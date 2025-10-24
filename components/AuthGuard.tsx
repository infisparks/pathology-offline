// @/components/AuthGuard.tsx
'use client'

import React, { useEffect, useState } from 'react'

// NOTE: Since we are removing the login/role system,
//       we no longer need to import the following:
// import { useRouter, usePathname } from 'next/navigation'
// import { getCurrentUser, onAuthStateChange, type AuthUser } from '@/lib/auth'
// import { useUserRole } from '@/hooks/useUserRole'
// import { roleAccessMap } from './AuthGuard' // Role map is removed

interface AuthGuardProps {
  children: React.ReactNode
}

/**
 * AuthGuard - Simplified for offline desktop application.
 *
 * This component no longer enforces authentication or role-based access control.
 * It serves primarily as a wrapper for the application layout.
 */
export default function AuthGuard({ children }: AuthGuardProps) {
  // In an offline, no-login app, we assume the "authentication" is complete instantly.
  // We can keep a simple state to simulate loading the main component, if needed,
  // but for a clean desktop experience, we can remove the complex loading/redirect logic.

  // If you need a splash screen, you can use a state here:
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Simulate a very fast initialization process
    const timer = setTimeout(() => {
      setLoading(false)
    }, 100) // Small delay to prevent flash, or 0 for instant load

    return () => clearTimeout(timer)
  }, [])

  // --- Loading State Display ---
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        {/* You can replace this with your app's main loading screen */}
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // If no login is required, the app is always "authenticated" and fully rendered.
  return <>{children}</>;
}