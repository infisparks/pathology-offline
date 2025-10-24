'use client'
import Link from 'next/link';
import { Button } from '@/components/ui/button'; // Assuming you use shadcn/ui

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center space-y-4">
      <h1 className="text-2xl font-bold">Welcome to Pathology App</h1>
      {/* Add your logo here if you want */}
      <Link href="/patient-entry" passHref>
        <Button size="lg">Go to Patient Entry</Button>
      </Link>
    </div>
  );
}