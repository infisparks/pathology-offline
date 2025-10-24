"use client";

import React, { useState } from "react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import letterhead from "../../public/bill.png";
import { toWords } from "number-to-words";

interface BloodTest {
  testId: string;
  testName: string;
  price: number;
}

interface Patient {
  title?: string;
  name: string;
  patientId: string;
  age: number;
  gender: string;
  registration_id?: number;
  contact?: string;
  createdAt: string;
  doctorName?: string;   // camelCase
  doctor_name?: string;  // snake_case, fallback
  discountAmount: number;
  amountPaid: number;
  bloodTests?: BloodTest[];
  dayType?: "year" | "month" | "day";
  day_type?: "year" | "month" | "day";
  billNo?: string;
  bill_no?: string;
}

interface FakeBillProps {
  patient: Patient;
  onClose: () => void;
}

export default function FakeBill({ patient, onClose }: FakeBillProps) {
  const [tests, setTests] = useState<BloodTest[]>(
    patient.bloodTests?.map((t) => ({ ...t })) ?? []
  );
  const [customPaid, setCustomPaid] = useState<number>(patient.amountPaid);

  const safe = (val: any) => val === undefined || val === null ? "N/A" : String(val);

  // Prefer doctorName, fallback to doctor_name
  const doctorName = patient.doctorName || (patient as any).doctor_name || "N/A";

  function getAgeWithUnit() {
    const dtRaw = patient.dayType ?? (patient as any).day_type;
    let unit = "y";
    if (dtRaw === "month") unit = "m";
    else if (dtRaw === "day") unit = "d";
    return `${safe(patient.age)}${unit}`;
  }

  function getMergedPatientId() {
    // Use registration_id if present, fallback to patientId
    const regId = patient.registration_id;
    if (patient.patientId && regId) {
      return `${patient.patientId}-${regId}`;
    }
    return patient.patientId || regId?.toString() || "N/A";
  }
  
  
  function getFullName() {
    return `${patient.title ? patient.title.toUpperCase() + " " : ""}${safe(
      patient.name
    ).toUpperCase()}`;
  }

  const calcAmounts = (
    list: BloodTest[],
    discount: number,
    paid: number
  ) => {
    const testTotal = list.reduce((s, t) => s + t.price, 0);
    return { testTotal, remaining: testTotal - discount - paid };
  };

  const handlePriceChange = (id: string, price: number) =>
    setTests((prev) =>
      prev.map((t) => (t.testId === id ? { ...t, price } : t))
    );

  const handleDownload = () => {
    const { testTotal, remaining } = calcAmounts(
      tests,
      patient.discountAmount,
      customPaid
    );
    const remainingWords = toWords(Math.round(remaining));
    const img = new Image();
    img.src = (letterhead as any).src ?? (letterhead as any);

    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext("2d")!.drawImage(img, 0, 0);
      const bg = canvas.toDataURL("image/jpeg", 0.5);

      const doc = new jsPDF({
        unit: "mm",
        format: "a4",
        orientation: "portrait",
      });
      const pageW = doc.internal.pageSize.getWidth();

      doc.addImage(bg, "JPEG", 0, 0, pageW, 297);
      doc.setFont("helvetica", "normal");
      const margin = 14;
      const mid = pageW / 2;
      const Lk = margin,
        Lc = margin + 40,
        Lv = margin + 44;
      const Rk = mid + margin,
        Rc = mid + margin + 40,
        Rv = mid + margin + 44;

      let y = 70;
      doc.setFontSize(10);
      const nameLines = doc.splitTextToSize(getFullName(), (pageW / 2 + margin) - Lv - 4);
      doc.text("Name", Lk, y);
      doc.text(":", Lc, y);
      doc.text(nameLines, Lv, y);
      doc.text("Patient ID", Rk, y);
      doc.text(":", Rc, y);
      doc.text(getMergedPatientId(), Rv, y);
      y += nameLines.length * 6;

      const row = (kL: string, vL: any, kR: string, vR: any) => {
        doc.text(safe(kL), Lk, y);
        doc.text(":", Lc, y);
        doc.text(safe(vL), Lv, y);
        doc.text(safe(kR), Rk, y);
        doc.text(":", Rc, y);
        doc.text(safe(vR), Rv, y);
        y += 6;
      };

      if (patient.bill_no) {
        row("Bill No", patient.bill_no, "", "");
      }

      row(
        "Age / Gender",
        `${getAgeWithUnit()} / ${safe(patient.gender)}`,
        "Registration Date",
        patient.createdAt
          ? new Date(patient.createdAt).toLocaleDateString()
          : "N/A"
      );
      row(
        "Ref. Doctor",
        doctorName,
        "Contact",
        patient.contact ?? "N/A"
      );

      y += 4;

      autoTable(doc, {
        head: [["Test Name", "Amount"]],
        body: tests.map((t) => [t.testName, t.price.toFixed(2)]),
        startY: y,
        theme: "grid",
        styles: { font: "helvetica", fontSize: 11 },
        headStyles: { fillColor: [30, 79, 145], fontStyle: "bold" },
        columnStyles: { 1: { fontStyle: "bold" } },
        margin: { left: margin, right: margin },
      });
      y = (doc as any).lastAutoTable.finalY + 10;

      const summary: [string, string][] = [["Test Total", testTotal.toFixed(2)]];
      if (patient.discountAmount > 0) {
        summary.push(["Discount", patient.discountAmount.toFixed(2)]);
      }
      summary.push(
        ["Amount Paid", customPaid.toFixed(2)],
        ["Remaining", remaining.toFixed(2)]
      );

      autoTable(doc, {
        head: [["Description", "Amount"]],
        body: summary,
        startY: y,
        theme: "plain",
        styles: { font: "helvetica", fontSize: 11 },
        columnStyles: { 1: { fontStyle: "bold" } },
        margin: { left: margin, right: margin },
      });
      y = (doc as any).lastAutoTable.finalY + 8;

      doc
        .setFont("helvetica", "normal")
        .setFontSize(10)
        .text(
          `(${remainingWords.charAt(0).toUpperCase() + remainingWords.slice(1)} only)`,
          pageW - margin,
          y,
          { align: "right" }
        );
      y += 12;

      doc
        .setFont("helvetica", "italic")
        .setFontSize(10)
        .text("Thank you for choosing our services!", pageW / 2, y, {
          align: "center",
        });

      doc.save(`Medfordlab_${patient.name}.pdf`);
    };

    img.onerror = () => alert("Failed to load letter-head image.");
  };

  // --------- MODAL CONTENT (VISIBLE) ----------
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-lg relative">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-500 hover:text-gray-700"
        >
          ✕
        </button>

        <h3 className="text-xl font-semibold mb-2">
          Generate Bill — {getFullName()}
        </h3>

        <div className="flex flex-col gap-1 text-sm mb-3">
          <div>
            <span className="font-medium text-gray-700">Ref. Doctor:</span>{" "}
            <span className="text-gray-900">{doctorName}</span>
          </div>
          <div>
            <span className="font-medium text-gray-700">Patient ID:</span>{" "}
            <span className="text-gray-900">{getMergedPatientId()}</span>
            </div>
          <div>
            <span className="font-medium text-gray-700">Age/Gender:</span>{" "}
            <span className="text-gray-900">
              {getAgeWithUnit()} / {safe(patient.gender)}
            </span>
          </div>
          <div>
            <span className="font-medium text-gray-700">Contact:</span>{" "}
            <span className="text-gray-900">{safe(patient.contact)}</span>
          </div>
          <div>
            <span className="font-medium text-gray-700">Registration Date:</span>{" "}
            <span className="text-gray-900">
              {patient.createdAt
                ? new Date(patient.createdAt).toLocaleDateString()
                : "N/A"}
            </span>
          </div>
        </div>

        <div className="max-h-60 overflow-y-auto mb-4">
          {tests.map((t) => (
            <div key={t.testId} className="flex justify-between items-center mb-2">
              <span>{t.testName}</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={t.price}
                onChange={(e) => handlePriceChange(t.testId, Number(e.target.value))}
                className="w-24 px-2 py-1 border rounded"
              />
            </div>
          ))}
        </div>

        <div className="mb-4 flex items-center space-x-2">
          <label className="w-1/2 text-sm font-medium">Total Paid (Rs.)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={customPaid}
            onChange={(e) => setCustomPaid(Number(e.target.value))}
            className="w-24 px-2 py-1 border rounded"
          />
        </div>

        <button
          onClick={handleDownload}
          className="w-full bg-teal-600 text-white py-2 rounded hover:bg-teal-700"
        >
          Download Bill
        </button>
      </div>
    </div>
  );
}
