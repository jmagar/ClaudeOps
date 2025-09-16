'use client';

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { CheckCircle, Clock, XCircle, AlertCircle, PlayCircle, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

interface ExecutionStep {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startedAt?: string;
  completedAt?: string;
  duration?: number;
  error?: string;
  metadata?: Record<string, any>;
}

interface ExecutionStepsProps {
  executionId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress?: number;
  className?: string;
}

// Default step definitions for different agent types
const defaultStepDefinitions: Record<string, ExecutionStep[]> = {
  'system-health': [
    {
      id: 'initialization',
      name: 'Initialization',
      description: 'Setting up the health check environment and configuration',
      status: 'pending'
    },
    {
      id: 'system-metrics',
      name: 'System Metrics Collection',
      description: 'Gathering CPU, memory, disk, and network statistics',
      status: 'pending'
    },
    {
      id: 'service-health',
      name: 'Service Health Check',
      description: 'Checking status of critical system services',
      status: 'pending'
    },
    {
      id: 'security-audit',
      name: 'Security Audit',
      description: 'Scanning for security vulnerabilities and updates',
      status: 'pending'
    },
    {
      id: 'ai-analysis',
      name: 'AI Analysis',
      description: 'Processing collected data and generating insights',
      status: 'pending'
    },
    {
      id: 'report-generation',
      name: 'Report Generation',
      description: 'Compiling final health report with recommendations',
      status: 'pending'
    }
  ],
  'docker-janitor': [
    {
      id: 'initialization',
      name: 'Initialization',
      description: 'Setting up Docker environment and permissions',
      status: 'pending'
    },
    {
      id: 'container-scan',
      name: 'Container Analysis',
      description: 'Scanning running and stopped containers',
      status: 'pending'
    },
    {
      id: 'image-analysis',
      name: 'Image Analysis',
      description: 'Identifying unused and outdated images',
      status: 'pending'
    },
    {
      id: 'volume-cleanup',
      name: 'Volume Cleanup',
      description: 'Finding orphaned and unused volumes',
      status: 'pending'
    },
    {
      id: 'cleanup-execution',
      name: 'Cleanup Execution',
      description: 'Performing safe cleanup operations',
      status: 'pending'
    }
  ]
};

// Get step icon based on status
function getStepIcon(status: ExecutionStep['status'], isActive = false) {
  const iconProps = { className: 'h-5 w-5' };
  
  switch (status) {
    case 'completed':
      return <CheckCircle {...iconProps} className="h-5 w-5 text-green-500" />;
    case 'running':
      return isActive 
        ? <Loader2 {...iconProps} className="h-5 w-5 text-blue-500 animate-spin" />
        : <PlayCircle {...iconProps} className="h-5 w-5 text-blue-500" />;
    case 'failed':
      return <XCircle {...iconProps} className="h-5 w-5 text-red-500" />;
    case 'skipped':
      return <AlertCircle {...iconProps} className="h-5 w-5 text-yellow-500" />;
    case 'pending':
    default:
      return <Clock {...iconProps} className="h-5 w-5 text-gray-400" />;
  }
}

// Centralized status-to-style mapping
const statusStyleMap = {
  completed: {
    badgeVariant: 'secondary' as const,
    progressColor: 'bg-green-500',
    iconColor: 'text-green-500'
  },
  running: {
    badgeVariant: 'default' as const,
    progressColor: 'bg-blue-500', 
    iconColor: 'text-blue-500'
  },
  failed: {
    badgeVariant: 'destructive' as const,
    progressColor: 'bg-red-500',
    iconColor: 'text-red-500'
  },
  skipped: {
    badgeVariant: 'outline' as const,
    progressColor: 'bg-yellow-500',
    iconColor: 'text-yellow-500'
  },
  pending: {
    badgeVariant: 'outline' as const,
    progressColor: 'bg-gray-400',
    iconColor: 'text-gray-400'
  }
} as const;

// Get status badge variant
function getStatusBadgeVariant(status: ExecutionStep['status']): 'default' | 'destructive' | 'outline' | 'secondary' {
  return statusStyleMap[status]?.badgeVariant || statusStyleMap.pending.badgeVariant;
}

// Get status progress color
function getStatusProgressColor(status: ExecutionStep['status']): string {
  return statusStyleMap[status]?.progressColor || statusStyleMap.pending.progressColor;
}

// Format duration
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

// Simulate step progression based on execution status and progress
function getSimulatedSteps(
  agentType: string = 'system-health', 
  executionStatus: string, 
  progress: number = 0,
  getStableDuration: (stepId: string, min?: number, max?: number) => number
): ExecutionStep[] {
  const baseSteps = defaultStepDefinitions[agentType] || defaultStepDefinitions['system-health'];
  const steps = baseSteps.map(step => ({ ...step })); // Deep copy
  
  if (executionStatus === 'pending') {
    return steps; // All steps remain pending
  }
  
  // Calculate how many steps should be completed/running based on progress
  const progressRatio = progress / 100;
  const totalSteps = steps.length;
  const completedSteps = Math.floor(progressRatio * totalSteps);
  const currentStepIndex = Math.min(completedSteps, totalSteps - 1);
  
  // Mark completed steps
  for (let i = 0; i < completedSteps && i < totalSteps; i++) {
    steps[i].status = 'completed';
    steps[i].completedAt = new Date(Date.now() - (totalSteps - i) * 10000).toISOString();
    steps[i].duration = getStableDuration(steps[i].id, 5000, 35000);
  }
  
  // Handle current step based on execution status
  if (executionStatus === 'running' && currentStepIndex < totalSteps) {
    steps[currentStepIndex].status = 'running';
    steps[currentStepIndex].startedAt = new Date().toISOString();
  } else if (executionStatus === 'completed') {
    // Mark all steps as completed
    steps.forEach((step, index) => {
      if (step.status !== 'completed') {
        step.status = 'completed';
        step.completedAt = new Date(Date.now() - (totalSteps - index) * 8000).toISOString();
        step.duration = getStableDuration(step.id, 3000, 28000);
      }
    });
  } else if (executionStatus === 'failed') {
    // Mark current step as failed if running
    if (currentStepIndex < totalSteps && steps[currentStepIndex].status !== 'completed') {
      steps[currentStepIndex].status = 'failed';
      steps[currentStepIndex].error = 'Execution failed during this step';
      steps[currentStepIndex].completedAt = new Date().toISOString();
    }
    
    // Mark remaining steps as skipped
    for (let i = currentStepIndex + 1; i < totalSteps; i++) {
      steps[i].status = 'skipped';
    }
  }
  
  return steps;
}

export default function ExecutionSteps({ 
  executionId, 
  status, 
  progress = 0, 
  className = '' 
}: ExecutionStepsProps) {
  const [steps, setSteps] = useState<ExecutionStep[]>([]);
  const [currentTime, setCurrentTime] = useState(Date.now());
  
  // Stable durations map to prevent re-randomization on re-renders
  const durationsMapRef = useRef<Map<string, number>>(new Map());
  
  // Helper to get or create stable duration for a step
  const getStableDuration = (stepId: string, minMs: number = 3000, maxMs: number = 35000): number => {
    const key = `${executionId}-${stepId}`;
    if (!durationsMapRef.current.has(key)) {
      durationsMapRef.current.set(key, Math.random() * (maxMs - minMs) + minMs);
    }
    return durationsMapRef.current.get(key)!;
  };
  
  // Update current time every second for running step duration
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);
  
  // Derive agent type from execution ID or use default
  const agentType = useMemo(() => {
    // In a real implementation, you would fetch this from the execution data
    // For now, we'll use system-health as default
    return 'system-health';
  }, [executionId]);
  
  // Generate/update steps based on execution status and progress
  useEffect(() => {
    const simulatedSteps = getSimulatedSteps(agentType, status, progress, getStableDuration);
    setSteps(simulatedSteps);
  }, [agentType, status, progress, getStableDuration]);
  
  // Calculate overall statistics
  const stepStats = useMemo(() => {
    const completed = steps.filter(step => step.status === 'completed').length;
    const running = steps.filter(step => step.status === 'running').length;
    const failed = steps.filter(step => step.status === 'failed').length;
    const totalDuration = steps
      .filter(step => step.duration)
      .reduce((sum, step) => sum + (step.duration || 0), 0);
    
    return {
      total: steps.length,
      completed,
      running,
      failed,
      totalDuration: totalDuration > 0 ? formatDuration(totalDuration) : null
    };
  }, [steps]);
  
  // Get running step duration
  const getRunningStepDuration = (step: ExecutionStep): string => {
    if (step.status !== 'running' || !step.startedAt) return '';
    
    const startTime = new Date(step.startedAt).getTime();
    const duration = currentTime - startTime;
    return formatDuration(duration);
  };
  
  return (
    <div className={`space-y-4 ${className}`}>
      {/* Progress Overview */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">
            Progress: {stepStats.completed} of {stepStats.total} steps
          </span>
          {stepStats.totalDuration && (
            <span className="text-sm text-gray-500">
              Total time: {stepStats.totalDuration}
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {stepStats.running > 0 && (
            <Badge variant="default" className="text-xs">
              {stepStats.running} Running
            </Badge>
          )}
          {stepStats.failed > 0 && (
            <Badge variant="destructive" className="text-xs">
              {stepStats.failed} Failed
            </Badge>
          )}
        </div>
      </div>
      
      {/* Overall Progress Bar */}
      <div className="mb-6">
        <Progress 
          value={progress} 
          className="h-2"
          indicatorClassName={getStatusProgressColor(status as ExecutionStep['status'])}
        />
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>0%</span>
          <span className="font-medium">{Math.round(progress)}%</span>
          <span>100%</span>
        </div>
      </div>
      
      {/* Step List */}
      <div className="space-y-3">
        {steps.map((step, index) => {
          const isLastStep = index === steps.length - 1;
          const isRunning = step.status === 'running';
          
          return (
            <div key={step.id} className="relative">
              {/* Step connector line */}
              {!isLastStep && (
                <div className="absolute left-6 top-8 w-px h-8 bg-gray-200" />
              )}
              
              {/* Step content */}
              <div className="flex items-start gap-3 p-3 rounded-lg border bg-white hover:bg-gray-50 transition-colors">
                {/* Step icon */}
                <div className="flex-shrink-0 mt-0.5">
                  {getStepIcon(step.status, isRunning)}
                </div>
                
                {/* Step details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-medium text-gray-900">{step.name}</h4>
                    <Badge variant={getStatusBadgeVariant(step.status)} className="text-xs">
                      {step.status}
                    </Badge>
                  </div>
                  
                  <p className="text-sm text-gray-600 mb-2">{step.description}</p>
                  
                  {/* Step metadata */}
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    {step.startedAt && (
                      <span>Started: {new Date(step.startedAt).toLocaleTimeString()}</span>
                    )}
                    
                    {step.completedAt && step.status === 'completed' && (
                      <span>Completed: {new Date(step.completedAt).toLocaleTimeString()}</span>
                    )}
                    
                    {step.duration && step.status === 'completed' && (
                      <span>Duration: {formatDuration(step.duration)}</span>
                    )}
                    
                    {isRunning && (
                      <span className="text-blue-600 font-medium">
                        Running: {getRunningStepDuration(step)}
                      </span>
                    )}
                  </div>
                  
                  {/* Error message */}
                  {step.error && (
                    <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                      {step.error}
                    </div>
                  )}
                </div>
                
                {/* Step number */}
                <div className="flex-shrink-0 text-xs text-gray-400 font-mono">
                  {(index + 1).toString().padStart(2, '0')}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      
      {/* Empty state */}
      {steps.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <Clock className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <div className="text-lg font-medium">No execution steps available</div>
          <div className="text-sm">Steps will appear when the execution starts</div>
        </div>
      )}
    </div>
  );
}