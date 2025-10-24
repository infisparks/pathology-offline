"use client"

import React from "react"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
import {
  UserIcon,
  FilePlusIcon as DocumentPlusIcon,
  ArrowDownIcon as ArrowDownTrayIcon,
  PencilIcon,
  TextIcon as DocumentTextIcon,
  BanknoteIcon as BanknotesIcon,
  CheckCircleIcon,
  XCircleIcon,
  TrashIcon,
} from "lucide-react"
import { isTestFullyEntered, isAllTestsComplete, calculateAmounts, formatCurrency } from "../lib/dashboard-utils"
import type { Registration, PaymentHistory } from "../types/dashboard"
import { useUserRole } from "@/hooks/useUserRole"
import { Badge } from "@/components/ui/badge"

interface RegistrationListProps {
  filteredRegistrations: Registration[]
  isLoading: boolean
  showCheckboxes: boolean
  selectAll: boolean
  handleToggleSelectAll: () => void
  selectedRegistrations: number[]
  handleToggleSelect: (id: number) => void
  expandedRegistrationId: number | null
  setExpandedRegistrationId: (id: number | null) => void
  setSampleModalRegistration: (reg: Registration | null) => void
  setSampleDateTime: (time: string) => void
  setSelectedRegistration: (reg: Registration | null) => void
  setNewAmountPaid: (amount: string) => void
  setTempDiscount: (discount: string) => void
  handleDownloadBill: () => void
  setFakeBillRegistration: (reg: Registration | null) => void
  handleDeleteRegistration: (reg: Registration) => void
  formatLocalDateTime: () => string
}

export function RegistrationList({
  filteredRegistrations,
  isLoading,
  showCheckboxes,
  selectAll,
  handleToggleSelectAll,
  selectedRegistrations,
  handleToggleSelect,
  expandedRegistrationId,
  setExpandedRegistrationId,
  setSampleModalRegistration,
  setSampleDateTime,
  setSelectedRegistration,
  setNewAmountPaid,
  setTempDiscount,
  handleDownloadBill,
  setFakeBillRegistration,
  handleDeleteRegistration,
  formatLocalDateTime,
}: RegistrationListProps) {
  const { role, loading: roleLoading, error: roleError } = useUserRole()
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.4 }}
      className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden"
    >
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-base font-semibold flex items-center text-gray-900">
          <UserIcon className="h-4 w-4 mr-2 text-stone-700" />
          Registrations {isLoading && <span className="ml-2 text-sm text-gray-500">(Loading...)</span>}
        </h2>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-100 text-xs text-gray-500 border-b border-gray-100">
              {showCheckboxes && (
                <th className="px-6 py-4 text-left font-medium">
                  <input
                    type="checkbox"
                    checked={selectAll}
                    onChange={handleToggleSelectAll}
                    className="h-4 w-4 text-stone-600 border-gray-300 rounded focus:ring-stone-500"
                  />
                </th>
              )}
              <th className="px-6 py-4 text-left font-medium uppercase tracking-wider text-gray-600">Patient</th>
              <th className="px-6 py-4 text-left font-medium uppercase tracking-wider text-gray-600">Tests</th>
              <th className="px-6 py-4 text-left font-medium uppercase tracking-wider text-gray-600">
                Registration Date
              </th>
              <th className="px-6 py-4 text-left font-medium uppercase tracking-wider text-gray-600">Status</th>
              <th className="px-6 py-4 text-left font-medium uppercase tracking-wider text-gray-600">Remaining</th>
              <th className="px-6 py-4 text-left font-medium uppercase tracking-wider text-gray-600">Total Amount</th>
              <th className="px-6 py-4 text-left font-medium uppercase tracking-wider text-gray-600">Paid Amount</th>
              <th className="px-6 py-4 text-left font-medium uppercase tracking-wider text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredRegistrations.map((r) => {
              const sampleCollected = !!r.sampleCollectedAt
              const complete = isAllTestsComplete(r)
              const status = !sampleCollected ? "Not Collected" : complete ? "Completed" : "Pending"
              const { testTotal, remaining, totalPaid } = calculateAmounts(r)

              // --- SHOW y/m/d as per day_type ---
              let ageUnit = "y"
              if (r.day_type === "month") ageUnit = "m"
              else if (r.day_type === "day") ageUnit = "d"

              return (
                <React.Fragment key={r.id}>
                  <motion.tr
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.3 }}
                    className={`hover:bg-gray-50 transition-colors duration-150 border-b border-gray-100`}
                  >
                    {showCheckboxes && (
                      <td className="px-4 py-3 relative">
                        <input
                          type="checkbox"
                          checked={selectedRegistrations.includes(r.id)}
                          onChange={() => handleToggleSelect(r.id)}
                          className="h-4 w-4 text-stone-600 border-gray-300 rounded focus:ring-stone-500"
                        />
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <div className="flex items-center space-x-2">
                          <span className="font-semibold text-gray-900 text-base">{r.name}</span>
                          <span
                            className={`inline-block px-2.5 py-0.5 text-xs font-semibold rounded-full
        ${r.visitType === "opd" ? "data-[visit-type=opd]:bg-blue-50 data-[visit-type=opd]:text-blue-700" : "data-[visit-type=ipd]:bg-green-50 data-[visit-type=ipd]:text-green-700"}
      `}
                            data-visit-type={r.visitType}
                          >
                            {r.visitType?.toUpperCase()}
                          </span>
                          {r.hospitalName && (
                            <span className="px-2 py-0.5 text-xs font-medium rounded-md bg-gray-100 text-gray-600 border border-gray-200">
                              {r.hospitalName}
                            </span>
                          )}
                          {r.tpa && (
                            <Badge variant="secondary" className="ml-1 bg-blue-100 text-blue-800 border-blue-200">TPA</Badge>
                          )}
                        </div>
                        <div className="mt-1 text-sm text-gray-600">
                          {r.age}
                          {ageUnit} • {r.gender} • {r.contact?.toString() || "No contact"} • Reg#{r.id}
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      {r.bloodTests?.length ? (
                        <div className="max-h-20 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
                          <ul className="space-y-1">
                            {r.bloodTests.map((t) => {
                              const done = t.testType?.toLowerCase() === "outsource" || isTestFullyEntered(r, t)
                              return (
                                <li key={t.testId} className="flex items-center text-xs">
                                  {done ? (
                                    <CheckCircleIcon className="h-3 w-3 text-green-600 mr-1 flex-shrink-0" />
                                  ) : (
                                    <XCircleIcon className="h-3 w-3 text-red-600 mr-1 flex-shrink-0" />
                                  )}
                                  <span className={done ? "text-green-800" : "text-red-800"}>{t.testName}</span>
                                </li>
                              )
                            })}
                          </ul>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">No tests</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      <div>
                        <span>{new Date(r.createdAt).toLocaleDateString()}</span>
                        <div className="text-xs text-gray-500">
                          {new Date(r.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {status === "Not Collected" && (
                        <span
                          className="px-2.5 py-0.5 text-xs rounded-full data-[status=not-collected]:bg-red-50 data-[status=not-collected]:text-red-700 font-medium"
                          data-status="not-collected"
                        >
                          Not Collected
                        </span>
                      )}
                      {status === "Pending" && (
                        <span
                          className="px-2.5 py-0.5 text-xs rounded-full data-[status=pending]:bg-amber-50 data-[status=pending]:text-amber-700 font-medium"
                          data-status="pending"
                        >
                          Pending
                        </span>
                      )}
                      {status === "Completed" && (
                        <span
                          className="px-2.5 py-0.5 text-xs rounded-full data-[status=completed]:bg-green-50 data-[status=completed]:text-green-700 font-medium"
                          data-status="completed"
                        >
                          Completed
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {remaining > 0 ? (
                        <span className="text-base font-semibold text-red-700">{formatCurrency(remaining)}</span>
                      ) : (
                        <span className="text-base font-medium text-gray-500">₹0.00</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-base font-semibold text-gray-800">{formatCurrency(testTotal)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-base font-semibold text-green-700">{formatCurrency(totalPaid)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setExpandedRegistrationId(expandedRegistrationId === r.id ? null : r.id)}
                        className="px-4 py-2 bg-stone-700 text-white rounded-md text-sm font-medium hover:bg-stone-800 shadow-sm"
                      >
                        {expandedRegistrationId === r.id ? "Hide" : "Actions"}
                      </button>
                    </td>
                  </motion.tr>

                  <AnimatePresence>
                    {expandedRegistrationId === r.id && (
                      <motion.tr
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.3 }}
                      >
                        <td colSpan={showCheckboxes ? 9 : 8} className="bg-gray-100 p-4">
                          <div className="flex flex-wrap gap-2">
                            {role === "phlebo" ? (
                              sampleCollected ? (
                                <Link
                                  href={`/download-report?id=${r.id}`}
                                  className="inline-flex items-center px-3.5 py-2 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700 shadow-sm"
                                >
                                  <ArrowDownTrayIcon className="h-4 w-4 mr-2" />
                                  Download Report
                                </Link>
                              ) : null
                            ) : (
                              <>
                                <button
                                  onClick={() => {
                                    setSampleModalRegistration(r)
                                    setSampleDateTime(r.sampleCollectedAt ? new Date(r.sampleCollectedAt).toISOString().slice(0, 16) : formatLocalDateTime())
                                  }}
                                  className={`inline-flex items-center px-3.5 py-2 ${sampleCollected ? 'bg-blue-600 hover:bg-blue-700' : 'bg-orange-600 hover:bg-orange-700'} text-white rounded-md text-sm font-medium shadow-sm`}
                                >
                                  <DocumentTextIcon className="h-4 w-4 mr-2" />
                                  {sampleCollected ? 'Sample Collected On' : 'Collect Sample'}
                                </button>
                                {sampleCollected && (
                                  <Link
                                    href={`/download-report?id=${r.id}`}
                                    className="inline-flex items-center px-3.5 py-2 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700 shadow-sm"
                                  >
                                    <ArrowDownTrayIcon className="h-4 w-4 mr-2" />
                                    Download Report
                                  </Link>
                                )}

                                <Link
                                  href={`/blood-values?id=${r.id}`}
                                  className="inline-flex items-center px-3.5 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 shadow-sm"
                                >
                                  <DocumentPlusIcon className="h-4 w-4 mr-2" />
                                  Add/Edit Values
                                </Link>

                                <button
                                  onClick={() => {
                                    setSelectedRegistration(r)
                                    setNewAmountPaid("")
                                    if (
                                      r.paymentHistory &&
                                      typeof r.paymentHistory === "object" &&
                                      "discount" in r.paymentHistory
                                    ) {
                                      setTempDiscount((r.paymentHistory as PaymentHistory).discount.toString())
                                    } else {
                                      setTempDiscount(r.discountAmount.toString())
                                    }
                                  }}
                                  className="inline-flex items-center px-3.5 py-2 bg-purple-600 text-white rounded-md text-sm font-medium hover:bg-purple-700 shadow-sm"
                                >
                                  <BanknotesIcon className="h-4 w-4 mr-2" />
                                  Update Payment
                                </button>

                                {selectedRegistrations.includes(r.id) && (
                                  <button
                                    onClick={handleDownloadBill}
                                    className="inline-flex items-center px-3.5 py-2 bg-teal-600 text-white rounded-md text-sm font-medium hover:bg-teal-700 shadow-sm"
                                  >
                                    <ArrowDownTrayIcon className="h-4 w-4 mr-2" />
                                    Download Bill
                                  </button>
                                )}

                                <button
                                  onClick={() => {
                                    const tpa = r.tpa === true;
                                    setFakeBillRegistration({
                                      ...r,
                                      bloodTests: (r.bloodTests || []).map((t: any) => ({
                                        ...t,
                                        price: tpa && typeof t.tpa_price === 'number' ? t.tpa_price : t.price,
                                      })),
                                      tpa,
                                    });
                                  }}
                                  className="inline-flex items-center px-3.5 py-2 bg-pink-600 text-white rounded-md text-sm font-medium hover:bg-pink-700 shadow-sm"
                                >
                                  <DocumentTextIcon className="h-4 w-4 mr-2" />
                                  Generate Bill
                                </button>

                                <Link
                                  href={`/edit-patient/${r.id}`}
                                  className="inline-flex items-center px-3.5 py-2 bg-amber-600 text-white rounded-md text-sm font-medium hover:bg-amber-700 shadow-sm"
                                >
                                  <PencilIcon className="h-4 w-4 mr-2" />
                                  Edit Details
                                </Link>

                                {role === "admin" && (
                                  <button
                                    onClick={() => handleDeleteRegistration(r)}
                                    className="inline-flex items-center px-3.5 py-2 bg-red-600 text-white rounded-md text-sm font-medium hover:bg-red-700 shadow-sm"
                                  >
                                    <TrashIcon className="h-4 w-4 mr-2" />
                                    Delete Registration
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </motion.tr>
                    )}
                  </AnimatePresence>
                </React.Fragment>
              )
            })}
          </tbody>
        </table>

        {filteredRegistrations.length === 0 && !isLoading && (
          <div className="p-8 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 mb-4">
              <UserIcon className="h-8 w-8 text-gray-500" />
            </div>
            <p className="text-gray-600 font-semibold">No registrations found</p>
            <p className="text-gray-500 text-sm mt-1">Try adjusting your search or filters</p>
          </div>
        )}
      </div>
    </motion.div>
  )
}