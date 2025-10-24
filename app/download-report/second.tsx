import Image from "next/image"
import type { AiSuggestions, PatientData } from "./types/report"

import diteImg from "@/public/dite.png"
import eatImg from "@/public/eat.png"

interface SecondPageProps {
  patientData: PatientData
  aiSuggestions: AiSuggestions
}

export default function SecondPage({ patientData, aiSuggestions }: SecondPageProps) {
  const formatDateTime = (isoString: string) => {
    const date = new Date(isoString)
    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    })
  }

  return (
    <div className="min-h-screen bg-white p-8 font-sans">
      {/* Header Section - Mimicking the PDF header layout */}
      <div className="mb-8 text-sm grid grid-cols-2 gap-y-2">
        <div>
          <span className="font-semibold">Patient Name:</span> {patientData.title ? `${patientData.title} ` : ""}
          {patientData.name.toUpperCase()}
        </div>
        <div className="text-right">
          <span className="font-semibold">Patient ID:</span>{" "}
          {patientData.patientId && patientData.registration_id
            ? `${patientData.patientId}-${patientData.registration_id}`
            : patientData.patientId || patientData.registration_id || "-"}
        </div>
        <div>
          <span className="font-semibold">Age/Sex:</span> {patientData.age} {patientData.total_day ? "Days" : "Years"} /{" "}
          {patientData.gender}
        </div>
        <div className="text-right">
          <span className="font-semibold">Sample Collected on:</span> {patientData.sampleCollectedAt ? formatDateTime(patientData.sampleCollectedAt) : "-"}
        </div>
        <div>
          <span className="font-semibold">Ref Doctor:</span> {(patientData.doctorName || "-").toUpperCase()}
        </div>
        <div className="text-right">
          <span className="font-semibold">Registration On:</span> {formatDateTime(patientData.createdAt)}
        </div>
        <div>
          <span className="font-semibold">Client Name:</span> {(patientData.hospitalName || "-").toUpperCase()}
        </div>
        <div className="text-right">
          <span className="font-semibold">Reported On:</span> {formatDateTime(patientData.createdAt)}
        </div>
      </div>
      <hr className="border-t-2 border-gray-300 mb-8" />

      {/* AI Suggestions Section */}
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-[#003366]">AI Expert Suggestion According to Report Value</h1>
      </div>

      <div className="space-y-4">
        {" "}
        {/* Changed from space-y-6 to space-y-4 */}
        {/* Dietary Recommendations Card */}
        <div className="border border-gray-300 rounded-lg p-4 bg-gray-50 flex items-start gap-4">
          <Image
            src={diteImg || "/placeholder.svg"}
            alt="Dietary Recommendations"
            width={80}
            height={80}
            className="flex-shrink-0"
          />
          <div>
            <h2 className="text-lg font-bold text-[#003366] mb-2">{aiSuggestions.diet.title}</h2>
            <p className="text-gray-700 text-sm mb-4">{aiSuggestions.diet.description}</p>
            <ul className="list-none space-y-2">
              {aiSuggestions.diet.items.map((item, index) => (
                <li key={index} className="text-sm">
                  <span className="font-semibold">• {item.heading}:</span> {item.content}
                </li>
              ))}
            </ul>
          </div>
        </div>
        {/* Exercise Recommendations Card */}
        <div className="border border-gray-300 rounded-lg p-4 bg-gray-50 flex items-start gap-4">
          <Image
            src={eatImg || "/placeholder.svg"}
            alt="Exercise Recommendations"
            width={80}
            height={80}
            className="flex-shrink-0"
          />
          <div>
            <h2 className="text-lg font-bold text-[#003366] mb-2">{aiSuggestions.exercise.title}</h2>
            <p className="text-gray-700 text-sm mb-4">{aiSuggestions.exercise.description}</p>
            <ul className="list-none space-y-2">
              {aiSuggestions.exercise.items.map((item, index) => (
                <li key={index} className="text-sm">
                  <span className="font-semibold">• {item.heading}:</span> {item.content}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}