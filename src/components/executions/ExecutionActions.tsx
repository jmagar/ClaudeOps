'use client';

import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Play, 
  Square, 
  RotateCcw, 
  Download, 
  Share2, 
  Copy, 
  ExternalLink, 
  AlertTriangle,
  Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';

// Fetch with timeout helper to prevent hanging requests
const fetchWithTimeout = async (
  url: string, 
  options: RequestInit = {}, 
  timeoutMs: number = 15000
): Promise<Response> => {
  const controller = new AbortController();
  let timeoutId: NodeJS.Timeout | undefined;

  try {
    // Set up timeout
    timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    // Add abort signal to options
    const fetchOptions: RequestInit = {
      ...options,
      signal: controller.signal
    };
    
    const response = await fetch(url, fetchOptions);
    return response;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};

interface ExecutionActionsProps {
  executionId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  agentType: string;
  isActive: boolean;
  className?: string;
}

interface ActionState {
  cancelling: boolean;
  restarting: boolean;
  sharing: boolean;
}

export default function ExecutionActions({
  executionId,
  status,
  agentType,
  isActive,
  className = ''
}: ExecutionActionsProps) {
  const router = useRouter();
  const [actionState, setActionState] = useState<ActionState>({
    cancelling: false,
    restarting: false,
    sharing: false
  });
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showRestartDialog, setShowRestartDialog] = useState(false);

  // Handle execution cancellation
  const handleCancel = useCallback(async () => {
    setActionState(prev => ({ ...prev, cancelling: true }));
    
    try {
      const response = await fetchWithTimeout(`/api/executions/${executionId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (!response.ok) {
        let message = 'Failed to cancel execution';
        try {
          const data = await response.clone().json();
          if (typeof data?.message === 'string' && data.message.trim()) {
            message = data.message;
          }
        } catch {
          try {
            const text = await response.text();
            if (text) message = text;
          } catch {}
        }
        throw new Error(message);
      }
      
      toast.success('Execution Cancelled', {
        description: `Successfully cancelled execution ${executionId.substring(0, 8)}`
      });
      
      // Refresh the page to show updated status
      router.refresh();
      
    } catch (error) {
      console.error('Failed to cancel execution:', error);
      toast.error('Cancellation Failed', {
        description: error instanceof Error ? error.message : 'Failed to cancel execution'
      });
    } finally {
      setActionState(prev => ({ ...prev, cancelling: false }));
      setShowCancelDialog(false);
    }
  }, [executionId, router]);

  // Handle execution restart
  const handleRestart = useCallback(async () => {
    setActionState(prev => ({ ...prev, restarting: true }));
    
    try {
      const response = await fetchWithTimeout('/api/agents/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: agentType,
          config: {} // Use default configuration
        })
      });
      
      if (!response.ok) {
        let message = 'Failed to restart execution';
        try {
          const data = await response.clone().json();
          if (typeof data?.message === 'string' && data.message.trim()) {
            message = data.message;
          }
        } catch {
          try {
            const text = await response.text();
            if (text) message = text;
          } catch {}
        }
        throw new Error(message);
      }
      
      const result = (await response.json()) as { executionId?: string };
      if (!result?.executionId || typeof result.executionId !== 'string') {
        throw new Error('Missing executionId in response');
      }
      
      toast.success('Execution Restarted', {
        description: `Started new execution with ID ${result.executionId.substring(0, 8)}`
      });
      
      // Navigate to the new execution
      router.push(`/executions/${result.executionId}`);
      
    } catch (error) {
      console.error('Failed to restart execution:', error);
      toast.error('Restart Failed', {
        description: error instanceof Error ? error.message : 'Failed to restart execution'
      });
    } finally {
      setActionState(prev => ({ ...prev, restarting: false }));
      setShowRestartDialog(false);
    }
  }, [agentType, router]);

  // Handle sharing execution
  const handleShare = useCallback(async () => {
    setActionState(prev => ({ ...prev, sharing: true }));
    
    try {
      const shareUrl = `${window.location.origin}/executions/${executionId}`;
      
      if (navigator.share) {
        // Use native sharing if available
        await navigator.share({
          title: `ClaudeOps Execution ${executionId.substring(0, 8)}`,
          text: `View execution details for ${agentType} agent`,
          url: shareUrl
        });
      } else {
        // Fallback to clipboard
        await navigator.clipboard.writeText(shareUrl);
        toast.success('Link Copied', {
          description: 'Execution link has been copied to clipboard'
        });
      }
    } catch (error) {
      console.error('Failed to share execution:', error);
      toast.error('Sharing Failed', {
        description: 'Failed to share execution link'
      });
    } finally {
      setActionState(prev => ({ ...prev, sharing: false }));
    }
  }, [executionId, agentType]);

  // Copy execution ID to clipboard
  const handleCopyId = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(executionId);
      toast.success('Execution ID Copied', {
        description: 'Execution ID has been copied to clipboard'
      });
    } catch (error) {
      console.error('Failed to copy execution ID:', error);
      toast.error('Copy Failed', {
        description: 'Failed to copy execution ID'
      });
    }
  }, [executionId]);

  // Export execution data
  const handleExport = useCallback(async () => {
    try {
      const response = await fetchWithTimeout(`/api/executions/${executionId}`);
      if (!response.ok) {
        let message = 'Failed to fetch execution data';
        try {
          const data = await response.clone().json();
          if (typeof data?.message === 'string' && data.message.trim()) {
            message = data.message;
          }
        } catch {
          try {
            const text = await response.text();
            if (text) message = text;
          } catch {}
        }
        throw new Error(message);
      }
      
      const executionData = await response.json();
      const safeAgent = agentType.replace(/[^a-z0-9-_]+/gi, '-').replace(/-+/g, '-').toLowerCase();
      const filename = `execution-${executionId.substring(0, 8)}-${safeAgent}.json`;
      
      const blob = new Blob([JSON.stringify(executionData, null, 2)], {
        type: 'application/json'
      });
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success('Export Complete', {
        description: `Execution data exported as ${filename}`
      });
    } catch (error) {
      console.error('Failed to export execution:', error);
      toast.error('Export Failed', {
        description: 'Failed to export execution data'
      });
    }
  }, [executionId, agentType]);

  // Open execution in new tab
  const handleOpenNewTab = useCallback(() => {
    const url = `/executions/${executionId}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }, [executionId]);

  return (
    <>
      <div className={`flex items-center gap-2 ${className}`}>
        {/* Cancel button - only for active executions */}
        {isActive && (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setShowCancelDialog(true)}
            disabled={actionState.cancelling}
            className="gap-2"
          >
            {actionState.cancelling ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Square className="h-4 w-4" />
            )}
            Cancel
          </Button>
        )}

        {/* Restart button - for completed or failed executions */}
        {(status === 'completed' || status === 'failed' || status === 'cancelled') && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowRestartDialog(true)}
            disabled={actionState.restarting}
            className="gap-2"
          >
            {actionState.restarting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RotateCcw className="h-4 w-4" />
            )}
            Restart
          </Button>
        )}

        {/* Export button */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          className="gap-2"
        >
          <Download className="h-4 w-4" />
          Export
        </Button>

        {/* Share button */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleShare}
          disabled={actionState.sharing}
          className="gap-2"
        >
          {actionState.sharing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Share2 className="h-4 w-4" />
          )}
          Share
        </Button>

        {/* More actions dropdown */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopyId}
            className="px-2"
            title="Copy Execution ID"
          >
            <Copy className="h-4 w-4" />
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={handleOpenNewTab}
            className="px-2"
            title="Open in New Tab"
          >
            <ExternalLink className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Cancel Confirmation Dialog */}
      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              Cancel Execution
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel this execution? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Execution ID:</span>
                <span className="font-mono">{executionId.substring(0, 8)}...</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Agent Type:</span>
                <span className="font-medium">{agentType}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Current Status:</span>
                <Badge variant={status === 'running' ? 'default' : 'outline'}>
                  {status}
                </Badge>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCancelDialog(false)}
              disabled={actionState.cancelling}
            >
              Keep Running
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancel}
              disabled={actionState.cancelling}
              className="gap-2"
            >
              {actionState.cancelling && <Loader2 className="h-4 w-4 animate-spin" />}
              Cancel Execution
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Restart Confirmation Dialog */}
      <Dialog open={showRestartDialog} onOpenChange={setShowRestartDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Play className="h-5 w-5 text-blue-500" />
              Restart Execution
            </DialogTitle>
            <DialogDescription>
              This will create a new execution with the same agent type and default configuration.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Agent Type:</span>
                <span className="font-medium">{agentType}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Current Status:</span>
                <Badge 
                  variant={
                    status === 'completed' ? 'secondary' : 
                    status === 'failed' ? 'destructive' : 'outline'
                  }
                >
                  {status}
                </Badge>
              </div>
            </div>
            
            <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800">
              A new execution will be created and you'll be redirected to its detail page.
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowRestartDialog(false)}
              disabled={actionState.restarting}
            >
              Cancel
            </Button>
            <Button
              variant="default"
              onClick={handleRestart}
              disabled={actionState.restarting}
              className="gap-2"
            >
              {actionState.restarting && <Loader2 className="h-4 w-4 animate-spin" />}
              Start New Execution
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}