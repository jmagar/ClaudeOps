'use client';

import * as React from 'react';
import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { WebSocketClient, ConnectionState } from '../utils/websocketClient';
import { ServerMessage } from '../websocket/messageTypes';

interface WebSocketContextType {
  client: WebSocketClient | null;
  connectionState: ConnectionState;
  isConnected: boolean;
  lastMessage: ServerMessage | null;
  sendMessage: WebSocketClient['sendMessage'];
  subscribeToExecution: (executionId: string) => boolean;
  unsubscribeFromExecution: (executionId: string) => boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  ping: () => boolean;
  getStats: () => ReturnType<WebSocketClient['getStats']>;
}

const WebSocketContext = createContext<WebSocketContextType | null>(null);

interface WebSocketProviderProps {
  children: ReactNode;
  url?: string;
  enabled?: boolean;
  reconnectAttempts?: number;
  reconnectInterval?: number;
  heartbeatInterval?: number;
}

export function WebSocketProvider({
  children,
  url = 'ws://localhost:3000/api/ws',
  enabled = true,
  reconnectAttempts = 10,
  reconnectInterval = 1000,
  heartbeatInterval = 30000
}: WebSocketProviderProps) {
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
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize WebSocket client
  useEffect(() => {
    if (!enabled || isInitialized) return;

    console.log('Initializing WebSocket client with URL:', url);
    
    const client = new WebSocketClient({
      url,
      reconnectAttempts,
      reconnectInterval,
      heartbeatInterval
    });

    // Set up event handlers
    client.onStateChange((state) => {
      console.log('WebSocket state changed:', state.status);
      setConnectionState(state);
    });

    client.onMessage((message) => {
      console.debug('WebSocket received message:', message.type);
      setLastMessage(message);
    });

    client.onError((event) => {
      console.error('WebSocket error in context:', event);
    });

    client.onOpen((event) => {
      console.log('WebSocket connected in context');
    });

    client.onClose((event) => {
      console.log('WebSocket closed in context:', event.code, event.reason);
    });

    clientRef.current = client;
    setIsInitialized(true);

    // Auto-connect if enabled
    if (enabled) {
      client.connect().catch(error => {
        console.error('Failed to auto-connect WebSocket:', error);
      });
    }

  }, [url, enabled, reconnectAttempts, reconnectInterval, heartbeatInterval, isInitialized]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (clientRef.current) {
        console.log('Destroying WebSocket client');
        clientRef.current.destroy();
        clientRef.current = null;
      }
    };
  }, []);

  // Helper functions
  const sendMessage: WebSocketContextType['sendMessage'] = (message) => {
    if (!clientRef.current) {
      console.warn('WebSocket client not available');
      return false;
    }
    return clientRef.current.sendMessage(message);
  };

  const subscribeToExecution = (executionId: string): boolean => {
    if (!clientRef.current) {
      console.warn('WebSocket client not available for subscription');
      return false;
    }
    return clientRef.current.subscribeToExecution(executionId);
  };

  const unsubscribeFromExecution = (executionId: string): boolean => {
    if (!clientRef.current) {
      console.warn('WebSocket client not available for unsubscription');
      return false;
    }
    return clientRef.current.unsubscribeFromExecution(executionId);
  };

  const connect = async (): Promise<void> => {
    if (!clientRef.current) {
      throw new Error('WebSocket client not available');
    }
    return clientRef.current.connect();
  };

  const disconnect = (): void => {
    if (!clientRef.current) {
      console.warn('WebSocket client not available for disconnection');
      return;
    }
    clientRef.current.disconnect();
  };

  const ping = (): boolean => {
    if (!clientRef.current) {
      console.warn('WebSocket client not available for ping');
      return false;
    }
    return clientRef.current.ping();
  };

  const getStats = () => {
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
  };

  const contextValue: WebSocketContextType = {
    client: clientRef.current,
    connectionState,
    isConnected: connectionState.status === 'connected',
    lastMessage,
    sendMessage,
    subscribeToExecution,
    unsubscribeFromExecution,
    connect,
    disconnect,
    ping,
    getStats
  };

  return (
    <WebSocketContext.Provider value={contextValue}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocketContext(): WebSocketContextType {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocketContext must be used within a WebSocketProvider');
  }
  return context;
}

// Optional: Export a hook that gracefully handles missing context
export function useWebSocketContextOptional(): WebSocketContextType | null {
  return useContext(WebSocketContext);
}