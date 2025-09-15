import { createServer } from 'http';
import next from 'next';
import { WebSocketServer } from 'ws';
import { WebSocketManager, setWebSocketManager } from './src/lib/websocket/server';

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || process.env.HOST || '0.0.0.0';
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Initialize Next.js application
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || hostname}`);
    
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
  
  const maxPayload = parseMaxPayload(process.env.WS_MAX_PAYLOAD);
  const wss = new WebSocketServer({ 
    server,
    path: '/api/ws',
    clientTracking: true,
    maxPayload,
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