/** @type {import('next').NextConfig} */
const nextConfig = {
  
  // Core Next.js configuration
  typedRoutes: true,
  
  // Turbopack configuration
  turbopack: {
    resolveExtensions: [
      '.mdx',
      '.tsx',
      '.ts',
      '.jsx',
      '.js',
      '.mjs',
      '.json',
    ],
  },
  
  // Build configuration
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
  
  // Environment variables
  env: {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    WEBSOCKET_PORT: process.env.WEBSOCKET_PORT,
  },
  
  // Output configuration for Docker
  output: process.env.NODE_ENV === 'production' ? 'standalone' : undefined,
  
  // Custom webpack configuration
  webpack: (config, { isServer }) => {
    // Client-side fallbacks
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
        stream: false,
        util: false,
        buffer: false,
        events: false,
      }
    }
    
    // Server-side externals
    if (isServer) {
      config.externals = [...(config.externals || []), 'ws', 'better-sqlite3'];
    }
    
    // SQLite configuration for better-sqlite3
    config.module.rules.push({
      test: /\.node$/,
      use: 'node-loader',
    });
    
    return config;
  },
  
  // Headers for security and performance
  async headers() {
    const headers = [];
    
    if (process.env.NODE_ENV === 'production') {
      headers.push({
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      });
    }
    
    return headers;
  },
  
  // Redirects for HTTPS enforcement in production
  async redirects() {
    if (process.env.NODE_ENV === 'production' && process.env.ENFORCE_HTTPS === 'true') {
      // Get the host from environment variables
      const host = process.env.ENFORCE_HTTPS_HOST || process.env.NEXT_PUBLIC_APP_URL?.replace(/^https?:\/\//, '');
      
      // Return empty array if no host is configured to avoid breaking non-prod deployments
      if (!host) {
        console.warn('HTTPS enforcement enabled but no host configured. Set ENFORCE_HTTPS_HOST or NEXT_PUBLIC_APP_URL.');
        return [];
      }
      
      return [
        {
          source: '/(.*)',
          destination: `https://${host}/$1`,
          permanent: false,
          has: [
            {
              type: 'header',
              key: 'x-forwarded-proto',
              value: 'http',
            },
          ],
        },
      ];
    }
    return [];
  },
}

export default nextConfig