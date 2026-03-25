import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'ClassBase — Learning Management System',
  description: 'A modern LMS for teachers and students.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
