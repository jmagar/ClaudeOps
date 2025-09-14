/** @type {import('next').NextConfig} */
const nextConfig = {
  typedRoutes: true,
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
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
  env: {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  },
  images: {
    formats: ['image/webp', 'image/avif'],
  },
  // Custom server configuration
  experimental: {
    serverComponentsExternalPackages: ['ws'],
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      }
    }
    
    // Handle WebSocket module properly
    if (isServer) {
      config.externals = [...(config.externals || []), 'ws'];
    }
    
    return config
  },
}

export default nextConfig