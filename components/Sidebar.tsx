'use client'

import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { 
  Home, UserPlus, Users, FlaskConical, Package, Settings, Stethoscope, ChevronLeft, ChevronRight, Clock, MoreVertical, X,
  // NOTE: LogOut is no longer needed
} from 'lucide-react'
import { Button } from '@/components/ui/button'
// NOTE: signOut is no longer needed
import { cn } from '@/lib/utils'
// NOTE: useUserRole is no longer needed
// NOTE: supabase import is no longer needed

import Link from 'next/link'

// Roles are removed, so every item is accessible.
// We remove the 'roles' property as it is now irrelevant.
const sidebarItems = [
  { icon: Home, label: 'Dashboard', href: '/dashboard' },
  { icon: UserPlus, label: 'Patient Entry', href: '/patient-entry' },

]

export default function Sidebar() {
  // NOTE: role, loading, and error states from useUserRole are removed
  const pathname = usePathname()
  // NOTE: useRouter is only needed for sign-out, which is removed, but we keep the import if needed later
  // const router = useRouter()
  const [isCollapsed, setIsCollapsed] = useState(true)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  // NOTE: email state is removed
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkScreenSize = () => {
      setIsMobile(window.innerWidth < 768)
      if (window.innerWidth >= 768) {
        setIsMobileMenuOpen(false)
      }
    }

    checkScreenSize()
    window.addEventListener('resize', checkScreenSize)
    
    return () => window.removeEventListener('resize', checkScreenSize)
  }, [])

  // NOTE: Supabase auth check is removed

  // NOTE: handleSignOut is removed

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen)
  }

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false)
  }

  // In an offline app, we assume the menu is ready instantly.
  // We can remove the loading and error states entirely.
  // The 'return null' condition for when role is not found is also removed.


  return (
    <>
      {/* Mobile Floating Menu Button */}
      <div className="md:hidden fixed top-4 left-4 z-50">
        <Button
          onClick={toggleMobileMenu}
          className="w-12 h-12 bg-blue-600 hover:bg-blue-700 rounded-full shadow-lg p-0"
        >
          <MoreVertical className="w-6 h-6 text-white" />
        </Button>
      </div>

      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-0 bg-black bg-opacity-50 z-40" onClick={closeMobileMenu} />
      )}

      {/* Mobile Sidebar */}
      <div className={cn(
        "md:hidden fixed left-0 top-0 h-full bg-white shadow-xl z-50 transform transition-transform duration-300 ease-in-out w-80",
        isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        {/* Mobile Header */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                <Stethoscope className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <h1 className="font-bold text-lg text-gray-900">INFICARE</h1>
                <p className="text-xs text-gray-500">Pathology System</p>
                {/* Email line removed */}
                <p className="mt-1 text-xs text-gray-600 truncate">Offline Mode</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 hover:bg-gray-100"
              onClick={closeMobileMenu}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Mobile Navigation */}
        <nav className="flex-1 p-4 overflow-y-auto">
          <ul className="space-y-2">
            {sidebarItems
              // Role filtering removed
              .map((item) => {
                const Icon = item.icon
                const isActive = pathname === item.href
                
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={closeMobileMenu}
                      className={cn(
                        "flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors",
                        isActive
                          ? "bg-blue-50 text-blue-700 border-r-2 border-blue-700"
                          : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                      )}
                    >
                      <Icon className="w-5 h-5 flex-shrink-0" />
                      <span>{item.label}</span>
                    </Link>
                  </li>
                )
              })}
          </ul>
        </nav>

        {/* Mobile Footer - Sign Out button removed */}
      </div>

      {/* Desktop Sidebar */}
      <div className={cn(
        "hidden md:flex h-screen bg-white shadow-lg flex-col transition-all duration-300",
        isCollapsed ? "w-16" : "w-64"
      )}>
        {/* Desktop Header */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            {!isCollapsed && (
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                  <Stethoscope className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <h1 className="font-bold text-lg text-gray-900">INFIPLUS</h1>
                  <p className="text-xs text-gray-500">Pathology System</p>
                  {/* Email line removed */}
                  <p className="mt-1 text-xs text-gray-600 truncate">Offline Mode</p>
                </div>
              </div>
            )}
            {isCollapsed && (
              <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center mx-auto">
                <Stethoscope className="w-6 h-6 text-white" />
              </div>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 hover:bg-gray-100"
              onClick={() => setIsCollapsed(!isCollapsed)}
            >
              {isCollapsed ? (
                <ChevronRight className="w-4 h-4" />
              ) : (
                <ChevronLeft className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Desktop Navigation */}
        <nav className="flex-1 p-4 overflow-y-auto">
          <ul className="space-y-2">
            {sidebarItems
              // Role filtering removed
              .map((item) => {
                const Icon = item.icon
                const isActive = pathname === item.href
                
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors",
                        isActive
                          ? "bg-blue-50 text-blue-700 border-r-2 border-blue-700"
                          : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                      )}
                      title={isCollapsed ? item.label : undefined}
                    >
                      <Icon className="w-5 h-5 flex-shrink-0" />
                      {!isCollapsed && <span>{item.label}</span>}
                    </Link>
                  </li>
                )
              })}
          </ul>
        </nav>

        {/* Desktop Footer - Sign Out button removed */}
      </div>
    </>
  )
}