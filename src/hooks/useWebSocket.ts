'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { WebSocketClient, ConnectionState, WebSocketClientConfig } from '../lib/utils/websocketClient';
import { ServerMessage, ClientMessage } from '../lib/websocket/messageTypes';

interface UseWebSocketOptions extends Partial<WebSocketClientConfig> {
  enabled?: boolean;
  autoConnect?: boolean;
  onOpen?: (event: Event) => void;
  onClose?: (event: CloseEvent) => void;
  onError?: (event: Event) => void;
  onMessage?: (message: ServerMessage) => void;
  onStateChange?: (state: ConnectionState) => void;
}

interface UseWebSocketReturn {
  client: WebSocketClient | null;
  connectionState: ConnectionState;
  isConnected: boolean;
  lastMessage: ServerMessage | null;
  messageHistory: ServerMessage[];
  error: string | null;
  
  // Connection control
  connect: () => Promise<void>;
  disconnect: () => void;
  reconnect: () => Promise<void>;
  
  // Message sending
  sendMessage: (message: Omit<ClientMessage, 'timestamp'>) => boolean;
  subscribeToExecution: (executionId: string) => boolean;
  unsubscribeFromExecution: (executionId: string) => boolean;
  ping: () => boolean;
  
  // Statistics
  getStats: () => ReturnType<WebSocketClient['getStats']>;
  
  // Utilities
  clearHistory: () => void;
}

// Auto-detect WebSocket URL based on current location
function getWebSocketUrl(): string {
  // Check for environment variable override first
  if (process.env.NEXT_PUBLIC_WS_URL) {
    const baseUrl = process.env.NEXT_PUBLIC_WS_URL;
    return baseUrl.replace(/^http/, 'ws') + '/api/ws';
  }

  // Auto-detect from current location if available
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    return `${protocol}//${host}/api/ws`;
  }

  // Fallback for SSR
  return 'ws://localhost:3000/api/ws';
}

export function useWebSocket(options: UseWebSocketOptions = {}): UseWebSocketReturn {
  const {
    url = getWebSocketUrl(),
    enabled = true,
    autoConnect = true,
    reconnectAttempts = 10,
    reconnectInterval = 1000,
    heartbeatInterval = 30000,
    heartbeatTimeout = 5000,
    protocols,
    onOpen,
    onClose,
    onError,
    onMessage,
    onStateChange
  } = options;

  const clientRef = useRef<WebSocketClient | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>({
    status: 'disconnected',
    clientId: null,
    lastConnected: null,
    reconnectCount: 0,
    latency: null,
    error: null
  });
  const [lastMessage, setLastMessage] = useState<ServerMessage | null>(null);
  const [messageHistory, setMessageHistory] = useState<ServerMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const maxHistorySize = 1000; // Limit message history size

  // Initialize WebSocket client
  useEffect(() => {
    if (!enabled) return;

    const client = new WebSocketClient({
      url,
      protocols,
      reconnectAttempts,
      reconnectInterval,
      heartbeatInterval,
      heartbeatTimeout
    });

    // Set up event handlers
    client.onStateChange((state) => {
      setConnectionState(state);
      setError(state.error);
      onStateChange?.(state);
    });

    client.onMessage((message) => {
      setLastMessage(message);
      setMessageHistory(prev => {
        const newHistory = [...prev, message];
        return newHistory.length > maxHistorySize 
          ? newHistory.slice(-maxHistorySize) 
          : newHistory;
      });
      onMessage?.(message);
    });

    client.onOpen((event) => {
      setError(null);
      onOpen?.(event);
    });

    client.onClose((event) => {
      onClose?.(event);
    });

    client.onError((event) => {
      setError('WebSocket connection error');
      onError?.(event);
    });

    clientRef.current = client;

    // Auto-connect if enabled
    if (autoConnect) {
      client.connect().catch(err => {
        console.error('Failed to auto-connect WebSocket:', err);
        setError(err.message || 'Failed to connect');
      });
    }

    // Cleanup on unmount
    return () => {
      client.destroy();
    };
  }, [
    url,
    enabled,
    autoConnect,
    reconnectAttempts,
    reconnectInterval,
    heartbeatInterval,
    heartbeatTimeout,
    protocols,
    onOpen,
    onClose,
    onError,
    onMessage,
    onStateChange
  ]);

  // Connection control functions
  const connect = useCallback(async (): Promise<void> => {
    if (!clientRef.current) {
      throw new Error('WebSocket client not initialized');
    }
    
    try {
      await clientRef.current.connect();
      setError(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to connect';
      setError(errorMessage);
      throw err;
    }
  }, []);

  const disconnect = useCallback((): void => {
    if (!clientRef.current) {
      console.warn('WebSocket client not available for disconnection');
      return;
    }
    
    clientRef.current.disconnect();
    setError(null);
  }, []);

  const reconnect = useCallback(async (): Promise<void> => {
    if (!clientRef.current) {
      throw new Error('WebSocket client not initialized');
    }

    // Disconnect first, then reconnect
    clientRef.current.disconnect();
    
    // Small delay to ensure clean disconnect
    await new Promise(resolve => setTimeout(resolve, 100));
    
    return connect();
  }, [connect]);

  // Message sending functions
  const sendMessage = useCallback((message: Omit<ClientMessage, 'timestamp'>): boolean => {
    if (!clientRef.current) {
      console.warn('WebSocket client not available');
      return false;
    }
    
    return clientRef.current.sendMessage(message);
  }, []);

  const subscribeToExecution = useCallback((executionId: string): boolean => {
    if (!clientRef.current) {
      console.warn('WebSocket client not available for subscription');
      return false;
    }
    
    return clientRef.current.subscribeToExecution(executionId);
  }, []);

  const unsubscribeFromExecution = useCallback((executionId: string): boolean => {
    if (!clientRef.current) {
      console.warn('WebSocket client not available for unsubscription');
      return false;
    }
    
    return clientRef.current.unsubscribeFromExecution(executionId);
  }, []);

  const ping = useCallback((): boolean => {
    if (!clientRef.current) {
      console.warn('WebSocket client not available for ping');
      return false;
    }
    
    return clientRef.current.ping();
  }, []);

  // Statistics
  const getStats = useCallback(() => {
    if (!clientRef.current) {
      return {
        messagesSent: 0,
        messagesReceived: 0,
        bytesTransferred: 0,
        connectionUptime: 0,
        lastActivity: null
      };
    }
    
    return clientRef.current.getStats();
  }, []);

  // Utilities
  const clearHistory = useCallback((): void => {
    setMessageHistory([]);
    setLastMessage(null);
  }, []);

  return {
    client: clientRef.current,
    connectionState,
    isConnected: connectionState.status === 'connected',
    lastMessage,
    messageHistory,
    error,
    
    // Connection control
    connect,
    disconnect,
    reconnect,
    
    // Message sending
    sendMessage,
    subscribeToExecution,
    unsubscribeFromExecution,
    ping,
    
    // Statistics
    getStats,
    
    // Utilities
    clearHistory
  };
}

export default useWebSocket;