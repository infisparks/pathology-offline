"use client"

export const dynamic = 'force-dynamic';
import { Suspense, useEffect, useState, useCallback } from "react"
// ✅ CHANGED: Replaced useParams with useSearchParams
import { useRouter, useSearchParams } from "next/navigation"

// ✅ Using local Dexie DB and types
import { db } from "@/lib/localdb" 
import type {
  PatientData,
  BloodTestData,
  CombinedTestGroup,
  HistoricalTestEntry,
  ComparisonTestSelection,
} from "./types/report"
// Assuming these are client-side only libraries
import { generateReportPdf, generateAiSuggestions } from "./pdf-generator" 

// -----------------------------
// Helper Functions 
// -----------------------------
const toLocalDateTimeString = (dateInput?: string | Date) => {
  const date = dateInput ? new Date(dateInput) : new Date()
  const offset = date.getTimezoneOffset()
  const adjustedDate = new Date(date.getTime() - offset * 60 * 1000)
  return adjustedDate.toISOString().slice(0, 16)
}

const format12Hour = (isoString: string) => {
  const date = new Date(isoString)
  let hours = date.getHours()
  const minutes = date.getMinutes()
  const ampm = hours >= 12 ? "PM" : "AM"
  hours = hours % 12
  hours = hours ? hours : 12
  const minutesStr = minutes < 10 ? "0" + minutes : minutes
  const day = date.getDate().toString().padStart(2, "0")
  const month = (date.getMonth() + 1).toString().padStart(2, "0")
  const year = date.getFullYear()
  return `${day}/${month}/${year}, ${hours}:${minutesStr} ${ampm}`
}

const formatDMY = (date: Date | string) => {
  const d = typeof date === "string" ? new Date(date) : date
  const day = d.getDate().toString().padStart(2, "0")
  const month = (d.getMonth() + 1).toString().padStart(2, "0")
  const year = d.getFullYear()
  let hours = d.getHours()
  const mins = d.getMinutes().toString().padStart(2, "0")
  const ampm = hours >= 12 ? "PM" : "AM"
  hours = hours % 12 || 12
  const hrsStr = hours.toString().padStart(2, "0")
  return `${day}/${month}/${year}, ${hrsStr}:${mins} ${ampm}`
}

const generateId = () => {
  return Math.random().toString(36).substring(2, 9)
}

const slugifyTestName = (name: string) =>
  name
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[.#$[\]()]/g, "")

// -----------------------------
// Component
// -----------------------------
export default function DownloadReportPage() {
  return (
    <Suspense fallback={<div>Loading Report...</div>}>
      <DownloadReport />
    </Suspense>
  )
}

function DownloadReport() {
  const router = useRouter()
  // ✅ CHANGED: Use useSearchParams to get query parameters
  const searchParams = useSearchParams()
  // ✅ CHANGED: Get 'id' from query string (e.g., ?id=1)
  const registrationId = searchParams.get('id')
  // ✅ CHANGED: Safer parsing
  const regIdNum = registrationId ? parseInt(registrationId, 10) : NaN

  const [patientData, setPatientData] = useState<PatientData | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [selectedTests, setSelectedTests] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [combinedGroups, setCombinedGroups] = useState<CombinedTestGroup[]>([])
  const [showCombineInterface, setShowCombineInterface] = useState(false)
  const [draggedTest, setDraggedTest] = useState<string | null>(null)
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null)
  const [updateTimeModal, setUpdateTimeModal] = useState<{
    isOpen: boolean
    testKey: string
    currentTime: string
  }>({
    isOpen: false,
    testKey: "",
    currentTime: "",
  })
  const [updateSampleTimeModal, setUpdateSampleTimeModal] = useState<{
    isOpen: boolean
    currentTime: string
  }>({
    isOpen: false,
    currentTime: "",
  })
  const [updateRegistrationTimeModal, setUpdateRegistrationTimeModal] = useState({
    isOpen: false,
    currentTime: "",
  })

  // States for comparison report
  const [isComparisonMode, setIsComparisonMode] = useState(false)
  const [historicalTestsData, setHistoricalTestsData] = useState<Record<string, HistoricalTestEntry[]>>({})
  const [comparisonSelections, setComparisonSelections] = useState<Record<string, ComparisonTestSelection>>({})

  // --- State for test display options ---
  const [testDisplayOptions, setTestDisplayOptions] = useState<
    Record<string, { showUnit: boolean; showRange: boolean }>
  >({})

  // --- State for local blood test definitions (from JSON) ---
  const [allTestDefinitions, setAllTestDefinitions] = useState<any[]>([]) 


  // ✅ REWRITTEN: Fetch all data locally
  useEffect(() => {
    // ✅ CHANGED: Updated check for the new regIdNum variable
    if (isNaN(regIdNum)) {
      setError("Invalid or missing Registration ID. (Expected URL format: ...?id=1)")
      setLoading(false)
      return
    }

    const fetchAllData = async () => {
      try {
        setLoading(true)
        setError(null)
        
        // 1. Fetch JSON Test Definitions
        const jsonRes = await fetch('/bloodtest.json')
        if (!jsonRes.ok) throw new Error('Failed to load /bloodtest.json')
        const testDefs = await jsonRes.json()
        setAllTestDefinitions(testDefs)
        
        // 2. Fetch Registration Data from local Dexie DB
        const registrationData = await db.registration.get(regIdNum)
        if (!registrationData) {
          throw new Error("Registration not found in local database.")
        }

        // 3. Fetch Patient Details
        const patientData = await db.patientdetail.get(registrationData.patient_id)
        if (!patientData) {
          throw new Error("Patient details not found in local database.")
        }

        const patientdetial = patientData as any
        const parsedBloodtestData = registrationData.blood_tests || []
        let parsedBloodtestDetail = registrationData.bloodtest_detail || {}

        // 4. Map Interpretations from JSON
        const testInterpretations: Record<string, string> = {}
        testDefs.forEach((test: any) => {
          const slug = slugifyTestName(test.test_name)
          testInterpretations[slug] = test.interpretation || ""
        })

        // 5. Map Patient Data
        const mappedPatientData: PatientData = {
          id: patientdetial.id,
          name: patientdetial.name,
          age: patientdetial.age,
          gender: patientdetial.gender,
          patientId: patientdetial.patient_id,
          contact: patientdetial.number,
          total_day: patientdetial.total_day,
          day_type: patientdetial.day_type,
          title: patientdetial.title,
          hospitalName: registrationData.hospital_name,
          registration_id: registrationData.id as number,
          createdAt: registrationData.registration_time,
          sampleCollectedAt: registrationData.sample_collection_time,
          bloodtest_data: parsedBloodtestData,
          bloodtest_detail: parsedBloodtestDetail,
          doctorName: registrationData.doctor_name,
        }

        // 6. Map Blood Test Details for display
        const bloodtestFromDetail: Record<string, BloodTestData> = {}
        const detailKeyToOriginalTestName: Record<string, string> = {}
        parsedBloodtestData.forEach((test: any) => {
            const detailKey = slugifyTestName(test.testName)
            detailKeyToOriginalTestName[detailKey] = test.testName
        })

        if (parsedBloodtestDetail && typeof parsedBloodtestDetail === "object") {
          for (const [testKeyFromDetail, testData] of Object.entries(parsedBloodtestDetail)) {
            const testInfo = testData as any
            const originalTestNameForThisDetail = detailKeyToOriginalTestName[testKeyFromDetail]
            let interpretationToAssign = ""
            if (originalTestNameForThisDetail) {
              const correctSlugForLookup = slugifyTestName(originalTestNameForThisDetail)
              interpretationToAssign = testInterpretations[correctSlugForLookup] || ""
            } 
            bloodtestFromDetail[testKeyFromDetail] = {
              testId: testKeyFromDetail,
              parameters: testInfo.parameters || [],
              subheadings: testInfo.subheadings || [],
              descriptions: testInfo.descriptions || [],
              reportedOn: testInfo.reportedOn || null,
              enteredBy: testInfo.enteredBy || "offline_user",
              type: testInfo,
              interpretation: interpretationToAssign,
            }
          }
        }

        const finalBloodtestData = hideInvisible({ ...mappedPatientData, bloodtest: bloodtestFromDetail })
        setPatientData({ ...mappedPatientData, bloodtest: finalBloodtestData })

        // 7. Fetch Historical Data (All registrations for this patient, excluding current one)
        const historicalRegistrations = await db.registration
          .where('patient_id')
          .equals(patientdetial.id) // patientdetial.id is the local DB key
          .filter(reg => reg.id !== regIdNum)
          .reverse() // Sort descending by ID (proxy for time)
          .toArray()

        const aggregatedHistoricalData: Record<string, HistoricalTestEntry[]> = {}
        const initialComparisonSelections: Record<string, ComparisonTestSelection> = {}

        historicalRegistrations.forEach((reg: any) => {
          let regBloodtestDetail = reg.bloodtest_detail || {}
          let regBloodtestData = reg.blood_tests || [] // Use local field name

          for (const [testKey, testDetail] of Object.entries(regBloodtestDetail || {})) {
            const testInfo = testDetail as any
            const originalTestName = regBloodtestData?.find((t: any) => slugifyTestName(t.testName) === testKey)?.testName || testKey.replace(/_/g, " ")
            const reportedOn = testInfo.reportedOn || reg.registration_time

            if (!aggregatedHistoricalData[testKey]) {
              aggregatedHistoricalData[testKey] = []
            }
            aggregatedHistoricalData[testKey].push({
              registrationId: reg.id,
              reportedOn: reportedOn,
              testKey: testKey,
              parameters: testInfo.parameters || [],
            })

            if (!initialComparisonSelections[testKey]) {
              initialComparisonSelections[testKey] = {
                testName: originalTestName,
                slugifiedTestName: testKey,
                availableDates: [],
                selectedDates: [],
              }
            }
            initialComparisonSelections[testKey].availableDates.push({
              date: new Date(reportedOn).toISOString(),
              registrationId: reg.id,
              testKey: testKey,
              reportedOn: reportedOn,
            })
          }
        })

        // Finalize comparison selections
        for (const testKey in initialComparisonSelections) {
          initialComparisonSelections[testKey].availableDates.sort(
            (a, b) => new Date(a.reportedOn).getTime() - new Date(b.reportedOn).getTime(),
          )
          const numToSelect = testKey === "cbc" ? 4 : testKey === "lft" ? 3 : 0
          initialComparisonSelections[testKey].selectedDates = initialComparisonSelections[
            testKey
          ].availableDates
            .slice(-numToSelect)
            .map((d) => d.date)
        }

        setHistoricalTestsData(aggregatedHistoricalData)
        setComparisonSelections(initialComparisonSelections)
      } catch (error) {
        setError(error instanceof Error ? error.message : "Unknown error occurred")
        console.error("Local Data Fetch Error:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchAllData()
  }, [registrationId, regIdNum])

  // --- Initialize selected tests and display options ---
  useEffect(() => {
    if (patientData?.bloodtest) {
      const testKeys = Object.keys(patientData.bloodtest)
      setSelectedTests(testKeys)

      // Initialize display options with defaults (all true)
      const initialOptions: Record<string, { showUnit: boolean; showRange: boolean }> = {}
      for (const testKey of testKeys) {
        initialOptions[testKey] = { showUnit: true, showRange: true }
      }
      setTestDisplayOptions(initialOptions)
    }
  }, [patientData])

  // --- Handler for changing display options ---
  const handleDisplayOptionChange = (testKey: string, option: "showUnit" | "showRange") => {
    setTestDisplayOptions((prev) => ({
      ...prev,
      [testKey]: {
        ...prev[testKey],
        [option]: !prev[testKey][option],
      },
    }))
  }

  // Hide invisible parameters (no changes)
  const hideInvisible = (d: PatientData): Record<string, BloodTestData> => {
    const out: Record<string, BloodTestData> = {}
    if (!d.bloodtest) return out
    for (const k in d.bloodtest) {
      const t = d.bloodtest[k]
      if (t.type === "outsource") continue
      const keptParams = Array.isArray(t.parameters)
        ? t.parameters
            .filter((p) => p.visibility !== "hidden")
            .map((p) => ({
              ...p,
              subparameters: Array.isArray(p.subparameters)
                ? p.subparameters.filter((sp) => sp.visibility !== "hidden")
                : [],
            }))
        : []
      out[k] = {
        ...t,
        parameters: keptParams,
        subheadings: t.subheadings,
        reportedOn: t.reportedOn,
        descriptions: t.descriptions,
        interpretation: t.interpretation,
      }
    }
    return out
  }

  // ✅ REWRITTEN: Local time updates
  const updateReportedOnTime = (testKey: string) => {
    const test = patientData?.bloodtest_detail?.[testKey]
    if (!test) return
    const currentTime = test.reportedOn && test.reportedOn !== null ? toLocalDateTimeString(test.reportedOn) : toLocalDateTimeString()
    setUpdateTimeModal({ isOpen: true, testKey, currentTime })
  }

  const saveUpdatedTime = async () => {
    if (!patientData || !updateTimeModal.testKey || isNaN(regIdNum)) return
    try {
      const newReportedOn = new Date(updateTimeModal.currentTime).toISOString()
      const testKey = updateTimeModal.testKey
      
      const updatedBloodtestDetail = {
        ...patientData.bloodtest_detail,
        [testKey]: {
          ...(patientData.bloodtest_detail[testKey] as BloodTestData),
          reportedOn: newReportedOn,
          // Ensure structure is correct for the update
        },
      }
      
      // Dexie.js update
      await db.registration
        .update(regIdNum, { bloodtest_detail: updatedBloodtestDetail })

      // Update local state immediately
      setPatientData((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          bloodtest_detail: updatedBloodtestDetail,
          bloodtest: prev.bloodtest
            ? {
                ...prev.bloodtest,
                [testKey]: {
                  ...prev.bloodtest[testKey],
                  reportedOn: newReportedOn,
                },
              }
            : undefined,
        }
      })
      setUpdateTimeModal((prev) => ({ ...prev, isOpen: false }))
      alert("Report time updated successfully locally!")
    } catch (error) {
      alert("Failed to update report time locally.")
      console.error(error)
    }
  }

  const updateSampleCollectedTime = () => {
    const currentTime = patientData?.sampleCollectedAt
      ? toLocalDateTimeString(patientData.sampleCollectedAt)
      : toLocalDateTimeString()
    setUpdateSampleTimeModal({ isOpen: true, currentTime })
  }

  const updateRegistrationTime = () => {
    const currentTime = patientData?.createdAt ? toLocalDateTimeString(patientData.createdAt) : toLocalDateTimeString()
    setUpdateRegistrationTimeModal({ isOpen: true, currentTime })
  }

  const saveUpdatedSampleTime = async () => {
    if (!patientData || isNaN(regIdNum)) return
    try {
      const newSampleAt = new Date(updateSampleTimeModal.currentTime).toISOString()
      
      // Dexie.js update
      await db.registration
        .update(regIdNum, { sample_collection_time: newSampleAt })
        
      setPatientData((prev) => (prev ? { ...prev, sampleCollectedAt: newSampleAt } : prev))
      setUpdateSampleTimeModal((prev) => ({ ...prev, isOpen: false }))
      alert("Sample collected time updated successfully locally!")
    } catch (error) {
      alert("Failed to update sample collected time locally.")
      console.error(error)
    }
  }

  const saveUpdatedRegistrationTime = async () => {
    if (!patientData || isNaN(regIdNum)) return
    try {
      const newCreatedAt = new Date(updateRegistrationTimeModal.currentTime).toISOString()
      
      // Dexie.js update
      await db.registration
        .update(regIdNum, { registration_time: newCreatedAt })
        
      setPatientData((prev) => (prev ? { ...prev, createdAt: newCreatedAt } : prev))
      setUpdateRegistrationTimeModal((prev) => ({ ...prev, isOpen: false }))
      alert("Registration time updated successfully locally!")
    } catch (error) {
      alert("Failed to update registration time locally.")
      console.error(error)
    }
  }

  // Combined test group functions (no changes)
  const addCombinedGroup = () => {
    const newGroup: CombinedTestGroup = {
      id: generateId(),
      name: `Combined Group ${combinedGroups.length + 1}`,
      tests: [],
    }
    setCombinedGroups([...combinedGroups, newGroup])
  }
  const removeCombinedGroup = (groupId: string) => {
    setCombinedGroups(combinedGroups.filter((group) => group.id === groupId))
  }
  const updateGroupName = (groupId: string, newName: string) => {
    setCombinedGroups(combinedGroups.map((group) => (group.id === groupId ? { ...group, name: newName } : group)))
  }
  const handleDragStart = (testKey: string) => {
    setDraggedTest(testKey)
  }
  const handleDragOver = (e: React.DragEvent, groupId: string) => {
    e.preventDefault()
    setActiveGroupId(groupId)
  }
  const handleDragLeave = () => {
    setActiveGroupId(null)
  }
  const handleDrop = (e: React.DragEvent, groupId: string) => {
    e.preventDefault()
    if (!draggedTest) return
    const updatedGroups = combinedGroups.map((group) => {
      if (group.id === groupId) {
        if (!group.tests.includes(draggedTest)) {
          return {
            ...group,
            tests: [...group.tests, draggedTest],
          }
        }
      }
      return group
    })
    setCombinedGroups(updatedGroups)
    setDraggedTest(null)
    setActiveGroupId(null)
  }
  const removeTestFromGroup = (groupId: string, testKey: string) => {
    setCombinedGroups(
      combinedGroups.map((group) =>
        group.id === groupId ? { ...group, tests: group.tests.filter((t) => t !== testKey) } : group,
      ),
    )
  }

  // --- Download functions (Modified to remove server calls) ---
  const downloadPDF = async (reportType: "normal" | "comparison" | "combined", includeLetterhead: boolean) => {
    if (!patientData) return
    setIsSending(true)
    try {
      const skipCoverForDownload = true
      const blob = await generateReportPdf(
        patientData,
        selectedTests,
        combinedGroups,
        historicalTestsData,
        comparisonSelections,
        reportType,
        includeLetterhead,
        skipCoverForDownload,
        undefined,
        false,
        testDisplayOptions, 
      )
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `report-${patientData.name.replace(/\s+/g, "-").toLowerCase()}-${reportType}${
        includeLetterhead ? "" : "-no-letterhead"
      }.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      alert("Report downloaded successfully!")
    } catch (error) {
      console.error("Error generating or downloading PDF:", error)
      alert("Failed to generate PDF report.")
    } finally {
      setIsSending(false)
    }
  }

  const preview = async (reportType: "normal" | "comparison" | "combined", withLetter: boolean) => {
    if (!patientData) return
    try {
      const blob = await generateReportPdf(
        patientData,
        selectedTests,
        combinedGroups,
        historicalTestsData,
        comparisonSelections,
        reportType,
        withLetter,
        true, // Always skip cover for preview
        undefined,
        false,
        testDisplayOptions, 
      )
      const url = URL.createObjectURL(blob)
      window.open(url, "_blank")
      setTimeout(() => {
        URL.revokeObjectURL(url)
      }, 10_000)
    } catch (err) {
      console.error("Preview error:", err)
      alert("Failed to generate preview.")
    }
  }

  // ❌ REMOVED: All WhatsApp and AI generation functions (sendWhatsApp, sendWhatsAppWithoutAI, sendReportToGroup)
  // as they rely on server-side APIs (Supabase Storage and external WhatsApp service).
  // The corresponding buttons in the JSX below are commented out or replaced with stubs.

  // --- Loading and error states ---
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-lg text-gray-600">Loading patient data...</p>
        </div>
      </div>
    )
  }
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
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
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition duration-150 ease-in-out"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }
  if (!patientData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">No Data Found</h2>
          <p className="text-gray-600">No patient data found for this registration ID.</p>
        </div>
      </div>
    )
  }

  // Main UI
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-4xl w-full space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Report Actions Card */}
          <div className="bg-white rounded-xl shadow-lg p-8 space-y-4 col-span-1 md:col-span-2">
            <h2 className="text-3xl font-bold text-center text-gray-800 mb-6">Report Ready (Offline)</h2>
            <div className="p-4 bg-blue-50 rounded-lg mb-4">
              <h3 className="text-lg font-semibold text-gray-800 mb-2">Patient Information</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium">Name:</span> {patientData.title ? `${patientData.title} ` : ""}
                  {patientData.name}
                </div>
                {(patientData.patientId || patientData.registration_id) && (
                  <div>
                    <span className="font-medium">Patient ID:</span>{" "}
                    {patientData.patientId && patientData.registration_id
                      ? `${patientData.patientId}-${patientData.registration_id}`
                      : patientData.patientId || patientData.registration_id || "-"}
                  </div>
                )}
                {patientData.age && (
                  <div>
                    <span className="font-medium">Age/Gender:</span> {patientData.age}{" "}
                    {patientData.day_type || "Years"} / {patientData.gender}
                  </div>
                )}
                {patientData.contact && (
                  <div>
                    <span className="font-medium">Contact:</span> {patientData.contact}
                  </div>
                )}
              </div>
            </div>
            {/* Registration Time */}
            <div className="p-4 bg-gray-100 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700">Registration On:</p>
                  <p className="text-sm text-gray-600">
                    {patientData.createdAt ? format12Hour(patientData.createdAt) : "Not set"}
                  </p>
                </div>
                <button
                  onClick={updateRegistrationTime}
                  className="text-sm text-indigo-600 hover:text-indigo-800 flex items-center"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4 mr-1"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                  </svg>
                  Update Time
                </button>
              </div>
            </div>
            {/* Sample Collected Time */}
            <div className="p-4 bg-gray-100 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700">Sample Collected On:</p>
                  <p className="text-sm text-gray-600">
                    {patientData.sampleCollectedAt ? format12Hour(patientData.sampleCollectedAt) : "Not set"}
                  </p>
                </div>
                <button
                  onClick={updateSampleCollectedTime}
                  className="text-sm text-indigo-600 hover:text-indigo-800 flex items-center"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4 mr-1"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                  </svg>
                  Update Time
                </button>
              </div>
            </div>
            {/* Comparison Mode Checkbox */}
            <div className="p-4 bg-gray-100 rounded-lg">
              <label className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  className="form-checkbox h-5 w-5 text-indigo-600 rounded"
                  checked={isComparisonMode}
                  onChange={(e) => setIsComparisonMode(e.target.checked)}
                />
                <span className="text-gray-700 font-medium">Generate Comparison Report</span>
              </label>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <button
                onClick={() => downloadPDF("normal", true)}
                className="w-full flex items-center justify-center space-x-3 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-medium transition duration-150 ease-in-out"
                disabled={isSending}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
                <span>Download Report L-Head</span>
              </button>
              <button
                onClick={() => downloadPDF("normal", false)}
                className="w-full flex items-center justify-center space-x-3 bg-indigo-500 hover:bg-indigo-600 text-white px-6 py-3 rounded-xl font-medium transition duration-150 ease-in-out"
                disabled={isSending}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
                <span>Download Report No L-Head</span>
              </button>
              <button
                onClick={() => downloadPDF("combined", true)}
                className="w-full flex items-center justify-center space-x-3 bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-xl font-medium transition duration-150 ease-in-out"
                disabled={isSending}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2m-6 0h.01M12 16l2 2m0 0l2-2m-2 2V9"
                  />
                </svg>
                <span>Download Combined</span>
              </button>
              <button
                onClick={() => downloadPDF("comparison", true)}
                className="w-full flex items-center justify-center space-x-3 bg-sky-600 hover:bg-sky-700 text-white px-6 py-3 rounded-xl font-medium transition duration-150 ease-in-out"
                disabled={isSending}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
                <span>Download Comparison</span>
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                onClick={() => preview(isComparisonMode ? "comparison" : "normal", true)}
                className="w-full flex items-center justify-center space-x-3 bg-gray-600 hover:bg-gray-700 text-white px-6 py-3 rounded-xl font-medium transition duration-150 ease-in-out"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7-1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                  />
                </svg>
                <span>Preview (Letterhead)</span>
              </button>
              <button
                onClick={() => preview(isComparisonMode ? "comparison" : "normal", false)}
                className="w-full flex items-center justify-center space-x-3 bg-gray-600 hover:bg-gray-700 text-white px-6 py-3 rounded-xl font-medium transition duration-150 ease-in-out"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7-1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                  />
                </svg>
                <span>Preview (No letterhead)</span>
              </button>
            </div>
            {/* ❌ Removed all WhatsApp/AI buttons */}
          </div>

          {/* Test Selection Card */}
          {!isComparisonMode && (
            <div className="bg-white rounded-xl shadow-lg p-8 space-y-4">
              <h2 className="text-2xl font-bold text-gray-800 mb-4">Select Tests to Include</h2>
              <div className="space-y-3">
                {patientData.bloodtest &&
                  Object.entries(patientData.bloodtest).map(([testKey, testData]) => (
                    <div key={testKey} className="border rounded-lg p-3 bg-gray-50">
                      <div className="flex items-center justify-between mb-2">
                        <label className="flex items-center space-x-3">
                          <input
                            type="checkbox"
                            className="form-checkbox h-5 w-5 text-indigo-600 rounded"
                            checked={selectedTests.includes(testKey)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedTests([...selectedTests, testKey])
                              } else {
                                setSelectedTests(selectedTests.filter((key) => key !== testKey))
                              }
                            }}
                          />
                          <span className="text-gray-700 font-medium">{testKey.replace(/_/g, " ")}</span>
                        </label>
                        <button
                          onClick={() => updateReportedOnTime(testKey)}
                          className="text-sm text-indigo-600 hover:text-indigo-800 flex items-center"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-4 w-4 mr-1"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                            />
                          </svg>
                          Update Time
                        </button>
                      </div>

                      {/* Unit/Range Checkboxes */}
                      <div className="flex items-center space-x-4 mt-2 pl-8">
                        <label className="flex items-center space-x-2 text-sm text-gray-600 cursor-pointer">
                          <input
                            type="checkbox"
                            className="form-checkbox h-4 w-4 text-indigo-600 rounded"
                            checked={testDisplayOptions[testKey]?.showUnit ?? true}
                            onChange={() => handleDisplayOptionChange(testKey, "showUnit")}
                          />
                          <span>Show Unit</span>
                        </label>
                        <label className="flex items-center space-x-2 text-sm text-gray-600 cursor-pointer">
                          <input
                            type="checkbox"
                            className="form-checkbox h-4 w-4 text-indigo-600 rounded"
                            checked={testDisplayOptions[testKey]?.showRange ?? true}
                            onChange={() => handleDisplayOptionChange(testKey, "showRange")}
                          />
                          <span>Show Range</span>
                        </label>
                      </div>

                      <div className="ml-8 mt-2 text-sm text-gray-600">
                        <span className="font-medium">Reported On:</span>{" "}
                        {(testData as BloodTestData).reportedOn && (testData as BloodTestData).reportedOn !== null ? (
                          <span>{format12Hour((testData as BloodTestData).reportedOn as string)}</span>
                        ) : (
                          <span className="text-orange-600 italic">Not set</span>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Comparison/Combined Cards (no changes to the UI structure) */}
          {isComparisonMode && (
            <div className="bg-white rounded-xl shadow-lg p-8 space-y-4 col-span-1 md:col-span-2">
              <h2 className="text-2xl font-bold text-gray-800 mb-4">Select Tests and Dates for Comparison</h2>
              <div className="space-y-4">
                {Object.values(comparisonSelections).map((selection) => (
                  <div key={selection.slugifiedTestName} className="border rounded-lg p-4">
                    <h3 className="text-lg font-semibold text-gray-800 mb-2">
                      {selection.testName} ({selection.availableDates.length} reports available)
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {selection.availableDates.map((dateEntry) => (
                        <label
                          key={dateEntry.date}
                          className="flex items-center space-x-2 bg-gray-100 px-3 py-1 rounded-full text-sm"
                        >
                          <input
                            type="checkbox"
                            className="form-checkbox h-4 w-4 text-indigo-600 rounded"
                            checked={selection.selectedDates.includes(dateEntry.date)}
                            onChange={(e) => {
                              setComparisonSelections((prev) => {
                                const newSelectedDates = e.target.checked
                                  ? [...prev[selection.slugifiedTestName].selectedDates, dateEntry.date]
                                  : prev[selection.slugifiedTestName].selectedDates.filter(
                                      (d) => d !== dateEntry.date,
                                    )
                                return {
                                  ...prev,
                                  [selection.slugifiedTestName]: {
                                    ...prev[selection.slugifiedTestName],
                                    selectedDates: newSelectedDates,
                                  },
                                }
                              })
                            }}
                          />
                          <span className="text-gray-700">
                            {new Date(dateEntry.reportedOn).toLocaleDateString("en-GB", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                            })}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {!isComparisonMode && (
            <div className="bg-white rounded-xl shadow-lg p-8 space-y-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-gray-800">Combine Tests</h2>
                <button
                  onClick={() => setShowCombineInterface(!showCombineInterface)}
                  className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl transition duration-150 ease-in-out"
                >
                  {showCombineInterface ? "Hide" : "Show"} Interface
                </button>
              </div>
              {showCombineInterface && (
                <>
                  <div className="space-y-4">
                    {combinedGroups.map((group) => (
                      <div
                        key={group.id}
                        className={`border-2 rounded-xl p-4 ${
                          activeGroupId === group.id ? "border-blue-500" : "border-gray-300"
                        }`}
                        onDragOver={(e) => handleDragOver(e, group.id)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, group.id)}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <input
                            type="text"
                            value={group.name}
                            onChange={(e) => updateGroupName(group.id, e.target.value)}
                            className="w-1/2 px-3 py-2 border rounded-md text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                          <button
                            onClick={() => removeCombinedGroup(group.id)}
                            className="px-3 py-1 bg-red-500 hover:bg-red-700 text-white rounded-xl transition duration-150 ease-in-out"
                          >
                            Remove Group
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {group.tests.map((testKey) => (
                            <div
                              key={testKey}
                              draggable="true"
                              onDragStart={() => handleDragStart(testKey)}
                              className="bg-yellow-100 px-3 py-1 rounded-full text-sm cursor-grab"
                            >
                              {testKey.replace(/_/g, " ")}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={addCombinedGroup}
                    className="px-4 py-2 bg-green-500 hover:bg-green-700 text-white rounded-xl transition duration-150 ease-in-out"
                  >
                    Add New Group
                  </button>
                  <div className="border-t pt-4">
                    <h3 className="text-lg font-semibold text-gray-700 mb-2">Drag Tests to Groups</h3>
                    <div className="flex flex-wrap gap-2">
                      {patientData.bloodtest &&
                        Object.keys(patientData.bloodtest).map((testKey) => (
                          <div
                            key={testKey}
                            draggable="true"
                            onDragStart={() => handleDragStart(testKey)}
                            className="bg-yellow-100 px-3 py-1 rounded-full text-sm cursor-grab"
                          >
                            {testKey.replace(/_/g, " ")}
                          </div>
                        ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {updateTimeModal.isOpen && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3 text-center">
              <h3 className="text-lg leading-6 font-medium text-gray-900">Update Report Time (Local)</h3>
              <div className="mt-2 px-7 py-3">
                <input
                  type="datetime-local"
                  className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                  value={updateTimeModal.currentTime}
                  onChange={(e) => setUpdateTimeModal({ ...updateTimeModal, currentTime: e.target.value })}
                />
              </div>
              <div className="items-center px-4 py-3">
                <button
                  className="px-4 py-2 bg-green-500 text-white text-base font-medium rounded-md w-full shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-300"
                  onClick={saveUpdatedTime}
                >
                  Save
                </button>
                <button
                  className="px-4 py-2 bg-red-500 text-white text-base font-medium rounded-md w-full shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-300 mt-2"
                  onClick={() => setUpdateTimeModal((prev) => ({ ...prev, isOpen: false }))}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {updateSampleTimeModal.isOpen && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3 text-center">
              <h3 className="text-lg leading-6 font-medium text-gray-900">Update Sample Collected Time (Local)</h3>
              <div className="mt-2 px-7 py-3">
                <input
                  type="datetime-local"
                  className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                  value={updateSampleTimeModal.currentTime}
                  onChange={(e) => setUpdateSampleTimeModal({ ...updateSampleTimeModal, currentTime: e.target.value })}
                />
              </div>
              <div className="items-center px-4 py-3">
                <button
                  className="px-4 py-2 bg-green-500 text-white text-base font-medium rounded-md w-full shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-300"
                  onClick={saveUpdatedSampleTime}
                >
                  Save
                </button>
                <button
                  className="px-4 py-2 bg-red-500 text-white text-base font-medium rounded-md w-full shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-300 mt-2"
                  onClick={() => setUpdateSampleTimeModal((prev) => ({ ...prev, isOpen: false }))}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {updateRegistrationTimeModal.isOpen && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3 text-center">
              <h3 className="text-lg leading-6 font-medium text-gray-900">Update Registration Time (Local)</h3>
              <div className="mt-2 px-7 py-3">
                <input
                  type="datetime-local"
                  className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                  value={updateRegistrationTimeModal.currentTime}
                  onChange={(e) =>
                    setUpdateRegistrationTimeModal((prev) => ({ ...prev, currentTime: e.target.value }))
                  }
                />
              </div>
              <div className="items-center px-4 py-3">
                <button
                  className="px-4 py-2 bg-green-500 text-white text-base font-medium rounded-md w-full shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-300"
                  onClick={saveUpdatedRegistrationTime}
                >
                  Save
                </button>
                <button
                  className="px-4 py-2 bg-red-500 text-white text-base font-medium rounded-md w-full shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-300 mt-2"
                  onClick={() => setUpdateRegistrationTimeModal((prev) => ({ ...prev, isOpen: false }))}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
