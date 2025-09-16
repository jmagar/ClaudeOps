'use client'

import { useEffect, useState } from 'react'
import { useWebSocket } from '@/hooks/useWebSocket'

interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy'
  timestamp: string
}

interface SystemStatusProps {
  className?: string
}

export function SystemStatusIndicator({ className = "" }: SystemStatusProps) {
  const [status, setStatus] = useState<'healthy' | 'degraded' | 'unhealthy'>('healthy')
  const [loading, setLoading] = useState(true)

  const { isConnected, lastMessage } = useWebSocket({
    onMessage: (message) => {
      if (message.type === 'system:status') {
        // Convert WebSocket message to status
        const wsStatus = message.status === 'error' ? 'unhealthy' : 
                        message.status === 'warning' ? 'degraded' : 'healthy'
        setStatus(wsStatus)
      }
    }
  })

  const fetchSystemStatus = async () => {
    try {
      const response = await fetch('/api/system/health')
      const data = await response.json()
      
      if (data.success && data.data) {
        setStatus(data.data.status)
      }
    } catch (error) {
      console.error('Failed to fetch system status:', error)
      setStatus('unhealthy')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSystemStatus()
    
    // Poll every 60 seconds if not connected via WebSocket
    const interval = setInterval(() => {
      if (!isConnected) {
        fetchSystemStatus()
      }
    }, 60000)

    return () => clearInterval(interval)
  }, [isConnected])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'bg-green-500'
      case 'degraded':
        return 'bg-orange-500'
      case 'unhealthy':
        return 'bg-red-500'
      default:
        return 'bg-gray-500'
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'System Healthy'
      case 'degraded':
        return 'System Degraded'
      case 'unhealthy':
        return 'System Unhealthy'
      default:
        return 'System Status Unknown'
    }
  }

  if (loading) {
    return (
      <div className={`flex items-center space-x-1 ${className}`}>
        <div className="h-2 w-2 rounded-full bg-gray-400 animate-pulse"></div>
        <span>Loading...</span>
      </div>
    )
  }

  return (
    <div className={`flex items-center space-x-1 ${className}`}>
      <div className={`h-2 w-2 rounded-full ${getStatusColor(status)}`}></div>
      <span>{getStatusText(status)}</span>
    </div>
  )
}