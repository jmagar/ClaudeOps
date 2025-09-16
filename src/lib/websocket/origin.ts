// Parse allowed WebSocket origins
export const parseAllowedOrigins = (value: string | undefined): string[] => {
  if (!value) return [];
  return value.split(',').map(origin => origin.trim()).filter(Boolean);
};

// Function to check if origin is allowed for WebSocket connections
export const isAllowedOrigin = (origin: string): boolean => {
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
      
      // Normalize protocols for comparison (ws->http, wss->https)
      const normalizeProto = (p: string) => (p === 'ws:' ? 'http:' : p === 'wss:' ? 'https:' : p);
      
      return originUrl.hostname === allowedUrl.hostname && 
             normalizePort(originUrl) === normalizePort(allowedUrl) &&
             normalizeProto(originUrl.protocol) === normalizeProto(allowedUrl.protocol);
    } catch {
      return origin === allowedOrigin;
    }
  });
};