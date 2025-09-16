'use client';

import { useCallback, useEffect, useState } from 'react';
import { useWebSocketContext } from '../lib/contexts/WebSocketContext';
import { SystemStatusMessage } from '../lib/websocket/messageTypes';

export interface SystemHealth {
  status: 'healthy' | 'warning' | 'error';
  lastUpdate: string;
  details: {
    cpu?: number;
    memory?: number;
    disk?: number;
    services?: Array<{ name: string; status: string }>;
  };
}

export interface SystemMetrics {
  cpu: {
    current: number;
    average: number;
    peak: number;
    history: Array<{ timestamp: string; value: number }>;
  };
  memory: {
    current: number;
    average: number;
    peak: number;
    history: Array<{ timestamp: string; value: number }>;
  };
  disk: {
    current: number;
    average: number;
    peak: number;
    history: Array<{ timestamp: string; value: number }>;
  };
}

export interface ServiceStatus {
  name: string;
  status: string;
  lastSeen: string;
  uptime?: number;
  healthCheck?: {
    endpoint: string;
    lastCheck: string;
    responseTime: number;
    success: boolean;
  };
}

export interface SystemAlerts {
  cpu: { active: boolean; threshold: number; current: number } | null;
  memory: { active: boolean; threshold: number; current: number } | null;
  disk: { active: boolean; threshold: number; current: number } | null;
  services: ServiceStatus[];
}

export interface UseSystemStatusOptions {
  metricsHistorySize?: number;
  alertThresholds?: {
    cpu?: number;
    memory?: number;
    disk?: number;
  };
  enableAlerts?: boolean;
}

export interface UseSystemStatusReturn {
  // Current system state
  systemHealth: SystemHealth | null;
  systemMetrics: SystemMetrics;
  services: ServiceStatus[];
  alerts: SystemAlerts;
  
  // Status checks
  isHealthy: boolean;
  hasWarnings: boolean;
  hasErrors: boolean;
  isConnected: boolean;
  
  // Metrics queries
  getCpuUsage: () => number;
  getMemoryUsage: () => number;
  getDiskUsage: () => number;
  getServiceStatus: (serviceName: string) => ServiceStatus | null;
  getMetricsHistory: (metric: 'cpu' | 'memory' | 'disk', hours?: number) => Array<{ timestamp: string; value: number }>;
  
  // Alert management
  acknowledgeAlert: (type: 'cpu' | 'memory' | 'disk') => void;
  getActiveAlerts: () => Array<{ type: string; message: string; severity: 'warning' | 'error' }>;
  
  // Utilities
  clearHistory: () => void;
  exportMetrics: (format?: 'json' | 'csv') => string;
  requestSystemStatus: () => boolean;
}

const DEFAULT_THRESHOLDS = {
  cpu: 80,
  memory: 85,
  disk: 90
};

export function useSystemStatus(options: UseSystemStatusOptions = {}): UseSystemStatusReturn {
  const {
    metricsHistorySize = 100,
    alertThresholds = DEFAULT_THRESHOLDS,
    enableAlerts = true
  } = options;

  const { lastMessage, sendMessage, isConnected } = useWebSocketContext();
  
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [systemMetrics, setSystemMetrics] = useState<SystemMetrics>({
    cpu: { current: 0, average: 0, peak: 0, history: [] },
    memory: { current: 0, average: 0, peak: 0, history: [] },
    disk: { current: 0, average: 0, peak: 0, history: [] }
  });
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [acknowledgedAlerts, setAcknowledgedAlerts] = useState<Set<string>>(new Set());

  // Handle incoming WebSocket messages
  useEffect(() => {
    if (!lastMessage || lastMessage.type !== 'system:status') return;

    handleSystemStatusMessage(lastMessage as SystemStatusMessage);
  }, [lastMessage]);

  // Handle system status message
  const handleSystemStatusMessage = useCallback((message: SystemStatusMessage) => {
    const timestamp = message.timestamp;
    
    // Update system health
    setSystemHealth({
      status: message.status,
      lastUpdate: timestamp,
      details: message.details || {}
    });

    // Update metrics if details are provided
    if (message.details) {
      setSystemMetrics(prev => {
        const newMetrics = { ...prev };
        const details = message.details!;
        
        // Update CPU metrics
        if (typeof details.cpu === 'number') {
          const cpuHistory = [...prev.cpu.history, { timestamp, value: details.cpu }]
            .slice(-metricsHistorySize);
          
          newMetrics.cpu = {
            current: details.cpu,
            average: calculateAverage(cpuHistory.map(h => h.value)),
            peak: Math.max(prev.cpu.peak, details.cpu),
            history: cpuHistory
          };
        }

        // Update Memory metrics
        if (typeof details.memory === 'number') {
          const memoryHistory = [...prev.memory.history, { timestamp, value: details.memory }]
            .slice(-metricsHistorySize);
          
          newMetrics.memory = {
            current: details.memory,
            average: calculateAverage(memoryHistory.map(h => h.value)),
            peak: Math.max(prev.memory.peak, details.memory),
            history: memoryHistory
          };
        }

        // Update Disk metrics
        if (typeof details.disk === 'number') {
          const diskHistory = [...prev.disk.history, { timestamp, value: details.disk }]
            .slice(-metricsHistorySize);
          
          newMetrics.disk = {
            current: details.disk,
            average: calculateAverage(diskHistory.map(h => h.value)),
            peak: Math.max(prev.disk.peak, details.disk),
            history: diskHistory
          };
        }

        return newMetrics;
      });

      // Update services if provided
      if (message.details.services) {
        setServices(prev => {
          const newServices: ServiceStatus[] = [];
          const services = message.details!.services!;
          
          for (const service of services) {
            const existingService = prev.find(s => s.name === service.name);
            const serviceStatus: ServiceStatus = {
              name: service.name,
              status: service.status,
              lastSeen: timestamp,
              uptime: existingService?.uptime // Preserve uptime if we had it
            };
            newServices.push(serviceStatus);
          }
          
          return newServices;
        });
      }
    }

    console.debug('System status updated:', message.status, message.details);
  }, [metricsHistorySize]);

  // Calculate average from array of numbers
  const calculateAverage = (values: number[]): number => {
    if (values.length === 0) return 0;
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  };

  // Generate alerts based on current metrics and thresholds
  const cpuThreshold = alertThresholds.cpu ?? DEFAULT_THRESHOLDS.cpu;
  const memoryThreshold = alertThresholds.memory ?? DEFAULT_THRESHOLDS.memory;
  const diskThreshold = alertThresholds.disk ?? DEFAULT_THRESHOLDS.disk;

  const alerts: SystemAlerts = {
    cpu: systemMetrics.cpu.current > cpuThreshold && enableAlerts && !acknowledgedAlerts.has('cpu')
      ? { active: true, threshold: cpuThreshold, current: systemMetrics.cpu.current }
      : null,
    memory: systemMetrics.memory.current > memoryThreshold && enableAlerts && !acknowledgedAlerts.has('memory')
      ? { active: true, threshold: memoryThreshold, current: systemMetrics.memory.current }
      : null,
    disk: systemMetrics.disk.current > diskThreshold && enableAlerts && !acknowledgedAlerts.has('disk')
      ? { active: true, threshold: diskThreshold, current: systemMetrics.disk.current }
      : null,
    services: services.filter(service => service.status !== 'healthy' && service.status !== 'running')
  };

  // Status checks
  const isHealthy = systemHealth?.status === 'healthy';
  const hasWarnings = systemHealth?.status === 'warning' || Boolean(alerts.cpu) || Boolean(alerts.memory);
  const hasErrors = systemHealth?.status === 'error' || Boolean(alerts.disk) || alerts.services.length > 0;

  // Query functions
  const getCpuUsage = useCallback((): number => {
    return systemMetrics.cpu.current;
  }, [systemMetrics.cpu.current]);

  const getMemoryUsage = useCallback((): number => {
    return systemMetrics.memory.current;
  }, [systemMetrics.memory.current]);

  const getDiskUsage = useCallback((): number => {
    return systemMetrics.disk.current;
  }, [systemMetrics.disk.current]);

  const getServiceStatus = useCallback((serviceName: string): ServiceStatus | null => {
    return services.find(service => service.name === serviceName) || null;
  }, [services]);

  const getMetricsHistory = useCallback((
    metric: 'cpu' | 'memory' | 'disk', 
    hours: number = 1
  ): Array<{ timestamp: string; value: number }> => {
    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
    return systemMetrics[metric].history.filter(
      item => new Date(item.timestamp) >= cutoffTime
    );
  }, [systemMetrics]);

  // Alert management
  const acknowledgeAlert = useCallback((type: 'cpu' | 'memory' | 'disk') => {
    setAcknowledgedAlerts(prev => new Set(prev).add(type));
    
    // Auto-clear acknowledgment after 30 minutes
    setTimeout(() => {
      setAcknowledgedAlerts(prev => {
        const newSet = new Set(prev);
        newSet.delete(type);
        return newSet;
      });
    }, 30 * 60 * 1000);
  }, []);

  const getActiveAlerts = useCallback((): Array<{ type: string; message: string; severity: 'warning' | 'error' }> => {
    const activeAlerts: Array<{ type: string; message: string; severity: 'warning' | 'error' }> = [];

    if (alerts.cpu?.active) {
      activeAlerts.push({
        type: 'cpu',
        message: `CPU usage (${alerts.cpu.current}%) exceeds threshold (${alerts.cpu.threshold}%)`,
        severity: 'warning' as const
      });
    }

    if (alerts.memory?.active) {
      activeAlerts.push({
        type: 'memory',
        message: `Memory usage (${alerts.memory.current}%) exceeds threshold (${alerts.memory.threshold}%)`,
        severity: 'warning' as const
      });
    }

    if (alerts.disk?.active) {
      activeAlerts.push({
        type: 'disk',
        message: `Disk usage (${alerts.disk.current}%) exceeds threshold (${alerts.disk.threshold}%)`,
        severity: 'error' as const
      });
    }

    for (const service of alerts.services) {
      const severity: 'error' | 'warning' = service.status === 'failed' ? 'error' : 'warning';
      activeAlerts.push({
        type: 'service',
        message: `Service ${service.name} is ${service.status}`,
        severity
      });
    }

    return activeAlerts;
  }, [alerts]);

  // Utilities
  const clearHistory = useCallback(() => {
    setSystemMetrics({
      cpu: { current: 0, average: 0, peak: 0, history: [] },
      memory: { current: 0, average: 0, peak: 0, history: [] },
      disk: { current: 0, average: 0, peak: 0, history: [] }
    });
    setAcknowledgedAlerts(new Set());
    console.log('System metrics history cleared');
  }, []);

  const exportMetrics = useCallback((format: 'json' | 'csv' = 'json'): string => {
    if (format === 'json') {
      return JSON.stringify({
        systemHealth,
        systemMetrics,
        services,
        exportedAt: new Date().toISOString()
      }, null, 2);
    } else {
      // CSV format
      const lines = ['timestamp,metric,value'];
      
      systemMetrics.cpu.history.forEach(item => {
        lines.push(`${item.timestamp},cpu,${item.value}`);
      });
      
      systemMetrics.memory.history.forEach(item => {
        lines.push(`${item.timestamp},memory,${item.value}`);
      });
      
      systemMetrics.disk.history.forEach(item => {
        lines.push(`${item.timestamp},disk,${item.value}`);
      });
      
      return lines.join('\n');
    }
  }, [systemHealth, systemMetrics, services]);

  const requestSystemStatus = useCallback((): boolean => {
    // We can't use agent:status for system status, use ping instead to keep connection alive
    return sendMessage({ type: 'ping' });
  }, [sendMessage]);

  // Auto-request system status periodically when connected
  useEffect(() => {
    if (!isConnected) return;

    const interval = setInterval(() => {
      requestSystemStatus();
    }, 30000); // Request every 30 seconds

    // Initial request
    requestSystemStatus();

    return () => clearInterval(interval);
  }, [isConnected, requestSystemStatus]);

  return {
    // Current system state
    systemHealth,
    systemMetrics,
    services,
    alerts,
    
    // Status checks
    isHealthy,
    hasWarnings,
    hasErrors,
    isConnected,
    
    // Metrics queries
    getCpuUsage,
    getMemoryUsage,
    getDiskUsage,
    getServiceStatus,
    getMetricsHistory,
    
    // Alert management
    acknowledgeAlert,
    getActiveAlerts,
    
    // Utilities
    clearHistory,
    exportMetrics,
    requestSystemStatus
  };
}

export default useSystemStatus;