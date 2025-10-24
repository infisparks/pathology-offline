
export type ReportConfig = {
    // Page layout and printable area
    page: {
      marginTop: number
      marginBottom: number
      marginHorizontal: number
    }
    printedBy: {
        display: boolean
        position: "left" | "right" | "center"
      }
    // Color theme for the report
    colors: {
      heading: string
      subheading: string
      highValue: string // Color for high values (H)
      lowValue: string // Color for low values (L)
      parameter: string // Color for normal parameter values (default black)
      printedBy: string
      tableHeaderBg: string
      tableHeaderText: string
      parameterHeaderText: string
    }
  
    // Font sizes for different elements
    fontSizes: {
      heading: number
      subheading: number
      parameter: number
      parameterHeader: number
      printedBy: number
      footer: number
    }
  
    // Stamp configurations
    stamps: {
      stampRight: {
        display: boolean
        width: number
        height: number
        marginBottom: number
      }
      stampCenter: {
        display: boolean
        width: number
        height: number
        marginBottom: number
      }
    }
  
    // Horizontal spacing for columns in percentage (must sum to 100)
    columnWidths: {
      parameter: number // e.g., 40
      value: number // e.g., 20
      unit: number // e.g., 20
      range: number // e.g., 20
    }
  
    // Vertical spacing between parameters
    parameterVerticalSpacing: number // space in px
  }
  
  /**
   * This configuration object controls the entire look and feel of the PDF report.
   * Modify these values to customize fonts, colors, margins, and stamp placement.
   */
  export const defaultReportConfig: ReportConfig = {
    // Page layout and printable area
    page: {
      marginTop: 50, // Space from the top of the page to the start of the patient header.
      marginBottom: 25, // Space from the bottom, creating the footer area. Content will move to a new page before crossing this.
      marginHorizontal: 23, // Left and right margins.
    },
  
    // Color theme for the report
    colors: {
      heading: "#003366", // Color for main test titles (e.g., "COMPLETE BLOOD COUNT").
      subheading: "#003366", // Color for subheadings within a test (e.g., "DIFFERENTIAL COUNT").
      highValue: "#000000", // Red color for high values.
      lowValue: "#000000", // Blue color for low values.
      parameter: "#000000", // Default color for parameter values.
      printedBy: "#555555", // Text color for the "Printed by..." footer text.
      tableHeaderBg: "#FFFFFF", // Background color for the main parameter header (PARAMETER, VALUE, UNIT, RANGE).
      tableHeaderText: "#000000", // Text color for the main parameter header.
      parameterHeaderText: "#000000", // Text color for the main parameter header.
    },
  
    // Font sizes for different elements
    fontSizes: {
      heading: 13, // Font size for main test titles.
      subheading: 10, // Font size for subheadings within a test.
      parameter: 9, // Font size for parameter names, values, units, and ranges.
      parameterHeader: 10, // Font size for the parameter table header.
      printedBy: 8, // Font size for the "Printed by..." text.
      footer: 7
    },
  
    // Stamp configurations
    stamps: {
      stampRight: {
        display: true,
        width: 35,
        height: 30, // Note: This will be dynamically calculated
        marginBottom: 21,
      },
      stampCenter: {
        display: false, // Default to false as requested
        width: 40,
        height: 30, // Note: This will be dynamically calculated
        marginBottom: 21,
      },
    },
  
    // "Printed by" text configuration
    printedBy: {
      display: true,
      position: "left",
    },
  
    // Horizontal spacing for columns in percentage (must sum to 100)
    columnWidths: {
      parameter: 40,
      value: 20,
      unit: 20,
      range: 20,
    },
  
    // Vertical spacing between parameters
    parameterVerticalSpacing: 5,
  }