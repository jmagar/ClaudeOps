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
    url.searchParams.forEach((value, key) => {
      if (query[key]) {
        // Convert to array if not already, then add value
        if (Array.isArray(query[key])) {
          (query[key] as string[]).push(value);
        } else {
          query[key] = [query[key] as string, value];
        }
      } else {
        query[key] = value;
      }
    });
    
    const parsedUrl = {
      pathname: url.pathname,
      query,
      search: url.search
    };
    
    handle(req, res, {
      pathname: parsedUrl.pathname,
      query: parsedUrl.query,
      search: parsedUrl.search,
      hash: url.hash,
      href: url.href,
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port,
      host: url.host,
      slashes: true,
      auth: null,
      path: url.pathname + url.search
    });
  });

  // Handle server errors
  server.on('error', (error: any) => {
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
  const wss = new WebSocketServer({ 
    server,
    path: '/api/ws',
    clientTracking: true,
    maxPayload: 64 * 1024, // 64KB max message size
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
  server.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log(`> WebSocket server ready on ws://${hostname}:${port}/api/ws`);
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log('Initiating graceful shutdown...');
    
    try {
      // Shutdown WebSocket manager first
      await wsManager.shutdown();
      
      // Close HTTP server
      server.close((err) => {
        if (err) {
          console.error('Error closing HTTP server:', err);
          process.exit(1);
        }
        console.log('HTTP server closed successfully');
        process.exit(0);
      });
    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  };

  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
});