'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { 
  TrendingUp, 
  TrendingDown, 
  Clock, 
  CheckCircle, 
  XCircle, 
  PlayCircle, 
  PauseCircle 
} from 'lucide-react'
import type { ApiResponse } from '@/lib/types/api'
import type { ExecutionStats as ExecutionStatsType } from '@/lib/types/database'

interface ExecutionStatsResponse extends ExecutionStatsType {
  trends?: {
    totalChange: number
    completionRateChange: number
    averageDurationChange: number
    costChange: number
  }
}

export function ExecutionStats() {
  const [stats, setStats] = useState<ExecutionStatsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchExecutionStats = async () => {
      try {
        setLoading(true)
        setError(null)

        const response = await fetch('/api/executions/stats')
        const data: ApiResponse<ExecutionStatsResponse> = await response.json()

        if (!data.success) {
          throw new Error(data.error?.message || 'Failed to fetch execution stats')
        }

        setStats(data.data || null)
      } catch (err) {
        console.error('Error fetching execution stats:', err)
        setError(err instanceof Error ? err.message : 'Failed to load execution stats')
      } finally {
        setLoading(false)
      }
    }

    fetchExecutionStats()

    // Refresh every 60 seconds
    const interval = setInterval(fetchExecutionStats, 60000)
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader>
              <div className="h-4 w-32 bg-muted rounded"></div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="h-8 w-16 bg-muted rounded"></div>
              <div className="h-2 w-full bg-muted rounded"></div>
              <div className="flex justify-between">
                <div className="h-3 w-20 bg-muted rounded"></div>
                <div className="h-3 w-16 bg-muted rounded"></div>
              </div>
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
            <XCircle className="h-8 w-8 mx-auto mb-2" />
            <p className="font-medium">Failed to load stats</p>
            <p className="text-sm text-muted-foreground mt-1">{error}</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!stats) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-muted-foreground">
            <PlayCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No execution data available</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const formatDuration = (ms: number | null) => {
    if (!ms) return '0s'
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${(ms / 60000).toFixed(1)}min`
  }

  const formatTrend = (value: number) => {
    const isPositive = value > 0
    const TrendIcon = isPositive ? TrendingUp : TrendingDown
    const color = isPositive ? 'text-green-600' : 'text-red-600'
    
    return (
      <span className={`flex items-center text-xs ${color}`}>
        <TrendIcon className="h-3 w-3 mr-1" />
        {Math.abs(value).toFixed(1)}%
      </span>
    )
  }

  return (
    <div className="space-y-4">
      {/* Completion Rate */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center justify-between">
            <span>Success Rate</span>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-2xl font-bold">
            {stats.completionRate.toFixed(1)}%
          </div>
          <Progress value={stats.completionRate} className="h-2" />
          <div className="flex justify-between items-center text-xs text-muted-foreground">
            <span>{stats.completed} / {stats.total} completed</span>
            {stats.trends?.completionRateChange !== undefined && (
              formatTrend(stats.trends.completionRateChange)
            )}
          </div>
        </CardContent>
      </Card>

      {/* Average Duration */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center justify-between">
            <span>Avg Duration</span>
            <Clock className="h-4 w-4 text-blue-600" />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-2xl font-bold">
            {formatDuration(stats.averageDuration)}
          </div>
          <div className="flex justify-between items-center text-xs text-muted-foreground">
            <span>Per execution</span>
            {stats.trends?.averageDurationChange !== undefined && (
              formatTrend(stats.trends.averageDurationChange)
            )}
          </div>
        </CardContent>
      </Card>

      {/* Current Activity */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center justify-between">
            <span>Active Executions</span>
            <PlayCircle className="h-4 w-4 text-orange-600" />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-2xl font-bold">{stats.running}</div>
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Running</span>
              <span className="font-medium">{stats.running}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Pending</span>
              <span className="font-medium">{stats.pending}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-red-600">Failed</span>
              <span className="font-medium text-red-600">{stats.failed}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Total Cost */}
      {stats.totalCost !== null && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center justify-between">
              <span>Total Cost</span>
              <TrendingUp className="h-4 w-4 text-green-600" />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-2xl font-bold">
              ${stats.totalCost.toFixed(4)}
            </div>
            <div className="flex justify-between items-center text-xs text-muted-foreground">
              <span>All executions</span>
              {stats.trends?.costChange !== undefined && (
                formatTrend(stats.trends.costChange)
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}