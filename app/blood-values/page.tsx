"use client"

export const dynamic = 'force-dynamic'; // <-- Add this line
import type React from "react"

import { useEffect, useState, useCallback, Suspense } from "react" // ✅ Added Suspense

import { useForm, type SubmitHandler, type Path } from "react-hook-form"

// ✅ CHANGED: Replaced useParams with useSearchParams
import { useSearchParams, useRouter } from "next/navigation"

// ✅ FIXED: Relative paths
import { db, type PatientDetailRow, type RegistrationRow } from "../../lib/localdb"
import { Droplet, User, AlertCircle, CheckCircle, Loader2, Calculator, CircleUserRound } from "lucide-react" 

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card"

import { Input } from "../../components/ui/input"

import { Button } from "../../components/ui/button"

import { Label } from "../../components/ui/label"
import { Textarea } from "../../components/ui/textarea" 

import { cn } from "../../lib/utils" 

import { Badge } from "../../components/ui/badge"

import { Separator } from "../../components/ui/separator"

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../../components/ui/tooltip"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog" 
// ✅ FIXED: Relative path
import { generateReportPdf } from "../download-report/pdf-generator" 
// ✅ FIXED: Relative path
import type { PatientData, CombinedTestGroup, HistoricalTestEntry, ComparisonTestSelection, BloodTestData } from "../download-report/types/report" 
/* ─────────────────── Types ─────────────────── */

interface SubParameterValue {
  name: string
  unit: string
  value: string | number
  range: string
  formula?: string
  valueType: "number" | "text"
}

interface TestParameterValue {
  name: string
  unit: string
  value: string | number
  range: string
  formula?: string
  valueType: "number" | "text"
  visibility?: string
  subparameters?: SubParameterValue[]
  suggestions?: { shortName: string; description: string }[]
  // Fields needed from JSON structure
  defaultValue?: string | number
  rangeKey?: string
}

interface SubHeading {
  title: string
  parameterNames: string[]
  is100?: boolean | string
}

// Type matching the structure of an entry in /bloodtest.json
interface BloodTestDefinition {
  id: number
  test_name: string
  interpretation?: string
  parameter: TestParameterValue[] // The definition of parameters
  sub_heading: SubHeading[]
}

interface TestValueEntry {
  testId: number 
  testName: string
  testType: string
  parameters: TestParameterValue[]
  subheadings?: SubHeading[]
  selectedParameters?: string[]
}

interface BloodValuesFormInputs {
  registrationId: string
  tests: TestValueEntry[]
}

export type IndexedParam = TestParameterValue & { originalIndex: number }

// --- FIX: Define a local map type that is structurally compatible with the desired output ---
// NOTE: Since the external BloodTestData type expects `testId: string`, we need to 
// create a structural equivalent that satisfies both the local code (which uses number for testId) 
// and the external type system (which requires certain fields).
interface BloodtestDetailMap {
  [testSlug: string]: {
    parameters: any[];
    subheadings: SubHeading[];
    // FIX: Must allow null to resolve error 2322/2352 related to PatientData.bloodtest_detail
    reportedOn: string | null; 
    enteredBy: string;
    // FIX: Test ID is locally a number, but external types might expect string. We must manage this in mapping.
    testId: number; 
    testName: string; // Required for mapping logic
    interpretation: string;
    createdAt?: string; 
    // Add type field to fully satisfy potential BloodTestData structural requirements
    type?: any; 
    descriptions?: any;
  };
}

// --- FIX: Create an intermediate type for coercion to fix error 2322 ---
// This type is used purely to satisfy the compiler when assigning BloodtestDetailMap 
// to the PatientData's Record<string, BloodTestData> which is externally defined.
type CoercedBloodtestDetail = Record<string, Omit<BloodTestData, 'testId'> & { testId: number }>;


/* ───────────── Helpers ───────────── */

const parseRange = (rangeStr: string): { min?: number; max?: number } => {
  const range = rangeStr.trim()
  if (range === "") return {}
  const hyphenParts = range.split("-")
  if (hyphenParts.length === 2) {
    const min = Number.parseFloat(hyphenParts[0])
    const max = Number.parseFloat(hyphenParts[1])
    if (!isNaN(min) && !isNaN(max)) return { min, max }
  }

  if (range.startsWith("<")) {
    const max = Number.parseFloat(range.slice(1))
    if (!isNaN(max)) return { max }
  } else if (range.startsWith(">")) {
    const min = Number.parseFloat(range.slice(1))
    if (!isNaN(min)) return { min }
  }

  if (range.startsWith("≤")) {
    const max = Number.parseFloat(range.slice(1))
    if (!isNaN(max)) return { max }
  } else if (range.startsWith("≥")) {
    const min = Number.parseFloat(range.slice(1))
    if (!isNaN(min)) return { min }
  }

  return {}
}

const parseRangeKey = (key: string): { lower: number; upper: number } => {
  if (!key) return { lower: 0, upper: 99999 } 

  const unit = key.trim().slice(-1).toLowerCase()
  const [l, u] = key.slice(0, -1).split("-").map(Number)

  let lowerDays = l
  let upperDays = u

  switch (unit) {
    case "y":
      lowerDays = l * 365
      upperDays = u * 365
      break
    case "m":
      lowerDays = l * 30
      upperDays = u * 30
      break
    case "d":
      // Already in days, no conversion needed
      break
    default:
      if (key.includes('-') && !isNaN(l) && !isNaN(u)) {
        return { lower: 0, upper: 99999 }
      }
      break
  }
  return { lower: lowerDays, upper: upperDays }
}


/* ---------- dropdown position helper ---------- */
interface SuggestPos {
  t: number
  p: number
  x: number
  y: number
  width: number
}

// Helper to extract parameter names from a formula string
const getFormulaDependencies = (formula: string): string[] => {
  const matches = formula.match(/[a-zA-Z_][a-zA-Z0-9_]*/g)
  const keywords = new Set(["Math", "abs", "round", "floor", "ceil", "min", "max", "log", "pow", "sqrt"])
  return Array.from(new Set(matches?.filter((m) => !keywords.has(m)) || []))
}

/* ------------------------------------------------------------------ */

const getFormDataForPreview = (
  currentTests: TestValueEntry[],
  patientDetails: PatientData, 
  fullPatientData: PatientData | null,
): PatientData | null => {
  if (!patientDetails || !fullPatientData) return null;

  // FIX: Use BloodtestDetailMap type for strict indexing
  const bloodtestDetail: BloodtestDetailMap = {}; 

  for (const t of currentTests) {
    const key = t.testName
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[.#$[\]()]/g, ""); 

    const params = t.parameters
      .map((p) => {
        const subs = p.subparameters?.filter((sp) => sp.value !== "") ?? [];
        if (p.value !== "" || subs.length) {
          const obj: any = { ...p, subparameters: subs };
          const strValue = String(p.value);
          
          // Custom parsing logic for value
          if (p.valueType === "number" && strValue !== "") {
              const numValue = Number(strValue);
              if (strValue === "-" || strValue === ".") {
                  obj.value = strValue;
              } else if (/^[<>]/.test(strValue)) {
                  obj.value = strValue;
              } else {
                  obj.value = isNaN(numValue) ? strValue : (strValue.includes(".") && strValue.endsWith("0") ? strValue : numValue);
              }
          } else {
              obj.value = strValue;
          }

          // Subparameters processing
          subs.forEach((sp) => {
            const spStr = String(sp.value);
            if (sp.valueType === "number" && spStr !== "") {
              const spNum = Number(spStr);
              if (spStr === "-" || spStr === ".") {
                sp.value = spStr;
              } else if (/^[<>]/.test(spStr)) {
                  sp.value = spStr;
              } else {
                sp.value = isNaN(spNum) ? spStr : (spStr.includes(".") && spStr.endsWith("0") ? spStr : spNum);
              }
            }
          });
          return obj;
        }
        return null;
      })
      .filter(Boolean) as TestParameterValue[];

    if (params.length > 0) {
      // FIX: Ensure fullPatientData.bloodtest is treated as the correct map type
      const existingBloodtestData = fullPatientData.bloodtest as unknown as BloodtestDetailMap;

      bloodtestDetail[key] = {
        parameters: params,
        testId: t.testId,
        testName: t.testName, 
        subheadings: t.subheadings || [],
        createdAt: existingBloodtestData?.[key]?.createdAt || new Date().toISOString(),
        reportedOn: existingBloodtestData?.[key]?.reportedOn || new Date().toISOString(),
        enteredBy: existingBloodtestData?.[key]?.enteredBy || "offline_user",
        interpretation: existingBloodtestData?.[key]?.interpretation || "", 
      };
    }
  }

  // FIX: Coerce the result to the desired structural type for PatientData
  const finalBloodtest: Record<string, BloodTestData> = {};
  for (const key in bloodtestDetail) {
    const detail = bloodtestDetail[key];
    finalBloodtest[key] = {
      testId: String(detail.testId), // Coerce number to string for external type compatibility
      parameters: detail.parameters,
      subheadings: detail.subheadings,
      reportedOn: detail.reportedOn,
      enteredBy: detail.enteredBy,
      interpretation: detail.interpretation,
      // Add missing fields from BloodTestData if required, using sensible defaults/values from detail
      testName: detail.testName,
    } as BloodTestData;
  }


  return {
    ...fullPatientData,
    bloodtest: finalBloodtest,
  };
};

// ✅ ADDED: A wrapper component to handle Suspense for useSearchParams
export default function BloodValuesPage() {
  return (
    <Suspense fallback={<CenterCard icon={Loader2} spin>Loading Page...</CenterCard>}>
      <BloodValuesForm />
    </Suspense>
  )
}

const BloodValuesForm: React.FC = () => {
  const router = useRouter()
  // ✅ CHANGED: Use useSearchParams hook
  const searchParams = useSearchParams()
  // ✅ CHANGED: Get 'id' from query string
  const registrationId = searchParams.get('id')

  const [loading, setLoading] = useState(true)
  const [dbText, setDbText] = useState<string[]>(["Negative", "Positive", "Not Detected", "Trace"]) 
  const [suggest, setSuggest] = useState<string[]>([])
  const [showSug, setShowSug] = useState<SuggestPos | null>(null)
  const [warn100, setWarn100] = useState<Record<string, boolean>>({})
  const [patientDetails, setPatientDetails] = useState<PatientData | null>(null)
  const [showPreviewModal, setShowPreviewModal] = useState(false) 
  const [pdfUrl, setPdfUrl] = useState<string | null>(null) 
  const [fullPatientData, setFullPatientData] = useState<PatientData | null>(null) 
  const [allTestDefinitions, setAllTestDefinitions] = useState<BloodTestDefinition[]>([]) 


  const {
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<BloodValuesFormInputs>({
    defaultValues: { registrationId: registrationId || "", tests: [] },
  })

  // ✅ NEW: Fetch all blood test definitions from local JSON
  useEffect(() => {
    fetch('/bloodtest.json')
      .then(res => {
        if (!res.ok) throw new Error('Failed to load /bloodtest.json');
        return res.json();
      })
      .then(data => setAllTestDefinitions(data as BloodTestDefinition[]))
      .catch(e => console.error("Error fetching blood test definitions:", e));
  }, []);


  /* ── Fetch patient’s booked tests and definitions (LOCAL DB + JSON) ── */
  useEffect(() => {
    if (!registrationId || allTestDefinitions.length === 0) return
    
    const regIdNum = Number(registrationId)
    if (isNaN(regIdNum)) {
        console.error("Invalid registration ID.");
        setLoading(false);
        return;
    }

    ;(async () => {
      try {
        // 1. Fetch Registration Data from local Dexie DB
        const registrationData = await db.registration.get(regIdNum)
        
        if (!registrationData) {
          console.error("Registration not found in local DB.")
          setLoading(false)
          return
        }

        // 2. Fetch Patient Details
        const patientData = await db.patientdetail.get(registrationData.patient_id)
        
        if (!patientData) {
          console.error("Patient details not found in local DB.")
          setLoading(false)
          return
        }

        const bookedTests = registrationData.blood_tests || [] 
        // FIX: Ensure storedBloodtestDetail is cast to the interface type
        const storedBloodtestDetail = (registrationData.bloodtest_detail || {}) as BloodtestDetailMap; 

        // Calculate age in days
        let ageDays = patientData.age || 0
        switch (patientData.day_type?.toLowerCase()) {
          case "year":
            ageDays *= 365
            break
          case "month":
            ageDays *= 30
            break
          case "day":
            // Already in days
            break
          default:
            ageDays *= 365
            break
        }
        // FIX: Ensure gender is handled safely as it might be null/undefined in DB
        const patientGender = patientData.gender?.toLowerCase()
        const genderKey = patientGender === "male" ? "male" : "female"
        
        console.log(`Patient age: ${patientData.age} ${patientData.day_type}, calculated age in days: ${ageDays}`)

        // 3. Prepare Test Interpretations from JSON
        const testInterpretations: Record<string, string> = {}
        allTestDefinitions.forEach((test: any) => {
          const slug = test.test_name.toLowerCase().replace(/\s+/g, "_").replace(/[.#$[\]()]/g, "")
          testInterpretations[slug] = test.interpretation || ""
        })

        // 4. Map Patient and Registration Data to PatientData type
        const mappedPatientData: PatientData = {
          id: patientData.id!,
          name: patientData.name || "", // FIX: Default to ""
          age: patientData.age || 0,
          // FIX: Assign a non-null string by falling back to ""
          gender: patientData.gender || "", 
          patientId: String(patientData.patient_id || ""), // FIX: Default to ""
          contact: String(patientData.number || ""), // FIX: Default to ""
          total_day: String(patientData.total_day || 0),
          // FIX: make sure to assign as the correct union type, not string
          day_type: patientData.day_type as "year" | "month" | "day" || "year", // FIX: Default to "year", typed for PatientData interface
          title: patientData.title || "", // FIX: Default to ""
          hospitalName: registrationData.hospital_name || "", // FIX: Default to ""
          registration_id: registrationData.id!,
          createdAt: registrationData.registration_time || new Date().toISOString(), // FIX: Default to current time
          sampleCollectedAt: registrationData.sample_collection_time || new Date().toISOString(), // FIX: Default to current time
          bloodtest_data: bookedTests,
          bloodtest_detail: storedBloodtestDetail as any, // Coerce for assignment, handled in step 6
          doctorName: registrationData.doctor_name || "", // FIX: Default to ""
        }
        
        // 5. Build form structure (TestValueEntry[])
        const tests: TestValueEntry[] = bookedTests.map((bt: any) => {
            const testDefData = allTestDefinitions.find(def => def.test_name === bt.testName)

            if (!testDefData) {
                console.warn(`Test definition not found in JSON for ${bt.testName}`)
                return {
                    testId: bt.testId,
                    testName: bt.testName,
                    testType: bt.testType,
                    parameters: [],
                    subheadings: [],
                    selectedParameters: bt.selectedParameters,
                } as TestValueEntry
            }

            const allParams = Array.isArray(testDefData.parameter) ? testDefData.parameter : []
            const subheadings = Array.isArray(testDefData.sub_heading) ? testDefData.sub_heading : []

            const wanted = bt.selectedParameters?.length
                ? allParams.filter((p: any) => bt.selectedParameters.includes(p.name))
                : allParams

            const params: TestParameterValue[] = wanted.map((p: any) => {
                const ranges = p.range?.[genderKey] || []
                let normal = ""
                for (const r of ranges) {
                    const { lower, upper } = parseRangeKey(r.rangeKey)
                    if (ageDays >= lower && ageDays <= upper) {
                        normal = r.rangeValue
                        break
                    }
                }
                if (!normal && ranges.length) normal = ranges[ranges.length - 1].rangeValue

                const testKey = bt.testName
                    .toLowerCase()
                    .replace(/\s+/g, "_")
                    .replace(/[.#$[\]()]/g, "")

                // FIX: Use key access on storedBloodtestDetail
                const saved = storedBloodtestDetail[testKey]?.parameters?.find((q: any) => q.name === p.name)

                let subps: SubParameterValue[] | undefined
                if (Array.isArray(p.subparameters)) {
                    subps = p.subparameters.map((s: any) => {
                        const sr = s.range?.[genderKey] || []
                        let sNorm = ""
                        for (const x of sr) {
                            const { lower, upper } = parseRangeKey(x.rangeKey)
                            if (ageDays >= lower && ageDays <= upper) {
                                sNorm = x.rangeValue
                                break
                            }
                        }
                        if (!sNorm && sr.length) sNorm = sr[sr.length - 1].rangeValue
                        const savedSp = saved?.subparameters?.find((z: any) => z.name === s.name)
                        return {
                            name: s.name,
                            unit: s.unit,
                            value: savedSp ? savedSp.value : "",
                            range: sNorm,
                            formula: s.formula || "",
                            valueType: s.valueType || "number",
                        } as SubParameterValue
                    })
                }

                return {
                    name: p.name,
                    unit: p.unit,
                    value: saved ? saved.value : p.defaultValue !== undefined ? p.defaultValue : "",
                    range: normal,
                    formula: p.formula || "",
                    valueType: p.valueType || "number",
                    visibility: p.visibility ?? "visible",
                    ...(subps ? { subparameters: subps } : {}),
                    ...(p.suggestions ? { suggestions: p.suggestions } : {}),
                } as TestParameterValue
            })

            return {
                testId: testDefData.id,
                testName: bt.testName,
                testType: bt.testType,
                parameters: params,
                subheadings: subheadings,
                selectedParameters: bt.selectedParameters,
            } as TestValueEntry
        })


        const mappedBloodtestDetail: BloodtestDetailMap = {}; 
        for (const t of tests) {
          const key = t.testName
            .toLowerCase()
            .replace(/\s+/g, "_")
            .replace(/[.#$[\]()]/g, "")

          const interpretation = allTestDefinitions.find(def => def.id === t.testId)?.interpretation || "";
          
          const existingTestDetail = storedBloodtestDetail[key];

          mappedBloodtestDetail[key] = {
            parameters: existingTestDetail?.parameters || t.parameters, 
            subheadings: t.subheadings || [],
            reportedOn: existingTestDetail?.reportedOn || new Date().toISOString(),
            enteredBy: existingTestDetail?.enteredBy || "offline_user", 
            testId: t.testId,
            testName: t.testName,
            interpretation: interpretation, 
            createdAt: existingTestDetail?.createdAt || new Date().toISOString(), 
          };
        }

        // 6. Final Coercion step to satisfy PatientData's strict Record<string, BloodTestData> type
        const finalBloodtest: Record<string, BloodTestData> = {};
        for (const key in mappedBloodtestDetail) {
          const detail = mappedBloodtestDetail[key];
          finalBloodtest[key] = {
            testId: String(detail.testId), // Coerce number to string for external type compatibility
            parameters: detail.parameters,
            subheadings: detail.subheadings,
            reportedOn: detail.reportedOn,
            enteredBy: detail.enteredBy,
            interpretation: detail.interpretation,
            testName: detail.testName,
            type: detail.type || "inhospital", // Default or ensure field existence
            descriptions: detail.descriptions || [],
          } as BloodTestData; // Final explicit cast
        }

        // FIX: The PatientData type is expected by the external report generator.
        // It's highly likely it requires a Record<string, BloodTestData> for 'bloodtest'.
        // We ensure patientDetails is constructed with the correct types.
        setPatientDetails({ ...mappedPatientData, bloodtest_detail: mappedBloodtestDetail as any }); 
        setFullPatientData({
          ...mappedPatientData,
          bloodtest: finalBloodtest, // Assign the coerced final map
        })

        reset({ registrationId, tests })
      } catch (e) {
        console.error("Error in fetching data for form:", e)
      } finally {
        setLoading(false)
      }
    })()
  }, [registrationId, allTestDefinitions, reset]) 

  /* ══════════════ “Sum to 100” warning logic ══════════════ */
  const testsWatch = watch("tests")
  useEffect(() => {
    const warn: Record<string, boolean> = {}
    testsWatch.forEach((t, tIdx) => {
      t.subheadings?.forEach((sh, shIdx) => {
        if (!(sh.is100 === true || sh.is100 === "true")) return
        const tag = `${tIdx}-${shIdx}`
        const idxs = sh.parameterNames.map((n) => t.parameters.findIndex((p) => p.name === n)).filter((i) => i >= 0)
        let sum = 0
        idxs.forEach((i) => {
          const v = +testsWatch[tIdx].parameters[i].value
          if (!isNaN(v)) sum += v
        })
        warn[tag] = sum > 100.0001
      })
    })
    setWarn100(warn)
  }, [testsWatch])

  /* ══════════════ Automatic Formula recalculation ══════════════ */
  const calcFormulaOnce = useCallback(
    (tIdx: number, pIdx: number) => {
      const data = watch("tests")[tIdx]
      const p = data.parameters[pIdx]
      if (!p.formula || p.valueType !== "number") return

      const nums: Record<string, number> = {}
      data.parameters.forEach((x) => {
        const v = +x.value
        if (!isNaN(v)) nums[x.name] = v
      })

      let expr = p.formula
      Object.entries(nums).forEach(([k, v]) => {
        expr = expr.replace(new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), v + "")
      })

      try {
        const r = Function('"use strict";return (' + expr + ");")()
        if (!isNaN(r)) {
          // Format to exactly 2 decimal places
          const formatted = Number(r).toFixed(2)
          setValue(`tests.${tIdx}.parameters.${pIdx}.value`, formatted, { shouldValidate: false })
        }
      } catch (e) {
        console.error(`Error evaluating formula for ${p.name}:`, e)
      }
    },
    [setValue, watch],
  )

  useEffect(() => {
    testsWatch.forEach((test, tIdx) => {
      test.parameters.forEach((param, pIdx) => {
        if (param.formula && param.valueType === "number") {
          const dependencies = getFormulaDependencies(param.formula)
          const allDependenciesMet = dependencies.every((depName) => {
            const depParam = test.parameters.find((p) => p.name === depName)
            return depParam && !isNaN(+depParam.value)
          })
          if (allDependenciesMet) {
            calcFormulaOnce(tIdx, pIdx)
          }
        }
      })
    })
  }, [testsWatch, calcFormulaOnce])

  /* ══════════════ Numeric Change: allow up to 3 decimal places or “<” / “>” prefixes ══════════════ */
  const numericChange = (v: string, t: number, p: number, sp?: number) => {
    if (v === "") {
      // Allow empty string
    } else {
      // Check for valid number format (up to 3 decimals, optional < or > prefix)
      const numericRegex = /^[<>]?-?\d*(\.\d{0,3})?$/;
      if (numericRegex.test(v)) {
        // It's a valid numeric-like string, proceed
      } else {
        // It's not a number or numeric-like string, so treat as generic text
        const path = sp == null ? `tests.${t}.parameters.${p}.value` : `tests.${t}.parameters.${p}.subparameters.${sp}.value`;
        setValue(path as Path<BloodValuesFormInputs>, v, { shouldValidate: false });
        return;
      }
    }
    const path =
      sp == null ? `tests.${t}.parameters.${p}.value` : `tests.${t}.parameters.${p}.subparameters.${sp}.value`;
    setValue(path as Path<BloodValuesFormInputs>, v, { shouldValidate: false });
  };

  /* ══════════════ Build suggestions for text inputs ══════════════ */
  const buildMatches = (param: TestParameterValue, q: string): string[] => {
    if (Array.isArray(param.suggestions) && param.suggestions.length > 0) {
      const pool = param.suggestions.map((s) => s.description)
      return q ? pool.filter((d) => d.toLowerCase().includes(q)) : pool
    }
    return q ? dbText.filter((s) => s.toLowerCase().includes(q)) : dbText
  }

  const showDropdown = (t: number, p: number, rect: DOMRect, q: string) => {
    const currentParam = watch("tests")[t].parameters[p]
    const matches = buildMatches(currentParam, q)
    setSuggest(matches)
    if (matches.length) {
      setShowSug({
        t,
        p,
        x: rect.left + window.scrollX,
        y: rect.bottom + window.scrollY,
        width: rect.width,
      })
    } else {
      setShowSug(null)
    }
  }

  const textChange = (txt: string, t: number, p: number, rect: DOMRect) => {
    setValue(`tests.${t}.parameters.${p}.value` as Path<BloodValuesFormInputs>, txt, {
      shouldValidate: false,
    })
    showDropdown(t, p, rect, txt.trim().toLowerCase())
  }

  const pickSug = (val: string, t: number, p: number) => {
    setValue(`tests.${t}.parameters.${p}.value` as Path<BloodValuesFormInputs>, val)
    setSuggest([])
    setShowSug(null)
  }

  /* ══════════════ Handle “fill remaining” for subheadings that sum to 100 ══════════════ */
  const fillRemaining = (tIdx: number, sh: SubHeading, lastIdx: number) => {
    const test = watch("tests")[tIdx]
    const idxs = sh.parameterNames.map((n) => test.parameters.findIndex((p) => p.name === n)).filter((i) => i >= 0)
    let total = 0
    idxs.slice(0, -1).forEach((i) => {
      const v = +test.parameters[i].value
      if (!isNaN(v)) total += v
    })
    const remainder = 100 - total
    const integerValue = Math.round(remainder)
    setValue(`tests.${tIdx}.parameters.${lastIdx}.value`, integerValue.toString(), { shouldValidate: false })
  }

  /* ══════════════ Submit handler: write back to LOCAL DB ══════════════ */
  const onSubmit: SubmitHandler<BloodValuesFormInputs> = async (data) => {
    const regIdNum = Number(data.registrationId)
    if (isNaN(regIdNum)) {
        alert("Invalid registration ID.");
        return;
    }

    try {
      // ❌ REMOVED: Supabase auth check
      const enteredBy = "offline_user" 

      // 1. Fetch existing registration data
      const existingRegData = await db.registration.get(regIdNum)
      if (!existingRegData) throw new Error("Registration not found in local DB.")
      
      const existingBloodtestDetail = (existingRegData.bloodtest_detail || {}) as BloodtestDetailMap;

      const bloodtestDetail: BloodtestDetailMap = {}; 
      for (const t of data.tests) {
        const key = t.testName
          .toLowerCase()
          .replace(/\s+/g, "_")
          .replace(/[.#$[\]()]/g, "") 

        const now = new Date().toISOString()
        const params = t.parameters
          .map((p) => {
            const subs = p.subparameters?.filter((sp) => sp.value !== "") ?? []
            if (p.value !== "" || subs.length) {
              const obj: any = { ...p, subparameters: subs }
              const strValue = String(p.value)
              
              // Custom parsing logic for value
              if (p.valueType === "number" && strValue !== "") {
                  const numValue = Number(strValue);
                  if (strValue === "-" || strValue === ".") {
                      obj.value = strValue;
                  } else if (/^[<>]/.test(strValue)) {
                      obj.value = strValue;
                  } else {
                      obj.value = isNaN(numValue) ? strValue : (strValue.includes(".") && strValue.endsWith("0") ? strValue : numValue);
                  }
              } else {
                  obj.value = strValue;
              }

              // Subparameters processing (consistent with main param logic)
              subs.forEach((sp) => {
                const spStr = String(sp.value)
                if (sp.valueType === "number" && spStr !== "") {
                  const spNum = Number(spStr);
                  if (spStr === "-" || spStr === ".") {
                    sp.value = spStr;
                  } else if (/^[<>]/.test(spStr)) {
                    sp.value = spStr;
                  } else {
                    sp.value = isNaN(spNum) ? spStr : (spStr.includes(".") && spStr.endsWith("0") ? spStr : spNum);
                  }
                }
              })
              return obj
            }
            return null
          })
          .filter(Boolean) as TestParameterValue[]

        // Only save test data if there are actual parameters with values
        if (params.length > 0) {
          const existingReportedOn = existingBloodtestDetail[key]?.reportedOn
          const newReportedOn = existingReportedOn || now // Preserve existing timestamp if present
          
          bloodtestDetail[key] = {
            parameters: params,
            testId: t.testId,
            testName: t.testName,
            subheadings: t.subheadings || [],
            createdAt: existingBloodtestDetail[key]?.createdAt || now,
            reportedOn: newReportedOn,
            enteredBy,
            interpretation: existingBloodtestDetail[key]?.interpretation || "", // Preserve interpretation
          } as BloodtestDetailMap[string]; // Explicitly cast to index signature type
        }
      }

      const mergedBloodtestDetail = {
        ...existingBloodtestDetail,
        ...bloodtestDetail,
      }

      // 2. Perform local update using Dexie.js
      await db.registration
        .update(regIdNum, { bloodtest_detail: mergedBloodtestDetail })
      
      alert("Saved locally!")
      // ✅ Use router.push (which we imported)
      router.push(`/download-report?id=${registrationId}`)
    } catch (e: any) {
      console.error("Local save failed:", e.message)
      alert("Local save failed: " + e.message)
    }
  }

  /* ══════════════ Preview Function ══════════════ */
  const handlePreview = async () => {
    if (!fullPatientData || !patientDetails || !tests) {
      alert("Patient data or test data not loaded yet. Please wait.")
      return
    }

    try {
      // NOTE: We pass 'tests' (from watch) as currentTests for the preview function
      const formDataForPreview = getFormDataForPreview(tests, patientDetails as PatientData, fullPatientData);

      if (!formDataForPreview) {
        alert("Could not prepare data for preview.");
        return;
      }

      const blob = await generateReportPdf(
        formDataForPreview,
        Object.keys(formDataForPreview.bloodtest || {}), 
        [], 
        {}, 
        {}, 
        "normal", 
        true, 
        true, 
        undefined, 
        false, 
      )
      const url = URL.createObjectURL(blob)
      setPdfUrl(url)
      setShowPreviewModal(true)
    } catch (error) {
      console.error("Error generating preview:", error)
      alert("Failed to generate report preview.")
    }
  }

  /* ── Early returns for missing registrationId or loading ── */
  if (!registrationId)
    return (
      <CenterCard icon={User} title="Registration Not Found">
        <Button onClick={() => router.push("/dashboard")}>Back to Dashboard</Button>
      </CenterCard>
    )

  if (loading)
    return (
      <CenterCard icon={Loader2} spin>
        Loading…
      </CenterCard>
    )

  const tests = watch("tests")

  return (
    <TooltipProvider>
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-1">
        <Card className="w-full max-w-3xl relative shadow-lg">
          <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center gap-2 pb-0.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600">
              <Droplet className="h-4 w-4" />
            </div>
            <div className="grid gap-0">
              <CardTitle className="text-lg font-bold text-gray-800">Blood Test Analysis (Offline)</CardTitle>
              <CardDescription className="text-gray-600 text-xs">
                Comprehensive data entry for patient blood test results.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-1">
            {patientDetails && (
              <Card className="mb-2 bg-blue-50 border-blue-200 shadow-sm">
                <CardContent className="p-1.5 flex items-center gap-2">
                  <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-200 text-blue-700 text-lg font-semibold">
                    {patientDetails.name ? (
                      patientDetails.name.charAt(0).toUpperCase()
                    ) : (
                      <CircleUserRound className="h-6 w-6" />
                    )}
                  </div>
                  <div className="grid gap-0">
                    <p className="text-base font-semibold text-gray-800">{patientDetails.name}</p>
                    <div className="flex items-center gap-1.5 text-xs text-gray-600">
                      <span className="font-medium">Patient ID:</span> {patientDetails.patientId}
                      <Separator orientation="vertical" className="h-3" />
                      <span className="font-medium">Reg ID:</span> {registrationId}
                    </div>
                    <div className="flex items-center gap-1 mt-0">
                      <Badge variant="secondary" className="bg-blue-100 text-blue-700 text-xs px-1.5 py-0.5">
                        Age: {patientDetails.age}
                      </Badge>
                      <Badge variant="secondary" className="bg-blue-100 text-blue-700 text-xs px-1.5 py-0.5">
                        Gender: {patientDetails.gender}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
            <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col h-full">
              <div className="flex-1 overflow-y-auto space-y-1.5 pb-1">
                {tests.map((test, tIdx) => {
                  if (test.testType?.toLowerCase() === "outsource") {
                    return (
                      <Card key={test.testId} className="mb-1.5 border-l-4 border-yellow-500 bg-yellow-50 shadow-sm">
                        <CardContent className="p-2">
                          <div className="flex items-center gap-1.5 text-yellow-800">
                            <Droplet className="h-3.5 w-3.5" />
                            <h3 className="font-semibold text-sm">{test.testName}</h3>
                          </div>
                          <p className="mt-0.5 text-xs text-yellow-800">
                            This is an outsourced test. No data entry is required.
                          </p>
                        </CardContent>
                      </Card>
                    )
                  }
                  const sh = test.subheadings || []
                  const shNames = sh.flatMap((x) => x.parameterNames)
                  const globals = test.parameters
                    .map((p, i) => ({ ...p, originalIndex: i }))
                    .filter((p) => !shNames.includes(p.name))
                  return (
                    <Card key={test.testId} className="mb-1.5 border-l-4 border-blue-500 bg-card shadow-sm">
                      <CardHeader className="pb-0">
                        <div className="flex items-center gap-1.5">
                          <Droplet className="h-3.5 w-3.5 text-blue-600" />
                          <CardTitle className="text-sm text-gray-800">{test.testName}</CardTitle>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0">
                        {sh.length > 0 && globals.length > 0 && (
                          <>
                            <h4 className="mb-1 text-xs font-semibold text-gray-700">Global Parameters</h4>
                            <div className="grid gap-1">
                              {globals.map((p) => (
                                <ParamRow
                                  key={p.originalIndex}
                                  tIdx={tIdx}
                                  pIdx={p.originalIndex}
                                  param={p}
                                  tests={tests}
                                  errors={errors}
                                  numericChange={numericChange}
                                  textChange={textChange}
                                  pickSug={pickSug}
                                  calcOne={calcFormulaOnce}
                                  setSuggest={setSuggest}
                                  setShowSug={setShowSug}
                                />
                              ))}
                            </div>
                          </>
                        )}
                        {sh.length
                          ? sh.map((s, shIdx) => {
                              const tag = `${tIdx}-${shIdx}`
                              const list = test.parameters
                                .map((p, i) => ({ ...p, originalIndex: i }))
                                .filter((p) => s.parameterNames.includes(p.name))
                              const need100 = s.is100 === true || s.is100 === "true"
                              const last = list[list.length - 1]
                              return (
                                <div key={shIdx} className="mt-2">
                                  <h4
                                    className={cn(
                                      "mb-1 text-xs font-semibold text-gray-700",
                                      warn100[tag] && "text-red-600",
                                    )}
                                  >
                                    {s.title}
                                    {need100 && (
                                      <span className="ml-1 text-2xs font-normal text-gray-500">(must total 100%)</span>
                                    )}
                                  </h4>
                                  <div className="grid gap-1">
                                    {list.map((p) => {
                                      const isLast = need100 && p.originalIndex === last.originalIndex
                                      return (
                                        <ParamRow
                                          key={p.originalIndex}
                                          tIdx={tIdx}
                                          pIdx={p.originalIndex}
                                          param={{ ...p, originalIndex: p.originalIndex }}
                                          tests={tests}
                                          errors={errors}
                                          pickSug={pickSug}
                                          numericChange={numericChange}
                                          textChange={textChange}
                                          calcOne={calcFormulaOnce}
                                          isLastOf100={isLast}
                                          fillRemaining={() => fillRemaining(tIdx, s, p.originalIndex)}
                                          setSuggest={setSuggest}
                                          setShowSug={setShowSug}
                                        />
                                      )
                                    })}
                                  </div>
                                </div>
                              )
                            })
                          : test.parameters.map((p, pIdx) => (
                              <ParamRow
                                key={pIdx}
                                tIdx={tIdx}
                                pIdx={pIdx}
                                param={{ ...p, originalIndex: pIdx }}
                                tests={tests}
                                errors={errors}
                                numericChange={numericChange}
                                textChange={textChange}
                                pickSug={pickSug}
                                calcOne={calcFormulaOnce}
                                setSuggest={setSuggest}
                                setShowSug={setShowSug}
                              />
                            ))}
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
              <div className="mt-2 border-t pt-2 flex gap-1.5">
                <Button type="submit" disabled={isSubmitting} className="flex-1 py-1.5 text-base">
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      Saving Locally…
                    </>
                  ) : (
                    <>
                      <CheckCircle className="mr-1.5 h-4 w-4" />
                      Save Results Locally
                    </>
                  )}
                </Button>
                <Button type="button" onClick={handlePreview} className="flex-1 py-1.5 text-base bg-gray-600 hover:bg-gray-700">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4 mr-1.5"
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
                  Preview Report
                </Button>
              </div>
            </form>
          </CardContent>
          {showSug && suggest.length > 0 && (
            <Card
              className="fixed z-50 max-h-32 overflow-auto p-0.5 shadow-lg"
              style={{
                top: showSug.y,
                left: showSug.x,
                width: `${showSug.width}px`,
                transform: "translateY(0)",
              }}
            >
              <CardContent className="p-0">
                {suggest.map((s, i) => (
                  <div
                    key={i}
                    className="cursor-pointer px-2 py-0.5 text-xs hover:bg-accent hover:text-accent-foreground"
                    onMouseDown={(e) => {
                      e.preventDefault()
                      pickSug(s, showSug.t, showSug.p)
                    }}
                  >
                    {s}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </Card>
      </div>
      {showPreviewModal && pdfUrl && (
        <Dialog open={showPreviewModal} onOpenChange={setShowPreviewModal}>
          <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>Report Preview</DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-hidden">
              <iframe src={pdfUrl} className="w-full h-full" />
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setShowPreviewModal(false)}>Close</Button>
              <Button onClick={() => {
                URL.revokeObjectURL(pdfUrl);
                setPdfUrl(null);
                setShowPreviewModal(false);
              }}>Close and Clear</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </TooltipProvider>
  )
}

/* ─────────────────── ParamRow Component ─────────────────── */

interface RowProps {
  tIdx: number
  pIdx: number
  param: IndexedParam
  tests: TestValueEntry[]
  errors: any
  numericChange: (v: string, t: number, p: number, sp?: number) => void
  textChange: (txt: string, t: number, p: number, rect: DOMRect) => void
  calcOne: (t: number, p: number) => void
  isLastOf100?: boolean
  fillRemaining?: () => void
  setSuggest: (s: string[]) => void
  setShowSug: (p: SuggestPos | null) => void
  pickSug: (val: string, t: number, p: number) => void
}

const ParamRow: React.FC<RowProps> = ({
  tIdx,
  pIdx,
  param,
  tests,
  errors,
  numericChange,
  textChange,
  calcOne,
  isLastOf100,
  fillRemaining,
  setSuggest,
  setShowSug,
  pickSug,
}) => {
  const currentParam = tests[tIdx].parameters[pIdx]
  const value = currentParam.value
  const numValue = Number.parseFloat(value as string)
  const parsedRange = parseRange(currentParam.range)
  let isOutOfRange = false
  if (!isNaN(numValue)) {
    const { min, max } = parsedRange
    if (min !== undefined && max !== undefined) {
      isOutOfRange = numValue < min || numValue > max
    } else if (min !== undefined) {
      isOutOfRange = numValue < min
    } else if (max !== undefined) {
      isOutOfRange = numValue > max
    }
  }

  const handleFocus = (e: React.FocusEvent<HTMLTextAreaElement>) => {
    const rect = e.target.getBoundingClientRect()
    textChange(e.target.value, tIdx, pIdx, rect)
  }

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const rect = e.target.getBoundingClientRect()
    textChange(e.target.value, tIdx, pIdx, rect)
  }

  const handleBlur = () => {
    setTimeout(() => {
      setSuggest([])
      setShowSug(null)
    }, 50)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      const form = e.currentTarget.form
      if (!form) return
      const inputs = Array.from(form.elements).filter((el): el is HTMLInputElement => el.tagName === "INPUT")
      const idx = inputs.indexOf(e.currentTarget)
      const next = inputs[idx + 1]
      if (next) next.focus()
    }
  }

  return (
    <div className="flex items-center rounded-lg border bg-background px-1.5 py-0.5 text-xs shadow-sm">
      <div className="flex flex-1 items-center gap-1">
        <Label htmlFor={`param-${tIdx}-${pIdx}`} className="font-medium text-foreground text-xs">
          {param.name}
          {param.unit && <span className="ml-0.5 text-2xs text-muted-foreground">({param.unit})</span>}
        </Label>
        {param.formula && param.valueType === "number" && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                onClick={() => calcOne(tIdx, pIdx)}
                variant="ghost"
                size="icon"
                className="h-5 w-5 text-blue-600 hover:bg-blue-50 hover:text-blue-800"
                aria-label="Calculate formula"
              >
                <Calculator className="h-2.5 w-2.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Calculate value using formula: {param.formula}</p>
            </TooltipContent>
          </Tooltip>
        )}
        {isLastOf100 && (
          <Button
            type="button"
            onClick={fillRemaining}
            variant="outline"
            size="sm"
            className="ml-1 h-5 text-2xs text-green-600 border-green-600 hover:bg-green-50 hover:text-green-800 bg-transparent"
          >
            Calculate Rem.
          </Button>
        )}
      </div>
      {param.valueType === "number" ? (
        <div className="relative ml-1.5 w-28">
          <Input
            id={`param-${tIdx}-${pIdx}`}
            type="text"
            value={String(currentParam.value ?? "")}
            onChange={(e) => numericChange(e.target.value, tIdx, pIdx)}
            onKeyDown={handleKeyDown}
            placeholder={"Value or >10 / <10"}
            className={cn("pr-6 h-6 text-xs", isOutOfRange && "border-red-500 bg-red-50 focus-visible:ring-red-500")}
          />
          {isOutOfRange && (
            <Tooltip>
              <TooltipTrigger asChild>
                <AlertCircle className="absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-red-500" />
              </TooltipTrigger>
              <TooltipContent>
                <p>Value is outside normal range: {currentParam.range}</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      ) : (
        <div className="relative ml-1.5 w-32">
          <Textarea
            id={`param-${tIdx}-${pIdx}`}
            value={String(currentParam.value ?? "")}
            onFocus={handleFocus}
            onChange={handleChange}
            onBlur={handleBlur}
            placeholder={"Text (multi-line)"}
            className="h-20 w-48 text-xs min-h-[unset]" // Increased height and width for text inputs
          />
        </div>
      )}
      <div className="ml-1.5 flex-1 text-right text-muted-foreground text-2xs">
        Normal Range:{" "}
        <span className={cn("font-medium", isOutOfRange ? "text-red-600" : "text-green-600")}>
          {currentParam.range}
        </span>
      </div>
    </div>
  )
}

/* ─────────────────── CenterCard Component ─────────────────── */

const CenterCard: React.FC<{
  icon: any
  title?: string
  spin?: boolean
  children: React.ReactNode
}> = ({ icon: Icon, title, spin, children }) => (
  <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-3">
    <Card className="w-full max-w-md text-center shadow-lg">
      <CardContent className="p-5">
        <Icon className={cn("mx-auto mb-2 h-9 w-9 text-primary", spin && "animate-spin")} />
        {title && <CardTitle className="mb-1 text-lg text-gray-800">{title}</CardTitle>}
        {children}
      </CardContent>
    </Card>
  </div>
)
