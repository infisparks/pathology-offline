"use client"

import { useEffect, useState, useMemo, useRef, useCallback } from "react"
import { useForm, useFieldArray, type SubmitHandler } from "react-hook-form"
// ✅ CHANGED: Replaced useParams with useSearchParams
import { useSearchParams, useRouter } from "next/navigation"

// ✅ Using local Dexie DB and types
// FIX: Rename imported BloodTestRow to avoid conflict with local definition below
import { db, type DoctorRow as DbDoctorRow, type BloodTestRow as DbBloodTestRow, type PaymentHistory as LocalPaymentHistory } from "@/lib/localdb"

import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { UserCircle, Phone, Calendar, Clock, Plus, X, Search, Trash2, ArrowLeft, Hospital } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"

/**
 * -----------------------------
 * Helpers and constants
 * -----------------------------
 */

// Local Table definitions (used for clarity, actual interaction is via db.tableName)
const TABLE = {
  PATIENT: "patientdetail", // Corresponds to Dexie's patientdetail
  REGISTRATION: "registration",
  DOCTOR: "doctorlist",
  PACKAGE: "packages", // Not used for fetching in this specific file, but kept for context
  BLOOD: "blood_test", // Not used for fetching in this specific file, but kept for context
} as const

// --- Time Conversion Helpers ---
function time12ToISO(date: string, time12: string) {
  const [time, mer] = time12.split(" ")
  // FIX 1: Removed stray ">" in .split(":")
  let [hh, mm] = time.split(":").map(Number)
  if (mer === "PM" && hh < 12) hh += 12
  if (mer === "AM" && hh === 12) hh = 0
  // Returns ISO string based on local client time
  return new Date(`${date}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00`).toISOString()
}

function isoToTime12(isoString: string) {
  const date = new Date(isoString)
  const hours = date.getHours()
  const minutes = date.getMinutes()
  const ampm = hours >= 12 ? "PM" : "AM"
  const hours12 = hours % 12 || 12
  return `${hours12}:${String(minutes).padStart(2, "0")} ${ampm}`
}

function isoToDate(isoString: string) {
  const date = new Date(isoString)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

/**
 * -----------------------------
 * Types (Using local DB types where possible)
 * -----------------------------
 */

// FIX 2: Define a placeholder for RegistrationRow since it's used in fetchData
// Assuming this is a local Dexie type, but not fully defined here.
// Adding the properties accessed in fetchData
interface RegistrationRow {
    id?: number
    patient_id: number
    hospital_name?: string
    visit_type?: "opd" | "ipd"
    registration_time?: string
    doctor_name?: string
    blood_tests?: BloodTestSelection[]
    amount_paid_history?: LocalPaymentHistory
    tpa?: boolean
    sample_collection_time?: string
    ipd_id?: number | null
    amount_paid: number
    discount?: number
    payment_mode?: "online" | "cash"
    amount_remaining?: number
    // FIX 3: Added missing day_type property (which was causing a TS error in the fetch)
    day_type?: "year" | "month" | "day"
}

// FIX: Use the renamed imported type (DbBloodTestRow) for consistency
interface BloodTestRow extends DbBloodTestRow {} 

interface BloodTestSelection {
  testId: number
  testName: string
  price: number
  testType: "inhospital" | "outsource"
}

interface PaymentEntry {
  amount: number
  // FIX: Explicitly define allowed payment modes
  paymentMode: "online" | "cash"
  time: string
}

// Ensure PaymentHistory uses the imported local type
interface PaymentHistory extends LocalPaymentHistory {} 

interface IFormInput {
  hospitalName: string
  visitType: "opd" | "ipd"
  title: string
  name: string
  contact: string
  age: number
  dayType: "year" | "month" | "day"
  gender: string
  address?: string
  email?: string 
  doctorName: string
  doctorId: number | null
  bloodTests: BloodTestSelection[]
  discountAmount: number
  paymentEntries: PaymentEntry[]
  patientId?: string
  registrationDate: string
  registrationTime: string
  tpa: boolean
  originalSampleCollectedTime?: string
  sendWhatsApp: boolean
  // FIX 4: Changed ipdId to be number | 0 | undefined to match usage (0 for "ON IPD ID")
  ipdId: number | 0 | undefined
  ipdPatientName: string
}

// IPD Patient Type based on MOCK API response
interface IpdPatient {
  ipd_id: number
  uhid: string
  patient_name: string
  mobile_number: string
  room_type: string
  bed_number: string
}

// FIX 5: Type extension for patientdetail used in the DB.get calls
// Assuming a structure for PatientDetail used by Dexie
interface PatientDetailRow {
  id?: number
  name?: string
  number?: number
  address?: string
  age?: number
  day_type?: "year" | "month" | "day"
  gender?: string
  patient_id?: string
  total_day?: number
  title?: string
}

// --- Extend Dexie Tables with placeholder types for use in `db.tableName` ---
// NOTE: This is a common pattern when Dexie tables are not fully typed globally
// or when using mock `db.tableName.get/update`
declare module "@/lib/localdb" {
    export interface LocalDB {
        registration: {
            get(id: number): Promise<RegistrationRow | undefined>
            update(id: number, changes: Partial<RegistrationRow>): Promise<any>
        }
        patientdetail: {
            get(id: number): Promise<PatientDetailRow | undefined>
            update(id: number, changes: Partial<PatientDetailRow>): Promise<any>
        }
    }
}


/**
 * -----------------------------
 * Data Simulation (Replacing External API)
 * -----------------------------
 */

// ✅ Mock function to simulate IPD patient list
async function fetchActiveIpdPatients(): Promise<IpdPatient[]> {
  console.log("Fetching active IPD patients from mock source.")
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve([
        { ipd_id: 1001, uhid: 'UHID-23001', patient_name: 'Amit Sharma', mobile_number: '9876543210', room_type: 'Private', bed_number: 'P-10' },
        { ipd_id: 1002, uhid: 'UHID-23002', patient_name: 'Priya Singh', mobile_number: '9988776655', room_type: 'Semi-Private', bed_number: 'S-2A' },
        { ipd_id: 1003, uhid: 'UHID-23003', patient_name: 'Rajesh Kumar', mobile_number: '9000111222', room_type: 'General', bed_number: 'G-5' },
      ])
    }, 50)
  })
}

/**
 * -----------------------------
 * Component
 * -----------------------------
 */

// NOTE: This component should now be at `app/edit-patient/page.tsx`
export default function EditPatientForm() {
  // ✅ CHANGED: Use useSearchParams to get query parameters
  const searchParams = useSearchParams()
  const router = useRouter()
  
  // ✅ CHANGED: Get 'id' from query string (e.g., ?id=1)
  const registrationId = searchParams.get('id') 
  const regIdNum = registrationId ? parseInt(registrationId, 10) : NaN

  /** default date + time */
  const initialDate = useMemo(() => new Date(), [])
  const defaultDate = useMemo(() => initialDate.toISOString().slice(0, 10), [initialDate])
  const defaultTime = useMemo(() => {
    const h12 = initialDate.getHours() % 12 || 12
    const mer = initialDate.getHours() >= 12 ? "PM" : "AM"
    return `${String(h12).padStart(2, "0")}:${String(initialDate.getMinutes()).padStart(2, "0")} ${mer}`
  }, [initialDate])

  /** ---------------- form ---------------- */
  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<IFormInput>({
    defaultValues: {
      hospitalName: "MEDFORD HOSPITAL",
      visitType: "opd",
      title: "",
      name: "",
      contact: "",
      age: 0, // FIX 6: age must be a number by default
      dayType: "year",
      gender: "",
      address: "",
      email: "",
      doctorName: "",
      doctorId: null,
      bloodTests: [],
      patientId: "",
      registrationDate: defaultDate,
      registrationTime: defaultTime,
      discountAmount: 0,
      paymentEntries: [],
      tpa: false,
      originalSampleCollectedTime: undefined,
      sendWhatsApp: false,
      ipdId: undefined, 
      ipdPatientName: "",
    },
  })

  /** local state */
  const [doctorList, setDoctorList] = useState<DbDoctorRow[]>([]) 
  const [bloodRows, setBloodRows] = useState<DbBloodTestRow[]>([]) 
  const [activeIpdPatients, setActiveIpdPatients] = useState<IpdPatient[]>([])
  const [showDoctorHints, setShowDoctorHints] = useState(false)
  const [showIpdHints, setShowIpdHints] = useState(false)
  const [ipdSearchText, setIpdSearchText] = useState("")
  const [searchText, setSearchText] = useState("")
  // FIX 7: setSelectedTestId is unused, but if it were used, it should be part of the flow.
  // We'll keep it as is, but it appears the search logic is a quick-add mechanism.
  const [selectedTestId, setSelectedTestId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [patientDbId, setPatientDbId] = useState<number | null>(null) 

  const doctorHintsRef = useRef<HTMLDivElement | null>(null)
  const ipdSearchRef = useRef<HTMLDivElement | null>(null)


  /** field arrays */
  const {
    fields: bloodTestFields,
    append: appendBloodTest,
    remove: removeBloodTest,
    replace: replaceBloodTests,
  } = useFieldArray({
    control,
    name: "bloodTests",
  })

  const {
    fields: paymentFields,
    append: appendPayment,
    remove: removePayment,
    replace: replacePayments,
  } = useFieldArray({
    control,
    name: "paymentEntries",
  })

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node
      if (doctorHintsRef.current && !doctorHintsRef.current.contains(target)) {
        setShowDoctorHints(false)
      }
      if (ipdSearchRef.current && !ipdSearchRef.current.contains(target)) {
        setShowIpdHints(false)
        setIpdSearchText("")
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])
  
  /** IPD patient filtering/sorting logic */
  const filteredIpdPatients = useMemo(() => {
    if (!ipdSearchText) return activeIpdPatients 

    const searchLower = ipdSearchText.toLowerCase().trim()
    const filtered = activeIpdPatients.filter(
      (p) =>
        String(p.ipd_id).includes(searchLower) ||
        p.uhid.toLowerCase().includes(searchLower) ||
        p.patient_name.toLowerCase().includes(searchLower) ||
        p.mobile_number.includes(searchLower) ||
        p.room_type.toLowerCase().includes(searchLower),
    )

    filtered.sort((a, b) => {
      const aStarts = a.patient_name.toLowerCase().startsWith(searchLower)
      const bStarts = b.patient_name.toLowerCase().startsWith(searchLower)

      if (aStarts && !bStarts) return -1
      if (!aStarts && bStarts) return 1
      return 0
    })

    return filtered
  }, [activeIpdPatients, ipdSearchText])

  // Clear IPD details when switching to OPD
  const watchVisitType = watch("visitType")
  useEffect(() => {
    if (watchVisitType === "opd") {
      // FIX 8: Cast undefined to number | 0 | undefined for ipdId
      setValue("ipdId", undefined) 
      setValue("ipdPatientName", "")
    }
  }, [watchVisitType, setValue])

  /** fetch existing data (LOCAL DB) */
  useEffect(() => {
    // ✅ CHANGED: Updated check for the new regIdNum variable
    if (isNaN(regIdNum)) {
      setError("Invalid or missing Registration ID. (Expected URL format: ...?id=1)")
      setLoading(false)
      return
    }

    const fetchData = async () => {
      try {
        setLoading(true)
        setError(null)

        // 1. Fetch IPD patient list (MOCK)
        const ipdPatients = await fetchActiveIpdPatients();
        setActiveIpdPatients(ipdPatients);

        // 2. Fetch Registration Data from local Dexie DB
        const registrationData = await db.registration.get(regIdNum)

        if (!registrationData) {
          throw new Error("Registration not found in local database.")
        }

        // 3. Fetch Patient Details
        const patient = await db.patientdetail.get(registrationData.patient_id)

        if (!patient) throw new Error("Patient details not found in local database.")

        let paymentEntries: PaymentEntry[] = []
        let discountAmount = 0
        if (registrationData.amount_paid_history) {
          const paymentHistory = registrationData.amount_paid_history as PaymentHistory
          paymentEntries = (paymentHistory.paymentHistory || []).map(p => ({
            amount: p.amount,
            // FIX: Ensure paymentMode is cast to the narrow union type
            paymentMode: p.paymentMode as "online" | "cash",
            time: p.time,
          }))
          discountAmount = paymentHistory.discount || 0
        }

        const bloodTests: BloodTestSelection[] = registrationData.blood_tests || []
        
        // 4. Determine IPD Patient Name for display
        let initialIpdPatientName = "";
        // FIX 9: The existingIpdId can be 0 or null from the DB, so we handle that.
        const existingIpdId = registrationData.ipd_id;
        
        if (existingIpdId === 0) {
          initialIpdPatientName = "ON IPD ID (0)";
        } else if (existingIpdId) {
            // Check ipdPatients
            const ipdPatient = ipdPatients.find(p => p.ipd_id === existingIpdId);
            if (ipdPatient) {
                initialIpdPatientName = `${ipdPatient.patient_name} (ID: ${existingIpdId})`;
            } else {
                initialIpdPatientName = `IPD ID: ${existingIpdId} (Name Not Found)`;
            }
        }


        const formData: IFormInput = {
          hospitalName: registrationData.hospital_name || "MEDFORD HOSPITAL",
          // FIX: Cast visitType to the narrow union type
          visitType: registrationData.visit_type as "opd" | "ipd" || "opd",
          title: patient.title || "",
          name: patient.name || "",
          contact: patient.number?.toString() || "",
          age: patient.age || 0,
          // FIX: Accessing day_type from registrationData
          dayType: registrationData.day_type as "year" | "month" | "day" || "year",
          gender: patient.gender || "",
          address: patient.address || "",
          email: "",
          doctorName: registrationData.doctor_name || "",
          bloodTests: bloodTests,
          discountAmount: discountAmount,
          paymentEntries: paymentEntries,
          patientId: patient.patient_id || "",
          registrationDate: registrationData.registration_time
            ? isoToDate(registrationData.registration_time)
            : defaultDate,
          registrationTime: registrationData.registration_time
            ? isoToTime12(registrationData.registration_time)
            : defaultTime,
          tpa: registrationData.tpa ?? false,
          originalSampleCollectedTime: registrationData.sample_collection_time,
          sendWhatsApp: false, 
          doctorId: null,
          // FIX 10: Ensure existingIpdId is of type number | 0 | undefined
          ipdId: existingIpdId === null || existingIpdId === undefined ? undefined : existingIpdId,
          ipdPatientName: initialIpdPatientName,
        }

        reset(formData)
        replaceBloodTests(bloodTests)
        replacePayments(paymentEntries)
        // FIX 11: patient.id can be undefined if patient details were created without an ID, but update requires it. 
        // We'll trust the non-null assertion as per the original code logic, but make sure the error handling is robust.
        setPatientDbId(patient.id!) 
      } catch (err: any) {
        console.error("Error fetching patient data:", err)
        setError(err.message || "Failed to load patient data")
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [registrationId, regIdNum, reset, replaceBloodTests, replacePayments, defaultDate, defaultTime])

  /** fetch look-ups (doctors/tests) (LOCAL DB) */
  useEffect(() => {
    // Fetch doctors from local DB
    db.doctorlist.toArray()
      .then(data => setDoctorList(data ?? []))
      .catch(error => console.error("Error fetching doctor list:", error))
    
    // Fetch blood tests from local DB
    db.blood_test.toArray()
      .then(data => setBloodRows(data ?? []))
      .catch(error => console.error("Error fetching blood tests:", error))

  }, [])

  /** auto-select gender by title */
  const titleValue = watch("title")
  useEffect(() => {
    const male = new Set(["MR", "MAST", "BABA"])
    const female = new Set(["MS", "MISS", "MRS", "BABY", "SMT"])
    const none = new Set(["BABY OF", "DR", "", "."])
    if (male.has(titleValue)) setValue("gender", "Male")
    else if (female.has(titleValue)) setValue("gender", "Female")
    else if (none.has(titleValue)) setValue("gender", "")
  }, [titleValue, setValue])

  /** derived totals */
  const bloodTests = watch("bloodTests")
  const discountAmount = watch("discountAmount") || 0
  const paymentEntries = watch("paymentEntries") || []
  const totalAmount = bloodTests.reduce((s, t) => s + (t.price || 0), 0)
  const totalPaid = paymentEntries.reduce((s, p) => s + (p.amount || 0), 0)
  const remainingAmount = totalAmount - discountAmount - totalPaid

  // FIX: Corrected property access to use properties defined in DbBloodTestRow
  const unselectedTests = useMemo(
    () => bloodRows.filter((t) => !bloodTests.some((bt) => bt.testId === t.id)),
    [bloodRows, bloodTests],
  )

  /** handlers */
    // Handler for IPD patient selection - ONLY updates IPD ID and Name for display
    function handleIpdPatientSelect(ipdPatient: IpdPatient) {
      setValue("ipdId", ipdPatient.ipd_id)
      setValue("ipdPatientName", `${ipdPatient.patient_name} (ID: ${ipdPatient.ipd_id})`)
      setShowIpdHints(false)
      setIpdSearchText("")
    }

  // FIX: Corrected property access to use properties defined in DbBloodTestRow
  function addTestById(id: number) {
    const t = bloodRows.find((x) => x.id === id)
    if (t?.id == null) return
    appendBloodTest({
      testId: t.id,
      testName: t.test_name,
      price: t.price ?? 0,
      testType: t.outsource ? "outsource" : "inhospital",
    })
    setSelectedTestId(null)
    setSearchText("")
  }

  function addAllTests() {
    unselectedTests.forEach((t) => {
      if (typeof t.id === "number") addTestById(t.id)
    })
  }

  function removeAllTests() {
    for (let i = bloodTestFields.length - 1; i >= 0; i--) removeBloodTest(i)
  }

  function addPaymentEntry() {
    const currentTime = time12ToISO(watch("registrationDate"), watch("registrationTime"))
    appendPayment({
      amount: 0,
      paymentMode: "online",
      time: currentTime,
    })
  }

  /** submit (LOCAL DB) */
  const onSubmit: SubmitHandler<IFormInput> = async (data) => {
    if (data.bloodTests.length === 0) {
      alert("Please add at least one blood test before submitting.")
      return
    }
    if (!patientDbId) {
      alert("Patient ID not found. Cannot update.")
      return
    }
    // FIX 13: Check against undefined for the ipdId
    if (data.visitType === "ipd" && data.ipdId === undefined) {
      alert("Please select an IPD ID for IPD visit.")
      return
    }

    try {
      const mult = data.dayType === "year" ? 360 : data.dayType === "month" ? 30 : 1
      const totalDay = data.age * mult

      // 1. Update Patient Detail (Local Dexie)
      // FIX 14: Ensure patient.id is used and is a number
      await db.patientdetail
        .update(patientDbId, {
          name: data.name.toUpperCase(),
          number: Number(data.contact),
          address: data.address || "",
          age: data.age,
          day_type: data.dayType,
          gender: data.gender,
          patient_id: data.patientId,
          total_day: totalDay,
          title: data.title,
        })

      const isoTime = time12ToISO(data.registrationDate, data.registrationTime)
      const paymentHistoryData: PaymentHistory = {
        totalAmount: totalAmount,
        discount: discountAmount,
        paymentHistory: data.paymentEntries.length > 0 ? data.paymentEntries : [],
      }
      const totalAmountPaid = data.paymentEntries.reduce((sum, entry) => sum + entry.amount, 0)

      // 2. Update Registration (Local Dexie)
      await db.registration
        .update(regIdNum, {
          amount_paid: totalAmountPaid,
          visit_type: data.visitType,
          registration_time: isoTime,
          sample_collection_time: data.originalSampleCollectedTime || isoTime, 
          discount: discountAmount, 
          hospital_name: data.hospitalName,
          // FIX 15: payment_mode should be "online" | "cash" | undefined, ensuring compatibility with the Partial<RegistrationRow> type.
          payment_mode: data.paymentEntries.length > 0 ? data.paymentEntries[0].paymentMode : undefined, 
          blood_tests: data.bloodTests, 
          amount_paid_history: paymentHistoryData, 
          doctor_name: data.doctorName,
          tpa: data.tpa,
          // FIX 16: ipd_id needs to be number | 0 | null | undefined
          ipd_id: data.visitType === "ipd" ? (data.ipdId === undefined ? null : data.ipdId) : null,
          amount_remaining: remainingAmount, 
          day_type: data.dayType, // FIX 17: Save dayType back to registration
        })


      // ❌ REMOVED: WhatsApp message sending logic (server-side dependency)
      if (data.sendWhatsApp) {
        console.warn("WhatsApp message sending is disabled in offline mode.")
      }

      alert("Patient updated successfully locally ✅")
      router.back()
    } catch (err: any) {
      console.error(err)
      alert(err.message ?? "Unexpected error – check console")
    }
  }

  if (loading) {
    return (
      <div className="flex h-screen bg-gray-50">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-600 mx-auto"></div>
            <p className="mt-4 text-lg text-gray-600">Loading patient data...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-screen bg-gray-50">
        <div className="flex-1 flex items-center justify-center">
          <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
            <div className="text-red-500 mb-4">
              <svg className="h-16 w-16 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-4">Error Loading Data</h2>
            <p className="text-gray-600 mb-6">{error}</p>
            <Button type="button" onClick={() => router.back()} className="mr-2">
              Go Back
            </Button>
            <Button type="button" onClick={() => window.location.reload()} variant="outline">
              Try Again
            </Button>
          </div>
        </div>
      </div>
    )
  }

  /** ------------------------------
   * JSX
   * ------------------------------ */

  return (
    <div className="flex h-screen bg-gray-50">
      <div className="flex-1 overflow-auto">
        <Card className="h-full rounded-none">
          <CardContent className="p-6 h-full">
            <form onSubmit={handleSubmit(onSubmit)} className="h-full">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center">
                  <Button type="button" variant="ghost" size="sm" onClick={() => router.back()} className="mr-3">
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <UserCircle className="h-6 w-6 text-gray-600 mr-3" />
                  <h2 className="text-2xl font-bold text-gray-800">Edit Patient Details (Offline)</h2>
                </div>
                <div className="flex items-center space-x-4">
                  <div className="flex items-center text-sm">
                    <Calendar className="h-4 w-4 text-gray-500 mr-2" />
                    <input type="date" {...register("registrationDate")} className="p-2 border rounded text-sm w-40" />
                  </div>
                  <div className="flex items-center text-sm">
                    <Clock className="h-4 w-4 text-gray-500 mr-2" />
                    <input
                      type="text"
                      {...register("registrationTime")}
                      className="p-2 border rounded text-sm w-32"
                      placeholder="12:00 PM"
                    />
                  </div>
                </div>
              </div>

              {/* Patient Information */}
              <div className="space-y-6">
                <div className="bg-white p-4 rounded-lg border">
                  <h3 className="text-lg font-semibold text-gray-700 mb-4">Patient Information</h3>
                  <div className="grid grid-cols-12 gap-4 mb-4">
                    <div className="col-span-2">
                      <Label className="text-sm">Title</Label>
                      <Select value={watch("title")} onValueChange={(v) => setValue("title", v)}>
                        <SelectTrigger className="h-10">
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                        <SelectContent>
                          {[".", "MR", "MRS", "MAST", "BABA", "MISS", "MS", "BABY", "SMT", "BABY OF", "DR"].map((t) => (
                            <SelectItem key={t} value={t}>
                              {t === "." ? "NoTitle" : t}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="col-span-6 relative">
                      <Label className="text-sm">Full Name</Label>
                      <div className="relative">
                        <Input
                          {...register("name", {
                            required: "Name is required",
                            onChange: (e) => setValue("name", e.target.value.toUpperCase()),
                          })}
                          className="h-10 pl-10"
                          placeholder="Enter patient's full name"
                        />
                        <UserCircle className="h-4 w-4 absolute left-3 top-3 text-gray-400" />
                      </div>
                      {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
                    </div>

                    <div className="col-span-4">
                      <Label className="text-sm">Contact Number</Label>
                      <div className="relative">
                        <Input
                          {...register("contact", {
                            required: "Phone number is required",
                            pattern: { value: /^[0-9]{10}$/, message: "Phone number must be 10 digits" },
                          })}
                          className="h-10 pl-10"
                          placeholder="Enter 10-digit mobile number"
                        />
                        <Phone className="h-4 w-4 absolute left-3 top-3 text-gray-400" />
                      </div>
                      {errors.contact && <p className="text-red-500 text-xs mt-1">{errors.contact.message}</p>}
                    </div>
                  </div>

                  {/* age row */}
                  <div className="grid grid-cols-12 gap-4">
                    <div className="col-span-2">
                      <Label className="text-sm">Age</Label>
                      <Input
                        type="number"
                        {...register("age", {
                          required: "Age is required",
                          min: { value: 0, message: "Age cannot be negative" },
                          valueAsNumber: true, // FIX 18: Added valueAsNumber to register
                        })}
                        className="h-10"
                      />
                      {errors.age && <p className="text-red-500 text-xs mt-1">{errors.age.message}</p>}
                    </div>

                    <div className="col-span-2">
                      <Label className="text-sm">Age Unit</Label>
                      <Select value={watch("dayType")} onValueChange={(v) => setValue("dayType", v as any)}>
                        <SelectTrigger className="h-10">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="year">Year</SelectItem>
                          <SelectItem value="month">Month</SelectItem>
                          <SelectItem value="day">Day</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="col-span-3">
                      <Label className="text-sm">Gender</Label>
                      <Select value={watch("gender")} onValueChange={(v) => setValue("gender", v)}>
                        <SelectTrigger className="h-10">
                          <SelectValue placeholder="Select gender" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Male">Male</SelectItem>
                          <SelectItem value="Female">Female</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* UPDATED SECTION for Visit Type and conditional IPD ID */}
                    <div className={`col-span-${watch("visitType") === "ipd" ? "2" : "3"}`}>
                      <Label className="text-sm">Hospital</Label>
                      <Select value={watch("hospitalName")} onValueChange={(v) => setValue("hospitalName", v)}>
                        <SelectTrigger className="h-10">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="MEDFORD HOSPITAL">MEDFORD HOSPITAL</SelectItem>
                          <SelectItem value="Gautami Medford NX Hospital">Gautami Medford NX Hospital</SelectItem>
                          <SelectItem value="Apex Clinic">Apex Clinic</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="col-span-1">
                      <Label className="text-sm">Visit</Label>
                      <Select value={watch("visitType")} onValueChange={(v) => setValue("visitType", v as any)}>
                        <SelectTrigger className="h-10">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="opd">OPD</SelectItem>
                          <SelectItem value="ipd">IPD</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {watch("visitType") === "ipd" && (
                      <div className="col-span-2 relative" ref={ipdSearchRef}>
                        <Label className="text-sm">IPD ID</Label>
                        <div className="relative">
                          <input
                            type="text"
                            className={`h-10 w-full border border-input rounded-md px-3 text-sm pr-10 ${watch('ipdId') !== undefined ? 'bg-blue-50' : ''}`}
                            placeholder="Select IPD Patient"
                            readOnly
                            onClick={() => setShowIpdHints(true)}
                            value={watch('ipdPatientName') || ''}
                          />
                          <input 
                            type="hidden" 
                            {...register("ipdId", { 
                                required: watch("visitType") === "ipd" ? "IPD ID is required" : false, 
                                // FIX 19: ipdId can be 0, so don't use valueAsNumber directly on hidden input, but manage the state.
                                // We'll rely on the value being set via setValue in handleIpdPatientSelect and use a custom validation check if needed.
                            })} 
                            // FIX 20: value must be string when used with hidden input and register.
                            value={watch('ipdId')?.toString() ?? ''} 
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="absolute right-0 top-0 h-10 w-10 p-0"
                            onClick={() => setShowIpdHints((prev) => !prev)}
                          >
                            <Hospital className="h-5 w-5 text-blue-500" />
                          </Button>
                        </div>
                        {errors.ipdId && <p className="text-red-500 text-xs mt-1">{errors.ipdId.message}</p>}
                        
                        {showIpdHints && (
                          <div className="absolute z-20 w-80 bg-white border border-gray-300 mt-1 rounded-md shadow-xl">
                            <div className="p-2 border-b">
                              <Input
                                type="text"
                                placeholder="Search IPD patient by name, ID, or phone..."
                                className="h-8"
                                value={ipdSearchText}
                                onChange={(e) => setIpdSearchText(e.target.value)}
                                autoFocus
                              />
                            </div>
                            <ul className="max-h-64 overflow-y-auto text-sm">
                              {/* Static "ON IPD ID" option */}
                              <li
                                className="px-3 py-2 hover:bg-gray-100 cursor-pointer border-b"
                                onClick={() => {
                                  setValue("ipdId", 0);
                                  setValue("ipdPatientName", "ON IPD ID (0)");
                                  setShowIpdHints(false);
                                  setIpdSearchText("");
                                }}
                              >
                                <div className="font-medium text-gray-900">ON IPD ID</div>
                                <div className="text-xs text-gray-500">Select for general IPD entries</div>
                              </li>
                              
                              {/* Dynamic patient list */}
                              {filteredIpdPatients.length === 0 ? (
                                <li className="px-3 py-2 text-center text-gray-500">No active IPD patients found (Mock).</li>
                              ) : (
                                filteredIpdPatients.map((p) => (
                                  <li
                                    key={p.ipd_id}
                                    className="px-3 py-2 hover:bg-gray-100 cursor-pointer border-b last:border-b-0"
                                    onClick={() => handleIpdPatientSelect(p)}
                                  >
                                    <div className="font-medium text-gray-900">
                                      {p.patient_name}
                                    </div>
                                    <div className="text-xs text-gray-500 flex justify-between">
                                      <span>
                                        <span className="font-semibold">IPD ID:</span> {p.ipd_id}
                                      </span>
                                      <span className="text-right">
                                        Room: {p.bed_number} ({p.room_type})
                                      </span>
                                    </div>
                                  </li>
                                ))
                              )}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* address / doctor */}
                <div className="bg-white p-4 rounded-lg border">
                  <h3 className="text-lg font-semibold text-gray-700 mb-4">Address & Doctor</h3>
                  <div className="grid grid-cols-12 gap-4 items-end">
                    <div className="col-span-4">
                      <Label className="text-sm">Address</Label>
                      <Textarea
                        {...register("address")}
                        className="min-h-[80px] resize-none"
                        placeholder="123 Main St, City"
                      />
                    </div>
                    <div className="col-span-4 relative" ref={doctorHintsRef}>
                      <Label className="text-sm">Doctor Name</Label>
                      <Input
                        {...register("doctorName", {
                          onChange: (e) => {
                            setValue("doctorName", e.target.value)
                            setShowDoctorHints(true)
                          },
                        })}
                        className="h-10"
                        autoComplete="off"
                        onFocus={() => setShowDoctorHints(true)}
                      />
                      {showDoctorHints && doctorList.length > 0 && (
                        <ul className="absolute z-10 w-full bg-white border border-gray-300 mt-1 rounded-md max-h-40 overflow-y-auto text-sm shadow-lg">
                          {doctorList
                            .filter((d) => d.doctor_name.toLowerCase().includes(watch("doctorName").toLowerCase()))
                            .map((d) => (
                              <li
                                key={d.id}
                                className="px-3 py-2 hover:bg-gray-100 cursor-pointer"
                                onClick={() => {
                                  setValue("doctorName", d.doctor_name)
                                  setValue("doctorId", d.id ?? null)
                                  setShowDoctorHints(false)
                                }}
                              >
                                {d.doctor_name}
                              </li>
                            ))}
                        </ul>
                      )}
                    </div>
                    <div className="col-span-2 flex flex-col justify-end pb-1">
                      <Label className="text-sm mb-1">Type</Label>
                      <div className="flex gap-4">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={!watch("tpa")}
                            onCheckedChange={(v) => setValue("tpa", !v)}
                            id="normal-checkbox"
                          />
                          <Label htmlFor="normal-checkbox" className="text-sm cursor-pointer">
                            Normal
                          </Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={watch("tpa")}
                            onCheckedChange={(v) => setValue("tpa", !!v)}
                            id="tpa-checkbox"
                          />
                          <Label htmlFor="tpa-checkbox" className="text-sm cursor-pointer">
                            TPA
                          </Label>
                        </div>
                      </div>
                    </div>
                    <div className="col-span-2 flex flex-col justify-end pb-1">
                      <Label className="text-sm mb-1">Send WhatsApp</Label>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={watch("sendWhatsApp")}
                          onCheckedChange={(v) => setValue("sendWhatsApp", !!v)}
                          id="send-whatsapp-checkbox"
                        />
                        <Label
                          htmlFor="send-whatsapp-checkbox"
                          className="text-sm cursor-pointer flex items-center gap-2 text-gray-500"
                        >
                          SMS (Disabled)
                        </Label>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Blood tests */}
                <div className="bg-white p-4 rounded-lg border">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-700">Blood Tests</h3>
                    <div className="flex items-center space-x-2">
                      <Button type="button" variant="outline" size="sm" onClick={addAllTests}>
                        Add All
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={removeAllTests}>
                        Remove All
                      </Button>
                      <div className="relative">
                        <Input
                          type="text"
                          placeholder="Search tests..."
                          className="h-9 w-48"
                          value={searchText}
                          onChange={(e) => {
                            setSearchText(e.target.value)
                          }}
                        />
                        <Search className="h-4 w-4 absolute right-3 top-2.5 text-gray-400" />
                        {searchText.trim() && (
                          <ul className="absolute z-10 w-full bg-white border border-gray-300 mt-1 rounded-md max-h-40 overflow-y-auto text-sm shadow-lg">
                            {unselectedTests
                              .filter((t) => t.test_name.toLowerCase().includes(searchText.toLowerCase()))
                              .map((t) => (
                                <li
                                  key={t.id ?? `missing-id-${t.test_name}`}
                                  className="px-3 py-2 hover:bg-gray-100 cursor-pointer"
                                  onClick={() => typeof t.id === "number" && addTestById(t.id)}
                                >
                                  {t.test_name} - ₹{t.price}
                                </li>
                              ))}
                          </ul>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => selectedTestId && addTestById(selectedTestId)}
                      >
                        <Plus className="h-4 w-4 mr-1" /> Add
                      </Button>
                    </div>
                  </div>

                  <div className="border rounded-md overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[50%]">Test Name</TableHead>
                          <TableHead className="w-[20%]">Price (₹)</TableHead>
                          <TableHead className="w-[20%]">Type</TableHead>
                          <TableHead className="w-[10%]" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {bloodTestFields.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center py-8 text-gray-500">
                              No tests selected
                            </TableCell>
                          </TableRow>
                        ) : (
                          bloodTestFields.map((field, idx) => (
                            <TableRow key={field.id}>
                              <TableCell>{watch(`bloodTests.${idx}.testName` as const)}</TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  {...register(`bloodTests.${idx}.price` as const, { valueAsNumber: true })}
                                  className="h-8 w-24"
                                />
                              </TableCell>
                              <TableCell>
                                <Select
                                  value={watch(`bloodTests.${idx}.testType` as const)}
                                  onValueChange={(v) => setValue(`bloodTests.${idx}.testType` as const, v as any)}
                                >
                                  <SelectTrigger className="h-8">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="inhospital">InHouse</SelectItem>
                                    {/* ✅ FIXED THE TYPO HERE */}
                                    <SelectItem value="outsource">Outsource</SelectItem>
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0"
                                  onClick={() => removeBloodTest(idx)}
                                >
                                  <X className="h-4 w-4 text-red-500" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {/* Payment Details & Summary (FIX 21: Cleaned up duplicated and incorrect JSX structure here) */}
                <div className="grid grid-cols-2 gap-6">
                  <div className="bg-white p-4 rounded-lg border">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-gray-700">Payment Details</h3>
                      <Button type="button" variant="outline" size="sm" onClick={addPaymentEntry}>
                        <Plus className="h-4 w-4 mr-1" /> Add Payment
                      </Button>
                    </div>
                    <div className="mb-4">
                      <Label className="text-sm">Discount (₹)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        {...register("discountAmount", { valueAsNumber: true })}
                        placeholder="0"
                        className="h-10"
                      />
                    </div>
                    <div className="space-y-3">
                      {paymentFields.length === 0 ? (
                        <div className="text-center py-4 text-gray-500 text-sm">No payments added yet</div>
                      ) : (
                        paymentFields.map((field, idx) => (
                          <div key={field.id} className="border rounded-lg p-3 bg-gray-50">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-medium">Payment {idx + 1}</span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={() => removePayment(idx)}
                              >
                                <Trash2 className="h-3 w-3 text-red-500" />
                              </Button>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <Label className="text-xs">Amount (₹)</Label>
                                <Input
                                  type="number"
                                  step="0.01"
                                  {...register(`paymentEntries.${idx}.amount` as const, { valueAsNumber: true })}
                                  className="h-8"
                                  placeholder="0"
                                />
                              </div>
                              <div>
                                <Label className="text-xs">Mode</Label>
                                <Select
                                  value={watch(`paymentEntries.${idx}.paymentMode` as const)}
                                  onValueChange={(v) => setValue(`paymentEntries.${idx}.paymentMode` as const, v as any)}
                                >
                                  <SelectTrigger className="h-8">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="online">Online</SelectItem>
                                    <SelectItem value="cash">Cash</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                  <div className="bg-white p-4 rounded-lg border">
                    <h3 className="text-lg font-semibold text-gray-700 mb-4">Payment Summary</h3>
                    <div className="space-y-3 mb-6">
                      <div className="flex justify-between">
                        <span>Total Amount:</span>
                        <span className="font-medium">₹{totalAmount.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Discount:</span>
                        <span className="font-medium">₹{discountAmount.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Total Paid:</span>
                        <span className="font-medium">₹{totalPaid.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between border-t pt-2">
                        <span className="font-semibold">Remaining Amount:</span>
                        <span
                          className={`font-semibold ${
                            remainingAmount < 0
                              ? "text-red-600"
                              : remainingAmount > 0
                                ? "text-orange-600"
                                : "text-green-600"
                          }`}
                        >
                          ₹{remainingAmount.toFixed(2)}
                        </span>
                      </div>
                    </div>
                    <Button type="submit" disabled={isSubmitting} className="w-full bg-green-600 hover:bg-green-700">
                      {isSubmitting ? "Updating Locally..." : "Update Patient Record Locally"}
                    </Button>
                  </div>
                </div>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
