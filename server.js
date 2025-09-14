import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { WebSocketServer } from 'ws';
import { WebSocketManager, setWebSocketManager } from './src/lib/websocket/server.js';

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;

// Initialize Next.js application
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  // Create WebSocket server
  const wss = new WebSocketServer({ 
    server,
    path: '/api/ws',
    clientTracking: true,
    perMessageDeflate: {
      deflate: {
        threshold: 1024,
        concurrencyLimit: 10
      },
      inflate: {
        threshold: 1024
      }
    }
  });

  // Initialize WebSocket manager
  const wsManager = new WebSocketManager(wss);
  
  // Set global instance for use in API routes
  setWebSocketManager(wsManager);

  // Start the server
  server.listen(port, (err) => {
    if (err) throw err;
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

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
});