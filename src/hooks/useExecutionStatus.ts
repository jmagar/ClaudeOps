'use client';

import { useCallback, useEffect, useState } from 'react';
import { useWebSocketContext } from '../lib/contexts/WebSocketContext';
import { 
  ExecutionStartedMessage,
  ExecutionCompletedMessage,
  ExecutionFailedMessage,
  ExecutionProgressMessage,
  CostUpdatedMessage
} from '../lib/websocket/messageTypes';

export interface ExecutionStatus {
  executionId: string;
  agentType?: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  currentStep?: string;
  startTime?: string;
  endTime?: string;
  duration?: number;
  result?: {
    success: boolean;
    data?: unknown;
    summary?: string;
    costUsd?: number;
    durationMs?: number;
  };
  error?: {
    message: string;
    code?: string;
    stack?: string;
  };
  cost: {
    current: number;
    total: number;
    tokenUsage?: {
      inputTokens: number;
      outputTokens: number;
      cacheHits?: number;
    };
  };
}

export interface ExecutionMetrics {
  totalExecutions: number;
  activeExecutions: number;
  completedExecutions: number;
  failedExecutions: number;
  totalCost: number;
  averageExecutionTime: number;
  successRate: number;
}

export interface UseExecutionStatusOptions {
  trackAll?: boolean; // Track all executions or just specific ones
  maxHistorySize?: number;
}

export interface UseExecutionStatusReturn {
  // Current execution states
  executions: Map<string, ExecutionStatus>;
  activeExecutions: ExecutionStatus[];
  completedExecutions: ExecutionStatus[];
  failedExecutions: ExecutionStatus[];
  
  // Individual execution queries
  getExecution: (executionId: string) => ExecutionStatus | undefined;
  getExecutionStatus: (executionId: string) => ExecutionStatus['status'] | null;
  getExecutionProgress: (executionId: string) => number;
  getExecutionCost: (executionId: string) => ExecutionStatus['cost'] | null;
  
  // Execution management
  startTracking: (executionId: string, agentType?: string) => void;
  stopTracking: (executionId: string) => void;
  clearHistory: () => void;
  clearExecution: (executionId: string) => void;
  
  // Metrics and statistics
  getMetrics: () => ExecutionMetrics;
  getExecutionHistory: (limit?: number) => ExecutionStatus[];
  
  // Utilities
  isExecutionActive: (executionId: string) => boolean;
  isExecutionCompleted: (executionId: string) => boolean;
  getActiveExecutionIds: () => string[];
}

export function useExecutionStatus(options: UseExecutionStatusOptions = {}): UseExecutionStatusReturn {
  const { trackAll = true, maxHistorySize = 100 } = options;
  const { lastMessage } = useWebSocketContext();
  
  const [executions, setExecutions] = useState<Map<string, ExecutionStatus>>(new Map());

  // Handle WebSocket messages
  useEffect(() => {
    if (!lastMessage) return;

    switch (lastMessage.type) {
      case 'execution:started':
        handleExecutionStarted(lastMessage as ExecutionStartedMessage);
        break;
      
      case 'execution:progress':
        handleExecutionProgress(lastMessage as ExecutionProgressMessage);
        break;
      
      case 'execution:completed':
        handleExecutionCompleted(lastMessage as ExecutionCompletedMessage);
        break;
      
      case 'execution:failed':
        handleExecutionFailed(lastMessage as ExecutionFailedMessage);
        break;
      
      case 'cost:updated':
        handleCostUpdate(lastMessage as CostUpdatedMessage);
        break;
    }
  }, [lastMessage]);

  // Handle execution started
  const handleExecutionStarted = useCallback((message: ExecutionStartedMessage) => {
    if (!trackAll) return; // Only track if explicitly enabled

    setExecutions(prev => {
      const newExecutions = new Map(prev);
      const execution: ExecutionStatus = {
        executionId: message.executionId,
        agentType: message.agentType,
        status: 'running',
        progress: 0,
        startTime: message.timestamp,
        cost: {
          current: 0,
          total: 0
        }
      };
      
      newExecutions.set(message.executionId, execution);
      console.log(`Tracking started execution: ${message.executionId} (${message.agentType})`);
      return newExecutions;
    });
  }, [trackAll]);

  // Handle execution progress
  const handleExecutionProgress = useCallback((message: ExecutionProgressMessage) => {
    setExecutions(prev => {
      const execution = prev.get(message.executionId);
      if (!execution) {
        if (!trackAll) return prev; // Don't create new tracking if not tracking all
        
        // Create minimal execution status for progress-only tracking
        const newExecutions = new Map(prev);
        newExecutions.set(message.executionId, {
          executionId: message.executionId,
          status: 'running',
          progress: message.progress,
          currentStep: message.step,
          cost: { current: 0, total: 0 }
        });
        return newExecutions;
      }

      const newExecutions = new Map(prev);
      newExecutions.set(message.executionId, {
        ...execution,
        progress: message.progress,
        currentStep: message.step
      });
      return newExecutions;
    });
  }, [trackAll]);

  // Handle execution completed
  const handleExecutionCompleted = useCallback((message: ExecutionCompletedMessage) => {
    setExecutions(prev => {
      const execution = prev.get(message.executionId);
      if (!execution && !trackAll) return prev;

      const newExecutions = new Map(prev);
      const updatedExecution: ExecutionStatus = {
        ...(execution || {
          executionId: message.executionId,
          status: 'pending' as const,
          progress: 0,
          cost: { current: 0, total: 0 }
        }),
        status: 'completed',
        progress: 100,
        endTime: message.timestamp,
        result: message.result
      };

      // Calculate duration if we have start time
      if (execution?.startTime) {
        updatedExecution.duration = 
          new Date(message.timestamp).getTime() - new Date(execution.startTime).getTime();
      }

      // Update cost if provided in result
      if (message.result.costUsd) {
        updatedExecution.cost = {
          ...updatedExecution.cost,
          current: message.result.costUsd,
          total: message.result.costUsd
        };
      }

      newExecutions.set(message.executionId, updatedExecution);
      console.log(`Execution completed: ${message.executionId}`, message.result);
      return newExecutions;
    });
  }, [trackAll]);

  // Handle execution failed
  const handleExecutionFailed = useCallback((message: ExecutionFailedMessage) => {
    setExecutions(prev => {
      const execution = prev.get(message.executionId);
      if (!execution && !trackAll) return prev;

      const newExecutions = new Map(prev);
      const updatedExecution: ExecutionStatus = {
        ...(execution || {
          executionId: message.executionId,
          status: 'pending' as const,
          progress: 0,
          cost: { current: 0, total: 0 }
        }),
        status: 'failed',
        endTime: message.timestamp,
        error: message.error
      };

      // Calculate duration if we have start time
      if (execution?.startTime) {
        updatedExecution.duration = 
          new Date(message.timestamp).getTime() - new Date(execution.startTime).getTime();
      }

      newExecutions.set(message.executionId, updatedExecution);
      console.error(`Execution failed: ${message.executionId}`, message.error);
      return newExecutions;
    });
  }, [trackAll]);

  // Handle cost updates
  const handleCostUpdate = useCallback((message: CostUpdatedMessage) => {
    setExecutions(prev => {
      const execution = prev.get(message.executionId);
      if (!execution) return prev;

      const newExecutions = new Map(prev);
      newExecutions.set(message.executionId, {
        ...execution,
        cost: {
          current: message.currentCost,
          total: message.totalCost,
          tokenUsage: message.tokenUsage
        }
      });
      return newExecutions;
    });
  }, []);

  // Maintain history size limit
  useEffect(() => {
    if (executions.size > maxHistorySize) {
      setExecutions(prev => {
        const newExecutions = new Map(prev);
        const executionsArray = Array.from(newExecutions.values());
        
        // Sort by end time (completed/failed first, then by timestamp)
        executionsArray.sort((a, b) => {
          if (a.endTime && !b.endTime) return -1;
          if (!a.endTime && b.endTime) return 1;
          if (a.endTime && b.endTime) {
            return new Date(b.endTime).getTime() - new Date(a.endTime).getTime();
          }
          return 0;
        });

        // Keep the most recent executions up to the limit
        const toKeep = executionsArray.slice(0, maxHistorySize);
        const newMap = new Map();
        toKeep.forEach(exec => newMap.set(exec.executionId, exec));
        
        return newMap;
      });
    }
  }, [executions.size, maxHistorySize]);

  // Query functions
  const getExecution = useCallback((executionId: string): ExecutionStatus | undefined => {
    return executions.get(executionId);
  }, [executions]);

  const getExecutionStatus = useCallback((executionId: string): ExecutionStatus['status'] | null => {
    return executions.get(executionId)?.status || null;
  }, [executions]);

  const getExecutionProgress = useCallback((executionId: string): number => {
    return executions.get(executionId)?.progress || 0;
  }, [executions]);

  const getExecutionCost = useCallback((executionId: string): ExecutionStatus['cost'] | null => {
    return executions.get(executionId)?.cost || null;
  }, [executions]);

  // Management functions
  const startTracking = useCallback((executionId: string, agentType?: string) => {
    setExecutions(prev => {
      if (prev.has(executionId)) return prev;

      const newExecutions = new Map(prev);
      newExecutions.set(executionId, {
        executionId,
        agentType,
        status: 'pending',
        progress: 0,
        cost: { current: 0, total: 0 }
      });
      
      console.log(`Started tracking execution: ${executionId}`);
      return newExecutions;
    });
  }, []);

  const stopTracking = useCallback((executionId: string) => {
    setExecutions(prev => {
      if (!prev.has(executionId)) return prev;
      
      const newExecutions = new Map(prev);
      newExecutions.delete(executionId);
      console.log(`Stopped tracking execution: ${executionId}`);
      return newExecutions;
    });
  }, []);

  const clearHistory = useCallback(() => {
    setExecutions(new Map());
    console.log('Cleared execution history');
  }, []);

  const clearExecution = useCallback((executionId: string) => {
    setExecutions(prev => {
      const newExecutions = new Map(prev);
      newExecutions.delete(executionId);
      return newExecutions;
    });
  }, []);

  // Computed values
  const activeExecutions = Array.from(executions.values()).filter(
    exec => exec.status === 'running' || exec.status === 'pending'
  );

  const completedExecutions = Array.from(executions.values()).filter(
    exec => exec.status === 'completed'
  );

  const failedExecutions = Array.from(executions.values()).filter(
    exec => exec.status === 'failed'
  );

  // Metrics calculation
  const getMetrics = useCallback((): ExecutionMetrics => {
    const allExecutions = Array.from(executions.values());
    const completed = allExecutions.filter(e => e.status === 'completed');
    const failed = allExecutions.filter(e => e.status === 'failed');
    const active = allExecutions.filter(e => e.status === 'running' || e.status === 'pending');

    const totalCost = allExecutions.reduce((sum, exec) => sum + exec.cost.total, 0);
    
    const executionsWithDuration = allExecutions.filter(e => e.duration);
    const averageExecutionTime = executionsWithDuration.length > 0
      ? executionsWithDuration.reduce((sum, exec) => sum + (exec.duration || 0), 0) / executionsWithDuration.length
      : 0;

    const finishedExecutions = completed.length + failed.length;
    const successRate = finishedExecutions > 0 ? (completed.length / finishedExecutions) * 100 : 0;

    return {
      totalExecutions: allExecutions.length,
      activeExecutions: active.length,
      completedExecutions: completed.length,
      failedExecutions: failed.length,
      totalCost,
      averageExecutionTime,
      successRate
    };
  }, [executions]);

  // Utility functions
  const getExecutionHistory = useCallback((limit?: number): ExecutionStatus[] => {
    const allExecutions = Array.from(executions.values());
    const sorted = allExecutions.sort((a, b) => {
      const aTime = a.endTime || a.startTime || '';
      const bTime = b.endTime || b.startTime || '';
      return bTime.localeCompare(aTime);
    });
    
    return limit ? sorted.slice(0, limit) : sorted;
  }, [executions]);

  const isExecutionActive = useCallback((executionId: string): boolean => {
    const status = getExecutionStatus(executionId);
    return status === 'running' || status === 'pending';
  }, [getExecutionStatus]);

  const isExecutionCompleted = useCallback((executionId: string): boolean => {
    const status = getExecutionStatus(executionId);
    return status === 'completed';
  }, [getExecutionStatus]);

  const getActiveExecutionIds = useCallback((): string[] => {
    return activeExecutions.map(exec => exec.executionId);
  }, [activeExecutions]);

  return {
    // Current execution states
    executions,
    activeExecutions,
    completedExecutions,
    failedExecutions,
    
    // Individual execution queries
    getExecution,
    getExecutionStatus,
    getExecutionProgress,
    getExecutionCost,
    
    // Execution management
    startTracking,
    stopTracking,
    clearHistory,
    clearExecution,
    
    // Metrics and statistics
    getMetrics,
    getExecutionHistory,
    
    // Utilities
    isExecutionActive,
    isExecutionCompleted,
    getActiveExecutionIds
  };
}

export default useExecutionStatus;