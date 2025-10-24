"use client"

import type React from "react"
import { useEffect, useState, useMemo } from "react"
import { supabase } from "@/lib/supabase"
import {
  useForm,
  useFieldArray,
  useWatch,
  type SubmitHandler,
  type FieldErrorsImpl,
  type UseFormGetValues,
  type UseFormSetValue,
  type Control,
  type UseFormRegister,
} from "react-hook-form"
import { FaEdit, FaTrash, FaRupeeSign, FaSave, FaPlus, FaPlusCircle, FaCopy, FaSyncAlt, FaCode } from "react-icons/fa"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Search, Plus, Edit } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog" // Import Dialog components
import { generateReportPdf } from "@/app/download-report/pdf-generator" // Import PDF generator
import type { PatientData, BloodTestData } from "@/app/download-report/types/report" // Import types

// ------------------------------------------------------------------
// INTERFACES
// ------------------------------------------------------------------
export interface AgeRangeItem {
  rangeKey: string
  rangeValue: string
}

export interface BloodTestParameter {
  name: string
  unit: string
  valueType: "text" | "number"
  defaultValue?: string | number
  formula?: string
  iscomment?: boolean
  range: {
    male: AgeRangeItem[]
    female: AgeRangeItem[]
  }
  suggestions?: {
    description: string
    shortName: string
  }[]
}

export interface BloodTestSubheading {
  title: string
  parameterNames: { name: string }[] // Changed from string[] to { name: string }[]
  is100?: boolean // Added this line for the new property
}

export interface BloodTestFormInputs {
  testName: string
  price: number
  tpa_price?: number // Optional TPA price
  parameters: BloodTestParameter[]
  subheadings: BloodTestSubheading[]
  isOutsource?: boolean
  interpretation?: string // Add this line for interpretation
}

// TestData interface for Supabase, mapping to table columns
export interface TestData {
  id: number // Supabase primary key
  testName: string // Maps to test_name
  price: number
  tpa_price?: number // Optional TPA price
  isOutsource: boolean // Maps to outsource
  parameters: BloodTestParameter[] // Maps to parameter (json)
  subheadings: BloodTestSubheading[] // Maps to sub_heading (json)
  interpretation?: string // Add this line for interpretation
  created_at: string // Supabase column name
}

// Helper to safely fetch error messages
function getFieldErrorMessage(errors: any, path: string[]): string | undefined {
  let current = errors
  for (const p of path) {
    if (!current) return undefined
    current = current[p]
  }
  return typeof current?.message === "string" ? current.message : undefined
}

// ------------------------------------------------------------------
// PARAMETER EDITOR
// ------------------------------------------------------------------
interface ParameterEditorProps {
  index: number
  control: Control<BloodTestFormInputs>
  register: UseFormRegister<BloodTestFormInputs>
  errors: FieldErrorsImpl<BloodTestFormInputs>
  remove: (index: number) => void
}

const ParameterEditor: React.FC<ParameterEditorProps> = ({ index, control, register, errors, remove }) => {
  const maleRangesArray = useFieldArray({
    control,
    name: `parameters.${index}.range.male`,
  })
  const femaleRangesArray = useFieldArray({
    control,
    name: `parameters.${index}.range.female`,
  })
  const suggestionsArray = useFieldArray({
    control,
    name: `parameters.${index}.suggestions`,
  })

  const paramNameErr = getFieldErrorMessage(errors, ["parameters", index.toString(), "name"])
  const paramUnitErr = getFieldErrorMessage(errors, ["parameters", index.toString(), "unit"])
  const paramValueTypeErr = getFieldErrorMessage(errors, ["parameters", index.toString(), "valueType"])

  return (
    <div className="border p-4 rounded mb-4 bg-gray-50">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-semibold">Parameter #{index + 1}</h3>
        <button type="button" onClick={() => remove(index)} className="text-red-500 hover:text-red-700">
          <FaTrash />
        </button>
      </div>

      {/* Parameter Name & Unit */}
      <div className="mt-2">
        <label className="block text-xs">Parameter Name</label>
        <input
          type="text"
          {...register(`parameters.${index}.name`, { required: "Required" })}
          className="w-full border rounded px-2 py-1"
        />
        {paramNameErr && <p className="text-red-500 text-xs">{paramNameErr}</p>}
      </div>
      <div className="mt-2">
        <label className="block text-xs">Unit</label>
        <input type="text" {...register(`parameters.${index}.unit`)} className="w-full border rounded px-2 py-1" />
        {paramUnitErr && <p className="text-red-500 text-xs">{paramUnitErr}</p>}
      </div>

      {/* Value Type */}
      <div className="mt-2">
        <label className="block text-xs">Value Type</label>
        <select
          {...register(`parameters.${index}.valueType`, { required: "Required" })}
          className="w-full border rounded px-2 py-1"
        >
          <option value="">Select Value Type</option>
          <option value="text">Text</option>
          <option value="number">Number</option>
        </select>
        {paramValueTypeErr && <p className="text-red-500 text-xs">{paramValueTypeErr}</p>}
      </div>

      {/* Formula (optional) */}
      <div className="mt-2">
        <label className="block text-xs">Formula (optional)</label>
        <input
          type="text"
          {...register(`parameters.${index}.formula`)}
          placeholder="e.g. TOTAL BILLIRUBIN - DIRECT BILLIRUBIN"
          className="w-full border rounded px-2 py-1"
        />
      </div>

      {/* Default Value (optional) */}
      <div className="mt-2">
        <label className="block text-xs">Default Value</label>
        <input
          type="text"
          {...register(`parameters.${index}.defaultValue`)}
          className="w-full border rounded px-2 py-1"
          placeholder="e.g. 0 or N/A"
        />
      </div>

      {/* Comment checkbox */}
      <div className="mt-2 flex items-center space-x-2">
        <input type="checkbox" {...register(`parameters.${index}.iscomment`)} id={`comment-${index}`} />
        <label htmlFor={`comment-${index}`} className="text-xs">
          This row is a comment (store <code>iscomment: true</code>)
        </label>
      </div>

      {/* Suggestions */}
      <div className="mt-4">
        <h4 className="text-xs font-medium">Suggestions</h4>
        {suggestionsArray.fields.map((field, sIndex) => (
          <div key={field.id} className="flex items-center space-x-2 mt-1">
            <input
              type="text"
              placeholder="Full suggestion text"
              {...register(`parameters.${index}.suggestions.${sIndex}.description`, { required: "Required" })}
              className="w-2/3 border rounded px-2 py-1"
            />
            <input
              type="text"
              placeholder="Short code"
              {...register(`parameters.${index}.suggestions.${sIndex}.shortName`, { required: "Required" })}
              className="w-1/3 border rounded px-2 py-1"
            />
            <button
              type="button"
              onClick={() => suggestionsArray.remove(sIndex)}
              className="text-red-500 hover:text-red-700"
            >
              <FaTrash />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => suggestionsArray.append({ description: "", shortName: "" })}
          className="mt-2 inline-flex items-center px-3 py-1 border border-green-600 text-green-600 rounded hover:bg-green-50"
        >
          <FaPlusCircle className="mr-1" /> Add Suggestion
        </button>
      </div>

      {/* Male Ranges */}
      <div className="mt-4">
        <h4 className="text-xs font-medium">Male Ranges</h4>
        {maleRangesArray.fields.map((field, mIndex) => {
          const keyErr = getFieldErrorMessage(errors, [
            "parameters",
            index.toString(),
            "range",
            "male",
            mIndex.toString(),
            "rangeKey",
          ])
          const valErr = getFieldErrorMessage(errors, [
            "parameters",
            index.toString(),
            "range",
            "male",
            mIndex.toString(),
            "rangeValue",
          ])
          return (
            <div key={field.id} className="flex items-center space-x-2 mt-1">
              <input
                type="text"
                {...register(`parameters.${index}.range.male.${mIndex}.rangeKey`)}
                className="w-1/2 border rounded px-2 py-1"
              />
              <input
                type="text"
                {...register(`parameters.${index}.range.male.${mIndex}.rangeValue`)}
                className="w-1/2 border rounded px-2 py-1"
              />
              <button
                type="button"
                onClick={() => maleRangesArray.remove(mIndex)}
                className="text-red-500 hover:text-red-700"
              >
                <FaTrash />
              </button>
              {keyErr && <p className="text-red-500 text-xs w-full">{keyErr}</p>}
              {valErr && <p className="text-red-500 text-xs w-full">{valErr}</p>}
            </div>
          )
        })}
        <button
          type="button"
          onClick={() => maleRangesArray.append({ rangeKey: "", rangeValue: "" })}
          className="mt-2 inline-flex items-center px-2 py-1 border border-blue-600 text-blue-600 rounded hover:bg-blue-50"
        >
          <FaPlus className="mr-1" /> Add Male Range
        </button>
      </div>

      {/* Female Ranges */}
      <div className="mt-4">
        <h4 className="text-xs font-medium">Female Ranges</h4>
        {femaleRangesArray.fields.map((field, fIndex) => {
          const keyErr = getFieldErrorMessage(errors, [
            "parameters",
            index.toString(),
            "range",
            "female",
            fIndex.toString(),
            "rangeKey",
          ])
          const valErr = getFieldErrorMessage(errors, [
            "parameters",
            index.toString(),
            "range",
            "female",
            fIndex.toString(),
            "rangeValue",
          ])
          return (
            <div key={field.id} className="flex items-center space-x-2 mt-1">
              <input
                type="text"
                {...register(`parameters.${index}.range.female.${fIndex}.rangeKey`)}
                className="w-1/2 border rounded px-2 py-1"
              />
              <input
                type="text"
                {...register(`parameters.${index}.range.female.${fIndex}.rangeValue`)}
                className="w-1/2 border rounded px-2 py-1"
              />
              <button
                type="button"
                onClick={() => femaleRangesArray.remove(fIndex)}
                className="text-red-500 hover:text-red-700"
              >
                <FaTrash />
              </button>
              {keyErr && <p className="text-red-500 text-xs w-full">{keyErr}</p>}
              {valErr && <p className="text-red-500 text-xs w-full">{valErr}</p>}
            </div>
          )
        })}
        <button
          type="button"
          onClick={() => femaleRangesArray.append({ rangeKey: "", rangeValue: "" })}
          className="mt-2 inline-flex items-center px-2 py-1 border border-blue-600 text-blue-600 rounded hover:bg-blue-50"
        >
          <FaPlus className="mr-1" /> Add Female Range
        </button>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------
// SUBHEADING EDITOR
// ------------------------------------------------------------------
interface SubheadingEditorProps {
  index: number
  control: Control<BloodTestFormInputs>
  register: UseFormRegister<BloodTestFormInputs>
  errors: FieldErrorsImpl<BloodTestFormInputs>
  remove: (index: number) => void
  getValues: UseFormGetValues<BloodTestFormInputs>
  setValue: UseFormSetValue<BloodTestFormInputs>
}

const SubheadingEditor: React.FC<SubheadingEditorProps> = ({
  index,
  control,
  register,
  errors,
  remove,
  getValues,
  setValue,
}) => {
  const paramNamesArray = useFieldArray({
    control,
    name: `subheadings.${index}.parameterNames`,
  })
  const globalParameters = useWatch({ control, name: "parameters" }) || []
  const subheadingTitleErr = getFieldErrorMessage(errors, ["subheadings", index.toString(), "title"])

  // avoid duplicate parameter usage across subheadings
  const handleParameterChange = (pIndex: number, newValue: string) => {
    if (!newValue) return
    const allSubheadings = getValues("subheadings") || []
    for (let shIndex = 0; shIndex < allSubheadings.length; shIndex++) {
      if (shIndex === index) continue
      // Map to string array for comparison
      const paramNames = allSubheadings[shIndex]?.parameterNames.map((p) => p.name) || []
      if (paramNames.includes(newValue)) {
        alert(`Parameter "${newValue}" is already used in another subheading!`)
        setValue(`subheadings.${index}.parameterNames.${pIndex}.name`, "") // Corrected path
        return
      }
    }
  }

  return (
    <div className="border p-4 rounded mb-4 bg-gray-100">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-semibold">Subheading #{index + 1}</h3>
        <button type="button" onClick={() => remove(index)} className="text-red-500 hover:text-red-700">
          <FaTrash />
        </button>
      </div>

      {/* Title */}
      <div className="mt-2">
        <label className="block text-xs">Subheading Title</label>
        <input
          type="text"
          {...register(`subheadings.${index}.title`, { required: "Required" })}
          className="w-full border rounded px-2 py-1"
          placeholder="e.g. RBC"
        />
        {subheadingTitleErr && <p className="text-red-500 text-xs">{subheadingTitleErr}</p>}
      </div>

      {/* is100 checkbox (for differential count, if applicable) */}
      <div className="mt-2 flex items-center space-x-2">
        <input type="checkbox" {...register(`subheadings.${index}.is100`)} id={`is100-${index}`} />
        <label htmlFor={`is100-${index}`} className="text-xs">
          This subheading's parameters sum to 100% (e.g., Differential Count)
        </label>
      </div>

      {/* Parameter Names */}
      <div className="mt-2">
        <h4 className="text-xs font-medium">Select Parameters</h4>
        {paramNamesArray.fields.map((field, pIndex) => {
          const paramNameErr = getFieldErrorMessage(errors, [
            "subheadings",
            index.toString(),
            "parameterNames",
            pIndex.toString(),
            "name", // Corrected path
          ])
          return (
            <div key={field.id} className="flex items-center space-x-2 mt-1">
              <select
                {...register(`subheadings.${index}.parameterNames.${pIndex}.name`, {
                  // Corrected path
                  required: "Required",
                  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => handleParameterChange(pIndex, e.target.value),
                })}
                className="w-full border rounded px-2 py-1"
                value={field.name} // Added to display current value
              >
                <option value="">Select Parameter</option>
                {globalParameters.map((param: { name: string }, idx: number) => (
                  <option key={idx} value={param.name}>
                    {param.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => paramNamesArray.remove(pIndex)}
                className="text-red-500 hover:text-red-700"
              >
                <FaTrash />
              </button>
              {paramNameErr && <p className="text-red-500 text-xs w-full">{paramNameErr}</p>}
            </div>
          )
        })}
        <button
          type="button"
          onClick={() => paramNamesArray.append({ name: "" })} // Changed to append object
          className="mt-2 inline-flex items-center px-2 py-1 border border-blue-600 text-blue-600 rounded hover:bg-blue-50"
        >
          <FaPlus className="mr-1" /> Add Parameter
        </button>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------
// TEST MODAL (Create & Edit)
// ------------------------------------------------------------------
interface TestModalProps {
  testData?: TestData
  onClose: () => void
  onTestUpdated: () => void
}

const TestModal: React.FC<TestModalProps> = ({ testData, onClose, onTestUpdated }) => {
  const defaultValues = useMemo<BloodTestFormInputs>(
    () =>
      testData
        ? {
            testName: testData.testName,
            price: testData.price,
            tpa_price: testData.tpa_price ?? undefined,
            parameters: testData.parameters,
            subheadings: testData.subheadings.map((sh) => ({
              // Ensure is100 is correctly mapped
              title: sh.title,
              parameterNames: sh.parameterNames,
              is100: sh.is100 || false, // Default to false if not present
            })),
            isOutsource: testData.isOutsource || false,
            interpretation: testData.interpretation || "", // Default to empty string if not present
          }
        : {
            testName: "",
            price: 0,
            tpa_price: undefined,
            parameters: [
              {
                name: "",
                unit: "",
                valueType: "text",
                formula: "",
                iscomment: false,
                suggestions: [],
                range: {
                  male: [{ rangeKey: "", rangeValue: "" }],
                  female: [{ rangeKey: "", rangeValue: "" }],
                },
              },
            ],
            subheadings: [],
            isOutsource: false,
            interpretation: "", // Default to empty string for new test
          },
    [testData],
  )

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
    getValues,
    setValue,
    reset,
  } = useForm<BloodTestFormInputs>({ defaultValues })

  const paramFields = useFieldArray({ control, name: "parameters" })
  const subheadingFields = useFieldArray({ control, name: "subheadings" })

  // State for PDF preview
  const [showPreviewModal, setShowPreviewModal] = useState(false)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)

  // Interpretation error
  const interpretationErr = getFieldErrorMessage(errors, ["interpretation"]);

  useEffect(() => {
    console.log("TestModal: paramFields.fields.length changed:", paramFields.fields.length)
    if (paramFields.fields.length === 0) {
      setValue("isOutsource", true)
      console.log("TestModal: Setting isOutsource to true because no parameters.")
    }
  }, [paramFields.fields.length, setValue])

  // Function to generate preview PDF
  const generatePreviewPdf = async () => {
    const currentFormData = getValues(); // Get current form data

    // Define simplified types for parameters and subheadings to avoid import conflicts
    interface PreviewParameter {
      name: string;
      unit: string;
      value: string | number;
      range: string;
      formula?: string;
      iscomment?: boolean;
      valueType?: "text" | "number";
    }

    interface PreviewSubheading {
      title: string;
      parameterNames: string[];
      is100?: boolean;
    }

    // Construct dummy PatientData based on current form structure
    const dummyParameters: PreviewParameter[] = currentFormData.parameters.map(p => ({
      name: p.name,
      unit: p.unit,
      value: p.valueType === "number" ? 1 : "Dummy Text Value", // Dummy value
      range: Array.isArray(p.range.male) && p.range.male.length > 0 ? p.range.male[0].rangeValue : "", // Use first male range as dummy
      formula: p.formula,
      iscomment: p.iscomment,
      valueType: p.valueType,
    }));

    const dummySubheadings: PreviewSubheading[] = currentFormData.subheadings.map(sh => ({
      title: sh.title,
      parameterNames: sh.parameterNames.map((pn: { name: string }) => pn.name), // Extract only name strings
      is100: sh.is100,
    }));

    const dummyBloodtestDetail: Record<string, BloodTestData> = {
      [currentFormData.testName.toLowerCase().replace(/\s+/g, "_").replace(/[.#$[\]()]/g, "").replace(/\//g, "")]: {
        testId: "dummy-id",
        parameters: dummyParameters as any, // Cast to any to bypass strict type checking temporarily
        subheadings: dummySubheadings as any, // Cast to any to bypass strict type checking temporarily
        reportedOn: new Date().toISOString(),
        enteredBy: "Dummy User",
        type: currentFormData.isOutsource ? "outsource" : "inhouse",
        descriptions: [],
        interpretation: currentFormData.interpretation || "Dummy interpretation for " + currentFormData.testName, // Include dummy interpretation
      }
    };

    const dummyPatientData: PatientData = {
      id: 1, // Dummy ID
      name: "Dummy Patient",
      age: 30,
      gender: "Male",
      patientId: "DP-001",
      contact: "1234567890",
      total_day: "30",
      day_type: "day",
      title: "Mr.",
      doctorName: "Dr. Dummy",
      hospitalName: "Dummy Hospital",
      registration_id: 101,
      createdAt: new Date().toISOString(),
      sampleCollectedAt: new Date().toISOString(),
      bloodtest_data: [{ testId: "dummy-id", testName: currentFormData.testName, price: currentFormData.price, testType: currentFormData.isOutsource ? "outsource" : "inhouse" }],
      bloodtest_detail: dummyBloodtestDetail,
      bloodtest: dummyBloodtestDetail,
    };

    try {
      const blob = await generateReportPdf(
        dummyPatientData,
        Object.keys(dummyPatientData.bloodtest || {}), // Include all tests for preview
        [], // No combined groups for a simple preview
        {}, // No historical data for a simple preview
        {}, // No comparison selections for a simple preview
        "normal", // Always normal report for this preview
        true, // Always include letterhead for this preview
        true, // Always skip cover for preview
        undefined, // No AI suggestions for preview
        false, // Do not include AI suggestions page
      );
      const url = URL.createObjectURL(blob);
      setPdfUrl(url);
      setShowPreviewModal(true);
    } catch (error) {
      console.error("Error generating preview PDF:", error);
      alert("Failed to generate preview.");
    }
  };

  const testNameErr = getFieldErrorMessage(errors, ["testName"])
  const testPriceErr = getFieldErrorMessage(errors, ["price"])
  const testTPAPriceErr = getFieldErrorMessage(errors, ["tpa_price"])

  // JSON editor toggle
  const [isJsonEditor, setIsJsonEditor] = useState(false)
  const [jsonContent, setJsonContent] = useState("")

  useEffect(() => {
    console.log("TestModal: defaultValues changed, updating jsonContent.")
    setJsonContent(JSON.stringify(getValues(), null, 2)) // Use getValues() to get current form state
  }, [getValues, testData]) // Depend on getValues and testData to ensure fresh content

  const onSubmit: SubmitHandler<BloodTestFormInputs> = async (data) => {
    console.log("TestModal: onSubmit triggered with data:", data)
    try {
      const payload: any = {
        test_name: data.testName,
        price: data.price,
        tpa_price: data.tpa_price,
        outsource: data.isOutsource,
        parameter: data.parameters,
        sub_heading: data.subheadings.map((sh: BloodTestSubheading) => ({
          // Transform back to string[] for Supabase
          title: sh.title,
          parameterNames: sh.parameterNames.map((p: { name: string }) => p.name), // Explicitly type p
          is100: sh.is100, // Include is100 when saving
        })),
        interpretation: data.interpretation, // Include interpretation
      }
      if (data.tpa_price !== undefined && data.tpa_price !== null) { // FIX APPLIED HERE
        payload.tpa_price = data.tpa_price
      }
      console.log("TestModal: Payload for Supabase:", payload)

      if (testData) {
        console.log("TestModal: Updating existing test with ID:", testData.id)
        const { error } = await supabase
          .from("blood_test")
          .update({ ...payload })
          .eq("id", testData.id)
        if (error) throw error
        alert("Test updated successfully!")
        console.log("TestModal: Test updated successfully!")
      } else {
        console.log("TestModal: Creating new test.")
        const { error } = await supabase.from("blood_test").insert({ ...payload })
        if (error) throw error
        alert("Test created successfully!")
        console.log("TestModal: Test created successfully!")
      }
      onTestUpdated()
      onClose()
    } catch (err: any) {
      console.error("TestModal: Error saving test:", err.message)
      alert(`Error saving test: ${err.message}`)
    }
  }

  const handleDelete = async () => {
    if (!testData) return
    if (!window.confirm("Delete this test?")) return
    console.log("TestModal: Attempting to delete test with ID:", testData.id)
    try {
      const { error } = await supabase.from("blood_test").delete().eq("id", testData.id)
      if (error) throw error
      alert("Deleted!")
      console.log("TestModal: Test deleted successfully!")
      onTestUpdated()
      onClose()
    } catch (err: any) {
      console.error("TestModal: Error deleting test:", err.message)
      alert(`Error deleting test: ${err.message}`)
    }
  }

  // JSON-mode save
  const handleSaveJson = async () => {
    console.log("TestModal: handleSaveJson triggered.")
    try {
      const parsed = JSON.parse(jsonContent)
      console.log("TestModal: Parsed JSON content:", parsed)

      // Transform for Supabase
      const transformedSubheadings = parsed.subheadings.map((sh: any) => ({
        title: sh.title,
        parameterNames: sh.parameterNames.map((p: any) => p.name),
        is100: parsed.is100 === "true" || parsed.is100 === true, // Convert string "true" to boolean true
      }))

      const payload: any = {
        test_name: parsed.testName,
        price: parsed.price,
        tpa_price: parsed.tpa_price,
        outsource: parsed.isOutsource,
        parameter: parsed.parameters,
        sub_heading: transformedSubheadings,
        interpretation: parsed.interpretation, // Include interpretation
      }
      if (parsed.tpa_price !== undefined && parsed.tpa_price !== null) { // FIX APPLIED HERE
        payload.tpa_price = parsed.tpa_price
      }
      console.log("TestModal: Payload for Supabase from JSON:", payload)

      if (testData) {
        console.log("TestModal: Updating existing test from JSON with ID:", testData.id)
        const { error } = await supabase
          .from("blood_test")
          .update({ ...payload })
          .eq("id", testData.id)
        if (error) throw error
      } else {
        console.log("TestModal: Creating new test from JSON.")
        const { error } = await supabase.from("blood_test").insert({ ...payload })
        if (error) throw error
      }
      alert("Saved!")
      console.log("TestModal: Test saved from JSON successfully!")
      onTestUpdated()
      onClose()
    } catch (e: any) {
      console.error("TestModal: Invalid JSON or error saving from JSON:", e)
      alert("Invalid JSON or error saving: " + e.message)
    }
  }

  const handleSwitchToForm = () => {
    console.log("TestModal: Switching to Form Editor.")
    try {
      const parsedJson = JSON.parse(jsonContent)
      // Transform subheadings from string[] (if coming from old JSON) to { name: string }[] for form
      const transformedSubheadings = parsedJson.subheadings.map((sh: any) => ({
        title: sh.title,
        parameterNames: (sh.parameterNames || []).map((name: string | { name: string }) =>
          typeof name === "string" ? { name } : name,
        ),
        is100: sh.is100 === "true" || sh.is100 === true, // Convert string "true" to boolean true
      }))
      reset({ ...parsedJson, subheadings: transformedSubheadings })
      setIsJsonEditor(false)
      console.log("TestModal: Successfully switched to Form Editor.")
    } catch (e: any) {
      console.error("TestModal: Error switching to Form Editor:", e)
      alert("Invalid JSON – can’t switch." + e.message)
    }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
      <div className="bg-white p-6 rounded-lg w-full max-w-3xl max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold flex items-center">
            {testData ? (
              <>
                <FaEdit className="mr-2" /> Edit Blood Test
              </>
            ) : (
              <>
                <FaPlusCircle className="mr-2" /> Create New Blood Test
              </>
            )}
          </h2>
          <button onClick={onClose} className="text-gray-600 hover:text-gray-800">
            Close
          </button>
        </div>

        {/* Editor-mode toggle */}
        <div className="flex justify-end mb-4">
          {isJsonEditor ? (
            <button
              onClick={handleSwitchToForm}
              className="inline-flex items-center px-3 py-1 border border-blue-600 text-blue-600 rounded hover:bg-blue-50 mr-2"
            >
              <FaSyncAlt className="mr-1" /> Switch to Form Editor
            </button>
          ) : (
            <button
              onClick={() => {
                setJsonContent(JSON.stringify(getValues(), null, 2))
                setIsJsonEditor(true)
              }}
              className="inline-flex items-center px-3 py-1 border border-blue-600 text-blue-600 rounded hover:bg-blue-50 mr-2"
            >
              <FaCode className="mr-1" /> Switch to JSON Editor
            </button>
          )}
          {isJsonEditor && (
            <button
              onClick={() => {
                navigator.clipboard.writeText(jsonContent)
                alert("JSON copied!")
              }}
              className="inline-flex items-center px-3 py-1 border border-green-600 text-green-600 rounded hover:bg-green-50"
            >
              <FaCopy className="mr-1" /> Copy JSON
            </button>
          )}
          <button
            type="button"
            onClick={generatePreviewPdf}
            className="inline-flex items-center px-3 py-1 bg-purple-600 text-white rounded hover:bg-purple-700 ml-2"
          >
            <FaCode className="mr-1" /> Preview Report
          </button>
        </div>

        {isJsonEditor ? (
          /* JSON editor */
          <>
            <textarea
              value={jsonContent}
              onChange={(e) => setJsonContent(e.target.value)}
              className="w-full h-80 border rounded px-3 py-2 font-mono"
            />
            <div className="flex justify-end mt-4">
              <button
                onClick={handleSaveJson}
                className="inline-flex items-center px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                <FaSave className="mr-1" /> Save JSON
              </button>
            </div>
          </>
        ) : (
          /* FORM mode */
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Test Name */}
            <div>
              <label className="block text-sm font-medium">Test Name</label>
              <input
                type="text"
                {...register("testName", { required: "Test name is required" })}
                className="w-full border rounded px-3 py-2"
              />
              {testNameErr && <p className="text-red-500 text-xs">{testNameErr}</p>}
            </div>
            {/* Price */}
            <div>
              <label className="block text-sm font-medium">
                Price (Rs.) <FaRupeeSign className="inline-block text-green-600" />
              </label>
              <input
                type="number"
                step="0.01"
                {...register("price", {
                  required: "Price is required",
                  valueAsNumber: true,
                })}
                className="w-full border rounded px-3 py-2"
              />
              {testPriceErr && <p className="text-red-500 text-xs">{testPriceErr}</p>}
            </div>
            {/* TPA Price (optional) */}
            <div>
              <label className="block text-sm font-medium">
                TPA Price (Optional)
              </label>
              <input
                type="number"
                step="0.01"
                {...register("tpa_price", { valueAsNumber: true })}
                className="w-full border rounded px-3 py-2"
                placeholder="Enter TPA price if any"
              />
              {testTPAPriceErr && <p className="text-red-500 text-xs">{testTPAPriceErr}</p>}
            </div>
            {/* Outsource */}
            <div>
              <label className="block text-sm font-medium">
                Outsource Test?
                <input
                  type="checkbox"
                  {...register("isOutsource")}
                  className="ml-2"
                  defaultChecked={!!defaultValues.isOutsource}
                />
              </label>
            </div>
            {/* Parameters */}
            <div>
              <label className="block text-sm font-medium">Global Parameters</label>
              {paramFields.fields.map((field, idx) => (
                <ParameterEditor
                  key={field.id}
                  index={idx}
                  control={control}
                  register={register}
                  errors={errors as FieldErrorsImpl<BloodTestFormInputs>}
                  remove={paramFields.remove}
                />
              ))}
              <button
                type="button"
                onClick={() =>
                  paramFields.append({
                    name: "",
                    unit: "",
                    valueType: "text",
                    formula: "",
                    iscomment: false,
                    range: {
                      male: [{ rangeKey: "", rangeValue: "" }],
                      female: [{ rangeKey: "", rangeValue: "" }],
                    },
                    suggestions: [],
                  } as BloodTestParameter) // Cast to BloodTestParameter
                }
                className="mt-2 inline-flex items-center px-3 py-1 border border-blue-600 text-blue-600 rounded hover:bg-blue-50"
              >
                <FaPlus className="mr-1" /> Add Global Parameter
              </button>
            </div>

            {/* Subheadings */}
            <div>
              <label className="block text-sm font-medium">Subheadings</label>
              <div className="space-y-4">
                {subheadingFields.fields.map((field, idx) => (
                  <SubheadingEditor
                    key={field.id}
                    index={idx}
                    control={control}
                    register={register}
                    errors={errors as FieldErrorsImpl<BloodTestFormInputs>}
                    remove={subheadingFields.remove}
                    getValues={getValues}
                    setValue={setValue}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() => subheadingFields.append({ title: "", parameterNames: [], is100: false } as BloodTestSubheading)} // Cast to BloodTestSubheading
                className="mt-2 inline-flex items-center px-3 py-1 border border-blue-600 text-blue-600 rounded hover:bg-blue-50"
              >
                <FaPlus className="mr-1" /> Add Subheading
              </button>
            </div>

            {/* Interpretation */}
            <div>
              <label className="block text-sm font-medium">Interpretation</label>
              <textarea
                {...register("interpretation")}
                className="w-full border rounded px-3 py-2 h-24"
                placeholder="Enter test interpretation or remarks..."
              ></textarea>
              {interpretationErr && <p className="text-red-500 text-xs">{interpretationErr}</p>}
            </div>

            {/* Save / delete */}
            <div className="flex justify-between items-center mt-4">
              {testData && (
                <button
                  type="button"
                  onClick={handleDelete}
                  className="inline-flex items-center px-3 py-1 border border-red-600 text-red-600 rounded hover:bg-red-50"
                >
                  <FaTrash className="mr-1" /> Delete Test
                </button>
              )}
              <button
                type="submit"
                className="inline-flex items-center px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                <FaSave className="mr-1" />
                {testData ? "Save Changes" : "Create Test"}
              </button>
            </div>
          </form>
        )}
      </div>
      {showPreviewModal && <Dialog open={showPreviewModal} onOpenChange={setShowPreviewModal}>
        <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Report Preview</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-hidden">
            {pdfUrl ? (
              <iframe src={pdfUrl} className="w-full h-full" />
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500">Loading preview...</div>
            )}
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button
              variant="outline"
              onClick={() => {
                setShowPreviewModal(false);
                if (pdfUrl) URL.revokeObjectURL(pdfUrl);
                setPdfUrl(null);
              }}
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>}
    </div>
  )
}

// ------------------------------------------------------------------
// INTERPRETATION MODAL
// ------------------------------------------------------------------
interface InterpretationModalProps {
  testData?: TestData;
  onClose: () => void;
  onInterpretationSaved: () => void;
}

const InterpretationModal: React.FC<InterpretationModalProps> = ({ testData, onClose, onInterpretationSaved }) => {
  const [interpretationText, setInterpretationText] = useState(testData?.interpretation || "");
  const [isSaving, setIsSaving] = useState(false);

  const handleSaveInterpretation = async () => {
    if (!testData) return;
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("blood_test")
        .update({ interpretation: interpretationText })
        .eq("id", testData.id);

      if (error) throw error;
      alert("Interpretation saved successfully!");
      onInterpretationSaved();
    } catch (error: any) {
      console.error("Error saving interpretation:", error.message);
      alert(`Error saving interpretation: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
      <div className="bg-white p-6 rounded-lg w-full max-w-xl max-h-[85vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold flex items-center">
            <FaEdit className="mr-2" /> Add/Edit Interpretation for {testData?.testName}
          </h2>
          <button onClick={onClose} className="text-gray-600 hover:text-gray-800">
            Close
          </button>
        </div>
        <textarea
          value={interpretationText}
          onChange={(e) => setInterpretationText(e.target.value)}
          className="w-full border rounded px-3 py-2 h-48 mb-4"
          placeholder="Write your interpretation here..."
        ></textarea>
        <div className="flex justify-end">
          <button
            onClick={handleSaveInterpretation}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            disabled={isSaving}
          >
            {isSaving ? "Saving..." : "Save Interpretation"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ------------------------------------------------------------------
// MAIN PAGE COMPONENT
// ------------------------------------------------------------------
export default function BloodTestsPage() {
  const [bloodTests, setBloodTests] = useState<TestData[]>([])
  const [filteredTests, setFilteredTests] = useState<TestData[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [showModal, setShowModal] = useState(false)
  const [selectedTest, setSelectedTest] = useState<TestData | null>(null)
  const [showInterpretationModal, setShowInterpretationModal] = useState(false)
  const [selectedTestForInterpretation, setSelectedTestForInterpretation] = useState<TestData | null>(null)

  useEffect(() => {
    console.log("BloodTestsPage: Initial fetch triggered.")
    fetchBloodTests()
  }, [])

  useEffect(() => {
    console.log("BloodTestsPage: Search term or bloodTests changed. Filtering data.")
    if (searchTerm.trim()) {
      const filtered = bloodTests.filter((test) => test.testName.toLowerCase().includes(searchTerm.toLowerCase()))
      setFilteredTests(filtered)
      console.log("BloodTestsPage: Filtered tests count:", filtered.length)
    } else {
      setFilteredTests(bloodTests)
      console.log("BloodTestsPage: No search term, showing all tests. Count:", bloodTests.length)
    }
  }, [searchTerm, bloodTests])

  const fetchBloodTests = async () => {
    console.log("BloodTestsPage: Attempting to fetch blood tests from Supabase...")
    try {
      const { data, error } = await supabase
        .from("blood_test")
        .select("id, test_name, price, tpa_price, outsource, parameter, sub_heading, created_at, interpretation") // Columns based on your schema
        .order("test_name")

      if (error) {
        console.error("BloodTestsPage: Supabase fetch error:", error)
        throw error
      }

      console.log("BloodTestsPage: Supabase data received:", data)

      // Map Supabase data to TestData interface, transforming subheadings
      const mappedData: TestData[] = (data || []).map((item: any) => ({
        id: item.id,
        testName: item.test_name,
        price: item.price,
        tpa_price: item.tpa_price ?? undefined,
        isOutsource: item.outsource,
        parameters: item.parameter || [], // Ensure it's an array, default to empty
        subheadings: (item.sub_heading || []).map((sh: any) => ({
          // Transform string[] to { name: string }[] and handle is100
          title: sh.title,
          parameterNames: (sh.parameterNames || []).map((name: string) => ({ name })),
          is100: sh.is100 === true || sh.is100 === "true", // Ensure boolean conversion
        })),
        interpretation: item.interpretation || undefined, // Include interpretation
        created_at: item.created_at,
      }))

      console.log("BloodTestsPage: Mapped data:", mappedData)
      setBloodTests(mappedData)
      setFilteredTests(mappedData) // Initialize filteredTests with all data
      console.log("BloodTestsPage: Data loaded successfully. Total tests:", mappedData.length)
    } catch (error) {
      console.error("BloodTestsPage: Error fetching blood tests:", error)
    } finally {
      setLoading(false)
      console.log("BloodTestsPage: Loading set to false.")
    }
  }

  const openEdit = (test: TestData) => {
    console.log("BloodTestsPage: Opening edit modal for test:", test.id)
    setSelectedTest(test)
    setShowModal(true)
  }

  const openCreate = () => {
    console.log("BloodTestsPage: Opening create modal.")
    setSelectedTest(null)
    setShowModal(true)
  }

  const openInterpretationModal = (test: TestData) => {
    console.log("BloodTestsPage: Opening interpretation modal for test:", test.id)
    setSelectedTestForInterpretation(test)
    setShowInterpretationModal(true)
  }

  const closeModal = () => {
    console.log("BloodTestsPage: Closing modal. Re-fetching data.")
    setShowModal(false)
    setSelectedTest(null)
    fetchBloodTests() // Refresh data after modal closes
  }

  const closeInterpretationModal = () => {
    console.log("BloodTestsPage: Closing interpretation modal. Re-fetching data.")
    setShowInterpretationModal(false)
    setSelectedTestForInterpretation(null)
    fetchBloodTests() // Refresh data after modal closes
  }

  if (loading) {
    console.log("BloodTestsPage: Displaying loading state.")
    return (
      <div className="flex h-screen bg-gray-50">
        <div className="flex-1 p-8">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-gray-200 rounded w-1/4"></div>
            <div className="h-64 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    )
  }

  console.log("BloodTestsPage: Rendering main content with filteredTests:", filteredTests.length)
  return (
    <div className="flex h-screen bg-gray-50">
      <div className="flex-1 overflow-auto">
        <div className="p-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Blood Tests</h1>
            <p className="text-gray-600 mt-2">Manage all available blood tests and their pricing</p>
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Test Database</CardTitle>
                <div className="flex items-center space-x-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                    <Input
                      placeholder="Search tests..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 w-64"
                    />
                  </div>
                  <Badge variant="outline">{filteredTests.length} tests</Badge>
                  <Button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Test
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Test Name</TableHead>
                      <TableHead>Price (₹)</TableHead>
                      <TableHead>TPA Price (₹)</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Parameters</TableHead>
                      <TableHead>Subheadings</TableHead>
                      {/* <TableHead>Descriptions</TableHead> */}
                      <TableHead>Created</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTests.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                          {searchTerm ? "No tests found matching your search." : "No blood tests available."}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredTests.map((test) => (
                        <TableRow key={test.id}>
                          <TableCell className="font-medium">{test.testName}</TableCell>
                          <TableCell>
                            <span className="font-medium">₹{test.price}</span>
                          </TableCell>
                          <TableCell>
                            {typeof test.tpa_price === "number" ? (
                              <span className="font-medium">₹{test.tpa_price}</span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant={test.isOutsource ? "destructive" : "default"}>
                              {test.isOutsource ? "Outsource" : "InHouse"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {test.parameters && Array.isArray(test.parameters) ? (
                              <div className="text-sm text-gray-600">{test.parameters.length} parameters</div>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {test.subheadings && Array.isArray(test.subheadings) ? (
                              <div className="text-sm text-gray-600">
                                {test.subheadings.length} subheadings
                                {test.subheadings.some(sh => sh.is100) && (
                                    <Badge className="ml-2" variant="secondary">100%</Badge>
                                )}
                              </div>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </TableCell>
                          {/* <TableCell>
                            {test.descriptions && Array.isArray(test.descriptions) ? (
                              <div className="text-sm text-gray-600">{test.descriptions.length} descriptions</div>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </TableCell> */}
                          <TableCell>
                            <div className="text-sm text-gray-600">
                              {new Date(test.created_at).toLocaleDateString("en-IN")}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center space-x-2">
                              <Button variant="ghost" size="sm" onClick={() => openEdit(test)}>
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openInterpretationModal(test)}
                                className="text-blue-500 hover:text-blue-700"
                              >
                                <FaPlus className="h-4 w-4 mr-1" />
                                Add Interpretation
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {showModal && <TestModal testData={selectedTest || undefined} onClose={closeModal} onTestUpdated={closeModal} />}
      {showInterpretationModal && (
        <InterpretationModal
          testData={selectedTestForInterpretation || undefined}
          onClose={closeInterpretationModal}
          onInterpretationSaved={closeInterpretationModal}
        />
      )}
    </div>
  )
}