// generateReportPdf.ts 

import { jsPDF } from "jspdf"
import letterhead from "@/public/letterhead.png"
import firstpage from "@/public/first.png"
import stamp from "@/public/stamp2.png"
import stamp2 from "@/public/stamp.png"
import diteImg from "@/public/dite.png"
import eatImg from "@/public/eat.png"
import type { Parameter, BloodTestData, PatientData, CombinedTestGroup, HistoricalTestEntry, ComparisonTestSelection, AiSuggestions } from "./types/report"
import { defaultReportConfig, type ReportConfig } from "./reportConfig"
import { parseHTMLContent, renderAiSuggestionsPage } from "./generateAiSuggestionsPage"
// import { renderAiSuggestionsPage, parseHTMLContent } from "./generateAiSuggestionsPage"

// -----------------------------
// Helper Functions (Maintained)
// -----------------------------
export const loadImageAsCompressedJPEG = async (url: string, quality = 0.5) => {
  const res = await fetch(url)
  const blob = await res.blob()
  return new Promise<{ dataUrl: string; width: number; height: number }>((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const c = document.createElement("canvas")
      c.width = img.width
      c.height = img.height
      const ctx = c.getContext("2d")
      if (!ctx) return reject(new Error("canvas"))
      ctx.drawImage(img, 0, 0)
      resolve({ dataUrl: c.toDataURL("image/jpeg", quality), width: img.width, height: img.height })
    }
    img.onerror = reject
    img.src = URL.createObjectURL(blob)
    img.crossOrigin = "anonymous"
  })
}

const parseRangeKey = (key: string) => {
  key = key.trim()
  const suf = key.slice(-1)
  let mul = 1
  if (suf === "m") mul = 30
  else if (suf === "y") mul = 365
  const core = key.replace(/[dmy]$/, "")
  const [lo, hi] = core.split("-")
  return { lower: Number(lo) * mul || 0, upper: Number(hi) * mul || Number.POSITIVE_INFINITY }
}

const parseNumericRangeString = (str: string) => {
  const up = /^\s*up\s*(?:to\s*)?([\d.]+)\s*$/i.exec(str)
  if (up) {
    const upper = Number.parseFloat(up[1])
    return isNaN(upper) ? null : { lower: 0, upper }
  }
  const m = /^\s*([\d.]+)\s*(?:-|to)\s*([\d.]+)\s*$/i.exec(str)
  if (!m) return null
  const lower = Number.parseFloat(m[1]), upper = Number.parseFloat(m[2])
  return isNaN(lower) || isNaN(upper) ? null : { lower, upper }
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

const parseColor = (color: string): [number, number, number] | null => {
  if (!color) return null
  if (color.startsWith("#")) {
    const hex = color.slice(1)
    if (hex.length === 3) {
      return [
        Number.parseInt(hex[0] + hex[0], 16),
        Number.parseInt(hex[1] + hex[1], 16),
        Number.parseInt(hex[2] + hex[2], 16),
      ]
    } else if (hex.length === 6) {
      return [
        Number.parseInt(hex.slice(0, 2), 16),
        Number.parseInt(hex.slice(2, 4), 16),
        Number.parseInt(hex.slice(4, 6), 16),
      ]
    }
  }
  const rgbMatch = color.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/)
  if (rgbMatch) {
    return [Number.parseInt(rgbMatch[1]), Number.parseInt(rgbMatch[2]), Number.parseInt(rgbMatch[3])]
  }
  const namedColors: Record<string, [number, number, number]> = {
    red: [255, 0, 0], green: [0, 128, 0], blue: [0, 0, 255], black: [0, 0, 0], white: [255, 255, 255], gray: [128, 128, 128], grey: [128, 128, 128], yellow: [255, 255, 0], orange: [255, 165, 0], purple: [128, 0, 128], pink: [255, 192, 203], brown: [165, 42, 42], navy: [0, 0, 128], teal: [0, 128, 128], lime: [0, 255, 0], cyan: [0, 255, 255], magenta: [255, 0, 255], silver: [192, 192, 192], maroon: [128, 0, 0], olive: [128, 128, 0]
  }
  const lowerColor = color.toLowerCase()
  return namedColors[lowerColor] || null
}

const slugifyTestName = (name: string) => name.toLowerCase().replace(/\s+/g, "_").replace(/[.#$[\]()]/g, "")

// -----------------------------
// AI Suggestion Generation Function
// -----------------------------
export const generateAiSuggestions = async (patientData: PatientData, bloodtestData: Record<string, BloodTestData>): Promise<AiSuggestions> => {
  const apiKey = "AIzaSyA0G8Jhg6yJu-D_OI97_NXgcJTlOes56P8"
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`
  const defaultResponse: AiSuggestions = {
    diet: {
      title: "Diet Recommendations",
      description: "Based on your general health, here are some diet suggestions:",
      items: [{ heading: "Balanced Diet", content: "Focus on a balanced diet with plenty of fruits, vegetables, and lean proteins." }, { heading: "Hydration", content: "Ensure adequate water intake throughout the day." }],
    },
    exercise: {
      title: "Exercise Recommendations",
      description: "To maintain good health, consider these exercise tips:",
      items: [{ heading: "Regular Activity", content: "Aim for at least 30 minutes of moderate physical activity most days." }, { heading: "Strength & Flexibility", content: "Incorporate strength training and stretching exercises." }],
    },
  }
  let bloodTestSummary = ""
  if (bloodtestData) {
    for (const testKey in bloodtestData) {
      const test = bloodtestData[testKey]
      bloodTestSummary += `\nTest: ${testKey.replace(/_/g, " ")}\n`
      test.parameters.forEach((param) => {
        let rangeStr = ""
        if (typeof param.range === "string") {
          rangeStr = param.range
        } else {
          const genderKey = patientData.gender?.toLowerCase() ?? ""
          const ageDays = patientData.total_day ? Number(patientData.total_day) : Number(patientData.age) * 365
          const arr = param.range[genderKey as keyof typeof param.range] || []
          for (const r of arr) {
            const { lower, upper } = parseRangeKey(r.rangeKey)
            if (ageDays >= lower && ageDays <= upper) {
              rangeStr = r.rangeValue
              break
            }
          }
          if (!rangeStr && arr.length) rangeStr = arr[arr.length - 1].rangeValue
        }
        const numVal = Number.parseFloat(String(param.value).trim())
        const numRange = parseNumericRangeString(rangeStr)
        let status = ""
        if (numRange && !isNaN(numVal)) {
          if (numVal < numRange.lower) status = " (LOW)"
          else if (numVal > numRange.upper) status = " (HIGH)"
          else status = " (NORMAL)"
        }
        bloodTestSummary += `- ${param.name}: ${param.value} ${param.unit} (Range: ${rangeStr})${status}\n`
      })
    }
  }
  const prompt = `Generate short, professional, and actionable diet and exercise recommendations for a patient based on their blood test report. 

 The patient's details are: Name: ${patientData.name}, Age: ${patientData.age} ${
    patientData.day_type === "day" ? "Days" : patientData.day_type === "month" ? "Months" : "Years"
  }, Gender: ${patientData.gender}. 

 Here are the relevant blood test results:\n${bloodTestSummary} 

 Provide the response as JSON with this structure: 
 { 
  "diet": { 
  "title": "Dietary Recommendations", 
  "description": "Based on your blood test results, here are some dietary suggestions:", 
  "items": [ 
  {"heading": "Short heading for diet item 1", "content": "Detailed content for diet item 1."}, 
  {"heading": "Short heading for diet item 2", "content": "Detailed content for diet item 2."} 
  ] 
  }, 
  "exercise": { 
  "title": "Exercise Recommendations", 
  "description": "To complement your diet, consider these exercise tips:", 
  "items": [ 
  {"heading": "Short heading for exercise item 1", "content": "Detailed content for exercise item 1."}, 
  {"heading": "Short heading for exercise item 2", "content": "Detailed content for exercise item 2."} 
  ] 
  } 
 } 

 Ensure the content is concise and directly related to the blood test values if possible, otherwise provide general health advice.`
  const requestBody = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: "application/json" },
  }
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    })
    if (!response.ok) {
      console.error("Gemini API error:", await response.text())
      return defaultResponse
    }
    const result = await response.json()
    const recommendations = JSON.parse(result.candidates[0].content.parts[0].text)
    return recommendations as AiSuggestions
  } catch (e) {
    console.error("Error fetching or parsing Gemini API response:", e)
    return defaultResponse
  }
}

// -----------------------------
// Main PDF Generation Function
// -----------------------------
export const generateReportPdf = async (
  data: PatientData,
  selectedTests: string[],
  combinedGroups: CombinedTestGroup[],
  historicalTestsData: Record<string, HistoricalTestEntry[]>,
  comparisonSelections: Record<string, ComparisonTestSelection>,
  reportType: "normal" | "comparison" | "combined",
  includeLetterhead: boolean,
  skipCover: boolean,
  aiSuggestions?: AiSuggestions,
  includeAiSuggestionsPage = false,
  testDisplayOptions: Record<string, { showUnit: boolean; showRange: boolean }> = {},
  config: Partial<ReportConfig> = {},
) => {
  const finalConfig = {
    ...defaultReportConfig, ...config, page: { ...defaultReportConfig.page, ...config.page }, colors: { ...defaultReportConfig.colors, ...config.colors }, fontSizes: { ...defaultReportConfig.fontSizes, ...config.fontSizes }, stamps: {
      ...defaultReportConfig.stamps, ...config.stamps, stampRight: { ...defaultReportConfig.stamps.stampRight, ...(config.stamps?.stampRight || {}) }, stampCenter: { ...defaultReportConfig.stamps.stampCenter, ...(config.stamps?.stampCenter || {}) },
    }, printedBy: { ...defaultReportConfig.printedBy, ...(config.printedBy || {}) }, columnWidths: { ...defaultReportConfig.columnWidths, ...config.columnWidths }, parameterVerticalSpacing: config.parameterVerticalSpacing ?? defaultReportConfig.parameterVerticalSpacing,
  }
  const doc = new jsPDF("p", "mm", "a4")
  const firstTestKey = Object.keys(data.bloodtest || {})[0]
  const printedBy = data.bloodtest?.[firstTestKey]?.enteredBy ?? "Lab System"
  const w = doc.internal.pageSize.getWidth()
  const h = doc.internal.pageSize.getHeight()
  const left = finalConfig.page.marginHorizontal
  const totalW = w - 2 * left
  const lineH = finalConfig.parameterVerticalSpacing
  const ageDays = data.total_day ? Number(data.total_day) : Number(data.age) * 365
  const genderKey = data.gender?.toLowerCase() ?? ""
  const footerMargin = finalConfig.page.marginBottom

  const [loadedLetterhead, loadedFirstPage, loadedStampRight, loadedStampCenter] = await Promise.all([
    includeLetterhead ? loadImageAsCompressedJPEG(letterhead.src, 0.5) : Promise.resolve(null),
    !skipCover ? loadImageAsCompressedJPEG(firstpage.src, 0.5) : Promise.resolve(null),
    loadImageAsCompressedJPEG(stamp.src, 0.5),
    loadImageAsCompressedJPEG(stamp2.src, 0.5),
  ])

  const addStampsAndPrintedBy = async (doc: jsPDF, enteredBy: string) => {
    if (finalConfig.stamps.stampRight.display && loadedStampRight) {
      const { width, marginBottom } = finalConfig.stamps.stampRight
      const aspectRatio = loadedStampRight.width / loadedStampRight.height
      const height = width / aspectRatio
      const sx = w - left - width
      const sy = h - height - marginBottom
      doc.addImage(loadedStampRight.dataUrl, "JPEG", sx, sy, width, height)
    }
    if (finalConfig.stamps.stampCenter.display && loadedStampCenter) {
      const { width, marginBottom } = finalConfig.stamps.stampCenter
      const aspectRatio = loadedStampCenter.width / loadedStampCenter.height
      const height = width / aspectRatio
      const sx = (w - width) / 2
      const sy = h - height - marginBottom
      doc.addImage(loadedStampCenter.dataUrl, "JPEG", sx, sy, width, height)
    }
    if (finalConfig.printedBy.display) {
      const printedByColor = parseColor(finalConfig.colors.printedBy)
      doc.setFont("helvetica", "normal").setFontSize(finalConfig.fontSizes.printedBy).setTextColor(printedByColor?.[0] ?? 0, printedByColor?.[1] ?? 0, printedByColor?.[2] ?? 0)
      let printedByX: number
      switch (finalConfig.printedBy.position) {
        case "right": printedByX = w - left; doc.text(`Printed by ${enteredBy}`, printedByX, h - finalConfig.page.marginBottom + 5, { align: "right" }); break
        case "center": printedByX = w / 2; doc.text(`Printed by ${enteredBy}`, printedByX, h - finalConfig.page.marginBottom + 5, { align: "center" }); break
        case "left":
        default: printedByX = left; doc.text(`Printed by ${enteredBy}`, printedByX, h - finalConfig.page.marginBottom + 5); break
      }
    }
  }

  const headerY = (reportedOnRaw?: string) => {
    const gap = 7
    let y = finalConfig.page.marginTop
    doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(0, 0, 0)
    const sampleDT = data.sampleCollectedAt ? new Date(data.sampleCollectedAt) : new Date(data.createdAt)
    const sampleDTStr = formatDMY(sampleDT)
    const registrationStr = formatDMY(data.createdAt)
    const reportedOnStr = reportedOnRaw ? formatDMY(reportedOnRaw) : "-"
    const leftRows = [
      { label: "Patient Name", value: data.title ? `${data.title} ${data.name.toUpperCase()}` : data.name.toUpperCase() },
      { label: "Age/Sex", value: `${data.age} ${data.day_type === "day" ? "Days" : data.day_type === "month" ? "Months" : "Years"} / ${data.gender}` },
      { label: "Ref Doctor", value: (data.doctorName || "-").toUpperCase() },
      { label: "Client Name", value: (data.hospitalName || "-").toUpperCase() },
    ]
    const mergedPatientId = data.patientId && data.registration_id ? `${data.patientId}-${data.registration_id}` : data.patientId || data.registration_id || "-"
    const rightRows = [
      { label: "Patient ID", value: mergedPatientId }, { label: "Sample Collected on", value: sampleDTStr }, { label: "Registration On", value: registrationStr }, { label: "Reported On", value: reportedOnStr },
    ]
    const maxLeftLabel = Math.max(...leftRows.map((r) => doc.getTextWidth(r.label)))
    const maxRightLabel = Math.max(...rightRows.map((r) => doc.getTextWidth(r.label)))
    const xLL = left
    const xLC = xLL + maxLeftLabel + 2
    const xLV = xLC + 2
    const startR = w / 2 + 10
    const xRL = startR
    const xRC = xRL + maxRightLabel + 2
    const xRV = xRC + 2
    const leftValueWidth = startR - xLV - 4
    for (let i = 0; i < leftRows.length; i++) {
      doc.text(leftRows[i].label, xLL, y)
      doc.text(":", xLC, y)
      if (i === 0) {
        doc.setFont("helvetica", "bold")
        const nameLines = doc.splitTextToSize(leftRows[i].value, leftValueWidth)
        doc.text(nameLines, xLV, y)
        doc.setFont("helvetica", "normal")
        y += nameLines.length * (gap - 2)
      } else {
        doc.text(leftRows[i].value, xLV, y)
        y += gap - 2
      }
      doc.text(rightRows[i].label, xRL, y - (gap - 2))
      doc.text(":", xRC, y - (gap - 2))
      doc.text(rightRows[i].value.toString(), xRV, y - (gap - 2))
    }
    return y
  }

  const addEndOfReport = (doc: jsPDF, w: number, h: number, footerMargin: number, finalConfig: ReportConfig, currentY: number) => {
    doc.setFont("helvetica", "italic").setFontSize(finalConfig.fontSizes.footer).setTextColor(0)
    doc.text("--------------------- END OF REPORT ---------------------", w / 2, currentY + 4, { align: "center" })
  }

  const addNewPageWithHeader = async (reportedOnRaw?: string) => {
    doc.addPage()
    if (includeLetterhead && loadedLetterhead) {
      doc.addImage(loadedLetterhead.dataUrl, "JPEG", 0, 0, w, h)
    }
    const y = headerY(reportedOnRaw)
    await addStampsAndPrintedBy(doc, printedBy)
    return y
  }

  const ensureSpace = async (y: number, minHeightNeeded: number, reportedOnRaw?: string): Promise<{ y: number; pageBreak: boolean }> => {
    const pageBreak = y + minHeightNeeded >= h - finalConfig.page.marginBottom
    if (pageBreak) {
      // Before adding a new page, if the current content didn't end with an END OF REPORT, add one now.
      // This ensures END OF REPORT is on every page at the bottom if the page is full.
      if (y < h - finalConfig.page.marginBottom - 10) { // Check if we have space to print EOR without going into footer
        addEndOfReport(doc, w, h, footerMargin, finalConfig, y)
      }
      return { y: await addNewPageWithHeader(reportedOnRaw), pageBreak: true }
    }
    return { y, pageBreak: false }
  }

  // --- CORRECTED printRow Function --- 
  const printRow = async (p: Parameter, y: number, reportedOnRaw: string | undefined, options: { showUnit: boolean; showRange: boolean; widths: { param: number; value: number; unit: number; range: number }; coords: { x1: number; x2: number; x3: number; x4: number } }, indent = 0): Promise<number> => {
    if (p.value === null || p.value === undefined || String(p.value).trim() === "") return y
    let rangeStr = ""
    if (typeof p.range === "string") {
      rangeStr = p.range
    } else if (p.range) {
      const arr = p.range[genderKey as keyof typeof p.range] || []
      for (const r of arr) {
        const { lower, upper } = parseRangeKey(r.rangeKey)
        if (ageDays >= lower && ageDays <= upper) {
          rangeStr = r.rangeValue
          break
        }
      }
      if (!rangeStr && arr.length) rangeStr = arr[arr.length - 1].rangeValue
    }
    rangeStr = rangeStr.replaceAll("\\n", "\n")
    const rawValue = String(p.value).trim()
    const valStr = rawValue !== "" ? `${rawValue}` : "-"
    const isSpanningParameter = (p.unit || "").trim() === "" && (rangeStr || "").trim() === ""
    const numRange = parseNumericRangeString(rangeStr)
    const numVal = Number.parseFloat(rawValue)
    let isValueOutOfRange = false
    let valueColor = parseColor(finalConfig.colors.parameter)
    let indicator = ""
    if (!isSpanningParameter && numRange && !isNaN(numVal)) {
      if (numVal < numRange.lower) {
        isValueOutOfRange = true
        valueColor = parseColor(finalConfig.colors.lowValue)
        indicator = " L"
      } else if (numVal > numRange.upper) {
        isValueOutOfRange = true
        valueColor = parseColor(finalConfig.colors.highValue)
        indicator = " H"
      }
    }
    const valueWithIndicator = `${valStr}${indicator}`
    const valueMaxWidth = isSpanningParameter ? options.widths.value + options.widths.unit + options.widths.range - 4 : options.widths.value - 4
    const nameLines = doc.splitTextToSize(" ".repeat(indent) + p.name, options.widths.param - 4)
    const valueLines = doc.splitTextToSize(valueWithIndicator, valueMaxWidth)
    const unitLines = !isSpanningParameter && options.showUnit ? doc.splitTextToSize(p.unit, options.widths.unit - 4) : []
    const rangeLines = !isSpanningParameter && options.showRange ? doc.splitTextToSize(rangeStr, options.widths.range - 4) : []
    const maxLines = Math.max(nameLines.length, valueLines.length, unitLines.length, rangeLines.length)
    const estimatedRowHeight = maxLines * lineH
    
    // --- Correction: Use ensureSpace and update y
    let result = await ensureSpace(y, estimatedRowHeight, reportedOnRaw)
    y = result.y
    // --- End Correction
    
    doc.setFont("helvetica", "normal").setFontSize(finalConfig.fontSizes.parameter).setTextColor(0, 0, 0)
    doc.text(nameLines, options.coords.x1, y + 4)
    const finalValueColor = isValueOutOfRange ? valueColor : parseColor(finalConfig.colors.parameter)
    doc.setFont("helvetica", isValueOutOfRange ? "bold" : "normal").setFontSize(finalConfig.fontSizes.parameter).setTextColor(finalValueColor?.[0] ?? 0, finalValueColor?.[1] ?? 0, finalValueColor?.[2] ?? 0)
    doc.text(valueLines, options.coords.x2 + 2, y + 4)
    if (!isSpanningParameter) {
      if (options.showUnit && unitLines.length > 0) {
        doc.setFont("helvetica", "normal").setTextColor(0, 0, 0)
        doc.text(unitLines, options.coords.x3 + 2, y + 4)
      }
      if (options.showRange && rangeLines.length > 0) {
        doc.setFont("helvetica", "normal").setTextColor(0, 0, 0)
        doc.text(rangeLines, options.coords.x4 + 2, y + 4)
      }
    }
    y += estimatedRowHeight
    if (p.subparameters?.length) {
      for (const sp of p.subparameters) {
        y = await printRow(sp, y, reportedOnRaw, options, indent + 2)
      }
    }
    return y
  }

  const printTest = async (testKey: string, tData: BloodTestData, y: number, displayOptions: Record<string, { showUnit: boolean; showRange: boolean }>): Promise<number> => {
    // --- Correction: Use ensureSpace and update y
    let result = await ensureSpace(y, 20, tData.reportedOn)
    y = result.y
    // --- End Correction
    
    doc.setDrawColor(0, 51, 102).setLineWidth(0.5)
    doc.line(left, y, w - left, y)
    doc.setFont("helvetica", "bold").setFontSize(finalConfig.fontSizes.heading).setTextColor(0, 51, 102)
    doc.text(testKey.replace(/_/g, " ").toUpperCase(), w / 2, y + 8, { align: "center" })
    y += 10
    const rowH = 7
    
    // --- Correction: Use ensureSpace and update y
    result = await ensureSpace(y, rowH, tData.reportedOn)
    y = result.y
    // --- End Correction
    
    const testOpts = displayOptions[testKey] || { showUnit: true, showRange: true }
    const baseWidths = {
      param: (totalW * finalConfig.columnWidths.parameter) / 100, value: (totalW * finalConfig.columnWidths.value) / 100, unit: (totalW * finalConfig.columnWidths.unit) / 100, range: (totalW * finalConfig.columnWidths.range) / 100,
    }
    let freedWidth = 0
    let visibleCols = 4
    if (!testOpts.showUnit) {
      freedWidth += baseWidths.unit
      visibleCols--
    }
    if (!testOpts.showRange) {
      freedWidth += baseWidths.range
      visibleCols--
    }
    const extraWidthPerCol = visibleCols > 0 ? freedWidth / visibleCols : 0
    const finalWidths = {
      param: baseWidths.param + (visibleCols > 0 ? extraWidthPerCol : freedWidth / 2), value: baseWidths.value + (visibleCols > 0 ? extraWidthPerCol : freedWidth / 2), unit: testOpts.showUnit ? baseWidths.unit + extraWidthPerCol : 0, range: testOpts.showRange ? baseWidths.range + extraWidthPerCol : 0,
    }
    const finalCoords = {
      x1: left, x2: left + finalWidths.param, x3: left + finalWidths.param + finalWidths.value, x4: left + finalWidths.param + finalWidths.value + finalWidths.unit,
    }
    const paramHeaderTextColor = parseColor(finalConfig.colors.parameterHeaderText)
    doc.setFontSize(finalConfig.fontSizes.parameterHeader)
    doc.setDrawColor(0, 0, 0)
    doc.roundedRect(left, y, totalW, rowH, 1, 1, "S")
    doc.setTextColor(paramHeaderTextColor?.[0] ?? 0, paramHeaderTextColor?.[1] ?? 0, paramHeaderTextColor?.[2] ?? 0)
    doc.setFont("helvetica", "bold")
    doc.text("PARAMETER", finalCoords.x1 + 2, y + 5)
    doc.text("VALUE", finalCoords.x2 + 2, y + 5)
    if (testOpts.showUnit) doc.text("UNIT", finalCoords.x3 + 2, y + 5)
    if (testOpts.showRange) doc.text("RANGE", finalCoords.x4 + 2, y + 5)
    y += rowH + 2
    const subheads = tData.subheadings ?? []
    const subNames = subheads.flatMap((s) => s.parameterNames)
    const globals = tData.parameters.filter((p) => !subNames.includes(p.name))
    const rowOptions = { showUnit: testOpts.showUnit, showRange: testOpts.showRange, widths: finalWidths, coords: finalCoords }
    for (const g of globals) {
      y = await printRow(g, y, tData.reportedOn, rowOptions)
    }
    for (const sh of subheads) {
      const rows = tData.parameters.filter((p) => sh.parameterNames.includes(p.name))
      if (!rows.length) continue
      
        // --- Correction: Use ensureSpace and update y
        result = await ensureSpace(y, 6 + lineH * 2, tData.reportedOn)
        y = result.y
        // --- End Correction

      doc.setFont("helvetica", "bold").setFontSize(finalConfig.fontSizes.subheading).setTextColor(0, 51, 102)
      doc.text(sh.title, finalCoords.x1, y + 5)
      y += 6
      for (const r of rows) {
        y = await printRow(r, y, tData.reportedOn, rowOptions, 2)
      }
    }
    if (tData.interpretation && tData.interpretation.trim() !== "") {
      const interpretationBlockPadding = 0
      const contentStartX = finalCoords.x1 + interpretationBlockPadding
      const contentMaxWidth = totalW - interpretationBlockPadding * 2
      const measureDoc = new jsPDF("p", "mm", "a4")
      measureDoc.setFont("helvetica", "normal").setFontSize(9)
      const finalYAfterContent = parseHTMLContent(measureDoc, tData.interpretation, contentStartX, 0, contentMaxWidth)
      const measuredContentHeight = finalYAfterContent
      const totalInterpretationBlockHeight = measuredContentHeight + interpretationBlockPadding * 2
      
        // --- Correction: Use ensureSpace and update y
        result = await ensureSpace(y, totalInterpretationBlockHeight + 4, tData.reportedOn)
        y = result.y
        // --- End Correction
        
      const blockRectYStart = y + 2
      doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(0, 0, 0)
      parseHTMLContent(doc, tData.interpretation, contentStartX, blockRectYStart + interpretationBlockPadding, contentMaxWidth)
      y = blockRectYStart + totalInterpretationBlockHeight + 1
    }
    y += 3
    if (Array.isArray(tData.descriptions) && tData.descriptions.length) {
      y += 4
      for (const { heading, content } of tData.descriptions) {
        
            // --- Correction: Use ensureSpace and update y
            result = await ensureSpace(y, lineH * 2, tData.reportedOn)
            y = result.y
            // --- End Correction
            
        doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(0, 51, 102)
        doc.text(heading, finalCoords.x1, y + lineH)
        y += lineH + 2
        y = parseHTMLContent(doc, content, finalCoords.x1, y, totalW)
        y += 4
      }
    }
    // --- REMOVED: addEndOfReport(doc, w, h, footerMargin, finalConfig, y) --- 
    // This is the line that caused the duplicate prints. It will be moved to the main flow.
    return y
  }

  const generateComparisonReportPDF = async (
    doc: jsPDF, data: PatientData, historicalTestsData: Record<string, HistoricalTestEntry[]>, comparisonSelections: Record<string, ComparisonTestSelection>, yPos: number, w: number, left: number, lineH: number, ageDays: number, genderKey: string, h: number, footerMargin: number, addNewPageWithHeader: (reportedOnRaw?: string) => Promise<number>, ensureSpace: (y: number, minHeightNeeded: number, reportedOnRaw?: string) => Promise<{ y: number; pageBreak: boolean }>,
  ): Promise<number> => {
    const totalW = w - 2 * left
    const comparisonLineHeight = 4
    const comparisonRowPadding = 1
    const selectedComparisonTests = Object.values(comparisonSelections).filter((selection: ComparisonTestSelection) => selection.selectedDates.length > 0 && data.bloodtest && data.bloodtest[selection.slugifiedTestName])
    let firstTestInComparisonReport = true
    for (const selection of selectedComparisonTests) {
      const relevantHistoricalEntries = historicalTestsData[selection.slugifiedTestName]?.filter((entry) => selection.selectedDates.includes(entry.reportedOn)).sort((a, b) => new Date(b.reportedOn).getTime() - new Date(a.reportedOn).getTime())
      if (!relevantHistoricalEntries || relevantHistoricalEntries.length === 0) continue
      if (!firstTestInComparisonReport) {
          // Add EOR before page break for next test
          addEndOfReport(doc, w, h, footerMargin, finalConfig, yPos);
          yPos = await addNewPageWithHeader(relevantHistoricalEntries[0].reportedOn)
      }
      firstTestInComparisonReport = false
      const dateHeaders = relevantHistoricalEntries.map((entry) => new Date(entry.reportedOn).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }))
      const numDateColumns = dateHeaders.length
      const fixedColWidthParam = totalW * 0.3
      const fixedColWidthRange = totalW * 0.2
      const remainingWidthForValues = totalW - fixedColWidthParam - fixedColWidthRange
      const dynamicColWidth = remainingWidthForValues / numDateColumns
      
      let result = await ensureSpace(yPos, 20, relevantHistoricalEntries[0].reportedOn)
      yPos = result.y

      doc.setDrawColor(0, 51, 102).setLineWidth(0.5)
      doc.line(left, yPos, w - left, yPos)
      doc.setFont("helvetica", "bold").setFontSize(13).setTextColor(0, 51, 102)
      doc.text(`${selection.testName.toUpperCase()} COMPARISON REPORT`, w / 2, yPos + 8, { align: "center" })
      yPos += 10
      doc.setFontSize(10).setFillColor(0, 51, 102)
      const rowH = 7
      
      result = await ensureSpace(yPos, rowH, relevantHistoricalEntries[0].reportedOn)
      yPos = result.y

      doc.rect(left, yPos, totalW, rowH, "F")
      doc.setTextColor(255, 255, 255)
      let currentX = left
      doc.text("PARAMETER", currentX + 2, yPos + 5)
      currentX += fixedColWidthParam
      doc.text("RANGE", currentX + 2, yPos + 5)
      currentX += fixedColWidthRange
      dateHeaders.forEach((header) => {
        doc.text(header, currentX + dynamicColWidth / 2, yPos + 5, { align: "center" })
        currentX += dynamicColWidth
      })
      yPos += rowH + 2
      const currentTestBloodData = data.bloodtest?.[selection.slugifiedTestName]
      if (!currentTestBloodData) continue
      const subheads = currentTestBloodData.subheadings ?? []
      const subNames = subheads.flatMap((s) => s.parameterNames)
      const globalParameters = currentTestBloodData.parameters.filter((p) => !subNames.includes(p.name))
      const printComparisonParameterRow = async (param: Parameter, indent = 0): Promise<number> => {
        if (param.value === null || param.value === undefined || String(param.value).trim() === "") return yPos
        let maxRowHeight = comparisonLineHeight
        let isTextParameter = false
        let latestParamInstance: Parameter | undefined
        if (relevantHistoricalEntries.length > 0) {
          latestParamInstance = relevantHistoricalEntries[0].parameters.find((p) => p.name === param.name) || relevantHistoricalEntries[0].parameters.flatMap((p) => p.subparameters || []).find((sp) => sp.name === param.name)
          if (latestParamInstance && (latestParamInstance.valueType === "text" || isNaN(Number(String(latestParamInstance.value).trim())))) {
            isTextParameter = true
          }
        }
        let commonUnit = ""
        let commonRange = ""
        if (!isTextParameter && relevantHistoricalEntries.length > 0) {
          const latestParam = relevantHistoricalEntries[0].parameters.find((p) => p.name === param.name)
          if (latestParam) {
            commonUnit = latestParam.unit || ""
            if (typeof latestParam.range === "string") {
              commonRange = latestParam.range
            } else {
              const arr = latestParam.range[genderKey as keyof typeof latestParam.range] || []
              for (const r of arr) {
                const { lower, upper } = parseRangeKey(r.rangeKey)
                if (ageDays >= lower && ageDays <= upper) {
                  commonRange = r.rangeValue
                  break
                }
              }
              if (!commonRange && arr.length) commonRange = arr[arr.length - 1].rangeValue
            }
          }
        }
        const paramDisplayName = param.unit && !isTextParameter ? `${param.name} (${param.unit})` : param.name
        const nameLines = doc.splitTextToSize(" ".repeat(indent) + paramDisplayName, fixedColWidthParam - 4)
        doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(0, 0, 0)
        doc.text(nameLines, left + 2, yPos + 4)
        maxRowHeight = Math.max(maxRowHeight, nameLines.length * comparisonLineHeight)
        if (!isTextParameter) {
          const rangeLines = doc.splitTextToSize(commonRange, fixedColWidthRange - 4)
          doc.text(rangeLines, left + fixedColWidthParam + 2, yPos + 4)
          maxRowHeight = Math.max(maxRowHeight, rangeLines.length * comparisonLineHeight)
        }
        let currentXForValues = left + fixedColWidthParam + fixedColWidthRange
        if (isTextParameter) {
          const latestEntry = relevantHistoricalEntries[0]
          const paramInstance = latestEntry?.parameters.find((p) => p.name === param.name) || latestEntry?.parameters.flatMap((p) => p.subparameters || []).find((sp) => sp.name === param.name)
          let valueToDisplay = "-"
          if (paramInstance) valueToDisplay = String(paramInstance.value).trim()
          doc.setFont("helvetica", "normal").setTextColor(0, 0, 0)
          const textSpanWidth = totalW - fixedColWidthParam
          const valueLines = doc.splitTextToSize(valueToDisplay, textSpanWidth - 4)
          doc.text(valueLines, left + fixedColWidthParam + 2, yPos + 4, { align: "left" })
          maxRowHeight = Math.max(maxRowHeight, valueLines.length * comparisonLineHeight)
        } else {
          relevantHistoricalEntries.forEach((entry) => {
            const paramInstance = entry.parameters.find((p) => p.name === param.name) || entry.parameters.flatMap((p) => p.subparameters || []).find((sp) => sp.name === param.name)
            let valueToDisplay = "-"
            let isOutOfRange = false
            if (paramInstance) {
              const rawValue = String(paramInstance.value).trim()
              valueToDisplay = rawValue
              const numVal = Number.parseFloat(rawValue)
              const numRange = parseNumericRangeString(commonRange)
              if (numRange && !isNaN(numVal)) {
                if (numVal < numRange.lower) {
                  isOutOfRange = true
                  valueToDisplay = `${rawValue} L`
                } else if (numVal > numRange.upper) {
                  isOutOfRange = true
                  valueToDisplay = `${rawValue} H`
                }
              }
              const valueColor = isOutOfRange && numRange ? numVal < numRange.lower ? parseColor(finalConfig.colors.lowValue) : parseColor(finalConfig.colors.highValue) : parseColor(finalConfig.colors.parameter)
              doc.setFont("helvetica", isOutOfRange ? "bold" : "normal").setTextColor(valueColor?.[0] ?? 0, valueColor?.[1] ?? 0, valueColor?.[2] ?? 0)
            } else {
              doc.setFont("helvetica", "normal").setTextColor(0, 0, 0)
            }
            const valueLines = doc.splitTextToSize(valueToDisplay, dynamicColWidth - 4)
            doc.text(valueLines, currentXForValues + dynamicColWidth / 2, yPos + 4, { align: "center" })
            maxRowHeight = Math.max(maxRowHeight, valueLines.length * comparisonLineHeight)
            currentXForValues += dynamicColWidth
          })
        }
        return yPos + maxRowHeight + comparisonRowPadding
      }
      for (const param of globalParameters) {
        result = await ensureSpace(yPos, comparisonLineHeight * 2, relevantHistoricalEntries[0].reportedOn)
        yPos = result.y
        yPos = await printComparisonParameterRow(param)
      }
      for (const sh of subheads) {
        const rows = currentTestBloodData.parameters.filter((p) => sh.parameterNames.includes(p.name))
        if (!rows.length) continue
        result = await ensureSpace(yPos, 6 + comparisonLineHeight * 2, relevantHistoricalEntries[0].reportedOn)
        yPos = result.y
        doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(0, 51, 102)
        doc.text(sh.title, left, yPos + 5)
        yPos += 6
        for (const param of rows) {
          result = await ensureSpace(yPos, comparisonLineHeight * 2, relevantHistoricalEntries[0].reportedOn)
          yPos = result.y
          yPos = await printComparisonParameterRow(param, 2)
        }
      }
      yPos += 10
    }
    // Add EOR after the last test in comparison mode
    addEndOfReport(doc, w, h, footerMargin, finalConfig, yPos)
    return yPos
  }

  // --- Main Page Flow --- 
  if (!skipCover) {
    if (loadedFirstPage) doc.addImage(loadedFirstPage.dataUrl, "JPEG", 0, 0, w, h)
  }
  if (includeAiSuggestionsPage && aiSuggestions) {
    const aiPageNumber = doc.getNumberOfPages() + 1
    doc.setPage(aiPageNumber)
    await renderAiSuggestionsPage(doc, data, aiSuggestions, w, h, left, headerY, addStampsAndPrintedBy, (y, minH, reportedOnRaw) => ensureSpace(y, minH, reportedOnRaw).then(r => r.y), printedBy, includeLetterhead)
  }
  const firstSelectedTestKey = selectedTests.length > 0 ? selectedTests[0] : undefined
  const firstTestReportedOn = firstSelectedTestKey && data.bloodtest && data.bloodtest[firstSelectedTestKey] ? data.bloodtest[firstSelectedTestKey].reportedOn : data.createdAt
  if (doc.getNumberOfPages() === 0 || (!skipCover && !includeAiSuggestionsPage)) {
    doc.addPage()
  } else if (includeAiSuggestionsPage || !skipCover) {
    doc.addPage()
  }
  if (includeLetterhead && loadedLetterhead) doc.addImage(loadedLetterhead.dataUrl, "JPEG", 0, 0, w, h)
  let currentY = headerY(firstTestReportedOn)
  await addStampsAndPrintedBy(doc, printedBy)
  if (!data.bloodtest) return doc.output("blob")
  
  if (reportType === "comparison") {
    currentY = await generateComparisonReportPDF(doc, data, historicalTestsData, comparisonSelections, currentY, w, left, lineH, ageDays, genderKey, h, footerMargin, addNewPageWithHeader, ensureSpace)
  } else if (reportType === "combined") {
    const testsToPrint = Object.keys(data.bloodtest || {}).filter((key) => selectedTests.includes(key))
    for (let i = 0; i < testsToPrint.length; i++) {
      const testKey = testsToPrint[i]
      const tData = data.bloodtest![testKey]
      if (!tData || tData.type === "outsource" || !tData.parameters.length) continue
      
      if (i > 0) {
          // If we are starting a new test, we need a new page. 
          // Before that, print EOR for the previous page's content.
          addEndOfReport(doc, w, h, footerMargin, finalConfig, currentY)
          currentY = await addNewPageWithHeader(tData.reportedOn)
      }
      
      currentY = await printTest(testKey, tData, currentY, testDisplayOptions)
      currentY += 10
    }
    // Add EOR at the very end of the document for the last content
    if (testsToPrint.length > 0) {
        addEndOfReport(doc, w, h, footerMargin, finalConfig, currentY)
    }
    
  } else { // 'normal' report
    let firstGroupOrTest = true
    for (const group of combinedGroups) {
      if (group.tests.length === 0) continue
      const testsInGroup = group.tests.filter((testKey) => selectedTests.includes(testKey) && data.bloodtest![testKey])
      if (testsInGroup.length === 0) continue
      
      let newPageNeeded = !firstGroupOrTest
      
      // Check if the first test of the group needs a new page.
      if (!firstGroupOrTest && currentY + 20 >= h - footerMargin) {
          newPageNeeded = true;
      }

      if (newPageNeeded) {
          addEndOfReport(doc, w, h, footerMargin, finalConfig, currentY)
          currentY = await addNewPageWithHeader(data.bloodtest![testsInGroup[0]].reportedOn)
      }
      
      firstGroupOrTest = false
      
      for (const testKey of testsInGroup) {
        const tData = data.bloodtest![testKey]
        // Only check for mid-group page break if it's NOT the first test in the group/report
        if (!firstGroupOrTest && currentY + 20 >= h - footerMargin) {
             addEndOfReport(doc, w, h, footerMargin, finalConfig, currentY)
             currentY = await addNewPageWithHeader(tData.reportedOn)
        }

        currentY = await printTest(testKey, tData, currentY, testDisplayOptions)
      }
    }
    const combinedTestKeys = combinedGroups.flatMap((group) => group.tests)
    const remainingTests = Object.keys(data.bloodtest || {}).filter((key) => selectedTests.includes(key) && !combinedTestKeys.includes(key))
    for (const testKey of remainingTests) {
      const tData = data.bloodtest![testKey]
      if (tData.type === "outsource" || !tData.parameters.length) continue
      
      if (!firstGroupOrTest) {
          addEndOfReport(doc, w, h, footerMargin, finalConfig, currentY)
          currentY = await addNewPageWithHeader(tData.reportedOn)
      }
      firstGroupOrTest = false
      
      currentY = await printTest(testKey, tData, currentY, testDisplayOptions)
    }
    
    // Add EOR at the very end of the document for the last content
    if (!firstGroupOrTest) {
        addEndOfReport(doc, w, h, footerMargin, finalConfig, currentY)
    }
  }
  
  return doc.output("blob")
}