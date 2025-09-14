'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useWebSocket } from '@/hooks/useWebSocket'
import { 
  Heart, 
  Cpu, 
  HardDrive, 
  MemoryStick, 
  Wifi, 
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus
} from 'lucide-react'
import type { ApiResponse } from '@/lib/types/api'
import type { SystemHealthStatus } from '@/lib/types/database'

interface SystemHealthData {
  status: SystemHealthStatus
  timestamp: string
  metrics: {
    cpu: {
      usage: number
      loadAverage: {
        '1m': number
        '5m': number
        '15m': number
      }
    }
    memory: {
      usage: number
      total: number
      available: number
    }
    disk: {
      usage: number
      free: number
      total: number
    }
    network: {
      connected: boolean
      latency?: number
    }
  }
  alerts: Array<{
    type: string
    message: string
    severity: 'low' | 'medium' | 'high'
  }>
  trends?: {
    cpu: number
    memory: number
    disk: number
  }
}

export function SystemHealth() {
  const [healthData, setHealthData] = useState<SystemHealthData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)

  const { isConnected, lastMessage } = useWebSocket({
    onMessage: (message) => {
      if (message.type === 'system:status') {
        // Convert the WebSocket message to our internal format
        const healthUpdate: SystemHealthData = {
          status: message.status === 'error' ? 'critical' : message.status,
          timestamp: message.timestamp,
          metrics: {
            cpu: {
              usage: message.details?.cpu || 0,
              loadAverage: {
                '1m': 0,
                '5m': 0,
                '15m': 0
              }
            },
            memory: {
              usage: message.details?.memory || 0,
              total: 0,
              available: 0
            },
            disk: {
              usage: message.details?.disk || 0,
              free: 0,
              total: 0
            },
            network: {
              connected: true
            }
          },
          alerts: []
        }
        setHealthData(healthUpdate)
        setLastUpdated(new Date().toISOString())
      }
    }
  })

  const fetchSystemHealth = async (showRefreshing = false) => {
    try {
      if (showRefreshing) setRefreshing(true)
      if (!healthData) setLoading(true)
      setError(null)

      const response = await fetch('/api/system/health')
      const data: ApiResponse<SystemHealthData> = await response.json()

      if (!data.success) {
        throw new Error(data.error?.message || 'Failed to fetch system health')
      }

      setHealthData(data.data || null)
      setLastUpdated(new Date().toISOString())
    } catch (err) {
      console.error('Error fetching system health:', err)
      setError(err instanceof Error ? err.message : 'Failed to load system health')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchSystemHealth()

    // Refresh every 30 seconds if not receiving real-time updates
    const interval = setInterval(() => {
      if (!isConnected) {
        fetchSystemHealth()
      }
    }, 30000)

    return () => clearInterval(interval)
  }, [isConnected])

  const getStatusColor = (status: SystemHealthStatus) => {
    switch (status) {
      case 'healthy':
        return 'text-green-600 bg-green-100'
      case 'warning':
        return 'text-orange-600 bg-orange-100'
      case 'critical':
        return 'text-red-600 bg-red-100'
      default:
        return 'text-gray-600 bg-gray-100'
    }
  }

  const getStatusIcon = (status: SystemHealthStatus) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle2 className="h-4 w-4" />
      case 'warning':
        return <AlertTriangle className="h-4 w-4" />
      case 'critical':
        return <XCircle className="h-4 w-4" />
      default:
        return <Minus className="h-4 w-4" />
    }
  }

  const getUsageColor = (usage: number) => {
    if (usage >= 90) return 'bg-red-500'
    if (usage >= 75) return 'bg-orange-500'
    if (usage >= 50) return 'bg-yellow-500'
    return 'bg-green-500'
  }

  const formatBytes = (bytes: number) => {
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    if (bytes === 0) return '0 B'
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i]
  }

  const getTrendIcon = (trend?: number) => {
    if (!trend) return null
    if (Math.abs(trend) < 1) return <Minus className="h-3 w-3 text-gray-500" />
    return trend > 0 
      ? <TrendingUp className="h-3 w-3 text-red-500" />
      : <TrendingDown className="h-3 w-3 text-green-500" />
  }

  const getRelativeTime = (timestamp: string): string => {
    const now = new Date()
    const time = new Date(timestamp)
    const diffMs = now.getTime() - time.getTime()
    const diffSeconds = Math.floor(diffMs / 1000)
    
    if (diffSeconds < 60) return `${diffSeconds}s ago`
    const diffMinutes = Math.floor(diffSeconds / 60)
    if (diffMinutes < 60) return `${diffMinutes}m ago`
    const diffHours = Math.floor(diffMinutes / 60)
    return `${diffHours}h ago`
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>System Health</span>
            <Skeleton className="h-6 w-6 rounded" />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2 animate-pulse">
              <div className="flex justify-between">
                <div className="h-4 w-16 bg-muted rounded"></div>
                <div className="h-4 w-12 bg-muted rounded"></div>
              </div>
              <div className="h-2 w-full bg-muted rounded"></div>
            </div>
          ))}
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>System Health</span>
            <XCircle className="h-4 w-4 text-destructive" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">
            <p className="text-destructive font-medium">Failed to load health data</p>
            <p className="text-sm text-muted-foreground mt-1">{error}</p>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => fetchSystemHealth()} 
              className="mt-3"
            >
              Try Again
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!healthData) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-muted-foreground">
            <Heart className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No health data available</p>
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
            <Heart className="h-5 w-5" />
            <span>System Health</span>
          </div>
          <div className="flex items-center space-x-2">
            <Badge 
              variant="secondary" 
              className={getStatusColor(healthData.status)}
            >
              {getStatusIcon(healthData.status)}
              <span className="ml-1 capitalize">{healthData.status}</span>
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fetchSystemHealth(true)}
              disabled={refreshing}
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardTitle>
        {(lastUpdated || isConnected) && (
          <div className="text-xs text-muted-foreground flex items-center justify-between">
            <span>
              {lastUpdated && `Updated ${getRelativeTime(lastUpdated)}`}
            </span>
            {isConnected && (
              <div className="flex items-center space-x-1 text-green-600">
                <div className="h-2 w-2 bg-green-600 rounded-full animate-pulse"></div>
                <span>Live</span>
              </div>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* CPU Usage */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center space-x-2">
              <Cpu className="h-4 w-4 text-muted-foreground" />
              <span>CPU Usage</span>
              {getTrendIcon(healthData.trends?.cpu)}
            </div>
            <span className="font-medium">{healthData.metrics.cpu.usage}%</span>
          </div>
          <Progress 
            value={healthData.metrics.cpu.usage} 
            className="h-2"
            // @ts-ignore - Adding custom className for progress color
            indicatorClassName={getUsageColor(healthData.metrics.cpu.usage)}
          />
          <div className="text-xs text-muted-foreground">
            Load: {healthData.metrics.cpu.loadAverage['1m'].toFixed(2)} / {' '}
            {healthData.metrics.cpu.loadAverage['5m'].toFixed(2)} / {' '}
            {healthData.metrics.cpu.loadAverage['15m'].toFixed(2)}
          </div>
        </div>

        {/* Memory Usage */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center space-x-2">
              <MemoryStick className="h-4 w-4 text-muted-foreground" />
              <span>Memory Usage</span>
              {getTrendIcon(healthData.trends?.memory)}
            </div>
            <span className="font-medium">{healthData.metrics.memory.usage}%</span>
          </div>
          <Progress 
            value={healthData.metrics.memory.usage} 
            className="h-2"
            // @ts-ignore - Adding custom className for progress color
            indicatorClassName={getUsageColor(healthData.metrics.memory.usage)}
          />
          <div className="text-xs text-muted-foreground">
            {formatBytes(healthData.metrics.memory.available)} available of {' '}
            {formatBytes(healthData.metrics.memory.total)}
          </div>
        </div>

        {/* Disk Usage */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center space-x-2">
              <HardDrive className="h-4 w-4 text-muted-foreground" />
              <span>Disk Usage</span>
              {getTrendIcon(healthData.trends?.disk)}
            </div>
            <span className="font-medium">{healthData.metrics.disk.usage}%</span>
          </div>
          <Progress 
            value={healthData.metrics.disk.usage} 
            className="h-2"
            // @ts-ignore - Adding custom className for progress color
            indicatorClassName={getUsageColor(healthData.metrics.disk.usage)}
          />
          <div className="text-xs text-muted-foreground">
            {formatBytes(healthData.metrics.disk.free)} free of {' '}
            {formatBytes(healthData.metrics.disk.total)}
          </div>
        </div>

        {/* Network Status */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center space-x-2">
              <Wifi className="h-4 w-4 text-muted-foreground" />
              <span>Network</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className={`h-2 w-2 rounded-full ${
                healthData.metrics.network.connected ? 'bg-green-500' : 'bg-red-500'
              }`}></div>
              <span className="font-medium">
                {healthData.metrics.network.connected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
          </div>
          {healthData.metrics.network.latency && (
            <div className="text-xs text-muted-foreground">
              Latency: {healthData.metrics.network.latency}ms
            </div>
          )}
        </div>

        {/* Alerts */}
        {healthData.alerts.length > 0 && (
          <div className="space-y-2 pt-2 border-t">
            <h4 className="text-sm font-medium flex items-center space-x-2">
              <AlertTriangle className="h-4 w-4 text-orange-600" />
              <span>Alerts</span>
            </h4>
            {healthData.alerts.map((alert, index) => (
              <div 
                key={index} 
                className={`p-2 rounded-lg text-xs ${
                  alert.severity === 'high' ? 'bg-red-50 text-red-800 border border-red-200' :
                  alert.severity === 'medium' ? 'bg-orange-50 text-orange-800 border border-orange-200' :
                  'bg-blue-50 text-blue-800 border border-blue-200'
                }`}
              >
                <div className="font-medium">{alert.type}</div>
                <div>{alert.message}</div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}