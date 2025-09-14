'use client';

import { useEffect, useState } from 'react';
import { useExecutionStatus } from '@/hooks/useExecutionStatus';
import { useExecutionLogs } from '@/hooks/useExecutionLogs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui';
import { Badge } from '@/components/ui';
import LogViewer from './LogViewer';
import ExecutionSteps from './ExecutionSteps';
import ExecutionActions from './ExecutionActions';
import CostTracker from './CostTracker';

interface ExecutionDetailProps {
  executionId: string;
}

interface ExecutionData {
  id: string;
  agentType: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt: string;
  completedAt?: string;
  costUsd?: number;
  durationMs?: number;
  resultSummary?: string;
  aiAnalysis?: any;
  logs?: string;
}

// Helper function to format duration
function formatDuration(durationMs: number): string {
  const seconds = Math.floor(durationMs / 1000);
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

// Helper function to get status variant
function getStatusVariant(status: string): 'default' | 'destructive' | 'outline' | 'secondary' {
  switch (status) {
    case 'running':
      return 'default';
    case 'completed':
      return 'secondary';
    case 'failed':
    case 'cancelled':
      return 'destructive';
    default:
      return 'outline';
  }
}

// Helper function to get status color
function getStatusColor(status: string): string {
  switch (status) {
    case 'running':
      return 'text-blue-600';
    case 'completed':
      return 'text-green-600';
    case 'failed':
      return 'text-red-600';
    case 'cancelled':
      return 'text-orange-600';
    default:
      return 'text-gray-600';
  }
}

export default function ExecutionDetail({ executionId }: ExecutionDetailProps) {
  const [executionData, setExecutionData] = useState<ExecutionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Use execution status hook for real-time updates
  const {
    getExecution,
    getExecutionStatus,
    getExecutionProgress,
    getExecutionCost,
    isExecutionActive,
    startTracking
  } = useExecutionStatus({ trackAll: true });

  // Use execution logs hook for real-time log streaming
  const {
    logs,
    isStreaming,
    subscribeToExecution
  } = useExecutionLogs({ 
    executionId,
    maxLogs: 1000,
    autoScroll: true
  });

  // Get real-time execution data
  const realtimeExecution = getExecution(executionId);
  const currentStatus = getExecutionStatus(executionId);
  const currentProgress = getExecutionProgress(executionId);
  const currentCost = getExecutionCost(executionId);

  // Fetch initial execution data
  useEffect(() => {
    async function fetchExecutionData() {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`/api/executions/${executionId}`);
        if (!response.ok) {
          if (response.status === 404) {
            setError('Execution not found');
            return;
          }
          throw new Error(`Failed to fetch execution: ${response.statusText}`);
        }

        const data: ExecutionData = await response.json();
        setExecutionData(data);

        // Start tracking this execution for real-time updates
        startTracking(executionId, data.agentType);

        // Subscribe to logs if execution is active
        if (data.status === 'running' || data.status === 'pending') {
          subscribeToExecution(executionId);
        }
      } catch (err) {
        console.error('Failed to fetch execution data:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch execution data');
      } finally {
        setLoading(false);
      }
    }

    fetchExecutionData();
  }, [executionId, startTracking, subscribeToExecution]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2 text-gray-600">Loading execution details...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="text-red-600 text-lg font-medium mb-2">Error</div>
        <div className="text-gray-600 mb-4">{error}</div>
        <button 
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!executionData) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-600">Execution not found</div>
      </div>
    );
  }

  // Merge static data with real-time data
  const displayStatus = currentStatus || executionData.status;
  const displayProgress = currentProgress;
  const isActive = isExecutionActive(executionId);
  const costData = currentCost || { 
    current: executionData.costUsd || 0, 
    total: executionData.costUsd || 0 
  };

  // Calculate duration
  const durationMs = executionData.completedAt
    ? new Date(executionData.completedAt).getTime() - new Date(executionData.startedAt).getTime()
    : realtimeExecution?.duration || executionData.durationMs || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            Execution {executionId.substring(0, 8)}
          </h1>
          <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
            <span>Agent: <span className="font-medium">{executionData.agentType}</span></span>
            <span>Started: {new Date(executionData.startedAt).toLocaleString()}</span>
            {durationMs > 0 && (
              <span>Duration: {formatDuration(durationMs)}</span>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <Badge variant={getStatusVariant(displayStatus)} className="text-sm">
            <div className={`w-2 h-2 rounded-full mr-2 ${
              displayStatus === 'running' ? 'bg-blue-500 animate-pulse' : 
              displayStatus === 'completed' ? 'bg-green-500' : 
              displayStatus === 'failed' ? 'bg-red-500' : 'bg-gray-400'
            }`} />
            {displayStatus.charAt(0).toUpperCase() + displayStatus.slice(1)}
          </Badge>
          
          <ExecutionActions 
            executionId={executionId}
            status={displayStatus}
            agentType={executionData.agentType}
            isActive={isActive}
          />
        </div>
      </div>

      {/* Progress Bar (if active) */}
      {isActive && displayProgress > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium">Progress</span>
              <span className="text-sm text-gray-600">{Math.round(displayProgress)}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${displayProgress}%` }}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Logs and Steps */}
        <div className="lg:col-span-2 space-y-6">
          {/* Real-time Log Viewer */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Execution Logs
                {isStreaming && (
                  <Badge variant="outline" className="text-xs">
                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full mr-1 animate-pulse" />
                    Live
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                Real-time logs from the agent execution process
              </CardDescription>
            </CardHeader>
            <CardContent>
              <LogViewer 
                executionId={executionId}
                logs={logs}
                isStreaming={isStreaming}
                height={400}
              />
            </CardContent>
          </Card>
          
          {/* Execution Steps */}
          <Card>
            <CardHeader>
              <CardTitle>Execution Steps</CardTitle>
              <CardDescription>
                Progress through the agent execution workflow
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ExecutionSteps 
                executionId={executionId}
                status={displayStatus}
                progress={displayProgress}
              />
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Cost and Metadata */}
        <div className="space-y-6">
          {/* Cost Tracker */}
          <CostTracker 
            executionId={executionId}
            cost={costData}
            agentType={executionData.agentType}
          />

          {/* Execution Metadata */}
          <Card>
            <CardHeader>
              <CardTitle>Execution Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Execution ID:</span>
                <span className="font-mono text-xs">{executionId}</span>
              </div>
              
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Agent Type:</span>
                <span className="font-medium">{executionData.agentType}</span>
              </div>
              
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Status:</span>
                <span className={`font-medium ${getStatusColor(displayStatus)}`}>
                  {displayStatus.charAt(0).toUpperCase() + displayStatus.slice(1)}
                </span>
              </div>
              
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Started At:</span>
                <span>{new Date(executionData.startedAt).toLocaleString()}</span>
              </div>
              
              {executionData.completedAt && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Completed At:</span>
                  <span>{new Date(executionData.completedAt).toLocaleString()}</span>
                </div>
              )}
              
              {durationMs > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Duration:</span>
                  <span>{formatDuration(durationMs)}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Result Summary (if completed) */}
          {executionData.resultSummary && (
            <Card>
              <CardHeader>
                <CardTitle>Result Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">
                  {executionData.resultSummary}
                </p>
              </CardContent>
            </Card>
          )}

          {/* AI Analysis (if available) */}
          {executionData.aiAnalysis && (
            <Card>
              <CardHeader>
                <CardTitle>AI Analysis</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm space-y-2">
                  {executionData.aiAnalysis.summary && (
                    <div>
                      <span className="font-medium">Summary:</span>
                      <p className="text-gray-700 mt-1">{executionData.aiAnalysis.summary}</p>
                    </div>
                  )}
                  
                  {executionData.aiAnalysis.recommendations?.length > 0 && (
                    <div>
                      <span className="font-medium">Recommendations:</span>
                      <ul className="list-disc list-inside text-gray-700 mt-1 space-y-1">
                        {executionData.aiAnalysis.recommendations.map((rec: string, index: number) => (
                          <li key={index} className="text-sm">{rec}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}