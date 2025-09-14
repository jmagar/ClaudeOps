import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Dashboard - ClaudeOps',
  description: 'Real-time agent execution monitoring dashboard',
}

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="z-10 max-w-5xl w-full items-center justify-between font-mono text-sm lg:flex">
        <div className="fixed bottom-0 left-0 flex h-48 w-full items-end justify-center bg-gradient-to-t from-white via-white dark:from-black dark:via-black lg:static lg:h-auto lg:w-auto lg:bg-none">
          <div className="pointer-events-none flex place-items-center gap-2 p-8 lg:pointer-events-auto lg:p-0">
            <h1 className="text-2xl font-bold">ClaudeOps</h1>
          </div>
        </div>
      </div>

      <div className="relative flex place-items-center before:absolute before:h-[300px] before:w-[480px] before:-translate-x-1/2 before:rounded-full before:bg-gradient-radial before:from-white before:to-transparent before:blur-2xl before:content-[''] after:absolute after:-z-20 after:h-[180px] after:w-[240px] after:translate-x-1/3 after:bg-gradient-conic after:from-sky-200 after:via-blue-200 after:blur-2xl after:content-[''] before:dark:bg-gradient-to-br before:dark:from-transparent before:dark:to-blue-700 before:dark:opacity-10 after:dark:from-sky-900 after:dark:via-[#0141ff] after:dark:opacity-40 before:lg:h-[360px] z-[-1]">
        <div className="text-center">
          <h2 className="text-4xl font-bold mb-4">
            AI-Powered Homelab Automation
          </h2>
          <p className="text-lg text-muted-foreground mb-8">
            Real-time agent execution monitoring with comprehensive cost tracking
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
            <div className="p-6 border rounded-lg">
              <h3 className="text-xl font-semibold mb-2">Agent Management</h3>
              <p className="text-muted-foreground">
                Create, configure, and monitor Claude agents with real-time status updates
              </p>
            </div>
            <div className="p-6 border rounded-lg">
              <h3 className="text-xl font-semibold mb-2">Cost Tracking</h3>
              <p className="text-muted-foreground">
                Comprehensive cost monitoring and budget enforcement for all executions
              </p>
            </div>
            <div className="p-6 border rounded-lg">
              <h3 className="text-xl font-semibold mb-2">Real-time Logs</h3>
              <p className="text-muted-foreground">
                Live streaming of agent execution logs and performance metrics
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}