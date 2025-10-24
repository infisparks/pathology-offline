"use client"

import { useEffect, useState, useMemo, useRef, useCallback } from "react"
import { useForm, useFieldArray, type SubmitHandler } from "react-hook-form"
import { 
  db, 
  type DoctorRow, 
  type BloodTestRow as LocalBloodTestRow, 
  type RegistrationRow,
  type PatientDetailRow,
  type PackageRow
} from "@/lib/localdb" 
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { UserCircle, Phone, Calendar, Clock, Plus, X, Search, Trash2, Hospital } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { generatePatientIdWithSequence } from "@/lib/patientIdGenerator"
import { useRouter } from "next/navigation"

/**
 * -----------------------------
 * Helpers and constants
 * -----------------------------
 */

const TABLE = {
  PATIENT: "patientdetail", // Corresponds to patientdetail in localdb
  REGISTRATION: "registration",
  DOCTOR: "doctorlist",
  PACKAGE: "packages",
  BLOOD: "blood_test", // Kept for package fetching consistency, but direct fetch from JSON for lookup
} as const

function time12ToISO(date: string, time12: string) {
  const [time, mer] = time12.split(" ")
  let [hh, mm] = time.split(":").map(Number)
  if (mer === "PM" && hh < 12) hh += 12
  if (mer === "AM" && hh === 12) hh = 0
  return new Date(`${date}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00`).toISOString()
}

/**
 * -----------------------------
 * Types
 * -----------------------------
 */

// Use the local DB type for BloodTest
interface BloodTestRow extends LocalBloodTestRow {}

interface BloodTestSelection {
  testId: number
  testName: string
  price: number
  testType: "inhospital" | "outsource"
}

interface PaymentEntry {
  amount: number
  paymentMode: "online" | "cash"
  time: string
}

interface PaymentHistory {
  totalAmount: number
  discount: number
  paymentHistory: PaymentEntry[]
}

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
  existingPatientId?: number // Local DB primary key (id)
  tpa: boolean
  selectedPackageId?: string
  sendWhatsApp: boolean
  ipdId?: number // For IPD visits (optional for form)
  ipdPatientName: string // To hold the name of the selected IPD patient
}

// Adapt PackageType to local DB structure
interface PackageType {
  id: number
  package_name: string
  tests: BloodTestSelection[]
  discountamount: number // Renamed from 'discount' for clarity with local structure
}

// PatientSuggestion uses fields from the local 'patientdetail' table
interface PatientSuggestion {
  id: number // Primary key
  name: string
  number: number
  patient_id: string // The generated ID (e.g., 20251020-0001)
  title?: string
  age: number
  day_type: "year" | "month" | "day"
  gender: string
  address?: string
}

// IPD Patient Type for local data/mock
interface IpdPatient {
  ipd_id: number
  uhid: string
  patient_name: string
  mobile_number: string
  room_type: string
  bed_number: string
}

/**
 * -----------------------------
 * Local Data Simulation
 * -----------------------------
 */

// Mock function to simulate local or internal API IPD patient data
async function fetchActiveIpdPatients(): Promise<IpdPatient[]> {
  // In a real Electron app, this would query a local 'ipd_patients' table or a local network service.
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

export default function PatientEntry() {
  const router = useRouter()
  
  /** default date + time */
  const initialDate = useMemo(() => new Date(), [])
  
  // FIX: Corrected slicing to get YYYY-MM-DD format
  const defaultDate = useMemo(() => initialDate.toISOString().slice(0, 10), [initialDate])
  
  const defaultTime = useMemo(() => {
    const h12 = initialDate.getHours() % 12 || 12
    const mer = initialDate.getHours() >= 12 ? "PM" : "AM"
    return `${String(h12).padStart(2, "0")}:${String(initialDate.getMinutes()).padStart(2, "0")} ${mer}`
  }, [initialDate])

  const getDefaultFormValues = useCallback(
    (): IFormInput => ({
      hospitalName: "MEDFORD HOSPITAL",
      visitType: "opd",
      title: "",
      name: "",
      contact: "",
      age: 0,
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
      existingPatientId: undefined,
      tpa: false,
      selectedPackageId: "",
      sendWhatsApp: false, // Default to false since WhatsApp API is removed
      ipdId: undefined, // Type is number | undefined
      ipdPatientName: "",
    }),
    [defaultDate, defaultTime],
  )

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
    defaultValues: getDefaultFormValues(),
  })

  /** local state */
  const [doctorList, setDoctorList] = useState<DoctorRow[]>([])
  // BloodRows now sourced from JSON
  const [bloodRows, setBloodRows] = useState<BloodTestRow[]>([]) 
  const [packageRows, setPackageRows] = useState<PackageType[]>([])
  const [patientHints, setPatientHints] = useState<PatientSuggestion[]>([])
  const [activeIpdPatients, setActiveIpdPatients] = useState<IpdPatient[]>([])
  const [showPatientHints, setShowPatientHints] = useState(false)
  const [showDoctorHints, setShowDoctorHints] = useState(false)
  const [showIpdHints, setShowIpdHints] = useState(false)
  const [ipdSearchText, setIpdSearchText] = useState("")
  const [searchText, setSearchText] = useState("")
  const [selectedTestId, setSelectedTestId] = useState<number | null>(null)
  const [isExistingPatient, setIsExistingPatient] = useState(false)
  const patientHintsRef = useRef<HTMLDivElement | null>(null)
  const doctorHintsRef = useRef<HTMLDivElement | null>(null)
  const testSearchRef = useRef<HTMLDivElement | null>(null)
  const ipdSearchRef = useRef<HTMLDivElement | null>(null)

  /** field arrays */
  const {
    fields: bloodTestFields,
    append: appendBloodTest,
    remove: removeBloodTest,
  } = useFieldArray({
    control,
    name: "bloodTests",
  })
  const {
    fields: paymentFields,
    append: appendPayment,
    remove: removePayment,
  } = useFieldArray({
    control,
    name: "paymentEntries",
  })

  /** fetch look-ups and IPD patients (LOCAL DB and JSON) */
  useEffect(() => {
    // Fetch doctors from local DB
    db.doctorlist.toArray()
      .then(data => setDoctorList(data as DoctorRow[]))
      .catch(error => console.error("Error fetching doctor list:", error))
    
    // --- UPDATED: Fetch blood tests from local JSON file ---
    fetch('/bloodtest.json')
      .then(res => {
        if (!res.ok) {
          throw new Error('Failed to load /bloodtest.json');
        }
        return res.json();
      })
      .then(data => {
        // Assuming the JSON structure matches BloodTestRow[]
        // Sort the tests alphabetically for a better search experience
        const sortedData = (data as BloodTestRow[]).sort((a, b) => a.test_name.localeCompare(b.test_name));
        setBloodRows(sortedData);
      })
      .catch(error => console.error("Error fetching blood tests from JSON:", error));

    // Fetch packages from local DB
    db.packages.toArray()
      .then(data => setPackageRows(data as unknown as PackageType[]))
      .catch(error => console.error("Error fetching packages:", error))
    
    // Fetch active IPD patients from mock/local source
    fetchActiveIpdPatients().then(setActiveIpdPatients)
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

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node
      if (patientHintsRef.current && !patientHintsRef.current.contains(target)) {
        setShowPatientHints(false)
      }
      if (doctorHintsRef.current && !doctorHintsRef.current.contains(target)) {
        setShowDoctorHints(false)
      }
      if (testSearchRef.current && !testSearchRef.current.contains(target)) {
        setSearchText("")
      }
      if (ipdSearchRef.current && !ipdSearchRef.current.contains(target)) {
        setShowIpdHints(false)
        setIpdSearchText("")
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  /** patient autocomplete (LOCAL DB) */
  const watchName = watch("name")
  useEffect(() => {
    if (!watchName || watchName.trim().length < 2) {
      setPatientHints([])
      return
    }
    const timer = setTimeout(async () => {
      // ✅ LOCAL DB QUERY using Dexie.js
      const data = await db.patientdetail
        .where('name')
        .startsWithIgnoreCase(watchName.trim()) // Dexie.js extension for case-insensitive start
        .limit(10)
        .toArray()
      
      // Map to the expected type, assuming local patientdetail matches PatientSuggestion fields
      setPatientHints(data as PatientSuggestion[] ?? []) 
    }, 300)
    return () => clearTimeout(timer)
  }, [watchName])

  // IPD patient filtering/sorting logic
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

    // Sort: Patients whose name *starts* with the search text come first
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
      setValue("ipdId", undefined)
      setValue("ipdPatientName", "")
    }
  }, [watchVisitType, setValue])


  /** derived totals */
  const bloodTests = watch("bloodTests")
  const discountAmount = watch("discountAmount") || 0
  const paymentEntries = watch("paymentEntries") || []
  const totalAmount = bloodTests.reduce((s, t) => s + (t.price || 0), 0)
  const totalPaid = paymentEntries.reduce((s, p) => s + (p.amount || 0), 0)
  const remainingAmount = totalAmount - discountAmount - totalPaid
  const unselectedTests = useMemo(
    // bloodRows is now populated from JSON
    () => bloodRows.filter((t) => !bloodTests.some((bt) => bt.testId === t.id)),
    [bloodRows, bloodTests],
  )

  /** handlers */
  async function handlePatientSelect(p: PatientSuggestion) {
    setValue("name", p.name)
    // FIX: Ensure contact is a string before setting
    setValue("contact", p.number.toString()) 
    setValue("age", p.age)
    setValue("dayType", p.day_type)
    setValue("gender", p.gender)
    setValue("title", p.title || "")
    setValue("patientId", p.patient_id)
    setValue("address", p.address || "")
    // FIX: The value for existingPatientId is now a required number for update calls, so we check existence
    setValue("existingPatientId", p.id) 
    setIsExistingPatient(true)
    setShowPatientHints(false)

    // ✅ LOCAL DB QUERY: Fetch latest registration for this patient to get doctor name
    const registrationData = await db.registration
      .where('patient_id')
      // FIX: Use p.id (local primary key) which is definitely a number
      .equals(p.id) 
      .reverse() // Sort descending by primary key (id), assuming higher id means newer
      .limit(1)
      .toArray()
      
    if (registrationData && registrationData.length > 0) {
      setValue("doctorName", registrationData[0].doctor_name || "")
    } else {
      setValue("doctorName", "")
    }
  }

  function handleIpdPatientSelect(ipdPatient: IpdPatient) {
    setValue("ipdId", ipdPatient.ipd_id)
    setValue("ipdPatientName", `${ipdPatient.patient_name} (ID: ${ipdPatient.ipd_id})`)
    
    setShowIpdHints(false)
    setIpdSearchText("")
  }

  function handleNewPatient() {
    setValue("existingPatientId", undefined)
    setIsExistingPatient(false)
  }

  function addTestById(id: number) {
    const t = bloodRows.find((x) => x.id === id)
    if (typeof t?.id !== 'number') return;
    appendBloodTest({
      testId: t.id as number,
      testName: t.test_name,
      price: t.price,
      testType: t.outsource ? "outsource" : "inhospital",
    })
    setSelectedTestId(null)
    setSearchText("")
  }

  function addAllTests() {
    unselectedTests.forEach((t) => {
      if (typeof t.id === "number") {
        addTestById(t.id);
      }
    });
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

  /** submit (LOCAL DB TRANSACTION) */
  const onSubmit: SubmitHandler<IFormInput> = async (data) => {
    if (data.bloodTests.length === 0) {
      alert("Please add at least one blood test before submitting.")
      return
    }
    
    if (data.visitType === "ipd" && data.ipdId === undefined) {
        alert("Please select an IPD ID for IPD visit.")
        return
    }

    try {
      let patientDatabaseId: number
      const mult = data.dayType === "year" ? 360 : data.dayType === "month" ? 30 : 1
      const totalDay = data.age * mult

      // 1. Patient Upsert (Update or Insert)
      if (data.existingPatientId) {
        // A. Update Existing Patient
        // FIX: Assert existingPatientId is a number before passing to update() (Errors 2, 3)
        patientDatabaseId = data.existingPatientId as number 
        console.log("Using existing patient with ID:", patientDatabaseId)

        await db.patientdetail
          .update(patientDatabaseId, { // Now guaranteed to be number
            number: Number(data.contact),
            age: data.age,
            day_type: data.dayType,
            total_day: totalDay,
            gender: data.gender,
            address: data.address || "",
            // NOTE: Name and Title are usually immutable for existing records
          })
        
        console.log("Updated existing patient information locally")
      } else {
        // B. Insert New Patient
        if (!data.patientId) {
          // ✅ Use the locally implemented generator
          data.patientId = await generatePatientIdWithSequence() 
        }

        const newPatient: PatientDetailRow = { // Use specific type
          created_at: new Date().toISOString(),
          name: data.name.toUpperCase(),
          number: Number(data.contact),
          address: data.address || "",
          age: data.age,
          day_type: data.dayType,
          gender: data.gender,
          patient_id: data.patientId, // The generated ID
          total_day: totalDay,
          title: data.title,
        }

        // Dexie.js returns the primary key (id) of the inserted object
        patientDatabaseId = await db.patientdetail.add(newPatient) as number
        console.log("Created new patient with local ID:", patientDatabaseId)
      }

      // 2. Registration Insertion
      const isoTime = time12ToISO(data.registrationDate, data.registrationTime)
      const paymentHistoryData: PaymentHistory = {
        totalAmount: totalAmount,
        discount: discountAmount,
        paymentHistory: data.paymentEntries.length > 0 ? data.paymentEntries : [],
      }
      const totalAmountPaid = data.paymentEntries.reduce((sum, entry) => sum + entry.amount, 0)
      
      const newRegistration: any = { // Use 'any' for Dexie.js insert type flexibility
        created_at: new Date().toISOString(),
        patient_id: patientDatabaseId,
        amount_paid: totalAmountPaid,
        visit_type: data.visitType,
        registration_time: isoTime,
        sample_collection_time: isoTime, // Assuming sample_collection_time is registration time for now
        discount: discountAmount,
        hospital_name: data.hospitalName,
        payment_mode: data.paymentEntries.length > 0 ? data.paymentEntries[0].paymentMode : "online",
        blood_tests: data.bloodTests, // Assuming local DB can store JSON/objects here
        amount_remaining: remainingAmount, // Storing remaining amount as well
        doctor_name: data.doctorName,
        tpa: data.tpa,
        // FIX: Convert ipdId from number | undefined to number | null (Errors 4, 5)
        ipd_id: data.visitType === "ipd" ? (data.ipdId ?? null) : null, 
        amount_paid_history: paymentHistoryData, 
      }
      
      const registrationId = await db.registration.add(newRegistration)
      console.log("Created new registration with local ID:", registrationId)

      // 3. WhatsApp Message Removal
      // The WhatsApp section remains disabled for this offline version.
      if (data.sendWhatsApp) {
         console.warn("WhatsApp message skipped: This feature requires a server-side API which has been removed for offline mode.")
      }


      const message = data.existingPatientId
        ? "New registration added to existing patient successfully locally ✅"
        : "New patient and registration saved successfully locally ✅"
      
      alert(message)
      reset(getDefaultFormValues())
      setIsExistingPatient(false)
    } catch (err: any) {
      console.error("Local database error:", err)
      alert("Local save failed. Check console for details.")
    }
  }

  /** ------------------------------
   * JSX
   * ------------------------------ */
  
  // FIX: Ensure watch('ipdId') is converted to null for components expecting number | null (Error 4)
  const ipdIdValue = watch('ipdId') ?? null;
  
  return (
    <div className="flex h-screen bg-gray-50">
      <div className="flex-1 overflow-auto">
        <Card className="h-full rounded-none">
          <CardContent className="p-3 h-full">
            <form onSubmit={handleSubmit(onSubmit)} className="h-full">
            <div className="flex items-center justify-between mb-3">
    {/* Patient Entry Header Section */}
    <div className="flex items-center">
        <UserCircle className="h-6 w-6 text-gray-600 mr-2" />
        <div>
            <h2 className="text-2xl font-bold text-gray-800">Patient Entry</h2>
            {isExistingPatient && (
                <p className="text-sm text-blue-600 font-medium">Adding new registration to existing patient (Offline)</p>
            )}
        </div>
    </div>
    
    {/* --- NEW Logo Section --- */}
    <div className="flex justify-center flex-grow mx-4"> 
        <img 
            src="/infipluslogo.png" 
            alt="Infiplus Logo" 
            className="h-10 w-auto" 
        />
    </div>
    {/* ------------------------ */}

    {/* Date/Time Input Section */}
    <div className="flex items-center space-x-3">
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
              <div className="space-y-3">
                <div className="bg-white p-3 rounded-lg border">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-semibold text-gray-700">Patient Information</h3>
                    {isExistingPatient && (
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                        <span className="text-sm text-blue-600 font-medium">Existing Patient Selected</span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            handleNewPatient()
                            setValue("name", "")
                            setValue("contact", "")
                            setValue("patientId", "")
                            setValue("doctorName", "")
                            setValue("ipdId", undefined)
                            setValue("ipdPatientName", "")
                          }}
                        >
                          Clear & Add New
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-12 gap-2 mb-3">
                    {/* title */}
                    <div className="col-span-2">
                      <Label className="text-sm">Title</Label>
                      <Select
                        value={watch("title")}
                        onValueChange={(v) => setValue("title", v)}
                        disabled={isExistingPatient}
                      >
                        <SelectTrigger className="h-8">
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
                    {/* name + autocomplete */}
                    <div className="col-span-6 relative" ref={patientHintsRef}>
                      <Label className="text-sm">Full Name</Label>
                      <div className="relative">
                        <Input
                          {...register("name", {
                            required: "Name is required",
                            onChange: (e) => {
                              if (!isExistingPatient) {
                                setShowPatientHints(true)
                                setValue("name", e.target.value.toUpperCase())
                                handleNewPatient()
                              }
                            },
                          })}
                          className={`h-8 pl-10 ${isExistingPatient ? "bg-blue-50 border-blue-200" : ""}`}
                          placeholder="Type at least 2 letters..."
                          onFocus={() => !isExistingPatient && setShowPatientHints(true)}
                          disabled={isExistingPatient}
                          autoComplete="off"
                        />
                        <UserCircle className="h-4 w-4 absolute left-3 top-2.5 text-gray-400" />
                      </div>
                      {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
                      {showPatientHints && patientHints.length > 0 && !isExistingPatient && (
                        <ul className="absolute z-10 w-full bg-white border border-gray-300 mt-1 rounded-md max-h-40 overflow-y-auto text-sm shadow-lg">
                          {patientHints.map((p) => (
                            <li
                              key={p.id}
                              className="px-3 py-2 hover:bg-gray-100 cursor-pointer border-b border-gray-100 last:border-b-0"
                              onClick={() => handlePatientSelect(p)}
                            >
                              <div className="font-medium text-gray-900">
                                {p.title && p.title !== "." ? `${p.title} ` : ""}
                                {p.name}
                              </div>
                              <div className="text-xs text-gray-500">
                                {p.patient_id} • {p.number} • {p.age}
                                {p.day_type.charAt(0).toUpperCase()} • {p.gender}
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    {/* phone */}
                    <div className="col-span-4">
                      <Label className="text-sm">Contact Number</Label>
                      <div className="relative">
                        <Input
                          {...register("contact", {
                            required: "Phone number is required",
                            pattern: { value: /^[0-9]{10}$/, message: "Phone number must be 10 digits" },
                          })}
                          className={`h-8 pl-10 ${isExistingPatient ? "bg-blue-50 border-blue-200" : ""}`}
                          placeholder="Enter 10-digit mobile number"
                        />
                        <Phone className="h-4 w-4 absolute left-3 top-2.5 text-gray-400" />
                      </div>
                      {errors.contact && <p className="text-red-500 text-xs mt-1">{errors.contact.message}</p>}
                    </div>
                  </div>
                  {/* age row with conditional IPD ID field */}
                  <div className="grid grid-cols-12 gap-2">
                    <div className="col-span-2">
                      <Label className="text-sm">Age</Label>
                      <Input
                        type="number"
                        {...register("age", {
                          required: "Age is required",
                          min: { value: 1, message: "Age must be positive" },
                        })}
                        className={`h-8 ${isExistingPatient ? "bg-blue-50 border-blue-200" : ""}`}
                      />
                      {errors.age && <p className="text-red-500 text-xs mt-1">{errors.age.message}</p>}
                    </div>
                    <div className="col-span-2">
                      <Label className="text-sm">Age Unit</Label>
                      <Select
                        value={watch("dayType")}
                        onValueChange={(v) => setValue("dayType", v as any)}
                        disabled={isExistingPatient}
                      >
                        <SelectTrigger className={`h-8 ${isExistingPatient ? "bg-blue-50 border-blue-200" : ""}`}>
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
                      <Select
                        value={watch("gender")}
                        onValueChange={(v) => setValue("gender", v)}
                        disabled={isExistingPatient}
                      >
                        <SelectTrigger className={`h-8 ${isExistingPatient ? "bg-blue-50 border-blue-200" : ""}`}>
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
                        <SelectTrigger className={`h-8`}>
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
                        <SelectTrigger className={`h-8`}>
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
                          {/* Display the selected patient name, but keep the actual ipdId in the hidden input for submission */}
                          <input
                            type="text"
                            className={`h-8 w-full border border-input rounded-md px-3 text-sm pr-10 ${ipdIdValue !== null ? 'bg-blue-50' : ''}`}
                            placeholder="Select IPD Patient"
                            readOnly
                            onClick={() => setShowIpdHints(true)}
                            value={watch('ipdPatientName') || ''}
                          />
                          <input 
                            type="hidden" 
                            // FIX: Use ipdIdValue (number | null) to satisfy the type-checker where necessary
                            {...register("ipdId", { 
                                required: watch("visitType") === "ipd" ? "IPD ID is required" : false, 
                                valueAsNumber: true 
                            })} 
                            value={ipdIdValue ?? ''} 
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="absolute right-0 top-0 h-8 w-8 p-0"
                            onClick={() => setShowIpdHints((prev) => !prev)}
                          >
                            <Hospital className="h-4 w-4 text-blue-500" />
                          </Button>
                        </div>
                        {errors.ipdId && <p className="text-red-500 text-xs mt-1">{errors.ipdId.message}</p>}

                        {/* --- MODIFICATION STARTS HERE --- */}
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
                                <li className="px-3 py-2 text-center text-gray-500">No active IPD patients found locally.</li>
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
                        {/* --- MODIFICATION ENDS HERE --- */}
                      </div>
                    )}
                  </div>
                </div>

                {/* Address & Doctor */}
                <div className="bg-white p-3 rounded-lg border">
                  <h3 className="text-lg font-semibold text-gray-700 mb-3">Address & Doctor</h3>
                  <div className="grid grid-cols-12 gap-3 items-end">
                    <div className="col-span-5">
                      <Label className="text-sm">Address</Label>
                      <Textarea
                        {...register("address")}
                        className={`min-h-[50px] resize-none ${isExistingPatient ? "bg-blue-50 border-blue-200" : ""}`}
                        placeholder="123 Main St, City"
                      />
                    </div>
                    <div className="col-span-5 relative" ref={doctorHintsRef}>
                      <Label className="text-sm">Doctor Name</Label>
                      <Input
                        {...register("doctorName", {
                          required: "Referring doctor is required",
                        })}
                        onChange={(e) => {
                          setValue("doctorName", e.target.value)
                          setShowDoctorHints(true)
                        }}
                        onFocus={() => setShowDoctorHints(true)}
                        className="h-8"
                        autoComplete="off"
                      />
                      {errors.doctorName && <p className="text-red-500 text-xs mt-1">{errors.doctorName.message}</p>}
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
                  </div>

                  {/* WhatsApp SMS Control (NOTE: Functionality removed, only checkbox remains) */}
                  <div className="mt-3 flex items-center gap-2">
                    <Checkbox
                      checked={watch("sendWhatsApp")}
                      onCheckedChange={(v) => setValue("sendWhatsApp", !!v)}
                      id="whatsapp-checkbox"
                    />
                    <Label htmlFor="whatsapp-checkbox" className="text-sm cursor-pointer flex items-center gap-2">
                      <span className="text-green-600">📱</span>
                      Send WhatsApp SMS (Offline mode: **Disabled**)
                    </Label>
                  </div>
                </div>

                {/* Blood tests */}
                <div className="bg-white p-1 rounded-lg border">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-lg font-semibold text-gray-700">Blood Tests</h3>
                    <div className="flex items-center space-x-1">
                      {/* Package selection (optional, inline) */}
                      <div className="flex items-center mr-2">
                        <Label className="text-xs mr-1">Package</Label>
                        <Select
                          value={watch("selectedPackageId") || "none"}
                          onValueChange={async (pkgId) => {
                            setValue("selectedPackageId", pkgId)
                            if (!pkgId || pkgId === "none") return
                            const pkg = packageRows.find((p) => String(p.id) === String(pkgId))
                            if (pkg) {
                              removeAllTests()
                              pkg.tests.forEach((t: any) => { // Use 'any' here as Dexie stores objects generically
                                appendBloodTest({
                                  testId: t.testId,
                                  testName: t.testName,
                                  price: t.price,
                                  testType: t.testType,
                                })
                              })
                              setValue("discountAmount", pkg.discountamount || 0)
                            }
                          }}
                        >
                          <SelectTrigger className="h-7 w-48">
                            <SelectValue placeholder="Select package" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No Package</SelectItem>
                            {packageRows.map((pkg) => (
                              <SelectItem key={pkg.id} value={String(pkg.id)}>
                                {pkg.package_name} (₹{pkg.discountamount} OFF)
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button type="button" variant="outline" size="sm" onClick={addAllTests}>
                        Add All
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={removeAllTests}>
                        Remove All
                      </Button>
                      <div className="relative" ref={testSearchRef}>
                        <Input
                          type="text"
                          placeholder="Search tests..."
                          className="h-7 w-40"
                          value={searchText}
                          onChange={(e) => {
                            setSearchText(e.target.value)
                          }}
                        />
                        <Search className="h-4 w-4 absolute right-3 top-2 text-gray-400" />
                        {searchText.trim() && (
                          <ul className="absolute z-10 w-full bg-white border border-gray-300 mt-1 rounded-md max-h-32 overflow-y-auto text-sm shadow-lg">
                            {bloodRows // Now filtering against the full JSON list
                              .filter((t) => t.test_name.toLowerCase().includes(searchText.toLowerCase()))
                              .map((t) => (
                                <li
                                  key={t.id ?? ""}
                                  className="px-2 py-1 hover:bg-gray-100 cursor-pointer"
                                  onClick={() => t.id !== undefined && addTestById(t.id)}
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
                  {/* table */}
                  <div className="border rounded-md overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[50%] py-1 px-2">Test Name</TableHead>
                          <TableHead className="w-[20%] py-1 px-2">Price (₹)</TableHead>
                          <TableHead className="w-[20%] py-1 px-2">Type</TableHead>
                          <TableHead className="w-[10%] py-1 px-2" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {bloodTestFields.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center py-2 text-gray-500">
                              No tests selected
                            </TableCell>
                          </TableRow>
                        ) : (
                          bloodTestFields.map((field, idx) => (
                            <TableRow key={field.id}>
                              <TableCell className="py-1 px-2">{watch(`bloodTests.${idx}.testName` as const)}</TableCell>
                              <TableCell className="py-1 px-2">
                                <Input
                                  type="number"
                                  {...register(`bloodTests.${idx}.price` as const, { valueAsNumber: true })}
                                  className="h-7 w-20"
                                  disabled={
                                    (watch(`bloodTests.${idx}.testName` as const) || "").trim().toLowerCase() !==
                                    "histopathology"
                                  }
                                />
                              </TableCell>
                              <TableCell className="py-1 px-2">
                                <Select
                                  value={watch(`bloodTests.${idx}.testType` as const)}
                                  onValueChange={(v) => setValue(`bloodTests.${idx}.testType` as const, v as any)}
                                >
                                  <SelectTrigger className="h-7">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="inhospital">InHouse</SelectItem>
                                    <SelectItem value="outsource">Outsource</SelectItem>
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell className="py-1 px-2">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0"
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

                {/* Payment Details */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white p-3 rounded-lg border">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-lg font-semibold text-gray-700">Payment Details</h3>
                      <Button type="button" variant="outline" size="sm" onClick={addPaymentEntry}>
                        <Plus className="h-4 w-4 mr-1" /> Add Payment
                      </Button>
                    </div>
                    {/* Discount */}
                    <div className="mb-3">
                      <Label className="text-sm">Discount (₹)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        {...register("discountAmount", { valueAsNumber: true })}
                        placeholder="0"
                        className="h-8"
                      />
                    </div>
                    {/* Payment Entries */}
                    <div className="space-y-2">
                      {paymentFields.length === 0 ? (
                        <div className="text-center py-4 text-gray-500 text-sm">No payments added yet</div>
                      ) : (
                        paymentFields.map((field, idx) => (
                          <div key={field.id} className="border rounded-lg p-2 bg-gray-50">
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
                  <div className="bg-white p-3 rounded-lg border">
                    <h3 className="text-lg font-semibold text-gray-700 mb-3">Payment Summary</h3>
                    <div className="space-y-2 mb-3">
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
                    <Button type="submit" disabled={isSubmitting} className="w-full bg-blue-600 hover:bg-blue-700">
                      {isSubmitting
                        ? "Saving Locally..."
                        : isExistingPatient
                          ? "Add New Registration (Local)"
                          : "Save Patient Record (Local)"}
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
