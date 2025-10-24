import type { BloodTest, Registration, PaymentHistory } from "../types/dashboard"
import { jsPDF } from "jspdf"
import autoTable from "jspdf-autotable"
import { toWords } from "number-to-words"
import letterhead from "../../../public/bill.png" // Ensure this path is correct for your project

export const slugifyTestName = (name: string) =>
  name
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[.#$[\]]/g, "")

export const isTestFullyEntered = (r: Registration, t: BloodTest): boolean => {
  if (t.testType?.toLowerCase() === "outsource") return true
  if (!r.bloodtest) return false
  const data = r.bloodtest[slugifyTestName(t.testName)]
  if (!data?.parameters) return false
  return data.parameters.every((par: any) => par.value !== "" && par.value != null)
}

export const isAllTestsComplete = (r: Registration) =>
  !r.bloodTests?.length || r.bloodTests.every((bt: BloodTest) => isTestFullyEntered(r, bt))

export const calculateAmounts = (r: Registration) => {
  // Use tpa_price if tpa is true and tpa_price is a number, else use price
  const testTotal = r.bloodTests?.reduce((s: any, t: { price: any, tpa_price?: any }) => {
    if (r.tpa && typeof t.tpa_price === 'number') {
      return s + t.tpa_price;
    }
    return s + t.price;
  }, 0) || 0

  if (r.paymentHistory && typeof r.paymentHistory === "object" && "totalAmount" in r.paymentHistory) {
    const paymentData = r.paymentHistory as PaymentHistory
    const totalPaid = paymentData.paymentHistory?.reduce((sum: any, payment: { amount: any }) => sum + payment.amount, 0) || 0
    const discount = paymentData.discount || 0
    const remaining = testTotal - discount - totalPaid
    return { testTotal, remaining, totalPaid, discount }
  }

  const remaining = testTotal - Number(r.discountAmount || 0) - Number(r.amountPaid || 0)
  return { testTotal, remaining, totalPaid: r.amountPaid || 0, discount: r.discountAmount || 0 }
}

export const calculateTotalsForSelected = (selectedIds: number[], registrations: Registration[]) => {
  const selected = registrations.filter((r) => selectedIds.includes(r.id))
  const totalAmount = selected.reduce((sum, r) => {
    const { testTotal } = calculateAmounts(r)
    return sum + testTotal
  }, 0)

  let totalPaid = 0
  let totalDiscount = 0

  selected.forEach((r) => {
    if (r.paymentHistory && typeof r.paymentHistory === "object" && "totalAmount" in r.paymentHistory) {
      const paymentData = r.paymentHistory as PaymentHistory
      totalPaid += paymentData.paymentHistory?.reduce((sum: any, payment: { amount: any }) => sum + payment.amount, 0) || 0
      totalDiscount += paymentData.discount || 0
    } else {
      totalPaid += Number(r.amountPaid || 0)
      totalDiscount += Number(r.discountAmount || 0)
    }
  })

  return { totalAmount, totalPaid, totalDiscount, remaining: totalAmount - totalPaid - totalDiscount }
}

export const formatLocalDateTime = () => {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Kolkata',
  });
  const parts = formatter.formatToParts(now);
  const get = (type: string) => parts.find(p => p.type === type)?.value.padStart(2, '0');
  const year = get('year');
  const month = get('month');
  const day = get('day');
  const hour = get('hour');
  const minute = get('minute');
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

export const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export const getRank = (r: Registration) => (!r.sampleCollectedAt ? 1 : isAllTestsComplete(r) ? 3 : 2)
export const getMergedPatientId = (registration: Registration) => {
  if (registration.patientId && registration.registration_id) {
    return `${registration.patientId}-${registration.registration_id}`;
  }
  return registration.patientId || registration.registration_id?.toString() || "N/A";
};

export const format12Hour = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

export const getLatestReportedOnTime = (registration: Registration) => {
  let latestReportedOn: Date | null = null;

  if (registration.bloodtest) {
    for (const testKey in registration.bloodtest) {
      if (Object.prototype.hasOwnProperty.call(registration.bloodtest, testKey)) {
        const test = registration.bloodtest[testKey];
        if (test && test.reportedOn) {
          const reportedDate = new Date(test.reportedOn);
          if (isNaN(reportedDate.getTime())) continue; // Skip invalid dates

          if (!latestReportedOn || reportedDate > latestReportedOn) {
            latestReportedOn = reportedDate;
          }
        }
      }
    }
  }

  if (latestReportedOn) {
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "Asia/Kolkata",
    }).format(latestReportedOn);
  }
  return "-";
};

export const calculateTurnAroundTime = (registration: Registration) => {
  const registrationTime = new Date(registration.createdAt);
  const reportedOnTimeStr = getLatestReportedOnTime(registration);
  
  if (reportedOnTimeStr === "-") return "-";

  const reportedOnTime = new Date(reportedOnTimeStr);

  if (isNaN(registrationTime.getTime()) || isNaN(reportedOnTime.getTime())) return "-";

  const diffMs = reportedOnTime.getTime() - registrationTime.getTime();

  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  let tat = "";
  if (diffDays > 0) tat += `${diffDays}d `;
  if (diffHours > 0) tat += `${diffHours}h `;
  if (diffMinutes > 0) tat += `${diffMinutes}m`;

  return tat.trim() || "<1m";
};

export const downloadBill = (selectedRegistration: Registration) => {
  const img = new Image()
  img.src = (letterhead as any).src ?? (letterhead as any)
  img.crossOrigin = "anonymous"
  img.onload = () => {
    const canvas = document.createElement("canvas")
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext("2d")!
    ctx.drawImage(img, 0, 0)
    const bgDataUrl = canvas.toDataURL("image/jpeg", 0.5)

    const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" })
    const pageW = doc.internal.pageSize.getWidth()
    const pageH = doc.internal.pageSize.getHeight()

    doc.addImage(bgDataUrl, "JPEG", 0, 0, pageW, pageH)
    doc.setFont("helvetica", "normal").setFontSize(12)

    const margin = 14
    const colMid = pageW / 2
    const leftKeyX = margin
    const leftColonX = margin + 40
    const leftValueX = margin + 44
    const rightKeyX = colMid + margin
    const rightColonX = colMid + margin + 40
    const rightValueX = colMid + margin + 44

    let y = 70

    // Adjusted drawRow to handle multi-line left value
    const drawRow = (kL: string, vL: string | string[], kR: string, vR: string) => {
      doc.text(kL, leftKeyX, y)
      doc.text(":", leftColonX, y)
      if (Array.isArray(vL)) {
        doc.text(vL, leftValueX, y)
        y += (vL.length - 1) * 6; // Adjust y based on extra lines
      } else {
        doc.text(vL, leftValueX, y)
      }
      doc.text(kR, rightKeyX, y)
      doc.text(":", rightColonX, y)
      doc.text(vR, rightValueX, y)
      y += 6
    }

    const fullName = selectedRegistration.title
      ? `${selectedRegistration.title.toUpperCase()} ${selectedRegistration.name}`
      : selectedRegistration.name

    const unit =
      selectedRegistration.day_type === "month"
        ? "m"
        : selectedRegistration.day_type === "day"
        ? "d"
        : "y"

    // Calculate max width for the name column before splitting
    const nameColumnWidth = (pageW / 2 + margin) - leftValueX - 4;
    const nameLines = doc.splitTextToSize(fullName, nameColumnWidth);

    drawRow("Name", nameLines, "Patient ID", getMergedPatientId(selectedRegistration))
    if (selectedRegistration.bill_no) {
      drawRow("Bill No", selectedRegistration.bill_no, "", "");
    }
    drawRow(
      "Age / Gender",
      `${selectedRegistration.age}${unit} / ${selectedRegistration.gender}`,
      "Registration Date",
      new Date(selectedRegistration.createdAt).toLocaleDateString()
    )
    drawRow(
      "Ref. Doctor",
      selectedRegistration.doctor_name || "N/A",
      "Contact",
      selectedRegistration.contact?.toString() ?? "N/A"
    )
    y += 4

    const rows = selectedRegistration.bloodTests?.map((t) => [
      t.testName,
      (selectedRegistration.tpa && typeof t.tpa_price === 'number' ? t.tpa_price : t.price).toFixed(2)
    ]) ?? []
    autoTable(doc, {
      head: [["Test Name", "Amount"]],
      body: rows,
      startY: y,
      theme: "grid",
      styles: { font: "helvetica", fontSize: 11 },
      headStyles: { fillColor: [30, 79, 145], fontStyle: "bold" },
      columnStyles: { 1: { fontStyle: "bold" } },
      margin: { left: margin, right: margin },
    })
    y = (doc as any).lastAutoTable.finalY + 10

    const { testTotal, remaining, discount } = calculateAmounts(selectedRegistration)
    const remainingWords = toWords(Math.round(remaining))

    autoTable(doc, {
      head: [["Description", "Amount"]],
      body: [
        ["Test Total", testTotal.toFixed(2)],
        ["Discount", discount.toFixed(2)],
        ["Amount Paid", selectedRegistration.amountPaid.toFixed(2)],
        ["Remaining", remaining.toFixed(2)],
      ],
      startY: y,
      theme: "plain",
      styles: { font: "helvetica", fontSize: 11 },
      columnStyles: { 1: { fontStyle: "bold" } },
      margin: { left: margin, right: margin },
    })
    y = (doc as any).lastAutoTable.finalY + 8

    doc
      .setFont("helvetica", "normal")
      .setFontSize(10)
      .text(
        `(${remainingWords.charAt(0).toUpperCase() + remainingWords.slice(1)} only)`,
        pageW - margin,
        y,
        { align: "right" }
      )
    y += 12

    doc
      .setFont("helvetica", "italic")
      .setFontSize(10)
      .text("Thank you for choosing our services!", pageW / 2, y, { align: "center" })

    doc.save(`Bill_${selectedRegistration.name}_${selectedRegistration.id}.pdf`)
  }

  img.onerror = () => alert("Failed to load letterhead image.")
}

export const downloadMultipleBills = (selectedRegistrations: number[], allRegistrations: Registration[]) => {
  if (selectedRegistrations.length === 0) {
    alert("Please select at least one registration")
    return
  }

  const selectedRegistrationsData = allRegistrations.filter((r) => selectedRegistrations.includes(r.id))

  const registrationsByDate = selectedRegistrationsData.reduce(
    (acc, registration) => {
      const date = registration.createdAt.slice(0, 10)
      if (!acc[date]) acc[date] = []
      acc[date].push(registration)
      return acc
    },
    {} as Record<string, Registration[]>,
  )

  const sortedDates = Object.keys(registrationsByDate).sort()

  const img = new Image()
  img.src = (letterhead as any).src ?? (letterhead as any)
  img.crossOrigin = "anonymous"
  img.onload = () => {
    const canvas = document.createElement("canvas")
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext("2d")!
    ctx.drawImage(img, 0, 0)
    const bgDataUrl = canvas.toDataURL("image/jpeg", 0.5)

    const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" })
    const pageW = doc.internal.pageSize.getWidth()
    const pageH = doc.internal.pageSize.getHeight()

    sortedDates.forEach((date, dateIndex) => {
      const regs = registrationsByDate[date]
      regs.forEach((registration, regIndex) => {
        if (dateIndex > 0 || regIndex > 0) {
          doc.addPage()
        }
        doc.addImage(bgDataUrl, "JPEG", 0, 0, pageW, pageH)
        doc.setFont("helvetica", "normal").setFontSize(12)

        const margin = 14
        const colMid = pageW / 2
        const leftKeyX = margin
        const leftColonX = margin + 40
        const leftValueX = margin + 44
        const rightKeyX = colMid + margin
        const rightColonX = colMid + margin + 40
        const rightValueX = colMid + margin + 44

        let y = 70

        // Adjusted drawRow to handle multi-line left value
        const drawRow = (kL: string, vL: string | string[], kR: string, vR: string) => {
          doc.text(kL, leftKeyX, y)
          doc.text(":", leftColonX, y)
          if (Array.isArray(vL)) {
            doc.text(vL, leftValueX, y)
            y += (vL.length - 1) * 6; // Adjust y based on extra lines
          } else {
            doc.text(vL, leftValueX, y)
          }
          doc.text(kR, rightKeyX, y)
          doc.text(":", rightColonX, y)
          doc.text(vR, rightValueX, y)
          y += 6
        }

        const fullName = registration.title
          ? `${registration.title.toUpperCase()} ${registration.name}`
          : registration.name

        const unit =
          registration.day_type === "month"
            ? "m"
            : registration.day_type === "day"
            ? "d"
            : "y"

        // Calculate max width for the name column before splitting
        const nameColumnWidth = (pageW / 2 + margin) - leftValueX - 4;
        const nameLines = doc.splitTextToSize(fullName, nameColumnWidth);

        drawRow("Name", nameLines, "Patient ID", getMergedPatientId(registration))
        if (registration.bill_no) {
          drawRow("Bill No", registration.bill_no, "", "");
        }
        drawRow(
          "Age / Gender",
          `${registration.age}${unit} / ${registration.gender}`,
          "Registration Date",
          new Date(registration.createdAt).toLocaleDateString()
        )
        drawRow(
          "Ref. Doctor",
          registration.doctor_name || "N/A",
          "Contact",
          registration.contact?.toString() ?? "N/A"
        )
        y += 4

        const rows = registration.bloodTests?.map((t) => [t.testName, t.price.toFixed(2)]) ?? []
        autoTable(doc, {
          head: [["Test Name", "Amount"]],
          body: rows,
          startY: y,
          theme: "grid",
          styles: { font: "helvetica", fontSize: 11 },
          headStyles: { fillColor: [30, 79, 145], fontStyle: "bold" },
          columnStyles: { 1: { fontStyle: "bold" } },
          margin: { left: margin, right: margin },
        })
        y = (doc as any).lastAutoTable.finalY + 10

        const { testTotal, remaining, discount } = calculateAmounts(registration)
        const remainingWords = toWords(Math.round(remaining))

        autoTable(doc, {
          head: [["Description", "Amount"]],
          body: [
            ["Test Total", testTotal.toFixed(2)],
            ["Discount", discount.toFixed(2)],
            ["Amount Paid", registration.amountPaid.toFixed(2)],
            ["Remaining", remaining.toFixed(2)],
          ],
          startY: y,
          theme: "plain",
          styles: { font: "helvetica", fontSize: 11 },
          columnStyles: { 1: { fontStyle: "bold" } },
          margin: { left: margin, right: margin },
        })
        y = (doc as any).lastAutoTable.finalY + 8

        doc
          .setFont("helvetica", "normal")
          .setFontSize(10)
          .text(
            `(${remainingWords.charAt(0).toUpperCase() + remainingWords.slice(1)} only)`,
            pageW - margin,
            y,
            { align: "right" }
          )
        y += 12

        doc
          .setFont("helvetica", "italic")
          .setFontSize(10)
          .text("Thank you for choosing our services!", pageW / 2, y, { align: "center" })
      })
    })

    doc.save(`Multiple_Bills_${new Date().toLocaleDateString().replace(/\//g, "-")}.pdf`)
  }

  img.onerror = () => alert("Failed to load letterhead image.")
}

// --- Add this at the end of your file for WhatsApp uploads etc ---
export const generateBillBlob = async (selectedRegistration: Registration): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.src = (letterhead as any).src ?? (letterhead as any)
    img.crossOrigin = "anonymous"
    img.onload = () => {
      const canvas = document.createElement("canvas")
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext("2d")!
      ctx.drawImage(img, 0, 0)
      const bgDataUrl = canvas.toDataURL("image/jpeg", 0.5)

      const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" })
      const pageW = doc.internal.pageSize.getWidth()

      doc.addImage(bgDataUrl, "JPEG", 0, 0, pageW, doc.internal.pageSize.getHeight())
      doc.setFont("helvetica", "normal").setFontSize(12)

      const margin = 14
      const colMid = pageW / 2
      const leftKeyX = margin
      const leftColonX = margin + 40
      const leftValueX = margin + 44
      const rightKeyX = colMid + margin
      const rightColonX = colMid + margin + 40
      const rightValueX = colMid + margin + 44

      let y = 70

      const drawRow = (kL: string, vL: string | string[], kR: string, vR: string) => {
        doc.text(kL, leftKeyX, y)
        doc.text(":", leftColonX, y)
        if (Array.isArray(vL)) {
          doc.text(vL, leftValueX, y)
          y += (vL.length - 1) * 6; // Adjust y based on extra lines
        } else {
          doc.text(vL, leftValueX, y)
        }
        doc.text(kR, rightKeyX, y)
        doc.text(":", rightColonX, y)
        doc.text(vR, rightValueX, y)
        y += 6
      }

      const fullName = selectedRegistration.title
        ? `${selectedRegistration.title.toUpperCase()} ${selectedRegistration.name}`
        : selectedRegistration.name

      const unit =
        selectedRegistration.day_type === "month"
          ? "m"
          : selectedRegistration.day_type === "day"
          ? "d"
          : "y"

      // Calculate max width for the name column before splitting
      const nameColumnWidth = (pageW / 2 + margin) - leftValueX - 4;
      const nameLines = doc.splitTextToSize(fullName, nameColumnWidth);

      drawRow("Name", nameLines, "Patient ID", getMergedPatientId(selectedRegistration))
      if (selectedRegistration.bill_no) {
        drawRow("Bill No", selectedRegistration.bill_no, "", "");
      }
      drawRow(
        "Age / Gender",
        `${selectedRegistration.age}${unit} / ${selectedRegistration.gender}`,
        "Registration Date",
        new Date(selectedRegistration.createdAt).toLocaleDateString()
      )
      drawRow(
        "Ref. Doctor",
        selectedRegistration.doctor_name || "N/A",
        "Contact",
        selectedRegistration.contact?.toString() ?? "N/A"
      )
      y += 4

      const rows = selectedRegistration.bloodTests?.map((t) => [
        t.testName,
        (selectedRegistration.tpa && typeof t.tpa_price === 'number' ? t.tpa_price : t.price).toFixed(2)
      ]) ?? []
      autoTable(doc, {
        head: [["Test Name", "Amount"]],
        body: rows,
        startY: y,
        theme: "grid",
        styles: { font: "helvetica", fontSize: 11 },
        headStyles: { fillColor: [30, 79, 145], fontStyle: "bold" },
        columnStyles: { 1: { fontStyle: "bold" } },
        margin: { left: margin, right: margin },
      })
      y = (doc as any).lastAutoTable.finalY + 10

      const { testTotal, remaining, discount } = calculateAmounts(selectedRegistration)
      const remainingWords = toWords(Math.round(remaining))

      autoTable(doc, {
        head: [["Description", "Amount"]],
        body: [
          ["Test Total", testTotal.toFixed(2)],
          ["Discount", discount.toFixed(2)],
          ["Amount Paid", selectedRegistration.amountPaid.toFixed(2)],
          ["Remaining", remaining.toFixed(2)],
        ],
        startY: y,
        theme: "plain",
        styles: { font: "helvetica", fontSize: 11 },
        columnStyles: { 1: { fontStyle: "bold" } },
        margin: { left: margin, right: margin },
      })
      y = (doc as any).lastAutoTable.finalY + 8

      doc
        .setFont("helvetica", "normal")
        .setFontSize(10)
        .text(
          `(${remainingWords.charAt(0).toUpperCase() + remainingWords.slice(1)} only)`,
          pageW - margin,
          y,
          { align: "right" }
        )
      y += 12

      doc
        .setFont("helvetica", "italic")
        .setFontSize(10)
        .text("Thank you for choosing our services!", pageW / 2, y, { align: "center" })

      // THIS LINE IS NOW SYNCHRONOUS
      resolve(doc.output("blob"))
    }
    img.onerror = () => reject("Failed to load letterhead image.")
  })
}