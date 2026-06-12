import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: "Liar's Bar",
  description: 'A multiplayer bluffing card game with Russian Roulette stakes',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white">
        {children}
      </body>
    </html>
  )
}