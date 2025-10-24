// generateAiSuggestionsPage.ts
import { jsPDF } from "jspdf"
import diteImg from "@/public/dite.png"
import eatImg from "@/public/eat.png"
import letterhead from "@/public/letterhead.png"
import stamp from "@/public/stamp2.png"
import stamp2 from "@/public/stamp.png"
import type { PatientData, AiSuggestions, AiRecommendationSection, TableCell, TableRow, ParsedTable, CSSStyles } from "./types/report"
import { loadImageAsCompressedJPEG } from "./pdf-generator"
import { ReportConfig } from "./reportConfig"

// -----------------------------
// Helper Functions (Moved from original file)
// -----------------------------
const parseColor = (color: string): [number, number, number] | null => {
  if (!color) return null
  if (color.startsWith("#")) {
    const hex = color.slice(1)
    if (hex.length === 3) {
      return [Number.parseInt(hex[0] + hex[0], 16), Number.parseInt(hex[1] + hex[1], 16), Number.parseInt(hex[2] + hex[2], 16)]
    } else if (hex.length === 6) {
      return [Number.parseInt(hex.slice(0, 2), 16), Number.parseInt(hex.slice(2, 4), 16), Number.parseInt(hex.slice(4, 6), 16)]
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

const parseCSSUnit = (value: string, baseFontSize = 9): number => {
  if (!value) return 0
  const numMatch = value.match(/^([\d.]+)(px|pt|em|rem|%)?$/i)
  if (!numMatch) return 0
  const num = Number.parseFloat(numMatch[1])
  const unit = numMatch[2]?.toLowerCase() || "px"
  switch (unit) {
    case "pt":
      return num
    case "px":
      return num * 0.75
    case "em":
    case "rem":
      return num * baseFontSize
    case "%":
      return (num / 100) * baseFontSize
    default:
      return num
  }
}

const parseInlineCSS = (styleAttr: string): CSSStyles => {
  const styles: CSSStyles = {}
  if (!styleAttr) return styles
  const declarations = styleAttr.split(";").filter(Boolean)
  declarations.forEach((declaration) => {
    const [property, value] = declaration.split(":").map((s) => s.trim())
    if (!property || !value) return
    const prop = property.toLowerCase()
    switch (prop) {
      case "color": styles.color = value; break
      case "background-color": case "background": styles.backgroundColor = value; break
      case "font-weight": styles.fontWeight = value; break
      case "font-style": styles.fontStyle = value; break
      case "font-size": styles.fontSize = parseCSSUnit(value); break
      case "text-align": styles.textAlign = value; break
      case "margin": styles.margin = parseCSSUnit(value); break
      case "padding": styles.padding = parseCSSUnit(value); break
      case "border-width": styles.borderWidth = parseCSSUnit(value); break
      case "border-color": styles.borderColor = value; break
      case "border":
        const borderParts = value.split(/\s+/)
        borderParts.forEach((part) => {
          if (part.match(/^\d/)) {
            styles.borderWidth = parseCSSUnit(part)
          } else if (part.match(/^(solid|dashed|dotted)$/)) {
            styles.borderStyle = part
          } else {
            styles.borderColor = part
          }
        })
        break
      case "width": styles.width = parseCSSUnit(value); break
      case "height": styles.height = parseCSSUnit(value); break
    }
  })
  return styles
}

const applyCSSStyles = (doc: jsPDF, styles: CSSStyles, defaultFontSize = 9) => {
  if (styles.fontSize) {
    doc.setFontSize(styles.fontSize)
  }
  let fontStyle = "normal"
  if (styles.fontWeight === "bold" || styles.fontWeight === "bolder" || Number.parseInt(styles.fontWeight || "400") >= 600) {
    fontStyle = "bold"
  }
  if (styles.fontStyle === "italic") {
    fontStyle = fontStyle === "bold" ? "bolditalic" : "italic"
  }
  doc.setFont("helvetica", fontStyle)
  if (styles.color) {
    const color = parseColor(styles.color)
    if (color) {
      doc.setTextColor(color[0], color[1], color[2])
    }
  }
}

const decodeHTMLEntities = (text: string): string => {
  const entities: Record<string, string> = {
    "&lt;": "<", "&gt;": ">", "&amp;": "&", "&quot;": '"', "&apos;": "'", "&nbsp;": " ", "&ge;": "≥", "&le;": "≤", "&ne;": "≠", "&plusmn;": "±", "&times;": "×", "&divide;": "÷", "&deg;": "°", "&micro;": "µ", "&alpha;": "α", "&beta;": "β", "&gamma;": "γ", "&delta;": "δ", "&omega;": "ω",
  }
  return text.replace(/&[a-zA-Z0-9#]+;/g, (entity) => {
    return entities[entity] || entity
  })
}

const parseTable = (tableElement: Element): ParsedTable => {
  const rows: TableRow[] = []
  let hasHeader = false
  const thead = tableElement.querySelector("thead")
  const tbody = tableElement.querySelector("tbody")
  if (thead) {
    hasHeader = true
    const headerRows = thead.querySelectorAll("tr")
    headerRows.forEach((row) => {
      const cells: TableCell[] = []
      row.querySelectorAll("th, td").forEach((cell) => {
        const cellStyles = parseInlineCSS(cell.getAttribute("style") || "")
        cells.push({
          content: decodeHTMLEntities(cell.innerHTML.replace(/<br\s*\/?>/gi, "\n")), isHeader: true, colspan: Number.parseInt(cell.getAttribute("colspan") || "1"), rowspan: Number.parseInt(cell.getAttribute("rowspan") || "1"), styles: cellStyles,
        })
      })
      rows.push({ cells, styles: parseInlineCSS(row.getAttribute("style") || "") })
    })
  }
  const bodyRows = tbody ? tbody.querySelectorAll("tr") : tableElement.querySelectorAll("tr")
  bodyRows.forEach((row) => {
    if (thead && thead.contains(row)) return
    const cells: TableCell[] = []
    row.querySelectorAll("th, td").forEach((cell) => {
      const cellStyles = parseInlineCSS(cell.getAttribute("style") || "")
      cells.push({
        content: decodeHTMLEntities(cell.innerHTML.replace(/<br\s*\/?>/gi, "\n")), isHeader: cell.tagName.toLowerCase() === "th", colspan: Number.parseInt(cell.getAttribute("colspan") || "1"), rowspan: Number.parseInt(cell.getAttribute("rowspan") || "1"), styles: cellStyles,
      })
    })
    rows.push({ cells, styles: parseInlineCSS(row.getAttribute("style") || "") })
  })
  return { rows, hasHeader, styles: parseInlineCSS(tableElement.getAttribute("style") || "") }
}

const renderTable = (doc: jsPDF, table: ParsedTable, x: number, y: number, maxWidth: number): number => {
  if (table.rows.length === 0) return y
  const lineHeight = 5
  const defaultCellPadding = 2
  const defaultBorderWidth = 0.5
  const maxCols = Math.max(...table.rows.map((row) => row.cells.length))
  const colWidth = maxWidth / maxCols
  let currentY = y
  table.rows.forEach((row) => {
    let maxRowHeight = 0
    row.cells.forEach((cell) => {
      const cellPadding = cell.styles?.padding || defaultCellPadding
      const cellWidth = colWidth * (cell.colspan || 1) - 2 * cellPadding
      applyCSSStyles(doc, cell.styles || {})
      if (cell.isHeader) doc.setFont("helvetica", "bold").setFontSize(9)
      else doc.setFont("helvetica", "normal").setFontSize(8)
      const lines = doc.splitTextToSize(cell.content.replace(/<[^>]*>/g, ""), cellWidth)
      const cellHeight = Math.max(lines.length * lineHeight + 2 * cellPadding, lineHeight + 2 * cellPadding)
      maxRowHeight = Math.max(maxRowHeight, cellHeight)
    })
    let currentX = x
    row.cells.forEach((cell) => {
      const cellWidth = colWidth * (cell.colspan || 1)
      const cellHeight = maxRowHeight
      const cellPadding = cell.styles?.padding || defaultCellPadding
      const borderWidth = cell.styles?.borderWidth || defaultBorderWidth
      doc.setLineWidth(borderWidth)
      doc.setDrawColor(...(parseColor(cell.styles?.borderColor || "black") || [0, 0, 0]))
      let hasFill = false
      if (cell.styles?.backgroundColor) {
        const bgColor = parseColor(cell.styles.backgroundColor)
        if (bgColor) {
          doc.setFillColor(...bgColor)
          hasFill = true
        }
      } else if (cell.isHeader) {
        doc.setFillColor(240, 240, 240)
        hasFill = true
      }
      doc.rect(currentX, currentY, cellWidth, cellHeight, hasFill ? "FD" : "D")
      applyCSSStyles(doc, cell.styles || {})
      if (cell.isHeader) doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(0, 0, 0)
      else doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(0, 0, 0)
      const textWidth = cellWidth - 2 * cellPadding
      const lines = doc.splitTextToSize(cell.content.replace(/<[^>]*>/g, ""), textWidth)
      const textAlign = cell.styles?.textAlign || "left"
      lines.forEach((line: string, lineIndex: number) => {
        let textX = currentX + cellPadding
        if (textAlign === "center") textX = currentX + cellWidth / 2
        else if (textAlign === "right") textX = currentX + cellWidth - cellPadding
        doc.text(line, textX, currentY + cellPadding + (lineIndex + 1) * lineHeight, { align: textAlign as any })
      })
      currentX += cellWidth
    })
    currentY += maxRowHeight
  })
  return currentY + 5
}

export const parseHTMLContent = (doc: jsPDF, htmlContent: string, x: number, y: number, maxWidth: number): number => {
  const parser = new DOMParser()
  const htmlDoc = parser.parseFromString(`<div>${htmlContent}</div>`, "text/html")
  const container = htmlDoc.querySelector("div")
  let currentY = y
  const lineHeight = 5

  if (!container) {
    const cleanText = decodeHTMLEntities(htmlContent.replace(/<[^>]*>/g, ""))
    const lines = doc.splitTextToSize(cleanText, maxWidth)
    doc.setFont("helvetica", "normal").setFontSize(9)
    doc.text(lines, x, currentY)
    return currentY + lines.length * lineHeight
  }

  const processNode = (node: Node, currentX: number, currentY: number): [number, number] => {
    let xOffset = currentX
    let yOffset = currentY
    if (node.nodeType === Node.TEXT_NODE) {
      const text = decodeHTMLEntities(node.textContent || "")
      const textLines = text.split("\n")
      textLines.forEach((line, index) => {
        const parts = line.split(/(<strong\>|<\/strong\>|<b\>|<\/b\>|<em\>|<\/em\>|<i\>|<\/i\>)/i)
        parts.forEach((part: string) => {
          if (!part.trim()) return
          if (part.toLowerCase() === "<b>" || part.toLowerCase() === "<strong>") doc.setFont("helvetica", "bold")
          else if (part.toLowerCase() === "</b>" || part.toLowerCase() === "</strong>") doc.setFont("helvetica", "normal")
          else if (part.toLowerCase() === "<i>" || part.toLowerCase() === "<em>") doc.setFont("helvetica", "italic")
          else if (part.toLowerCase() === "</i>" || part.toLowerCase() === "</em>") doc.setFont("helvetica", "normal")
          else {
            const textParts = doc.splitTextToSize(part, maxWidth - (xOffset - x))
            textParts.forEach((textPart: string, textIndex: number) => {
              if (textIndex > 0) {
                yOffset += lineHeight
                xOffset = x
              }
              const textWidth = doc.getTextWidth(textPart)
              doc.text(textPart, xOffset, yOffset)
              xOffset += textWidth
            })
          }
        })
        if (index < textLines.length - 1) {
          yOffset += lineHeight
          xOffset = x
        }
      })
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element
      const tagName = element.tagName.toLowerCase()
      const styles = parseInlineCSS(element.getAttribute("style") || "")
      doc.setFontSize(9).setFont("helvetica", "normal").setTextColor(0, 0, 0)
      if (Object.keys(styles).length > 0) {
        applyCSSStyles(doc, styles)
      } else {
        switch (tagName) {
          case "h1": doc.setFont("helvetica", "bold").setFontSize(14); break
          case "h2": doc.setFont("helvetica", "bold").setFontSize(12); break
          case "h3": doc.setFont("helvetica", "bold").setFontSize(11); break
          case "h4": case "h5": case "h6": doc.setFont("helvetica", "bold").setFontSize(10); break
          case "strong": case "b": doc.setFont("helvetica", "bold").setFontSize(9); break
          case "em": case "i": doc.setFont("helvetica", "italic").setFontSize(9); break
          case "p": case "div":
            if (element.innerHTML.trim() !== "") {
              yOffset += lineHeight
              xOffset = x
            }
            break
          case "br": yOffset += lineHeight; xOffset = x; return [xOffset, yOffset]
          case "li": doc.text("• ", x, yOffset + lineHeight); xOffset = x + doc.getTextWidth("• "); yOffset += lineHeight; break
          case "ul": case "ol": yOffset += 2; xOffset = x; break
          case "table": yOffset = renderTable(doc, parseTable(element), x, yOffset, maxWidth); xOffset = x; return [xOffset, yOffset]
        }
      }
      if (tagName === "div" && styles.backgroundColor) {
        const bgColor = parseColor(styles.backgroundColor)
        if (bgColor) {
          doc.setFillColor(...bgColor)
          const textHeight = lineHeight * 1.2
          doc.rect(x, yOffset - textHeight + 2, maxWidth, textHeight, "F")
        }
      }
      for (let i = 0; i < element.childNodes.length; i++) {
        const [newX, newY] = processNode(element.childNodes[i], xOffset, yOffset)
        xOffset = newX
        yOffset = newY
      }
      if (["h1", "h2", "h3", "h4", "h5", "h6", "p", "ul", "ol", "div"].includes(tagName)) {
        if (element.innerHTML.trim() !== "") yOffset += styles.margin || 2
        xOffset = x
      }
      doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(0, 0, 0)
    }
    return [xOffset, yOffset]
  }
  for (let i = 0; i < container.childNodes.length; i++) {
    const [_, newY] = processNode(container.childNodes[i], x, currentY)
    currentY = newY
  }
  return currentY
}

// -----------------------------
// AI Suggestions Page Renderer
// -----------------------------
export const renderAiSuggestionsPage = async (
  doc: jsPDF,
  patientData: PatientData,
  aiSuggestions: AiSuggestions,
  w: number, h: number, left: number,
  headerY: (reportedOnRaw?: string) => number,
  addStampsAndPrintedBy: (doc: jsPDF, enteredBy: string) => Promise<void>,
  ensureSpace: (y: number, minHeightNeeded: number, reportedOnRaw?: string) => Promise<number>,
  printedBy: string,
  includeLetterhead: boolean,
) => {
  const [loadedLetterhead, loadedDietImage, loadedExerciseImage] = await Promise.all([
    includeLetterhead ? loadImageAsCompressedJPEG(letterhead.src, 0.5) : Promise.resolve(null),
    loadImageAsCompressedJPEG(diteImg.src, 0.3), // Lowered quality for image
    loadImageAsCompressedJPEG(eatImg.src, 0.3), // Lowered quality for image
  ])

  doc.addPage()
  if (includeLetterhead && loadedLetterhead) {
    doc.addImage(loadedLetterhead.dataUrl, "JPEG", 0, 0, w, h)
  }
  const aiPageY = headerY(patientData.createdAt)
  await addStampsAndPrintedBy(doc, printedBy)

  const totalW = w - 2 * left
  let currentY = aiPageY
  currentY = await ensureSpace(currentY, 30, patientData.createdAt)
  doc.setFont("helvetica", "bold").setFontSize(16).setTextColor(0, 51, 102)
  doc.text("AI Expert Suggestion According to Report Value", w / 2, currentY + 10, { align: "center" })
  currentY += 20
  const cardPadding = 5
  const imageSize = 30
  const textGap = 5
  const renderSingleRecommendationCard = async (section: AiRecommendationSection, image: string, startY: number): Promise<number> => {
    const cardX = left
    const cardWidth = totalW
    const imageWidth = imageSize
    const imageHeight = imageSize
    const textContentX = cardX + cardPadding + imageWidth + textGap
    const textContentWidth = cardWidth - 2 * cardPadding - imageWidth - textGap
    let textBlockHeight = 0
    doc.setFont("helvetica", "bold").setFontSize(12)
    const titleHeight = doc.getTextDimensions(section.title, { fontSize: 12 }).h
    textBlockHeight += titleHeight + 2
    doc.setFont("helvetica", "normal").setFontSize(8)
    const descriptionLines = doc.splitTextToSize(section.description, textContentWidth)
    const descriptionHeight = descriptionLines.length * 4
    textBlockHeight += descriptionHeight + 2
    for (const item of section.items) {
      doc.setFont("helvetica", "bold").setFontSize(9)
      const headingText = `• ${item.heading}:`
      const headingWidth = doc.getTextWidth(headingText)
      const headingLineHeight = 4
      textBlockHeight += headingLineHeight
      doc.setFont("helvetica", "normal").setFontSize(8)
      const firstLineContentWidth = textContentWidth - headingWidth
      const remainingContent = item.content.substring(doc.splitTextToSize(item.content, firstLineContentWidth)[0]?.length || 0).trim()
      const subsequentContentLines = doc.splitTextToSize(remainingContent, textContentWidth)
      const subsequentContentHeight = subsequentContentLines.length * 4
      textBlockHeight += subsequentContentHeight + 1
    }
    const cardHeight = Math.max(textBlockHeight + 2 * cardPadding, imageHeight + 2 * cardPadding)
    const cardCurrentY = await ensureSpace(startY, cardHeight + 10, patientData.createdAt)
    doc.setDrawColor(0, 0, 0).setLineWidth(0.2)
    doc.setFillColor(245, 245, 245)
    doc.rect(cardX, cardCurrentY, cardWidth, cardHeight, "FD")
    doc.addImage(image, "JPEG", cardX + cardPadding, cardCurrentY + cardPadding, imageWidth, imageHeight)
    let textDrawY = cardCurrentY + cardPadding
    doc.setFont("helvetica", "bold").setFontSize(12).setTextColor(0, 51, 102)
    doc.text(section.title, textContentX, textDrawY + titleHeight / 2)
    textDrawY += titleHeight + 2
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(50, 50, 50)
    doc.text(descriptionLines, textContentX, textDrawY)
    textDrawY += descriptionHeight + 2
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(0, 0, 0)
    for (const item of section.items) {
      doc.setFont("helvetica", "bold").setFontSize(9)
      const headingText = `• ${item.heading}:`
      const headingWidth = doc.getTextWidth(headingText)
      const headingLineHeight = 4
      const firstLineContentWidth = textContentWidth - headingWidth
      const firstLineContent = doc.splitTextToSize(item.content, firstLineContentWidth)[0] || ""
      const remainingContent = item.content.substring(firstLineContent.length).trim()
      const subsequentContentLines = doc.splitTextToSize(remainingContent, textContentWidth)
      const subsequentContentHeight = subsequentContentLines.length * 4
      const totalItemHeight = headingLineHeight + subsequentContentHeight
      textDrawY = await ensureSpace(textDrawY, totalItemHeight + 1, patientData.createdAt)
      doc.setFont("helvetica", "bold").setFontSize(9)
      doc.text(headingText, textContentX, textDrawY)
      doc.setFont("helvetica", "normal").setFontSize(8)
      doc.text(firstLineContent, textContentX + headingWidth, textDrawY)
      let currentContentY = textDrawY + headingLineHeight
      if (subsequentContentLines.length > 0) {
        doc.text(subsequentContentLines, textContentX, currentContentY)
        currentContentY += subsequentContentLines.length * 4
      }
      textDrawY = currentContentY + 1
    }
    return cardCurrentY + cardHeight + 10
  }
  currentY = await renderSingleRecommendationCard(aiSuggestions.diet, loadedDietImage!.dataUrl, currentY)
  currentY = await renderSingleRecommendationCard(aiSuggestions.exercise, loadedExerciseImage!.dataUrl, currentY)
  return currentY
}