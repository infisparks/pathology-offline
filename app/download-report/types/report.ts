export interface AgeRangeItem {
  rangeKey: string
  rangeValue: string
}
export type AiRecommendationItem = {
  heading: string
  content: string
}

export type AiRecommendationSection = {
  title: string
  description: string
  items: AiRecommendationItem[]
}

export type AiSuggestions = {
  diet: AiRecommendationSection
  exercise: AiRecommendationSection
}
export interface Parameter {
  name: string
  value: string | number
  unit: string
  range: string | { male: AgeRangeItem[]; female: AgeRangeItem[] }
  subparameters?: Parameter[]
  visibility?: string
  formula?: string
  iscomment?: boolean
  valueType?: string
  defaultValue?: string
}

export interface BloodTestData {
  testId: string
  parameters: Parameter[]
  subheadings?: { title: string; parameterNames: string[]; is100?: string }[]
  type?: string
  reportedOn?: string
  enteredBy?: string
  createdAt?: string
  descriptions?: { heading: string; content: string }[]
  interpretation?: string // Added interpretation field
}

export interface PatientData {
  id: number
  name: string
  age: string | number
  gender: string
  patientId: string
  contact: string
  total_day?: string | number
  day_type?: "year" | "month" | "day"
  title?: string
  doctorName?: string
  hospitalName?: string
  registration_id: number
  createdAt: string
  sampleCollectedAt?: string
  bloodtest_data: { testId: string; testName: string; price: number; testType?: string }[]
  bloodtest_detail: Record<string, { parameters: Parameter[]; reportedOn?: string; enteredBy?: string }>
  bloodtest?: Record<string, BloodTestData>
  referredBy?: string
}

export interface CombinedTestGroup {
  id: string
  name: string
  tests: string[]
}

export interface TableCell {
  content: string
  isHeader: boolean
  colspan?: number
  rowspan?: number
  styles?: CSSStyles
}

export interface TableRow {
  cells: TableCell[]
  styles?: CSSStyles
}

export interface ParsedTable {
  rows: TableRow[]
  hasHeader: boolean
  styles?: CSSStyles
}

export interface CSSStyles {
  color?: string
  backgroundColor?: string
  fontWeight?: string
  fontStyle?: string
  fontSize?: number
  textAlign?: string
  margin?: number
  padding?: number
  borderWidth?: number
  borderColor?: string
  borderStyle?: string
  width?: number
  height?: number
}

export interface HistoricalTestEntry {
  registrationId: number
  reportedOn: string // ISO string
  testKey: string // Slugified test name
  parameters: Parameter[]
}

export interface ComparisonTestSelection {
  testName: string // Original test name, e.g., "CBC"
  slugifiedTestName: string // Slugified test name, e.g., "cbc"
  availableDates: { date: string; registrationId: number; testKey: string; reportedOn: string }[]
  selectedDates: string[] // Array of ISO date strings for selected reports
}


// --- NEW: Report Configuration Type ---
export interface ReportConfig {
  page: {
    marginTop: number
    marginBottom: number
    marginHorizontal: number
  }
  colors: {
    heading: string
    subheading: string
    printedBy: string
    tableHeaderBg: string
    tableHeaderText: string
    parameterHeaderText: string
  }
  fontSizes: {
    heading: number
    subheading: number
    parameter: number
    parameterHeader: number
    printedBy: number
  }
  stamp: {
    width: number
    height: number
    position: "left" | "center" | "right"
    marginBottom: number
  }
}
