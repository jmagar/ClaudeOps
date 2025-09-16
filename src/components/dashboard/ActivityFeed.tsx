'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { useWebSocket } from '@/hooks/useWebSocket'
import { 
  Activity, 
  Clock, 
  DollarSign, 
  RefreshCw, 
  ExternalLink,
  AlertCircle,
  CheckCircle2,
  PlayCircle,
  XCircle
} from 'lucide-react'
import type { ApiResponse, PaginationResponse } from '@/lib/types/api'
import type { Execution } from '@/lib/types/database'

interface ActivityItem extends Execution {
  duration?: number
  relativeTime: string
}

export function ActivityFeed() {
  const [activities, setActivities] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  // WebSocket for real-time updates with debounced refresh
  const { isConnected } = useWebSocket({
    onMessage: (() => {
      let timeout: ReturnType<typeof setTimeout> | null = null
      return (message) => {
        if (message.type === 'execution:progress' || message.type === 'execution:completed') {
          if (timeout) clearTimeout(timeout)
          timeout = setTimeout(() => fetchActivities(), 500)
        }
      }
    })()
  })

  const fetchActivities = useCallback(async (showRefreshing = false) => {
    try {
      if (showRefreshing) setRefreshing(true)
      setLoading(prevLoading => prevLoading || activities.length === 0)
      setError(null)

      const response = await fetch('/api/executions?limit=20&sortBy=startedAt&sortOrder=desc')
      const data: ApiResponse<PaginationResponse<Execution>> = await response.json()

      if (!data.success) {
        throw new Error(data.error?.message || 'Failed to fetch recent activity')
      }

      const executions = data.data?.data || []
      
      // Calculate relative time and duration for each execution
      const activitiesWithTime: ActivityItem[] = executions.map(execution => ({
        ...execution,
        duration: execution.completedAt && execution.startedAt 
          ? new Date(execution.completedAt).getTime() - new Date(execution.startedAt).getTime()
          : undefined,
        relativeTime: getRelativeTime(execution.startedAt)
      }))

      setActivities(activitiesWithTime)
    } catch (err) {
      console.error('Error fetching activity feed:', err)
      setError(err instanceof Error ? err.message : 'Failed to load activity feed')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [activities.length])

  const getRelativeTime = (timestamp: string): string => {
    const now = new Date()
    const time = new Date(timestamp)
    const diffMs = now.getTime() - time.getTime()
    const diffSeconds = Math.floor(diffMs / 1000)
    const diffMinutes = Math.floor(diffSeconds / 60)
    const diffHours = Math.floor(diffMinutes / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffSeconds < 60) return 'just now'
    if (diffMinutes < 60) return `${diffMinutes}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return time.toLocaleDateString()
  }

  const formatDuration = (ms: number | undefined) => {
    if (!ms) return null
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${(ms / 60000).toFixed(1)}min`
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-green-600" />
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-600" />
      case 'running':
        return <PlayCircle className="h-4 w-4 text-blue-600" />
      case 'cancelled':
        return <AlertCircle className="h-4 w-4 text-orange-600" />
      default:
        return <Clock className="h-4 w-4 text-gray-600" />
    }
  }

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'completed':
        return 'default' as const
      case 'failed':
        return 'destructive' as const
      case 'running':
        return 'secondary' as const
      case 'cancelled':
        return 'outline' as const
      default:
        return 'outline' as const
    }
  }

  useEffect(() => {
    fetchActivities()

    // Refresh every 2 minutes if not receiving real-time updates
    const interval = setInterval(() => {
      if (!isConnected) {
        fetchActivities()
      }
    }, 120000)

    return () => clearInterval(interval)
  }, [isConnected, fetchActivities])

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Recent Activity</span>
            <Skeleton className="h-6 w-6 rounded" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-start space-x-3 animate-pulse">
                <div className="h-4 w-4 bg-muted rounded-full mt-1"></div>
                <div className="flex-1 space-y-2">
                  <div className="flex justify-between">
                    <div className="h-4 w-32 bg-muted rounded"></div>
                    <div className="h-4 w-16 bg-muted rounded"></div>
                  </div>
                  <div className="h-3 w-24 bg-muted rounded"></div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Activity className="h-5 w-5" />
            <span>Recent Activity</span>
            {isConnected && (
              <div className="flex items-center space-x-1 text-xs text-green-600">
                <div className="h-2 w-2 bg-green-600 rounded-full animate-pulse"></div>
                <span>Live</span>
              </div>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fetchActivities(true)}
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {error ? (
          <div className="text-center py-8">
            <AlertCircle className="h-8 w-8 mx-auto mb-2 text-destructive" />
            <p className="text-destructive font-medium">Failed to load activity</p>
            <p className="text-sm text-muted-foreground mt-1">{error}</p>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => fetchActivities()} 
              className="mt-3"
            >
              Try Again
            </Button>
          </div>
        ) : activities.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No recent activity</p>
            <p className="text-sm mt-1">Start an execution to see activity here</p>
          </div>
        ) : (
          <div className="space-y-4">
            {activities.map((activity) => (
              <div key={activity.id} className="flex items-start space-x-3 group">
                <div className="mt-1">
                  {getStatusIcon(activity.status)}
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">
                        {activity.agentType}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Started {activity.relativeTime}
                        {activity.duration && (
                          <span className="ml-2">
                            • {formatDuration(activity.duration)}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center space-x-2 ml-2">
                      <Badge 
                        variant={getStatusVariant(activity.status)}
                        className="text-xs"
                      >
                        {activity.status}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        asChild
                      >
                        <a href={`/executions/${activity.id}`}>
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </Button>
                    </div>
                  </div>
                  
                  {/* Cost and additional info */}
                  <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                    {activity.costUsd != null && Number.isFinite(activity.costUsd) && (
                      <span className="flex items-center space-x-1">
                        <DollarSign className="h-3 w-3" />
                        <span>${activity.costUsd.toFixed(4)}</span>
                      </span>
                    )}
                    {activity.triggeredBy && (
                      <span>via {activity.triggeredBy}</span>
                    )}
                  </div>

                  {/* Summary if available */}
                  {activity.resultSummary && (
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {activity.resultSummary}
                    </p>
                  )}
                </div>
              </div>
            ))}

            {/* Show more button if there are many items */}
            {activities.length >= 20 && (
              <div className="text-center pt-4">
                <Button variant="outline" size="sm" asChild>
                  <a href="/executions">
                    View All Executions
                    <ExternalLink className="h-3 w-3 ml-1" />
                  </a>
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}