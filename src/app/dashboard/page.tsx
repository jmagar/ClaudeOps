import { Metadata } from 'next'
import { DashboardOverview } from '@/components/dashboard/DashboardOverview'
import { ExecutionStats } from '@/components/dashboard/ExecutionStats'
import { ActivityFeed } from '@/components/dashboard/ActivityFeed'
import { QuickActions } from '@/components/dashboard/QuickActions'
import { SystemHealth } from '@/components/dashboard/SystemHealth'
import { SystemStatusIndicator } from '@/components/dashboard/SystemStatusIndicator'

export const metadata: Metadata = {
  title: 'Execution Dashboard - ClaudeOps',
  description: 'Real-time agent execution monitoring and management dashboard',
}

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">ClaudeOps Dashboard</h1>
              <p className="text-sm text-muted-foreground">
                AI-powered homelab automation and monitoring
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <div className="hidden sm:flex items-center space-x-2 text-sm">
                <SystemStatusIndicator />
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8">
        <div className="space-y-8">
          {/* Overview Section */}
          <section>
            <h2 className="text-lg font-semibold mb-4">Overview</h2>
            <DashboardOverview />
          </section>

          {/* Stats and Actions Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Quick Actions */}
            <section>
              <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
              <QuickActions />
            </section>

            {/* System Health */}
            <section>
              <h2 className="text-lg font-semibold mb-4">System Health</h2>
              <SystemHealth />
            </section>

            {/* Execution Statistics */}
            <section>
              <h2 className="text-lg font-semibold mb-4">Statistics</h2>
              <ExecutionStats />
            </section>
          </div>

          {/* Activity Feed */}
          <section>
            <h2 className="text-lg font-semibold mb-4">Recent Activity</h2>
            <ActivityFeed />
          </section>
        </div>
      </main>
    </div>
  )
}