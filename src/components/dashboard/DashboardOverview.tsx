'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Activity, Clock, DollarSign, Zap } from 'lucide-react'
import type { ApiResponse, PaginationResponse } from '@/lib/types/api'
import type { Execution } from '@/lib/types/database'

interface DashboardStats {
  totalExecutions: number
  runningExecutions: number
  completedExecutions: number
  failedExecutions: number
  totalCost: number
  monthlyCost: number
  averageDuration: number
  successRate: number
}

export function DashboardOverview() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [recentExecutions, setRecentExecutions] = useState<Execution[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true)
        setError(null)

        // Fetch recent executions for overview
        const executionsResponse = await fetch('/api/executions?limit=10&sortBy=startedAt&sortOrder=desc')
        
        if (!executionsResponse.ok) {
          let errorMessage = `HTTP ${executionsResponse.status} ${executionsResponse.statusText}`
          try {
            const errorBody = await executionsResponse.text()
            if (errorBody) {
              errorMessage += `: ${errorBody}`
            }
          } catch {
            // Ignore if we can't read the error body
          }
          throw new Error(errorMessage)
        }
        
        const executionsData: ApiResponse<PaginationResponse<Execution>> = await executionsResponse.json()

        if (!executionsData.success) {
          throw new Error(executionsData.error?.message || 'Failed to fetch executions')
        }

        const executions = executionsData.data?.data || []
        setRecentExecutions(executions)

        // Calculate stats from executions
        const totalExecutions = executions.length
        const runningExecutions = executions.filter(e => e.status === 'running').length
        const completedExecutions = executions.filter(e => e.status === 'completed').length
        const failedExecutions = executions.filter(e => e.status === 'failed').length
        
        const totalCost = executions.reduce((sum, e) => sum + (e.costUsd || 0), 0)
        const completedExecs = executions.filter(e => e.status === 'completed' && e.durationMs != null)
        const averageDuration = completedExecs.length > 0 
          ? completedExecs.reduce((sum, e) => sum + (e.durationMs || 0), 0) / completedExecs.length 
          : 0

        const successRate = totalExecutions > 0 
          ? (completedExecutions / totalExecutions) * 100 
          : 0

        setStats({
          totalExecutions,
          runningExecutions,
          completedExecutions,
          failedExecutions,
          totalCost,
          monthlyCost: totalCost, // For MVP, using total as monthly
          averageDuration,
          successRate
        })

      } catch (err) {
        console.error('Error fetching dashboard data:', err)
        setError(err instanceof Error ? err.message : 'Failed to load dashboard data')
      } finally {
        setLoading(false)
      }
    }

    fetchDashboardData()

    // Refresh every 30 seconds
    const interval = setInterval(fetchDashboardData, 30000)
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="h-4 w-20 bg-muted rounded"></div>
              <div className="h-4 w-4 bg-muted rounded"></div>
            </CardHeader>
            <CardContent>
              <div className="h-8 w-16 bg-muted rounded mb-1"></div>
              <div className="h-3 w-24 bg-muted rounded"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <Card className="border-destructive">
        <CardContent className="pt-6">
          <div className="text-center text-destructive">
            <p className="font-medium">Failed to load dashboard data</p>
            <p className="text-sm text-muted-foreground mt-1">{error}</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Executions</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalExecutions || 0}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.runningExecutions || 0} currently running
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Cost</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${(stats?.monthlyCost || 0).toFixed(4)}
            </div>
            <p className="text-xs text-muted-foreground">
              ${(stats?.totalCost || 0).toFixed(4)} total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats?.successRate?.toFixed(1) || '0.0'}%
            </div>
            <Progress value={stats?.successRate || 0} className="h-2 mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Duration</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats?.averageDuration ? `${(stats.averageDuration / 1000).toFixed(1)}s` : '0s'}
            </div>
            <p className="text-xs text-muted-foreground">
              Per execution
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Executions Overview */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Executions</CardTitle>
        </CardHeader>
        <CardContent>
          {recentExecutions.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No executions yet</p>
              <p className="text-sm">Start your first agent execution to see activity here</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentExecutions.slice(0, 5).map((execution) => (
                <div key={execution.id} className="flex items-center justify-between p-3 rounded-lg border bg-card/50">
                  <div className="flex items-center space-x-3">
                    <div className="flex flex-col">
                      <span className="font-medium text-sm">{execution.agentType}</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(execution.startedAt).toLocaleString()}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge 
                      variant={
                        execution.status === 'completed' ? 'default' :
                        execution.status === 'failed' ? 'destructive' :
                        execution.status === 'running' ? 'secondary' :
                        'outline'
                      }
                    >
                      {execution.status}
                    </Badge>
                    {execution.costUsd && (
                      <span className="text-xs text-muted-foreground">
                        ${execution.costUsd.toFixed(4)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}