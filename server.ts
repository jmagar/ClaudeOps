import { createServer, IncomingMessage } from 'http';
import next from 'next';
import { WebSocketServer } from 'ws';
import { WebSocketManager, setWebSocketManager } from './src/lib/websocket/server';

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || process.env.HOST || '0.0.0.0';
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Initialize Next.js application
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Function to check if origin is allowed for WebSocket connections
export const isAllowedOrigin = (origin: string, host?: string): boolean => {
  const allowedOrigins = parseAllowedOrigins(process.env.WS_ALLOWED_ORIGINS);
  
  // In development, allow localhost connections
  if (process.env.NODE_ENV !== 'production') {
    return true;
  }
  
  // If no origins are configured in production, reject all
  if (allowedOrigins.length === 0) {
    return false;
  }
  
  return allowedOrigins.some(allowedOrigin => {
    try {
      const originUrl = new URL(origin);
      const allowedUrl = new URL(allowedOrigin);
      
      // Normalize ports for comparison (ws:80, wss:443 defaults)
      const normalizePort = (url: URL): string => {
        if (url.port) return url.port;
        return url.protocol === 'https:' || url.protocol === 'wss:' ? '443' : '80';
      };
      
      return originUrl.hostname === allowedUrl.hostname && 
             normalizePort(originUrl) === normalizePort(allowedUrl) &&
             originUrl.protocol === allowedUrl.protocol;
    } catch {
      return origin === allowedOrigin;
    }
  });
};

// Parse allowed WebSocket origins
const parseAllowedOrigins = (value: string | undefined): string[] => {
  if (!value) return [];
  return value.split(',').map(origin => origin.trim()).filter(Boolean);
};

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const forwardedProto = req.headers['x-forwarded-proto']?.toString()?.split(',')[0]?.trim();
    const forwardedHost = req.headers['x-forwarded-host']?.toString()?.split(',')[0]?.trim();
    const protocol = forwardedProto || 'http';
    const host = forwardedHost || req.headers.host || hostname;
    const url = new URL(req.url || '/', `${protocol}://${host}`);
    
    // Preserve multi-value query parameters
    const query: Record<string, string | string[]> = {};
    for (const key of Array.from(new Set(url.searchParams.keys()))) {
      const values = url.searchParams.getAll(key);
      query[key] = values.length > 1 ? values : values[0];
    }
    
    const parsedUrl = {
      pathname: url.pathname,
      query,
      search: url.search,
      hash: url.hash,
      href: url.href,
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port,
      host: url.host,
      slashes: true,
      auth: null,
      path: url.pathname + url.search
    };
    
    handle(req, res, parsedUrl);
  });

  // Configure HTTP server timeouts to prevent slowloris attacks
  server.requestTimeout = 120000; // 2 minutes - Node 18+ compatible
  server.headersTimeout = 60000; // 1 minute
  server.keepAliveTimeout = 5000; // 5 seconds

  // Set per-socket timeouts
  server.on('connection', (socket) => {
    socket.setTimeout(120000); // 2 minutes per socket
  });

  // Handle server errors
  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`❌ Port ${port} is already in use. Please free the port or use a different one.`);
      process.exit(1);
    } else if (error.code === 'EACCES') {
      console.error(`❌ Permission denied to bind to port ${port}. Try a port number above 1024.`);
      process.exit(1);
    } else {
      console.error('❌ Server error:', error.message);
      process.exit(1);
    }
  });

  // Create WebSocket server
  const parseMaxPayload = (value: string | undefined): number => {
    const defaultValue = 1048576; // 1MB
    if (!value) return defaultValue;
    
    const parsed = parseInt(value, 10);
    if (isNaN(parsed) || parsed <= 0 || parsed > 100 * 1024 * 1024) { // Max 100MB
      console.warn(`Invalid WS_MAX_PAYLOAD: ${value}, using default: ${defaultValue}`);
      return defaultValue;
    }
    return parsed;
  };
  
  // WebSocket origin validation function with proper callback signature
  const verifyClient = (info: { origin: string; secure: boolean; req: IncomingMessage }, cb: (result: boolean, code?: number, message?: string) => void): void => {
    const { origin, req } = info;
    const host = req.headers.host;
    
    // Handle missing or invalid origins gracefully
    if (!origin) {
      if (process.env.NODE_ENV === 'production') {
        console.warn('Rejected WebSocket connection: missing origin header');
        cb(false, 401, 'Missing origin header');
        return;
      } else {
        cb(true); // Allow in development even without origin
        return;
      }
    }
    
    const isAllowed = isAllowedOrigin(origin, host);
    
    if (!isAllowed) {
      console.warn(`Rejected WebSocket connection from unauthorized origin: ${origin}`);
      cb(false, 401, 'Unauthorized origin');
    } else {
      cb(true);
    }
  };

  const maxPayload = parseMaxPayload(process.env.WS_MAX_PAYLOAD);
  const wss = new WebSocketServer({ 
    server,
    path: '/api/ws',
    clientTracking: true,
    maxPayload,
    verifyClient,
    perMessageDeflate: {
      threshold: 1024,
      concurrencyLimit: 10,
      serverNoContextTakeover: true,
      clientNoContextTakeover: true,
      zlibDeflateOptions: {
        level: 6
      },
      zlibInflateOptions: {
        // use defaults
      }
    }
  });

  // Initialize WebSocket manager
  const wsManager = new WebSocketManager(wss);
  
  // Set global instance for use in API routes
  setWebSocketManager(wsManager);

  // Start the server
  server.listen(port, hostname, () => {
    const advertisedHost = (hostname === '0.0.0.0' || hostname === '::') ? 'localhost' : hostname;
    console.log(`> Ready on http://${advertisedHost}:${port} (listening on ${hostname})`);
    console.log(`> WebSocket server ready on ws://${advertisedHost}:${port}/api/ws`);
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log('Initiating graceful shutdown...');
    
    const timeout = setTimeout(() => {
      console.log('⚠️ Shutdown timeout - force exiting');
      process.exit(1);
    }, 10000);
    
    try {
      // Shutdown WebSocket manager first
      await wsManager.shutdown();
      
      // Close HTTP server
      await new Promise<void>((resolve, reject) => {
        server.close((err) => err ? reject(err) : resolve());
      });
      
      clearTimeout(timeout);
      console.log('HTTP server closed successfully');
      process.exit(0);
    } catch (error) {
      clearTimeout(timeout);
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  };

  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}).catch((error) => {
  console.error('❌ Failed to initialize Next.js app:', error);
  process.exit(1);
});