"use client"

import { lazy, Suspense, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  XCircleIcon,
  BanknoteIcon as BanknotesIcon,
  CreditCardIcon,
  ArrowDownIcon as ArrowDownTrayIcon,
} from "lucide-react"
import { calculateAmounts, formatCurrency, format12Hour, generateBillBlob, downloadBill } from "../lib/dashboard-utils"
import type { Registration } from "../types/dashboard"
// ❌ REMOVED: import { supabase } from "@/lib/supabase"
// ❌ REMOVED: import { downloadBill } from "../lib/dashboard-utils" // Moved import up

// Lazy load the FakeBill component
const FakeBill = lazy(() => import("../FakeBill")) // Adjust path if needed

interface DashboardModalsProps {
  selectedRegistration: Registration | null
  setSelectedRegistration: (reg: Registration | null) => void
  newAmountPaid: string
  setNewAmountPaid: (amount: string) => void
  paymentMode: string
  setPaymentMode: (mode: string) => void
  tempDiscount: string
  setTempDiscount: (discount: string) => void
  handleUpdateAmountAndDiscount: () => void
  handleDownloadBill: () => void
  sampleModalRegistration: Registration | null
  setSampleModalRegistration: (reg: Registration | null) => void
  sampleDateTime: string
  setSampleDateTime: (time: string) => void
  handleSaveSampleDate: () => void
  deleteRequestModalRegistration: Registration | null
  setDeleteRequestModalRegistration: (reg: Registration | null) => void
  deleteReason: string
  setDeleteReason: (reason: string) => void
  submitDeleteRequest: () => void
  fakeBillRegistration: Registration | null
  setFakeBillRegistration: (reg: Registration | null) => void
  formatLocalDateTime: () => string
  amountId: string
  setAmountId: (id: string) => void
  billNo: string
  setBillNo: (billNo: string) => void
}

export function DashboardModals({
  selectedRegistration,
  setSelectedRegistration,
  newAmountPaid,
  setNewAmountPaid,
  paymentMode,
  setPaymentMode,
  tempDiscount,
  setTempDiscount,
  handleUpdateAmountAndDiscount,
  handleDownloadBill,
  sampleModalRegistration,
  setSampleModalRegistration,
  sampleDateTime,
  setSampleDateTime,
  handleSaveSampleDate,
  deleteRequestModalRegistration,
  setDeleteRequestModalRegistration,
  deleteReason,
  setDeleteReason,
  submitDeleteRequest,
  fakeBillRegistration,
  setFakeBillRegistration,
  formatLocalDateTime,
  amountId,
  setAmountId,
  billNo,
  setBillNo,
}: DashboardModalsProps) {
  // ❌ REMOVED: WhatsApp API logic. This is an external server dependency.
  const [isSendingBill, setIsSendingBill] = useState(false)
  
  const handleSendBillWhatsApp = async () => {
    alert("WhatsApp bill sending is disabled in offline mode. Please use 'Download Bill' to share manually.")
  }

  return (
    <>
      {/* Payment modal */}
      <AnimatePresence>
        {selectedRegistration && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 overflow-y-auto"
          >
            <div className="min-h-screen px-4 py-6 flex items-center justify-center">
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto relative"
              >
                <div className="sticky top-0 bg-white rounded-t-2xl border-b border-gray-100 p-6 pb-4">
                  <button
                    onClick={() => setSelectedRegistration(null)}
                    className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <XCircleIcon className="h-6 w-6" />
                  </button>
                  <div>
                    <h3 className="text-xl font-bold text-gray-800 mb-1">Update Payment & Discount (Local)</h3>
                    <p className="text-gray-500 text-sm">
                      {selectedRegistration.name} - Reg#{selectedRegistration.id}
                    </p>
                  </div>
                </div>

                <div className="p-6 pt-2">
                  {(() => {
                    const testTotal = selectedRegistration.bloodTests?.reduce((s, t) => s + t.price, 0) || 0
                    const { totalPaid: currentPaid, discount: currentDiscount } = calculateAmounts(selectedRegistration)
                    const additionalPayment = Number(newAmountPaid) || 0
                    const discountAmount = Number(tempDiscount) || 0
                    const remaining = testTotal - discountAmount - currentPaid - additionalPayment

                    return (
                      <>
                        <div className="mb-6 bg-gray-50 rounded-xl p-4 space-y-3">
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-600">Test Total:</span>
                            <span className="font-medium">{formatCurrency(testTotal)}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-600">Current Discount:</span>
                            <span className="font-medium text-amber-600">{formatCurrency(discountAmount)}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-600">Current Paid:</span>
                            <span className="font-medium text-teal-600">{formatCurrency(currentPaid)}</span>
                          </div>
                          {additionalPayment > 0 && (
                            <div className="flex justify-between items-center">
                              <span className="text-sm text-gray-600">Additional Payment:</span>
                              <span className="font-medium text-blue-600">{formatCurrency(additionalPayment)}</span>
                            </div>
                          )}
                          <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                            <span className="text-sm font-medium text-gray-800">Remaining:</span>
                            <span
                              className={`font-bold ${remaining > 0 ? "text-red-600" : remaining < 0 ? "text-green-600" : "text-gray-600"}`}
                            >
                              {formatCurrency(remaining)}
                            </span>
                          </div>
                        </div>

                        <div className="mb-6">
                          <button
                            onClick={handleDownloadBill}
                            className="w-full bg-teal-600 text-white py-3 rounded-xl font-medium hover:bg-teal-700 transition-colors duration-200 shadow-sm flex items-center justify-center"
                          >
                            <ArrowDownTrayIcon className="h-4 w-4 mr-2" />
                            Download Bill
                          </button>
                        </div>

                        <form
                          onSubmit={(e) => {
                            e.preventDefault()
                            handleUpdateAmountAndDiscount()
                          }}
                          className="space-y-4"
                        >
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Discount Amount (₹)</label>
                            <div className="relative">
                              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <BanknotesIcon className="h-4 w-4 text-gray-400" />
                              </div>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={tempDiscount}
                                onChange={(e) => setTempDiscount(e.target.value)}
                                className="pl-10 w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                                placeholder="Enter discount amount"
                              />
                            </div>
                          </div>

                          <div className="flex gap-2">
                            <div className="flex-1">
                              <label className="block text-sm font-medium text-gray-700 mb-1">Additional Payment (₹)</label>
                              <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                  <BanknotesIcon className="h-4 w-4 text-gray-400" />
                                </div>
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={newAmountPaid}
                                  onChange={(e) => setNewAmountPaid(e.target.value)}
                                  className="pl-10 w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                                  placeholder="Enter additional payment"
                                />
                              </div>
                            </div>
                            <div className="flex-1">
                              <label className="block text-sm font-medium text-gray-700 mb-1">Amount ID (optional)</label>
                              <input
                                type="text"
                                value={amountId}
                                onChange={(e) => setAmountId(e.target.value)}
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                placeholder="Enter amount ID"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Bill No (optional)</label>
                            <input
                              type="text"
                              value={billNo}
                              onChange={(e) => setBillNo(e.target.value)}
                              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              placeholder="Enter Bill No"
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Payment Mode</label>
                            <div className="relative">
                              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <CreditCardIcon className="h-4 w-4 text-gray-400" />
                              </div>
                              <select
                                value={paymentMode}
                                onChange={(e) => setPaymentMode(e.target.value)}
                                className="pl-10 w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                              >
                                <option value="cash">Cash</option>
                                <option value="online">Online</option>
                              </select>
                            </div>
                          </div>

                          <button
                            type="submit"
                            className="w-full bg-violet-600 text-white py-3 rounded-xl font-medium hover:bg-violet-700 transition-colors duration-200 shadow-sm flex items-center justify-center"
                          >
                            <BanknotesIcon className="h-4 w-4 mr-2" />
                            Update Payment & Discount
                          </button>
                        </form>
                        <div className="mb-6">
                          <button
                            onClick={handleSendBillWhatsApp}
                            className="w-full bg-green-600 text-white py-3 rounded-xl font-medium hover:bg-green-700 transition-colors duration-200 shadow-sm flex items-center justify-center disabled:opacity-60"
                            disabled={isSendingBill}
                          >
                            <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M16.72 11.06a6 6 0 10-2.28 2.28l2.54.73a1 1 0 001.26-1.26l-.73-2.54z"></path></svg>
                            {isSendingBill ? "Sending…" : "Send Bill on WhatsApp (Disabled)"}
                          </button>
                        </div>
                      </>
                    )
                  })()}
                </div>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sample Collection Modal */}
      <AnimatePresence>
        {sampleModalRegistration && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 overflow-y-auto"
          >
            <div className="min-h-screen px-4 py-6 flex items-center justify-center">
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto relative"
              >
                <div className="sticky top-0 bg-white rounded-t-2xl border-b border-gray-100 p-6 pb-4">
                  <button
                    onClick={() => setSampleModalRegistration(null)}
                    className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <XCircleIcon className="h-6 w-6" />
                  </button>
                  <div>
                    <h3 className="text-xl font-bold text-gray-800 mb-1">Set Sample Collection Time (Local)</h3>
                    <p className="text-gray-500 text-sm">
                      {sampleModalRegistration.name} - Reg#{sampleModalRegistration.id}
                    </p>
                  </div>
                </div>

                <div className="p-6 pt-2">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Date & Time</label>
                      <input
                        type="datetime-local"
                        value={sampleDateTime}
                        onChange={(e) => setSampleDateTime(e.target.value)}
                        max={formatLocalDateTime()}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                      />
                    </div>
                    <p className="text-sm text-gray-600">Selected: {format12Hour(sampleDateTime)}</p>

                    <div className="flex justify-end space-x-3 pt-4">
                      <button
                        onClick={() => setSampleModalRegistration(null)}
                        className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors duration-200 text-gray-800 font-medium"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveSampleDate}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors duration-200 font-medium"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Request Modal */}
      <AnimatePresence>
        {deleteRequestModalRegistration && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 overflow-y-auto"
          >
            <div className="min-h-screen px-4 py-6 flex items-center justify-center">
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto relative"
              >
                <div className="sticky top-0 bg-white rounded-t-2xl border-b border-gray-100 p-6 pb-4">
                  <button
                    onClick={() => setDeleteRequestModalRegistration(null)}
                    className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <XCircleIcon className="h-6 w-6" />
                  </button>
                  <div>
                    <h3 className="text-xl font-bold text-gray-800 mb-1">Deletion is Permanent (Local)</h3>
                    <p className="text-gray-500 text-sm">
                      {deleteRequestModalRegistration.name} - Reg#{deleteRequestModalRegistration.id}
                    </p>
                  </div>
                </div>

                <div className="p-6 pt-2">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Reason for Deletion (Required)
                      </label>
                      <textarea
                        value={deleteReason}
                        onChange={(e) => setDeleteReason(e.target.value)}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                        rows={4}
                        placeholder="Please provide a detailed reason for this deletion"
                        required
                      />
                    </div>

                    <div className="flex justify-end space-x-3 pt-4">
                      <button
                        onClick={() => setDeleteRequestModalRegistration(null)}
                        className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors duration-200 text-gray-800 font-medium"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={submitDeleteRequest}
                        disabled={!deleteReason.trim()}
                        className={`px-4 py-2 rounded-lg text-white font-medium ${
                          deleteReason.trim()
                            ? "bg-red-600 hover:bg-red-700 transition-colors duration-200"
                            : "bg-red-300 cursor-not-allowed"
                        }`}
                      >
                        Confirm Delete
                      </button>
                    </div>
                    <p className="text-xs text-red-500 pt-2">Note: This action permanently removes the record from your local database.</p>
                  </div>
                </div>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Fake Bill modal - Lazy loaded */}
      {fakeBillRegistration && (
        <Suspense
          fallback={
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
              <div className="bg-white p-8 rounded-lg shadow-lg">
                <p className="text-gray-700">Loading bill generator...</p>
              </div>
            </div>
          }
        >
          <FakeBill patient={fakeBillRegistration as any} onClose={() => setFakeBillRegistration(null)} />
        </Suspense>
      )}
    </>
  )
}
