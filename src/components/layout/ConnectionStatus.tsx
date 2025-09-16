'use client';

import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useSystemStatus } from '@/hooks/useSystemStatus';
import { cn } from '@/lib/utils';
import { CircleIcon, AlertCircleIcon, CheckCircleIcon } from 'lucide-react';

interface ConnectionStatusProps {
  className?: string;
  showLabel?: boolean;
  variant?: 'badge' | 'icon' | 'full';
}

export function ConnectionStatus({ 
  className, 
  showLabel = true, 
  variant = 'badge' 
}: ConnectionStatusProps) {
  const { isConnected, connectionState, error } = useWebSocket({
    enabled: true,
    autoConnect: true,
  });
  const { systemHealth, isHealthy, hasWarnings, hasErrors } = useSystemStatus();

  // Determine overall status
  const getConnectionStatus = () => {
    if (!isConnected) {
      return {
        status: 'disconnected' as const,
        label: 'Disconnected',
        color: 'destructive' as const,
        icon: AlertCircleIcon
      };
    }

    if (hasErrors) {
      return {
        status: 'error' as const,
        label: 'System Error',
        color: 'destructive' as const,
        icon: AlertCircleIcon
      };
    }

    if (hasWarnings) {
      return {
        status: 'warning' as const,
        label: 'System Warning',
        color: 'secondary' as const,
        icon: CircleIcon
      };
    }

    if (isHealthy) {
      return {
        status: 'healthy' as const,
        label: 'Connected',
        color: 'default' as const,
        icon: CheckCircleIcon
      };
    }

    return {
      status: 'connecting' as const,
      label: 'Connecting',
      color: 'secondary' as const,
      icon: CircleIcon
    };
  };

  const { status, label, color, icon: StatusIcon } = getConnectionStatus();

  // Detailed status for tooltip
  const getDetailedStatus = () => {
    const details = [];
    
    details.push(`WebSocket: ${isConnected ? 'Connected' : 'Disconnected'}`);
    if (connectionState.latency) {
      details.push(`Latency: ${connectionState.latency}ms`);
    }
    if (systemHealth) {
      details.push(`System: ${systemHealth.status}`);
      if (systemHealth.details.cpu) {
        details.push(`CPU: ${systemHealth.details.cpu}%`);
      }
      if (systemHealth.details.memory) {
        details.push(`Memory: ${systemHealth.details.memory}%`);
      }
    }
    if (error) {
      details.push(`Error: ${error}`);
    }

    return details.join('\n');
  };

  if (variant === 'icon') {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={cn('flex items-center justify-center', className)}>
              <StatusIcon
                className={cn(
                  'h-4 w-4',
                  status === 'healthy' && 'text-green-500',
                  status === 'warning' && 'text-yellow-500',
                  status === 'error' && 'text-red-500',
                  status === 'disconnected' && 'text-gray-500',
                  status === 'connecting' && 'text-blue-500 animate-pulse'
                )}
              />
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <div className="space-y-1">
              <p className="font-semibold">{label}</p>
              <pre className="text-xs whitespace-pre-wrap">{getDetailedStatus()}</pre>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (variant === 'full') {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={cn('flex items-center gap-2', className)}>
              <StatusIcon
                className={cn(
                  'h-4 w-4',
                  status === 'healthy' && 'text-green-500',
                  status === 'warning' && 'text-yellow-500',
                  status === 'error' && 'text-red-500',
                  status === 'disconnected' && 'text-gray-500',
                  status === 'connecting' && 'text-blue-500 animate-pulse'
                )}
              />
              {showLabel && (
                <span className="text-sm font-medium text-muted-foreground">
                  {label}
                </span>
              )}
              {connectionState.latency && (
                <span className="text-xs text-muted-foreground">
                  {connectionState.latency}ms
                </span>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <div className="space-y-1">
              <p className="font-semibold">Connection Details</p>
              <pre className="text-xs whitespace-pre-wrap">{getDetailedStatus()}</pre>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Default badge variant
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant={color} className={cn('flex items-center gap-1', className)}>
            <StatusIcon className="h-3 w-3" />
            {showLabel && <span>{label}</span>}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <div className="space-y-1">
            <p className="font-semibold">System Status</p>
            <pre className="text-xs whitespace-pre-wrap">{getDetailedStatus()}</pre>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}