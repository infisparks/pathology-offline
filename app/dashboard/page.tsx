"use client"

import { useState, useEffect, useMemo, useCallback, useRef } from "react"
// ❌ REMOVED: import { supabase } from "@/lib/supabase"
// ✅ Using local Dexie DB for data operations
import { db } from "@/lib/localdb" 
import { useRouter } from "next/navigation"

import { DashboardHeader } from "./components/dashboard-header"
import { RegistrationList } from "./components/registration-list"
import { DashboardModals } from "./components/dashboard-modals"
import {
  isAllTestsComplete,
  formatLocalDateTime,
  getRank,
  downloadBill,
  downloadMultipleBills,
  // downloadBill and downloadMultipleBills rely on client-side JS and are kept.
} from "./lib/dashboard-utils"
import type { Registration, DashboardMetrics, PaymentHistory } from "./types/dashboard"

/**
 * Helper to get YYYY-MM-DD date string in Asia/Kolkata timezone
 */
function getKolkataDateString(date: string | Date = new Date()) {
  const d = new Date(date)
  const utc = d.getTime() + d.getTimezoneOffset() * 60000
  const kolkataOffset = 5.5 * 3600000 // Asia/Kolkata is UTC+5:30
  const kolkata = new Date(utc + kolkataOffset)

  const year = kolkata.getFullYear()
  const month = (kolkata.getMonth() + 1).toString().padStart(2, "0")
  const day = kolkata.getDate().toString().padStart(2, "0")

  return `${year}-${month}-${day}`
}

/**
 * Convert ISO (UTC) string to local datetime-local string (for <input type="datetime-local" />)
 */
function toLocalInputValue(isoDateString?: string) {
  if (!isoDateString) return formatLocalDateTime() // fallback to now
  const date = new Date(isoDateString)
  const off = date.getTimezoneOffset()
  const local = new Date(date.getTime() - off * 60 * 1000)
  return local.toISOString().slice(0, 16)
}

/**
 * Format datetime-local string ("YYYY-MM-DDTHH:MM") or ISO to 12-hour display in local time
 */
function format12HourLocal(dateString?: string) {
  if (!dateString) return "-"
  let d =
    dateString.includes("T") && dateString.length <= 16
      ? new Date(dateString + ":00")
      : new Date(dateString)
  if (isNaN(d.getTime())) return "-"
  let hours = d.getHours()
  const minutes = d.getMinutes()
  const ampm = hours >= 12 ? "PM" : "AM"
  hours = hours % 12
  hours = hours ? hours : 12
  const minutesStr = minutes < 10 ? "0" + minutes : minutes
  const day = d.getDate().toString().padStart(2, "0")
  const month = (d.getMonth() + 1).toString().padStart(2, "0")
  const year = d.getFullYear()
  return `${day}/${month}/${year}, ${hours}:${minutesStr} ${ampm}`
}

export default function Dashboard() {
  /* --- state --- */
  const [registrations, setRegistrations] = useState<Registration[]>([])
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    totalRegistrations: 0,
    todayRegistrations: 0,
    totalRevenue: 0,
    todayRevenue: 0,
    pendingReports: 0,
    completedTests: 0,
  })
  const [selectedRegistration, setSelectedRegistration] = useState<Registration | null>(null)
  const [newAmountPaid, setNewAmountPaid] = useState<string>("")
  const [paymentMode, setPaymentMode] = useState<string>("online")
  const [searchTerm, setSearchTerm] = useState<string>("") // For local list filtering
  const [globalSearchTerm, setGlobalSearchTerm] = useState<string>("") // For DB search
  const [globalSearchResults, setGlobalSearchResults] = useState<Registration[] | null>(null)
  const [isGlobalLoading, setIsGlobalLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [expandedRegistrationId, setExpandedRegistrationId] = useState<number | null>(null)
  const [fakeBillRegistration, setFakeBillRegistration] = useState<Registration | null>(null)
  const [selectedRegistrations, setSelectedRegistrations] = useState<number[]>([])
  const [selectAll, setSelectAll] = useState(false)
  const [showCheckboxes, setShowCheckboxes] = useState<boolean>(false)
  const [isFiltersExpanded, setIsFiltersExpanded] = useState<boolean>(false)
  const [isFilterContentMounted, setIsFilterContentMounted] = useState<boolean>(false)
  const [hospitalFilterTerm, setHospitalFilterTerm] = useState<string>("all")

  const [isLoading, setIsLoading] = useState(true)

  // Using Asia/Kolkata timezone for todayStr
  const todayKolkata = getKolkataDateString(new Date().toISOString())
  const todayStr = todayKolkata // YYYY-MM-DD
  const [startDate, setStartDate] = useState<string>(todayStr)
  const [endDate, setEndDate] = useState<string>(todayStr)

  const [sampleModalRegistration, setSampleModalRegistration] = useState<Registration | null>(null)
  const [sampleDateTime, setSampleDateTime] = useState<string>(formatLocalDateTime())

  const [tempDiscount, setTempDiscount] = useState<string>("")
  const [amountId, setAmountId] = useState<string>("")
  const [billNo, setBillNo] = useState<string>("")

  useEffect(() => {
    if (selectedRegistration) {
      setBillNo(selectedRegistration.bill_no || "")
    }
  }, [selectedRegistration])

  const filterContentRef = useRef<HTMLDivElement>(null)

  // ❌ REMOVED: Role logic (since we removed the login/role system)
  const [role] = useState<string>("admin") // Default to admin since login is removed
  const router = useRouter()
  useEffect(() => {
    if (role === "xray") {
      router.replace("/x-rayDashboard")
    }
  }, [role, router])

  if (role === "xray") {
    return null
  }
  // -----------------------------------------------------

  /* --- helpers --- */
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsFilterContentMounted(true)
    }, 500)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (sampleModalRegistration?.sampleCollectedAt) {
      setSampleDateTime(toLocalInputValue(sampleModalRegistration.sampleCollectedAt))
    } else if (sampleModalRegistration) {
      setSampleDateTime(formatLocalDateTime())
    }
  }, [sampleModalRegistration])

  // ✅ REWRITTEN: Fetch Dashboard Stats (Local DB)
  const fetchDashboardStats = useCallback(async () => {
    try {
      const today = new Date().toISOString().split("T")[0]
      // Use standard ISO dates for comparison; no need for +05:30 offset locally
      const startOfDayISO = `${startDate || today}T00:00:00.000Z`
      const endOfDayISO = `${endDate || today}T23:59:59.999Z`

      // Fetch all registrations within the date range from IndexedDB
      const allRegistrationsData = await db.registration
        .where('registration_time')
        .between(startOfDayISO, endOfDayISO, true, true)
        .toArray()
      
      // Fetch all patient details needed for mapping
      const patientIds = allRegistrationsData.map(reg => reg.patient_id).filter((id): id is number => typeof id === 'number');
      const uniquePatientIds = Array.from(new Set(patientIds));
      const patientDetails = await db.patientdetail.where('id').anyOf(uniquePatientIds).toArray();
      const patientMap = new Map(patientDetails.map(p => [p.id, p]));

      let totalRegistrationsCount = 0
      let totalRevenue = 0
      let pendingReportsCount = 0
      let completedTestsCount = 0

      const mappedRegistrations: Registration[] = allRegistrationsData.map((registrationRow: any) => {
        const patientDetail = patientMap.get(registrationRow.patient_id);
        
        // Map local row to the expected Registration type
        const reg: Registration = {
          id: registrationRow.id!,
          bloodtest_detail: registrationRow.bloodtest_detail || {},
          registration_id: registrationRow.id!,
          visitType: registrationRow.visit_type || "",
          createdAt: registrationRow.registration_time,
          discountAmount: registrationRow.discount || 0, // Use 'discount' from local DB
          amountPaid: registrationRow.amount_paid || 0,
          doctor_name: registrationRow.doctor_name,
          bloodTests: (registrationRow.blood_tests || []).map((test: any) => ({ // Use 'blood_tests'
            ...test,
            testName: String(test.testName || ""),
          })),
          bloodtest: registrationRow.bloodtest_detail || {},
          sampleCollectedAt: registrationRow.sample_collection_time, // Use 'sample_collection_time'
          paymentHistory: registrationRow.amount_paid_history || null,
          hospitalName: registrationRow.hospital_name,
          // FIX: patient_id (internal DB link) must be a number
          patient_id: registrationRow.patient_id, 
          // FIX: patientId (external user-facing ID) is a string
          patientId: patientDetail?.patient_id ?? "", 
          name: patientDetail?.name ?? "Unknown",
          age: patientDetail?.age ?? 0,
          gender: patientDetail?.gender,
          contact: patientDetail?.number,
          address: patientDetail?.address,
          day_type: patientDetail?.day_type,
          total_day: patientDetail?.total_day,
          title: patientDetail?.title,
          tpa: registrationRow.tpa === true,
          bill_no: registrationRow.bill_no || undefined,
        };
        return reg;
      })

      mappedRegistrations.forEach((reg) => {
        totalRegistrationsCount++

        let regRevenue = 0
        if (
          reg.paymentHistory &&
          typeof reg.paymentHistory === "object" &&
          "paymentHistory" in reg.paymentHistory
        ) {
          const paymentData = reg.paymentHistory as PaymentHistory
          regRevenue = paymentData.paymentHistory?.reduce((sum, payment) => sum + payment.amount, 0) || 0
        } else {
          regRevenue = reg.amountPaid || 0
        }
        totalRevenue += regRevenue

        // Check status for completed tests and pending reports
        const sampleCollected = !!reg.sampleCollectedAt
        const complete = isAllTestsComplete(reg)

        if (sampleCollected && complete) {
          completedTestsCount++
        } else if (sampleCollected && !complete) {
          pendingReportsCount++
        }
      })
      

      setMetrics({
        totalRegistrations: totalRegistrationsCount,
        todayRegistrations: totalRegistrationsCount,
        totalRevenue: totalRevenue,
        todayRevenue: totalRevenue,
        pendingReports: pendingReportsCount,
        completedTests: completedTestsCount,
      })
    } catch (error: any) {
      console.error("Dashboard: Error fetching dashboard stats:", error.message)
    }
  }, [startDate, endDate])

  // ✅ REWRITTEN: Fetch Registrations (Local DB)
  const fetchRegistrations = useCallback(async (startDate: string, endDate: string) => {
    setIsLoading(true)
    setGlobalSearchResults(null) // Clear global search when fetching by date
    try {
      // Use standard ISO dates for comparison
      const startOfDayISO = `${startDate}T00:00:00.000Z`
      const endOfDayISO = `${endDate}T23:59:59.999Z`

      // 1. Fetch registrations within the date range
      const registrationRows = await db.registration
        .where('registration_time')
        .between(startOfDayISO, endOfDayISO, true, true)
        .reverse() // Sort by ID descending (proxy for registration time)
        .toArray();
      
      // 2. Fetch all required patient details
      const patientIds = registrationRows.map(reg => reg.patient_id).filter((id): id is number => typeof id === 'number');
      const uniquePatientIds = Array.from(new Set(patientIds));
      const patientDetails = await db.patientdetail.where('id').anyOf(uniquePatientIds).toArray();
      const patientMap = new Map(patientDetails.map(p => [p.id, p]));

      // 3. Map rows to the expected Registration type
      const mappedData: Registration[] = registrationRows.map((registrationRow: any) => {
        const patientDetail = patientMap.get(registrationRow.patient_id);
        
        return {
          id: registrationRow.id!,
          bloodtest_detail: registrationRow.bloodtest_detail || {},
          registration_id: registrationRow.id!,
          visitType: registrationRow.visit_type || "",
          createdAt: registrationRow.registration_time,
          discountAmount: registrationRow.discount || 0,
          amountPaid: registrationRow.amount_paid || 0,
          doctor_name: registrationRow.doctor_name,
          bloodTests: (registrationRow.blood_tests || []).map((test: any) => ({
            ...test,
            testName: String(test.testName || ""),
          })),
          bloodtest: registrationRow.bloodtest_detail || {},
          sampleCollectedAt: registrationRow.sample_collection_time,
          paymentHistory: registrationRow.amount_paid_history || null,
          hospitalName: registrationRow.hospital_name,
          // FIX: patient_id (internal DB link) must be a number
          patient_id: registrationRow.patient_id, 
          // FIX: patientId (external user-facing ID) is a string
          patientId: patientDetail?.patient_id ?? "", 
          name: patientDetail?.name ?? "Unknown",
          age: patientDetail?.age ?? 0,
          gender: patientDetail?.gender,
          contact: patientDetail?.number,
          address: patientDetail?.address,
          day_type: patientDetail?.day_type,
          total_day: patientDetail?.total_day,
          title: patientDetail?.title,
          tpa: registrationRow.tpa === true,
          bill_no: registrationRow.bill_no || undefined,
        }
      })

      const sortedRegistrations = mappedData.sort((a, b) => {
        const rankDiff = getRank(a) - getRank(b)
        // Secondary sort: Newest first
        return rankDiff !== 0 ? rankDiff : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      })

      setRegistrations(sortedRegistrations)
    } catch (error: any) {
      console.error("Dashboard: Error fetching registrations:", error.message)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // ❌ REMOVED: Realtime Subscriptions (No Supabase)
  // useEffect(() => { ... return () => { supabase.removeChannel(...) } ...}, [...])

  // Initial load
  useEffect(() => {
    fetchRegistrations(startDate, endDate)
    fetchDashboardStats()
  }, [fetchRegistrations, fetchDashboardStats, startDate, endDate])

  // Update dashboard stats when date filters change
  useEffect(() => {
    if (!globalSearchResults) {
      fetchDashboardStats()
    }
  }, [startDate, endDate, globalSearchResults, fetchDashboardStats])

  // ✅ REWRITTEN: Local Global Search Logic (In-memory/Dexie query)
  const handleGlobalSearch = useCallback(async () => {
    const term = globalSearchTerm.trim().toLowerCase()
    if (term.length < 3) {
      alert("Please enter at least 3 characters for a global search.")
      return
    }
    setIsGlobalLoading(true)
    setRegistrations([]) // Clear date-based registrations
    
    try {
      // 1. Search Patient Details for matches
      const matchingPatients = await db.patientdetail
        .filter(p => 
          p.name?.toLowerCase().includes(term) ||
          p.patient_id?.toLowerCase().includes(term) ||
          String(p.number)?.includes(term)
        )
        .toArray()

      const matchingPatientIds = matchingPatients.map(p => p.id!).filter((id): id is number => typeof id === 'number');
      const patientMap = new Map(matchingPatients.map(p => [p.id, p]));

      if (matchingPatientIds.length === 0) {
        setGlobalSearchResults([]);
        return;
      }
      
      // 2. Fetch all registrations for these patients
      const registrationRows = await db.registration
        .where('patient_id')
        .anyOf(matchingPatientIds)
        .reverse()
        .toArray();
      
      // 3. Map rows to the expected Registration type
      const mappedData: Registration[] = registrationRows.map((registrationRow: any) => {
        const patientDetail = patientMap.get(registrationRow.patient_id);
        
        return {
          id: registrationRow.id!,
          bloodtest_detail: registrationRow.bloodtest_detail || {},
          registration_id: registrationRow.id!,
          visitType: registrationRow.visit_type || "",
          createdAt: registrationRow.registration_time,
          discountAmount: registrationRow.discount || 0,
          amountPaid: registrationRow.amount_paid || 0,
          doctor_name: registrationRow.doctor_name,
          bloodTests: (registrationRow.blood_tests || []).map((test: any) => ({
            ...test,
            testName: String(test.testName || ""),
          })),
          bloodtest: registrationRow.bloodtest_detail || {},
          sampleCollectedAt: registrationRow.sample_collection_time,
          paymentHistory: registrationRow.amount_paid_history || null,
          hospitalName: registrationRow.hospital_name,
          // FIX: patient_id (internal DB link) must be a number
          patient_id: registrationRow.patient_id, 
          // FIX: patientId (external user-facing ID) is a string
          patientId: patientDetail?.patient_id ?? "", 
          name: patientDetail?.name ?? "Unknown",
          age: patientDetail?.age ?? 0,
          gender: patientDetail?.gender,
          contact: patientDetail?.number,
          address: patientDetail?.address,
          day_type: patientDetail?.day_type,
          total_day: patientDetail?.total_day,
          title: patientDetail?.title,
          tpa: registrationRow.tpa === true,
          bill_no: registrationRow.bill_no || undefined,
        }
      })
      
      setGlobalSearchResults(mappedData)
    } catch (error: any) {
      console.error("Global Search Error:", error)
      alert("An error occurred during the local global search.")
      setGlobalSearchResults([])
    } finally {
      setIsGlobalLoading(false)
    }
  }, [globalSearchTerm])

  const clearGlobalSearch = useCallback(() => {
    setGlobalSearchTerm("")
    setGlobalSearchResults(null)
    // Refetch data for the selected date range
    fetchRegistrations(startDate, endDate)
  }, [startDate, endDate, fetchRegistrations])

  /* --- filters --- */
  const filteredRegistrations = useMemo(() => {
    // Determine the source of data: global search results or date-range registrations
    const sourceData = globalSearchResults ?? registrations

    return sourceData.filter((r) => {
      // Local search term (filters the current list)
      const term = searchTerm.trim().toLowerCase()
      const matchesSearch =
        !term ||
        (r.name && r.name.toLowerCase().includes(term)) ||
        (r.contact ? r.contact.toString().includes(term) : false) ||
        (r.patientId && r.patientId.toLowerCase().includes(term))
      if (!matchesSearch) return false

      const sampleCollected = !!r.sampleCollectedAt
      const complete = isAllTestsComplete(r)
      switch (statusFilter) {
        case "notCollected":
          if (sampleCollected) return false
          break
        case "sampleCollected": // This means sample collected but tests not complete (Pending)
          if (!sampleCollected || complete) return false
          break
        case "completed":
          if (!sampleCollected || !complete) return false
          break
      }

      if (hospitalFilterTerm !== "all" && r.hospitalName !== hospitalFilterTerm) return false

      return true
    })
  }, [registrations, globalSearchResults, searchTerm, statusFilter, hospitalFilterTerm])

  /* --- actions --- */
  // ✅ REWRITTEN: handleSaveSampleDate (Local DB)
  const handleSaveSampleDate = useCallback(
    async () => {
      if (!sampleModalRegistration) return
      try {
        const utc = new Date(sampleDateTime)
        const isoString = utc.toISOString()
        
        // Dexie.js update
        await db.registration
          .update(sampleModalRegistration.id, { sample_collection_time: isoString })
        
        alert(`Sample time updated locally for ${sampleModalRegistration.name}`)
        
        // Refresh data based on current mode (global search vs date range)
        if (globalSearchResults) handleGlobalSearch()
        else fetchRegistrations(startDate, endDate)

        fetchDashboardStats()
      } catch (e: any) {
        console.error("Dashboard: Error saving sample time locally:", e.message)
        alert("Error saving sample time locally.")
      } finally {
        setSampleModalRegistration(null)
      }
    },
    [
      sampleModalRegistration,
      sampleDateTime,
      fetchRegistrations,
      startDate,
      endDate,
      globalSearchResults,
      handleGlobalSearch,
      fetchDashboardStats,
    ]
  )

  // ✅ REWRITTEN: handleDeleteRegistration (Local DB)
  const handleDeleteRegistration = useCallback(
    async (r: Registration) => {
      if (!confirm(`Delete registration for ${r.name}? This will permanently remove the registration record from local storage.`))
        return

      try {
        // 1. Fetch the registration data to store in deleted_data (No need for extra select, just use r)
        // In a real Dexie implementation, you would move the data from 'registration' to a new 'deleted_data' table
        const registrationData = await db.registration.get(r.id);
        
        if (!registrationData) throw new Error("Registration not found in local DB!")

        const deletedData = {
          ...registrationData,
          deleted: true,
          deleted_time: new Date().toISOString(),
        }
        
        // 2. Insert into local 'deleted_data' table (Assuming you add this table to your localdb.ts)
        // Since we didn't define a 'deleted_data' table in the localdb.ts provided, 
        // we will simulate the delete and trust the user to update localdb.ts with the table.
        // For now, we only delete from the main table.

        // await db.deleted_data.add(deletedData); // Placeholder if deleted_data table existed

        // 3. Delete from registration table
        const delCount = await db.registration.delete(r.id);
        // if (delCount === 0) throw new Error("Local registration record not found for deletion.")

        // Update local state
        setRegistrations((prev) => prev.filter((registration) => registration.id !== r.id))
        fetchDashboardStats()

        alert("Registration deleted locally.")
      } catch (e: any) {
        console.error("Error deleting locally:", e.message)
        alert("Error deleting locally: " + (e.message || "Unknown error"))
      }
    },
    [fetchDashboardStats]
  )

  const handleToggleSelectAll = useCallback(() => {
    if (selectAll) {
      setSelectedRegistrations([])
    } else {
      setSelectedRegistrations(filteredRegistrations.map((r) => r.id))
    }
    setSelectAll(!selectAll)
  }, [selectAll, filteredRegistrations])

  const handleToggleSelect = useCallback((registrationId: number) => {
    setSelectedRegistrations((prev) =>
      prev.includes(registrationId) ? prev.filter((id) => id !== registrationId) : [...prev, registrationId]
    )
  }, [])

  const handleToggleFilters = useCallback(() => {
    if (!isFiltersExpanded && !isFilterContentMounted) {
      setIsFilterContentMounted(true)
      setTimeout(() => {
        setIsFiltersExpanded(true)
      }, 50)
    } else {
      setIsFiltersExpanded(!isFiltersExpanded)
    }
  }, [isFiltersExpanded, isFilterContentMounted])

  const handleDownloadBill = useCallback(() => {
    if (selectedRegistration) {
      downloadBill(selectedRegistration)
    }
  }, [selectedRegistration])

  const handleDownloadMultipleBills = useCallback(() => {
    downloadMultipleBills(selectedRegistrations, registrations)
  }, [selectedRegistrations, registrations])

  // ✅ REWRITTEN: handleUpdateAmountAndDiscount (Local DB)
  const handleUpdateAmountAndDiscount = useCallback(async () => {
    if (!selectedRegistration) return

    const additionalPayment = Number.parseFloat(newAmountPaid) || 0
    const newDiscountAmount = Number.parseFloat(tempDiscount) || 0

    try {
      // 1. Get current registration data from local DB for safety and consistency
      const currentRegData = await db.registration.get(selectedRegistration.id);
      if (!currentRegData) throw new Error("Registration not found in local DB.");

      let currentPaymentHistory: PaymentHistory
      if (
        currentRegData.amount_paid_history &&
        typeof currentRegData.amount_paid_history === "object" &&
        "totalAmount" in currentRegData.amount_paid_history
      ) {
        currentPaymentHistory = currentRegData.amount_paid_history as PaymentHistory
      } else {
        // Recalculate based on current local state
        const testTotal = selectedRegistration.bloodTests?.reduce((s, t) => s + t.price, 0) || 0;
        currentPaymentHistory = {
          totalAmount: testTotal,
          discount: selectedRegistration.discountAmount || 0,
          paymentHistory:
            selectedRegistration.amountPaid > 0
              ? [
                  {
                    amount: selectedRegistration.amountPaid,
                    paymentMode: "cash", // Assumed mode if history is missing
                    time: currentRegData.registration_time, 
                  },
                ]
              : [],
        }
      }

      const updatedPaymentHistory: PaymentHistory = {
        totalAmount: selectedRegistration.bloodTests?.reduce((s, t) => s + t.price, 0) || 0,
        discount: newDiscountAmount,
        paymentHistory:
          additionalPayment > 0
            ? [
                ...currentPaymentHistory.paymentHistory,
                {
                  amount: additionalPayment,
                  paymentMode: paymentMode as "online" | "cash",
                  time: new Date().toISOString(),
                  ...(amountId ? { amountId } : {}),
                  ...(billNo ? { billNo } : {}),
                },
              ]
            : currentPaymentHistory.paymentHistory,
      }

      const newTotalPaid = updatedPaymentHistory.paymentHistory.reduce(
        (sum, payment) => sum + payment.amount,
        0
      )

      const updateData: any = {
        discount: newDiscountAmount, // Local DB uses 'discount' field name
        amount_paid: newTotalPaid,
        amount_paid_history: updatedPaymentHistory,
      }

      if (billNo) {
        updateData.bill_no = billNo
      }
      
      // Dexie.js update
      await db.registration.update(selectedRegistration.id, updateData)

      setSelectedRegistration(null)
      setNewAmountPaid("")
      setAmountId("")
      setBillNo("")
      setPaymentMode("online")
      alert("Payment and discount updated successfully locally!")

      // Refresh data based on current mode (global search vs date range)
      if (globalSearchResults) {
        handleGlobalSearch()
      } else {
        fetchRegistrations(startDate, endDate)
      }
      fetchDashboardStats()
    } catch (error: any) {
      console.error("Dashboard: Error updating payment and discount locally:", error.message)
      alert("Error updating payment and discount locally. Please try again.")
    }
  }, [
    selectedRegistration,
    newAmountPaid,
    tempDiscount,
    paymentMode,
    amountId,
    billNo,
    fetchRegistrations,
    fetchDashboardStats,
    startDate,
    endDate,
    globalSearchResults,
    handleGlobalSearch,
  ])

  const getFakeBillPatient = (reg: Registration | null) => {
    if (!reg) return null
    const tpa = reg.tpa === true
    return {
      ...reg,
      bloodTests: (reg.bloodTests || []).map((t: any) => ({
        ...t,
        price: tpa && typeof t.tpa_price === "number" ? t.tpa_price : t.price,
      })),
      tpa,
      bill_no: reg.bill_no,
    }
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <div className="flex-1 overflow-auto">
        <div className="p-8">
          <DashboardHeader
            metrics={metrics}
            showCheckboxes={showCheckboxes}
            setShowCheckboxes={setShowCheckboxes}
            selectedRegistrations={selectedRegistrations}
            registrations={registrations}
            handleDownloadMultipleBills={handleDownloadMultipleBills}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            globalSearchTerm={globalSearchTerm}
            setGlobalSearchTerm={setGlobalSearchTerm}
            handleGlobalSearch={handleGlobalSearch}
            clearGlobalSearch={clearGlobalSearch}
            isGlobalSearchActive={globalSearchResults !== null}
            startDate={startDate}
            setStartDate={setStartDate}
            endDate={endDate}
            setEndDate={setEndDate}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            isFiltersExpanded={isFiltersExpanded}
            handleToggleFilters={handleToggleFilters}
            isFilterContentMounted={isFilterContentMounted}
            hospitalFilterTerm={hospitalFilterTerm}
            setHospitalFilterTerm={setHospitalFilterTerm}
            loadedDataStartDate={startDate}
            loadedDataEndDate={endDate}
          />

          <RegistrationList
            filteredRegistrations={filteredRegistrations}
            isLoading={isLoading || isGlobalLoading}
            showCheckboxes={showCheckboxes}
            selectAll={selectAll}
            handleToggleSelectAll={handleToggleSelectAll}
            selectedRegistrations={selectedRegistrations}
            handleToggleSelect={handleToggleSelect}
            expandedRegistrationId={expandedRegistrationId}
            setExpandedRegistrationId={setExpandedRegistrationId}
            setSampleModalRegistration={setSampleModalRegistration}
            setSampleDateTime={setSampleDateTime}
            setSelectedRegistration={setSelectedRegistration}
            setNewAmountPaid={setNewAmountPaid}
            setTempDiscount={setTempDiscount}
            handleDownloadBill={handleDownloadBill}
            setFakeBillRegistration={setFakeBillRegistration}
            handleDeleteRegistration={handleDeleteRegistration}
            formatLocalDateTime={formatLocalDateTime}
          />
        </div>
      </div>

      <DashboardModals
        selectedRegistration={selectedRegistration}
        setSelectedRegistration={setSelectedRegistration}
        newAmountPaid={newAmountPaid}
        setNewAmountPaid={setNewAmountPaid}
        paymentMode={paymentMode}
        setPaymentMode={setPaymentMode}
        tempDiscount={tempDiscount}
        setTempDiscount={setTempDiscount}
        handleUpdateAmountAndDiscount={handleUpdateAmountAndDiscount}
        handleDownloadBill={handleDownloadBill}
        sampleModalRegistration={sampleModalRegistration}
        setSampleModalRegistration={setSampleModalRegistration}
        sampleDateTime={sampleDateTime}
        setSampleDateTime={setSampleDateTime}
        handleSaveSampleDate={handleSaveSampleDate}
        fakeBillRegistration={getFakeBillPatient(fakeBillRegistration)}
        setFakeBillRegistration={setFakeBillRegistration}
        formatLocalDateTime={formatLocalDateTime}
        deleteRequestModalRegistration={null}
        setDeleteRequestModalRegistration={function (reg: Registration | null): void {
          console.error("Delete request functionality is disabled in offline mode.")
        }}
        deleteReason={""}
        setDeleteReason={function (reason: string): void {
          console.error("Delete request functionality is disabled in offline mode.")
        }}
        submitDeleteRequest={function (): void {
          console.error("Delete request functionality is disabled in offline mode.")
        }}
        amountId={amountId}
        setAmountId={setAmountId}
        billNo={billNo}
        setBillNo={setBillNo}
      />
    </div>
  )
}