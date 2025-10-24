"use client"

import React, { useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  BarChartIcon as ChartBarIcon,
  ArrowDownIcon as ArrowDownTrayIcon,
  MicroscopeIcon as MagnifyingGlassIcon,
  CalendarIcon,
  MoveHorizontalIcon as AdjustmentsHorizontalIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  BeakerIcon,
  SearchIcon,
  XIcon,
} from "lucide-react"
import { formatCurrency, calculateTotalsForSelected } from "../lib/dashboard-utils"
import type { DashboardMetrics, Registration } from "../types/dashboard"

interface DashboardHeaderProps {
  metrics: DashboardMetrics
  showCheckboxes: boolean
  setShowCheckboxes: (show: boolean) => void
  selectedRegistrations: number[]
  registrations: Registration[]
  handleDownloadMultipleBills: () => void
  searchTerm: string
  setSearchTerm: (term: string) => void
  globalSearchTerm: string
  setGlobalSearchTerm: (term: string) => void
  handleGlobalSearch: () => void
  clearGlobalSearch: () => void
  isGlobalSearchActive: boolean
  startDate: string
  setStartDate: (date: string) => void
  endDate: string
  setEndDate: (date: string) => void
  statusFilter: string
  setStatusFilter: (status: string) => void
  isFiltersExpanded: boolean
  handleToggleFilters: () => void
  isFilterContentMounted: boolean
  hospitalFilterTerm: string
  setHospitalFilterTerm: (term: string) => void
  loadedDataStartDate?: string
  loadedDataEndDate?: string
}

export function DashboardHeader({
  metrics,
  showCheckboxes,
  setShowCheckboxes,
  selectedRegistrations,
  registrations,
  handleDownloadMultipleBills,
  searchTerm,
  setSearchTerm,
  globalSearchTerm,
  setGlobalSearchTerm,
  handleGlobalSearch,
  clearGlobalSearch,
  isGlobalSearchActive,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  statusFilter,
  setStatusFilter,
  isFiltersExpanded,
  handleToggleFilters,
  isFilterContentMounted,
  hospitalFilterTerm,
  setHospitalFilterTerm,
  loadedDataStartDate,
  loadedDataEndDate,
}: DashboardHeaderProps) {
  const filterContentRef = useRef<HTMLDivElement>(null)

  return (
    <>
      <img
        src="/INFICARE.png"
        alt="Company Banner"
        width={2000}
        height={200}
        className="w-full h-auto max-h-[400px] object-cover rounded-xl mb-8"
      />

      <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold text-gray-800">Registration Dashboard</h1>
        <button
          onClick={() => setShowCheckboxes(!showCheckboxes)}
          className="px-4 py-2 bg-stone-700 text-white rounded-md text-sm font-medium hover:bg-stone-800 shadow-sm flex items-center"
        >
          <ArrowDownTrayIcon className="h-4 w-4 mr-2" />
          {showCheckboxes ? "Cancel Selection" : "Download Bills"}
        </button>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {[
          {
            icon: ChartBarIcon,
            label: "Total Registrations",
            val: metrics.totalRegistrations,
            color: "from-blue-500 to-blue-600",
            textColor: "text-blue-600",
          },
          {
            icon: BeakerIcon,
            label: "Completed Tests",
            val: metrics.completedTests,
            color: "from-green-500 to-green-600",
            textColor: "text-green-600",
          },
          {
            icon: BeakerIcon,
            label: "Pending Reports",
            val: metrics.pendingReports,
            color: "from-red-500 to-red-600",
            textColor: "text-red-600",
          },
        ].map((m, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: i * 0.1 }}
            className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden"
          >
            <div className="flex items-center p-4">
              <div className={`p-3 rounded-lg bg-gradient-to-br ${m.color} mr-4`}>
                {React.createElement(m.icon, { className: "h-5 w-5 text-white" })}
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">{m.label}</p>
                <p className={`text-2xl font-bold ${m.textColor}`}>
                  {m.val}
                </p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="mb-6"
      >
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div
            className="p-4 border-b border-gray-100 flex justify-between items-center cursor-pointer"
            onClick={handleToggleFilters}
          >
            <h2 className="text-base font-semibold flex items-center text-gray-800">
              <AdjustmentsHorizontalIcon className="h-4 w-4 mr-2 text-teal-600" />
              Filters & Search
            </h2>
            {isGlobalSearchActive ? (
              <p className="text-sm text-red-600 font-semibold ml-auto mr-4">
                Displaying Global Search Results
              </p>
            ) : (
              (startDate || endDate) && (
                <p className="text-sm text-gray-500 ml-auto mr-4">
                  Displaying data from: {startDate} to {endDate}
                </p>
              )
            )}
            {isFiltersExpanded ? (
              <ChevronUpIcon className="h-4 w-4 text-gray-500" />
            ) : (
              <ChevronDownIcon className="h-4 w-4 text-gray-500" />
            )}
          </div>

          <div
            ref={filterContentRef}
            className={`${isFiltersExpanded ? "block" : "hidden"} transition-all duration-300`}
          >
            {isFilterContentMounted && (
              <div className="p-4">
                {/* -- Global Search -- */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-b border-gray-200 pb-4 mb-4">
                  <div className="relative md:col-span-2">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <SearchIcon className="h-4 w-4 text-gray-400" />
                    </div>
                    <input
                      type="text"
                      placeholder="Globally search all records by name or phone..."
                      value={globalSearchTerm}
                      onChange={(e) => setGlobalSearchTerm(e.target.value)}
                      className="pl-10 w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-stone-500 focus:border-transparent text-sm"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleGlobalSearch}
                      className="w-full inline-flex justify-center items-center px-4 py-2 bg-stone-700 text-white rounded-md text-sm font-medium hover:bg-stone-800 shadow-sm"
                    >
                      <SearchIcon className="h-4 w-4 mr-2" />
                      Search
                    </button>
                    {isGlobalSearchActive && (
                       <button
                         onClick={clearGlobalSearch}
                         className="inline-flex justify-center items-center p-2 bg-red-600 text-white rounded-md text-sm font-medium hover:bg-red-700 shadow-sm"
                         title="Clear Global Search"
                       >
                         <XIcon className="h-4 w-4" />
                       </button>
                    )}
                  </div>
                </div>

                {/* -- Local Filters -- */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <MagnifyingGlassIcon className="h-4 w-4 text-gray-400" />
                    </div>
                    <input
                      type="text"
                      placeholder="Filter current list..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-stone-500 focus:border-transparent text-sm"
                    />
                  </div>

                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <CalendarIcon className="h-4 w-4 text-gray-400" />
                    </div>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="pl-10 w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-stone-500 focus:border-transparent text-sm"
                      disabled={isGlobalSearchActive}
                    />
                  </div>

                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <CalendarIcon className="h-4 w-4 text-gray-400" />
                    </div>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="pl-10 w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-stone-500 focus:border-transparent text-sm"
                      disabled={isGlobalSearchActive}
                    />
                  </div>

                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-stone-500 focus:border-transparent text-sm"
                  >
                    <option value="all">All Statuses</option>
                    <option value="notCollected">Not Collected</option>
                    <option value="sampleCollected">Pending</option>
                    <option value="completed">Completed</option>
                  </select>
                  <select
                    value={hospitalFilterTerm}
                    onChange={(e) => setHospitalFilterTerm(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-stone-500 focus:border-transparent text-sm"
                  >
                    <option value="all">All Hospitals</option>
                    <option value="MEDFORD HOSPITAL">MEDFORD HOSPITAL</option>
                    <option value="Gautami Medford NX Hospital">Gautami Medford NX Hospital</option>
                    <option value="Apex Clinic">Apex Clinic</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* Selected Registrations Summary */}
      <AnimatePresence>
        {selectedRegistrations.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="mb-6"
          >
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden p-4">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <h3 className="font-medium text-gray-800">Selected: {selectedRegistrations.length} registrations</h3>
                  {(() => {
                    const { totalAmount, totalPaid, totalDiscount, remaining } = calculateTotalsForSelected(
                      selectedRegistrations,
                      registrations,
                    )
                    return (
                      <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-6">
                        <div>
                          <p className="text-xs font-medium text-gray-500 mb-1">Total Amount</p>
                          <p className="text-lg font-bold text-gray-800">{formatCurrency(totalAmount)}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-gray-500 mb-1">Total Paid</p>
                          <p className="text-lg font-bold text-teal-600">{formatCurrency(totalPaid)}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-gray-500 mb-1">Total Discount</p>
                          <p className="text-lg font-bold text-amber-600">{formatCurrency(totalDiscount)}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-gray-500 mb-1">Remaining</p>
                          <p className="text-lg font-bold text-red-600">{formatCurrency(remaining)}</p>
                        </div>
                      </div>
                    )
                  })()}
                </div>
                <button
                  onClick={handleDownloadMultipleBills}
                  className="inline-flex items-center px-4 py-2 bg-stone-700 text-white rounded-md text-sm font-medium hover:bg-stone-800 shadow-sm"
                >
                  <ArrowDownTrayIcon className="h-4 w-4 mr-2" />
                  Download Selected Bills
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}