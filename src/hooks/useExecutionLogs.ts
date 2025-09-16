'use client';

import { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import { useWebSocketContext } from '../lib/contexts/WebSocketContext';
import { ExecutionLogMessage, ServerMessage } from '../lib/websocket/messageTypes';

export interface LogEntry {
  id: string;
  executionId: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  source?: string;
  timestamp: string;
}

export interface LogStreamOptions {
  executionId?: string;
  maxLogs?: number;
  autoScroll?: boolean;
  filterLevel?: 'info' | 'warn' | 'error' | 'debug';
  filterSource?: string;
  bufferSize?: number;
}

export interface UseExecutionLogsReturn {
  logs: LogEntry[];
  filteredLogs: LogEntry[];
  isStreaming: boolean;
  executionId: string | null;
  
  // Subscription management
  subscribeToExecution: (executionId: string) => boolean;
  unsubscribeFromExecution: (executionId?: string) => boolean;
  
  // Log management
  clearLogs: () => void;
  exportLogs: (format?: 'json' | 'text') => string;
  
  // Filtering and search
  setFilterLevel: (level: 'info' | 'warn' | 'error' | 'debug' | null) => void;
  setFilterSource: (source: string | null) => void;
  searchLogs: (query: string) => LogEntry[];
  
  // Statistics
  getLogStats: () => {
    total: number;
    byLevel: Record<string, number>;
    bySources: Record<string, number>;
    timeRange: { start: string | null; end: string | null };
  };
  
  // Virtual scrolling support
  getVirtualizedLogs: (startIndex: number, endIndex: number) => LogEntry[];
}

export function useExecutionLogs(options: LogStreamOptions = {}): UseExecutionLogsReturn {
  const {
    executionId: initialExecutionId,
    maxLogs = 1000,
    autoScroll = true,
    filterLevel,
    filterSource,
    bufferSize = 100
  } = options;

  const { lastMessage, subscribeToExecution: wsSubscribe, unsubscribeFromExecution: wsUnsubscribe, isConnected } = useWebSocketContext();
  
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [currentExecutionId, setCurrentExecutionId] = useState<string | null>(initialExecutionId || null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentFilterLevel, setCurrentFilterLevel] = useState<'info' | 'warn' | 'error' | 'debug' | null>(filterLevel || null);
  const [currentFilterSource, setCurrentFilterSource] = useState<string | null>(filterSource || null);
  
  const logBuffer = useRef<LogEntry[]>([]);
  const flushTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const subscriptionRef = useRef<string | null>(null);

  // Auto-subscribe to initial execution ID
  useEffect(() => {
    if (initialExecutionId && isConnected && subscriptionRef.current !== initialExecutionId) {
      const success = wsSubscribe(initialExecutionId);
      if (success) {
        setCurrentExecutionId(initialExecutionId);
        subscriptionRef.current = initialExecutionId;
        setIsStreaming(true);
        console.log(`Subscribed to execution logs: ${initialExecutionId}`);
      }
    }
  }, [initialExecutionId, isConnected, wsSubscribe]);

  // Handle incoming WebSocket messages
  useEffect(() => {
    if (!lastMessage) return;

    switch (lastMessage.type) {
      case 'execution:log':
        handleLogMessage(lastMessage as ExecutionLogMessage);
        break;
      
      case 'execution:started':
        if ('executionId' in lastMessage && lastMessage.executionId === currentExecutionId) {
          setIsStreaming(true);
          console.log(`Execution started: ${lastMessage.executionId}`);
        }
        break;
      
      case 'execution:completed':
      case 'execution:failed':
        if ('executionId' in lastMessage && lastMessage.executionId === currentExecutionId) {
          setIsStreaming(false);
          flushLogBuffer(); // Ensure all logs are displayed
          console.log(`Execution ended: ${lastMessage.executionId}`);
        }
        break;
    }
  }, [lastMessage, currentExecutionId]);

  // Handle log message and add to buffer
  const handleLogMessage = useCallback((logMessage: ExecutionLogMessage) => {
    if (currentExecutionId && logMessage.executionId !== currentExecutionId) {
      return; // Ignore logs from other executions
    }

    const logEntry: LogEntry = {
      id: `${logMessage.executionId}-${logMessage.timestamp}-${Math.random().toString(36).substr(2, 9)}`,
      executionId: logMessage.executionId,
      level: logMessage.level,
      message: logMessage.message,
      source: logMessage.source,
      timestamp: logMessage.timestamp
    };

    // Add to buffer
    logBuffer.current.push(logEntry);

    // Flush buffer if it reaches the buffer size or set a timeout
    if (logBuffer.current.length >= bufferSize) {
      flushLogBuffer();
    } else if (!flushTimeoutRef.current) {
      flushTimeoutRef.current = setTimeout(() => {
        flushLogBuffer();
      }, 100); // Flush after 100ms
    }
  }, [currentExecutionId, bufferSize]);

  // Flush the log buffer to the main logs array
  const flushLogBuffer = useCallback(() => {
    if (flushTimeoutRef.current) {
      clearTimeout(flushTimeoutRef.current);
      flushTimeoutRef.current = null;
    }

    if (logBuffer.current.length === 0) return;

    const newLogs = [...logBuffer.current];
    logBuffer.current = [];

    setLogs(prevLogs => {
      const combined = [...prevLogs, ...newLogs];
      // Maintain max logs limit
      return combined.length > maxLogs 
        ? combined.slice(-maxLogs)
        : combined;
    });
  }, [maxLogs]);

  // Subscribe to execution logs
  const subscribeToExecution = useCallback((executionId: string): boolean => {
    if (subscriptionRef.current) {
      // Unsubscribe from current execution
      wsUnsubscribe(subscriptionRef.current);
    }

    const success = wsSubscribe(executionId);
    if (success) {
      setCurrentExecutionId(executionId);
      subscriptionRef.current = executionId;
      setIsStreaming(true);
      setLogs([]); // Clear previous logs
      console.log(`Subscribed to execution logs: ${executionId}`);
    }

    return success;
  }, [wsSubscribe, wsUnsubscribe]);

  // Unsubscribe from execution logs
  const unsubscribeFromExecution = useCallback((executionId?: string): boolean => {
    const targetExecutionId = executionId || currentExecutionId;
    if (!targetExecutionId) return false;

    const success = wsUnsubscribe(targetExecutionId);
    if (success) {
      if (targetExecutionId === currentExecutionId) {
        setCurrentExecutionId(null);
        setIsStreaming(false);
      }
      subscriptionRef.current = null;
      console.log(`Unsubscribed from execution logs: ${targetExecutionId}`);
    }

    return success;
  }, [currentExecutionId, wsUnsubscribe]);

  // Clear all logs
  const clearLogs = useCallback(() => {
    setLogs([]);
    logBuffer.current = [];
    if (flushTimeoutRef.current) {
      clearTimeout(flushTimeoutRef.current);
      flushTimeoutRef.current = null;
    }
  }, []);

  // Export logs in different formats
  const exportLogs = useCallback((format: 'json' | 'text' = 'json'): string => {
    if (format === 'json') {
      return JSON.stringify(logs, null, 2);
    } else {
      return logs.map(log => 
        `[${log.timestamp}] [${log.level.toUpperCase()}] ${log.source ? `[${log.source}] ` : ''}${log.message}`
      ).join('\n');
    }
  }, [logs]);

  // Filter logs based on level and source
  const filteredLogs = useMemo(() => {
    let filtered = logs;

    if (currentFilterLevel) {
      const levelPriority = { debug: 0, info: 1, warn: 2, error: 3 };
      const minPriority = levelPriority[currentFilterLevel];
      filtered = filtered.filter(log => levelPriority[log.level] >= minPriority);
    }

    if (currentFilterSource) {
      filtered = filtered.filter(log => 
        log.source?.toLowerCase().includes(currentFilterSource.toLowerCase())
      );
    }

    return filtered;
  }, [logs, currentFilterLevel, currentFilterSource]);

  // Search logs
  const searchLogs = useCallback((query: string): LogEntry[] => {
    if (!query.trim()) return filteredLogs;

    const lowerQuery = query.toLowerCase();
    return filteredLogs.filter(log =>
      log.message.toLowerCase().includes(lowerQuery) ||
      log.source?.toLowerCase().includes(lowerQuery) ||
      log.level.toLowerCase().includes(lowerQuery)
    );
  }, [filteredLogs]);

  // Get log statistics
  const getLogStats = useCallback(() => {
    const byLevel: Record<string, number> = { debug: 0, info: 0, warn: 0, error: 0 };
    const bySources: Record<string, number> = {};
    let startTime: string | null = null;
    let endTime: string | null = null;

    for (const log of logs) {
      byLevel[log.level]++;
      
      if (log.source) {
        bySources[log.source] = (bySources[log.source] || 0) + 1;
      }

      if (!startTime || log.timestamp < startTime) {
        startTime = log.timestamp;
      }
      if (!endTime || log.timestamp > endTime) {
        endTime = log.timestamp;
      }
    }

    return {
      total: logs.length,
      byLevel,
      bySources,
      timeRange: { start: startTime, end: endTime }
    };
  }, [logs]);

  // Get virtualized logs for performance with large datasets
  const getVirtualizedLogs = useCallback((startIndex: number, endIndex: number): LogEntry[] => {
    return filteredLogs.slice(startIndex, endIndex + 1);
  }, [filteredLogs]);

  // Filter control functions
  const setFilterLevel = useCallback((level: 'info' | 'warn' | 'error' | 'debug' | null) => {
    setCurrentFilterLevel(level);
  }, []);

  const setFilterSource = useCallback((source: string | null) => {
    setCurrentFilterSource(source);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (flushTimeoutRef.current) {
        clearTimeout(flushTimeoutRef.current);
      }
      if (subscriptionRef.current) {
        wsUnsubscribe(subscriptionRef.current);
      }
    };
  }, [wsUnsubscribe]);

  return {
    logs,
    filteredLogs,
    isStreaming,
    executionId: currentExecutionId,
    
    // Subscription management
    subscribeToExecution,
    unsubscribeFromExecution,
    
    // Log management
    clearLogs,
    exportLogs,
    
    // Filtering and search
    setFilterLevel,
    setFilterSource,
    searchLogs,
    
    // Statistics
    getLogStats,
    
    // Virtual scrolling support
    getVirtualizedLogs
  };
}

export default useExecutionLogs;