'use client'

import './globals.css'
// Removed unused Metadata import
import { Inter } from 'next/font/google'
import AuthGuard from '@/components/AuthGuard'
import Sidebar from '@/components/Sidebar'

const inter = Inter({ subsets: ['latin'] })

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      {/* Added <head> section for PWA tags */}
      <head>
        <title>Pathology App</title> {/* Customize your title */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#000000" /> {/* Match theme_color in manifest */}
        {/* Recommended PWA meta tags for iOS */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Pathology" /> {/* Match short_name */}
        {/* Consider adding apple-touch-icon links here */}
        {/* <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png"> */}
      </head>
      <body className={inter.className}>
        <AuthGuard>
          <div className="flex h-screen">
            <Sidebar />

            {/* main content area */}
            <main className="flex-1 overflow-auto bg-gray-50 p-4">
              {children}
            </main>
          </div>
        </AuthGuard>
      </body>
    </html>
  )
}
