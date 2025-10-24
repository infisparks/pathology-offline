'use client'

import { useEffect, useState } from 'react'
import { onAuthStateChange, type AuthUser } from '@/lib/auth' // Use the local auth lib

export function useUserRole() {
  const [role, setRole] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    // onAuthStateChange is already adapted to use the local state
    const { subscription } = onAuthStateChange((user) => {
      if (!cancelled) {
        if (user) {
          // The local AuthUser (derived from UserRow) *already* contains the role
          setRole(user.role || null)
          setError(null)
        } else {
          setRole(null)
          setError('No authenticated user')
        }
        setLoading(false)
      }
    })

    // Cleanup function
    return () => {
      cancelled = true
      subscription?.unsubscribe()
    }
  }, [])

  return { role, loading, error }
}