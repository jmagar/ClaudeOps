import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'ClaudeOps',
  description: 'AI-powered homelab automation with Claude agent execution monitoring',
  keywords: ['claude', 'ai', 'homelab', 'automation', 'monitoring'],
  authors: [{ name: 'ClaudeOps Team' }],
  creator: 'ClaudeOps',
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'),
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body className="min-h-screen bg-background font-sans antialiased">
        <div id="root">{children}</div>
      </body>
    </html>
  )
}