'use client'

// NOTE: For optimal WebSocket handling, server events should include agentType
// in execution:progress, execution:completed, and execution:failed messages
// to avoid the need for client-side executionId → agentType mapping

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useWebSocket } from '@/hooks/useWebSocket'
import { 
  Play, 
  Activity, 
  Heart, 
  Shield, 
  Container,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Clock
} from 'lucide-react'

interface AgentConfig {
  type: string
  name: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  enabled: boolean
  estimatedCost: number
  estimatedDuration: string
  category: 'monitoring' | 'maintenance' | 'security'
}

const availableAgents: AgentConfig[] = [
  {
    type: 'system-health',
    name: 'System Health Check',
    description: 'Comprehensive system analysis with AI insights',
    icon: Heart,
    enabled: true,
    estimatedCost: 0.05,
    estimatedDuration: '2-3 min',
    category: 'monitoring'
  },
  {
    type: 'docker-janitor',
    name: 'Docker Cleanup',
    description: 'Clean unused containers, images, and volumes',
    icon: Container,
    enabled: false, // Future implementation
    estimatedCost: 0.10,
    estimatedDuration: '3-5 min',
    category: 'maintenance'
  },
  {
    type: 'backup-validator',
    name: 'Backup Validation',
    description: 'Verify backup integrity and test restores',
    icon: Shield,
    enabled: false, // Future implementation
    estimatedCost: 0.03,
    estimatedDuration: '1-2 min',
    category: 'security'
  }
]

interface QuickActionExecutionProgress {
  agentType: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  progress?: number
  currentStep?: string
  executionId?: string
}

export function QuickActions() {
  const [executions, setExecutions] = useState<Record<string, QuickActionExecutionProgress>>({})
  const [lastExecution, setLastExecution] = useState<{ type: string; timestamp: number } | null>(null)
  // Map from executionId to agentType to resolve the hard-coded issue
  const [executionToAgentMap, setExecutionToAgentMap] = useState<Map<string, string>>(new Map())

  const { isConnected, sendMessage, subscribeToExecution } = useWebSocket({
    onMessage: (message) => {
      if (message.type === 'execution:started') {
        // Store the mapping when execution starts
        const { executionId, agentType } = message
        if (executionId && agentType) {
          setExecutionToAgentMap(prev => new Map(prev.set(executionId, agentType)))
        }
      } else if (message.type === 'execution:progress') {
        const { executionId, progress, step } = message
        // Look up agentType from our mapping
        const agentType = executionToAgentMap.get(executionId)
        if (!agentType) {
          console.warn('No agentType found for executionId:', executionId)
          return // Ignore messages without proper mapping
        }
        
        setExecutions(prev => ({
          ...prev,
          [agentType]: {
            agentType,
            status: 'running',
            progress: typeof progress === 'number' ? progress : undefined,
            currentStep: step,
            executionId
          }
        }))
      } else if (message.type === 'execution:completed' || message.type === 'execution:failed') {
        const { executionId } = message
        // Look up agentType from our mapping
        const agentType = executionToAgentMap.get(executionId)
        if (!agentType) {
          console.warn('No agentType found for executionId:', executionId)
          return // Ignore messages without proper mapping
        }
        
        const status = message.type === 'execution:completed' ? 'completed' : 'failed'
        setExecutions(prev => ({
          ...prev,
          [agentType]: {
            ...prev[agentType],
            status,
            progress: status === 'completed' ? 100 : undefined
          }
        }))
        
        // Clear execution status after 5 seconds and clean up mapping
        setTimeout(() => {
          setExecutions(prev => {
            const updated = { ...prev }
            delete updated[agentType]
            return updated
          })
          setExecutionToAgentMap(prev => {
            const updated = new Map(prev)
            updated.delete(executionId)
            return updated
          })
        }, 5000)
      }
    }
  })

  const executeAgent = async (agentType: string) => {
    try {
      // Set pending status immediately
      setExecutions(prev => ({
        ...prev,
        [agentType]: {
          agentType,
          status: 'pending'
        }
      }))

      const response = await fetch('/api/executions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          agentType,
          triggeredBy: 'manual',
          config: {}
        })
      })

      const result = await response.json()

      if (!result.success) {
        throw new Error(result.error?.message || 'Failed to start execution')
      }

      const executionId = result.data?.id
      if (executionId) {
        // Store the mapping for this execution
        setExecutionToAgentMap(prev => new Map(prev.set(executionId, agentType)))
        // Subscribe to execution updates
        subscribeToExecution(executionId)
        setLastExecution({ type: agentType, timestamp: Date.now() })
      }

    } catch (error) {
      console.error('Error starting execution:', error)
      setExecutions(prev => ({
        ...prev,
        [agentType]: {
          agentType,
          status: 'failed'
        }
      }))
      
      // Clear error status after 3 seconds
      setTimeout(() => {
        setExecutions(prev => {
          const updated = { ...prev }
          delete updated[agentType]
          return updated
        })
      }, 3000)
    }
  }

  const getExecutionStatus = (agentType: string) => {
    return executions[agentType]
  }

  const isRecentlyExecuted = (agentType: string) => {
    if (!lastExecution || lastExecution.type !== agentType) return false
    return Date.now() - lastExecution.timestamp < 60000 // Within last minute
  }

  const renderActionButton = (agent: AgentConfig) => {
    const execution = getExecutionStatus(agent.type)
    const isRecent = isRecentlyExecuted(agent.type)
    
    if (!agent.enabled) {
      return (
        <Button disabled variant="outline" className="w-full">
          <Clock className="h-4 w-4 mr-2" />
          Coming Soon
        </Button>
      )
    }

    if (execution) {
      const { status, progress, currentStep } = execution
      
      switch (status) {
        case 'pending':
          return (
            <Button disabled variant="outline" className="w-full">
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              Starting...
            </Button>
          )
        
        case 'running':
          return (
            <div className="space-y-2">
              <Button disabled variant="secondary" className="w-full">
                <Activity className="h-4 w-4 mr-2" />
                Running...
              </Button>
              {currentStep && (
                <p className="text-xs text-muted-foreground text-center truncate">
                  {currentStep}
                </p>
              )}
              {progress !== undefined && (
                <div className="w-full bg-muted rounded-full h-1">
                  <div 
                    className="bg-primary rounded-full h-1 transition-all duration-500"
                    style={{ width: `${Math.min(100, Math.max(0, Number(progress) || 0))}%` }}
                  ></div>
                </div>
              )}
            </div>
          )
        
        case 'completed':
          return (
            <Button 
              variant="outline" 
              className="w-full border-green-200 text-green-700"
              onClick={() => executeAgent(agent.type)}
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Completed
            </Button>
          )
        
        case 'failed':
          return (
            <Button 
              variant="outline" 
              className="w-full border-red-200 text-red-700"
              onClick={() => executeAgent(agent.type)}
            >
              <AlertTriangle className="h-4 w-4 mr-2" />
              Failed - Retry
            </Button>
          )
      }
    }

    return (
      <Button 
        onClick={() => executeAgent(agent.type)}
        className="w-full"
        disabled={isRecent}
      >
        <Play className="h-4 w-4 mr-2" />
        {isRecent ? 'Recently Executed' : 'Execute'}
      </Button>
    )
  }

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'monitoring':
        return 'bg-blue-100 text-blue-800'
      case 'maintenance':
        return 'bg-orange-100 text-orange-800'
      case 'security':
        return 'bg-green-100 text-green-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Quick Actions</span>
          {!isConnected && (
            <Badge variant="outline" className="text-xs">
              <AlertTriangle className="h-3 w-3 mr-1" />
              Offline
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {availableAgents.map((agent) => {
            const IconComponent = agent.icon
            
            return (
              <div key={agent.type} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="flex-shrink-0">
                      <IconComponent className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-medium text-sm">{agent.name}</h3>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {agent.description}
                      </p>
                    </div>
                  </div>
                  <Badge 
                    variant="secondary" 
                    className={`text-xs ${getCategoryColor(agent.category)}`}
                  >
                    {agent.category}
                  </Badge>
                </div>
                
                <div className="flex justify-between items-center text-xs text-muted-foreground">
                  <span>~${agent.estimatedCost.toFixed(3)}</span>
                  <span>{agent.estimatedDuration}</span>
                </div>
                
                {renderActionButton(agent)}
              </div>
            )
          })}
        </div>

        {/* Connection Status */}
        <div className="mt-6 pt-4 border-t">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Real-time Updates</span>
            <div className={`flex items-center space-x-1 ${isConnected ? 'text-green-600' : 'text-orange-600'}`}>
              <div className={`h-2 w-2 rounded-full ${isConnected ? 'bg-green-600 animate-pulse' : 'bg-orange-600'}`}></div>
              <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}