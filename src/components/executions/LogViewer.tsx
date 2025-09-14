'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as ReactWindow from 'react-window';
const List = ReactWindow.FixedSizeList;

// Define the props interface locally since react-window types might be inconsistent
interface ReactWindowChildProps {
  index: number;
  style: React.CSSProperties;
  data: any;
}
import { LogEntry } from '@/hooks/useExecutionLogs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, Search, Filter, RotateCcw, Eye, EyeOff } from 'lucide-react';

interface LogViewerProps {
  executionId: string;
  logs: LogEntry[];
  isStreaming: boolean;
  height?: number;
  className?: string;
}

interface LogItemProps extends ReactWindowChildProps {
  data: {
    logs: LogEntry[];
    searchTerm: string;
    showTimestamp: boolean;
  };
}

// Individual log item component for virtual scrolling
const LogItem: React.FC<LogItemProps> = ({ index, style, data }) => {
  const { logs, searchTerm, showTimestamp } = data;
  const log = logs[index];
  
  if (!log) return null;

  // Level styling configuration
  const levelConfig = {
    debug: { color: 'text-gray-500', bg: 'bg-gray-50', badge: 'bg-gray-100 text-gray-700' },
    info: { color: 'text-blue-600', bg: 'bg-blue-50', badge: 'bg-blue-100 text-blue-700' },
    warn: { color: 'text-yellow-600', bg: 'bg-yellow-50', badge: 'bg-yellow-100 text-yellow-700' },
    error: { color: 'text-red-600', bg: 'bg-red-50', badge: 'bg-red-100 text-red-700' }
  };

  const config = levelConfig[log.level];
  
  // Highlight search terms in the message
  const highlightSearchTerm = (text: string, searchTerm: string) => {
    if (!searchTerm) return text;
    
    const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    
    return parts.map((part, index) => 
      regex.test(part) ? 
        <mark key={index} className="bg-yellow-200 px-1 rounded">{part}</mark> : 
        part
    );
  };

  // Format timestamp
  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit'
    }) + '.' + String(date.getMilliseconds()).padStart(3, '0');
  };

  return (
    <div 
      style={style} 
      className={`px-3 py-2 border-b border-gray-100 font-mono text-sm transition-colors hover:${config.bg}`}
    >
      <div className="flex items-start gap-2">
        {showTimestamp && (
          <span className="text-gray-400 text-xs whitespace-nowrap flex-shrink-0 min-w-[80px]">
            {formatTimestamp(log.timestamp)}
          </span>
        )}
        
        <Badge 
          variant="outline" 
          className={`text-xs ${config.badge} flex-shrink-0 min-w-[50px] justify-center`}
        >
          {log.level.toUpperCase()}
        </Badge>
        
        {log.source && (
          <Badge variant="outline" className="text-xs text-gray-600 flex-shrink-0">
            {log.source}
          </Badge>
        )}
        
        <span className={`${config.color} flex-1 whitespace-pre-wrap break-words leading-5`}>
          {highlightSearchTerm(log.message, searchTerm)}
        </span>
      </div>
    </div>
  );
};

export default function LogViewer({ 
  executionId, 
  logs, 
  isStreaming, 
  height = 400, 
  className = ''
}: LogViewerProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [levelFilter, setLevelFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [autoScroll, setAutoScroll] = useState(true);
  const [showTimestamp, setShowTimestamp] = useState(true);
  const [isAtBottom, setIsAtBottom] = useState(true);
  
  const listRef = useRef<List>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Filter and search logs
  const filteredLogs = useMemo(() => {
    let filtered = logs;

    // Filter by level
    if (levelFilter !== 'all') {
      const levelPriority = { debug: 0, info: 1, warn: 2, error: 3 };
      const minPriority = levelPriority[levelFilter as keyof typeof levelPriority];
      filtered = filtered.filter(log => levelPriority[log.level] >= minPriority);
    }

    // Filter by source
    if (sourceFilter !== 'all') {
      filtered = filtered.filter(log => log.source === sourceFilter);
    }

    // Filter by search term
    if (searchTerm.trim()) {
      const lowerSearchTerm = searchTerm.toLowerCase();
      filtered = filtered.filter(log =>
        log.message.toLowerCase().includes(lowerSearchTerm) ||
        log.source?.toLowerCase().includes(lowerSearchTerm) ||
        log.level.toLowerCase().includes(lowerSearchTerm)
      );
    }

    return filtered;
  }, [logs, levelFilter, sourceFilter, searchTerm]);

  // Get unique sources for filter dropdown
  const uniqueSources = useMemo(() => {
    const sources = new Set<string>();
    logs.forEach(log => {
      if (log.source) {
        sources.add(log.source);
      }
    });
    return Array.from(sources).sort();
  }, [logs]);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && isAtBottom && filteredLogs.length > 0 && listRef.current) {
      listRef.current.scrollToItem(filteredLogs.length - 1, 'end');
    }
  }, [filteredLogs.length, autoScroll, isAtBottom]);

  // Handle scroll events to determine if user is at bottom
  const handleScroll = useCallback(({ scrollOffset, scrollDirection }: any) => {
    if (!listRef.current) return;
    
    const list = listRef.current;
    const itemHeight = 60; // Approximate item height
    const containerHeight = height;
    const totalHeight = filteredLogs.length * itemHeight;
    const scrollBottom = scrollOffset + containerHeight;
    const threshold = 100; // Allow some threshold for "near bottom"
    
    const atBottom = scrollBottom >= totalHeight - threshold;
    setIsAtBottom(atBottom);

    // If user scrolls up, disable auto-scroll
    if (scrollDirection === 'backward' && autoScroll) {
      setAutoScroll(false);
    }
  }, [height, filteredLogs.length, autoScroll]);

  // Re-enable auto-scroll when manually scrolling to bottom
  const scrollToBottom = useCallback(() => {
    if (listRef.current && filteredLogs.length > 0) {
      listRef.current.scrollToItem(filteredLogs.length - 1, 'end');
      setAutoScroll(true);
      setIsAtBottom(true);
    }
  }, [filteredLogs.length]);

  // Export logs functionality
  const exportLogs = useCallback((format: 'json' | 'text' = 'text') => {
    const filename = `execution-${executionId.substring(0, 8)}-logs.${format}`;
    let content: string;
    
    if (format === 'json') {
      content = JSON.stringify(filteredLogs, null, 2);
    } else {
      content = filteredLogs
        .map(log => `[${log.timestamp}] [${log.level.toUpperCase()}] ${log.source ? `[${log.source}] ` : ''}${log.message}`)
        .join('\n');
    }
    
    const blob = new Blob([content], { type: format === 'json' ? 'application/json' : 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [filteredLogs, executionId]);

  // Clear filters
  const clearFilters = useCallback(() => {
    setSearchTerm('');
    setLevelFilter('all');
    setSourceFilter('all');
  }, []);

  // Get log statistics
  const logStats = useMemo(() => {
    const byLevel = { debug: 0, info: 0, warn: 0, error: 0 };
    logs.forEach(log => {
      byLevel[log.level]++;
    });
    
    return {
      total: logs.length,
      filtered: filteredLogs.length,
      byLevel
    };
  }, [logs, filteredLogs]);

  return (
    <Card className={`relative ${className}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg">Execution Logs</CardTitle>
            {isStreaming && (
              <Badge variant="outline" className="text-xs animate-pulse">
                <div className="w-1.5 h-1.5 bg-green-500 rounded-full mr-1" />
                Live
              </Badge>
            )}
            <span className="text-sm text-gray-500">
              {logStats.filtered} of {logStats.total} entries
            </span>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowTimestamp(!showTimestamp)}
              className="h-8 px-2"
            >
              {showTimestamp ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => exportLogs('text')}
              className="h-8 px-2"
            >
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Filters and Search */}
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search logs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 h-8"
            />
          </div>
          
          <Select value={levelFilter} onValueChange={setLevelFilter}>
            <SelectTrigger className="w-[120px] h-8">
              <SelectValue placeholder="Level" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Levels</SelectItem>
              <SelectItem value="debug">Debug+</SelectItem>
              <SelectItem value="info">Info+</SelectItem>
              <SelectItem value="warn">Warn+</SelectItem>
              <SelectItem value="error">Error</SelectItem>
            </SelectContent>
          </Select>

          {uniqueSources.length > 0 && (
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="w-[120px] h-8">
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                {uniqueSources.map(source => (
                  <SelectItem key={source} value={source}>{source}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {(searchTerm || levelFilter !== 'all' || sourceFilter !== 'all') && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="h-8 px-2"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div ref={containerRef} className="relative">
          {/* Virtual scrolled log list */}
          <List
            ref={listRef}
            height={height}
            itemCount={filteredLogs.length}
            itemSize={60}
            itemData={{
              logs: filteredLogs,
              searchTerm,
              showTimestamp
            }}
            onScroll={handleScroll}
            overscanCount={5}
          >
            {LogItem}
          </List>

          {/* Empty state */}
          {filteredLogs.length === 0 && (
            <div className="flex items-center justify-center h-full text-gray-500">
              <div className="text-center">
                <div className="text-lg font-medium">No logs to display</div>
                <div className="text-sm">
                  {logs.length === 0 
                    ? 'Waiting for execution logs...' 
                    : 'No logs match the current filters'
                  }
                </div>
              </div>
            </div>
          )}

          {/* Scroll to bottom button */}
          {!isAtBottom && (
            <div className="absolute bottom-4 right-4">
              <Button
                onClick={scrollToBottom}
                size="sm"
                className="rounded-full shadow-lg"
              >
                ↓ Bottom
              </Button>
            </div>
          )}
        </div>
      </CardContent>

      {/* Log statistics bar */}
      <div className="px-4 py-2 border-t bg-gray-50 text-xs text-gray-600">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span>Total: {logStats.total}</span>
            {logStats.byLevel.error > 0 && (
              <span className="text-red-600">Errors: {logStats.byLevel.error}</span>
            )}
            {logStats.byLevel.warn > 0 && (
              <span className="text-yellow-600">Warnings: {logStats.byLevel.warn}</span>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            {isStreaming && (
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span>Streaming</span>
              </div>
            )}
            <span>Auto-scroll: {autoScroll ? 'ON' : 'OFF'}</span>
          </div>
        </div>
      </div>
    </Card>
  );
}