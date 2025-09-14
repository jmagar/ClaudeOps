# Next.js 15.5.3 App Router Patterns Research Document

## ClaudeOps Project

**Research Date**: 2025-09-13  
**Next.js Version**: 15.5.3  
**Framework**: App Router with TypeScript

---

## Overview

This document provides comprehensive research on Next.js 15.5.3 App Router patterns for the ClaudeOps project. The research covers project structure, API routes organization, WebSocket integration, file organization best practices, and TypeScript integration patterns.

---

## 1. Project Structure for Next.js 15 with App Router

### 1.1 Recommended Root Structure

```
claudeops/
├── app/                        # App Router (Next.js 15 routing)
│   ├── layout.tsx              # Root layout (required)
│   ├── page.tsx                # Homepage
│   ├── globals.css             # Global styles
│   ├── api/                    # API routes
│   │   ├── agents/
│   │   │   ├── route.ts        # GET/POST /api/agents
│   │   │   └── [id]/
│   │   │       └── route.ts    # Dynamic agent routes
│   │   ├── chat/
│   │   │   └── route.ts        # Chat API endpoints
│   │   └── websocket/
│   │       └── route.ts        # WebSocket connection handler
│   ├── dashboard/              # Dashboard pages
│   │   ├── page.tsx
│   │   └── layout.tsx
│   ├── agents/                 # Agent management pages
│   │   ├── page.tsx
│   │   ├── [id]/
│   │   │   └── page.tsx
│   │   └── create/
│   │       └── page.tsx
│   └── (auth)/                 # Route group for auth
│       ├── login/
│       │   └── page.tsx
│       └── register/
│           └── page.tsx
├── src/                        # Application source code
│   ├── components/             # Shared components
│   │   ├── ui/                 # Reusable UI components
│   │   │   ├── Button/
│   │   │   │   ├── index.tsx
│   │   │   │   ├── Button.test.tsx
│   │   │   │   └── Button.module.css
│   │   │   ├── Card/
│   │   │   ├── Input/
│   │   │   └── Modal/
│   │   ├── layout/             # Layout components
│   │   │   ├── Header/
│   │   │   ├── Footer/
│   │   │   └── Sidebar/
│   │   └── features/           # Feature-specific components
│   │       ├── agent/
│   │       │   ├── AgentCard/
│   │       │   ├── AgentForm/
│   │       │   └── AgentChat/
│   │       ├── chat/
│   │       │   ├── ChatWindow/
│   │       │   ├── MessageList/
│   │       │   └── MessageInput/
│   │       └── dashboard/
│   │           ├── Stats/
│   │           └── ActivityFeed/
│   ├── lib/                    # Utility functions
│   │   ├── api/                # API client functions
│   │   │   ├── agents.ts
│   │   │   ├── chat.ts
│   │   │   └── websocket.ts
│   │   ├── utils/              # General utilities
│   │   │   ├── cn.ts           # className utility
│   │   │   ├── formatters.ts
│   │   │   └── validators.ts
│   │   ├── constants/          # Application constants
│   │   │   ├── routes.ts
│   │   │   └── config.ts
│   │   └── claude/             # Claude SDK integration
│   │       ├── client.ts
│   │       └── types.ts
│   ├── hooks/                  # Custom React hooks
│   │   ├── useAgent.ts
│   │   ├── useChat.ts
│   │   ├── useWebSocket.ts
│   │   └── useLocalStorage.ts
│   ├── context/                # React Context providers
│   │   ├── AgentContext.tsx
│   │   ├── ChatContext.tsx
│   │   └── ThemeContext.tsx
│   ├── types/                  # TypeScript type definitions
│   │   ├── agent.types.ts
│   │   ├── chat.types.ts
│   │   ├── api.types.ts
│   │   └── common.types.ts
│   └── styles/                 # Additional styles
│       ├── components.css
│       └── utilities.css
├── public/                     # Static assets
│   ├── icons/
│   ├── images/
│   └── favicon.ico
├── docs/                       # Documentation
├── tests/                      # Test files
│   ├── __mocks__/
│   ├── components/
│   └── api/
├── .env.local                  # Environment variables
├── .env.example               # Environment template
├── .eslintrc.js               # ESLint configuration
├── .gitignore                 # Git ignore rules
├── jest.config.ts             # Jest configuration
├── next.config.ts             # Next.js configuration
├── package.json               # Dependencies
├── tailwind.config.ts         # Tailwind CSS config
└── tsconfig.json              # TypeScript configuration
```

### 1.2 Key Structural Principles

1. **App Router First**: All routing logic in the `app/` directory
2. **Source Organization**: Business logic in `src/` for better separation
3. **Feature-Based Components**: Group components by feature domain
4. **Type Safety**: Dedicated `types/` directory for TypeScript definitions
5. **Co-location**: Keep related files close together (component + test + styles)

---

## 2. API Routes Organization and Patterns

### 2.1 Route Handler Structure

Next.js 15 App Router uses the new Route Handlers pattern with `route.ts` files:

```typescript
// app/api/agents/route.ts
import { NextRequest, NextResponse } from 'next/server'
import type { Agent } from '@/types/agent.types'

export async function GET(request: NextRequest) {
  try {
    const agents = await getAgents()
    return NextResponse.json(agents)
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch agents' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: Omit<Agent, 'id'> = await request.json()
    const agent = await createAgent(body)
    return NextResponse.json(agent, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to create agent' },
      { status: 500 }
    )
  }
}
```

### 2.2 Dynamic Route Parameters

```typescript
// app/api/agents/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const agent = await getAgentById(id)
    if (!agent) {
      return NextResponse.json(
        { error: 'Agent not found' },
        { status: 404 }
      )
    }
    return NextResponse.json(agent)
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch agent' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const body = await request.json()
    const agent = await updateAgent(id, body)
    return NextResponse.json(agent)
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to update agent' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    await deleteAgent(id)
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to delete agent' },
      { status: 500 }
    )
  }
}
```

### 2.3 API Route Organization Patterns

1. **Resource-Based Structure**: Organize by domain entities
2. **Nested Resources**: Use nested folders for related resources
3. **Middleware Integration**: Use route-level middleware for auth/validation
4. **Error Handling**: Consistent error response patterns
5. **Type Safety**: Strong typing for request/response objects

```typescript
// app/api/agents/[id]/chat/route.ts - Nested resource example
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: agentId } = await params
  const { message } = await request.json()
  
  const response = await sendMessageToAgent(agentId, message)
  return NextResponse.json(response)
}
```

---

## 3. WebSocket Integration with Next.js 15

### 3.1 Socket.io Integration Pattern

For real-time communication in ClaudeOps, Socket.io provides the most robust solution:

```typescript
// app/api/socket/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { Server as SocketServer } from 'socket.io'
import { Server as HttpServer } from 'http'

export async function GET(req: NextRequest) {
  const res = NextResponse.next()
  
  // @ts-ignore - accessing internal server
  if (!res.socket.server.io) {
    console.log('Initializing Socket.io server...')
    const httpServer: HttpServer = res.socket.server
    const io = new SocketServer(httpServer, {
      path: '/api/socket',
      addTrailingSlash: false,
      cors: {
        origin: process.env.NODE_ENV === 'production' 
          ? process.env.NEXTAUTH_URL 
          : 'http://localhost:3000',
        methods: ['GET', 'POST']
      }
    })

    // Agent communication events
    io.on('connection', (socket) => {
      console.log('Client connected:', socket.id)

      // Join agent-specific rooms
      socket.on('join-agent', (agentId: string) => {
        socket.join(`agent-${agentId}`)
        console.log(`Client ${socket.id} joined agent room: ${agentId}`)
      })

      // Handle chat messages
      socket.on('chat-message', async (data: {
        agentId: string
        message: string
        userId: string
      }) => {
        try {
          // Process message with Claude API
          const response = await processMessageWithClaude(data)
          
          // Broadcast response to agent room
          io.to(`agent-${data.agentId}`).emit('chat-response', {
            agentId: data.agentId,
            message: response.message,
            timestamp: new Date().toISOString()
          })
        } catch (error) {
          socket.emit('error', { message: 'Failed to process message' })
        }
      })

      // Handle agent status updates
      socket.on('agent-status', (data: {
        agentId: string
        status: 'online' | 'offline' | 'busy'
      }) => {
        io.to(`agent-${data.agentId}`).emit('status-update', data)
      })

      socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id)
      })
    })

    // @ts-ignore
    res.socket.server.io = io
  }
  
  return new Response('Socket.io server initialized', { status: 200 })
}
```

### 3.2 Client-Side WebSocket Hook

```typescript
// src/hooks/useWebSocket.ts
import { useEffect, useRef, useState } from 'react'
import io, { Socket } from 'socket.io-client'

interface UseWebSocketProps {
  agentId?: string
  onMessage?: (data: any) => void
  onStatusUpdate?: (data: any) => void
}

export function useWebSocket({ 
  agentId, 
  onMessage, 
  onStatusUpdate 
}: UseWebSocketProps) {
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const socketRef = useRef<Socket | null>(null)

  useEffect(() => {
    // Initialize socket connection
    socketRef.current = io({
      path: '/api/socket',
      addTrailingSlash: false
    })

    const socket = socketRef.current

    socket.on('connect', () => {
      setIsConnected(true)
      setError(null)
      
      // Join agent room if agentId provided
      if (agentId) {
        socket.emit('join-agent', agentId)
      }
    })

    socket.on('disconnect', () => {
      setIsConnected(false)
    })

    socket.on('chat-response', (data) => {
      onMessage?.(data)
    })

    socket.on('status-update', (data) => {
      onStatusUpdate?.(data)
    })

    socket.on('error', (error) => {
      setError(error.message)
    })

    return () => {
      socket.disconnect()
    }
  }, [agentId, onMessage, onStatusUpdate])

  const sendMessage = (message: string, userId: string) => {
    if (socketRef.current && agentId) {
      socketRef.current.emit('chat-message', {
        agentId,
        message,
        userId
      })
    }
  }

  const updateAgentStatus = (status: 'online' | 'offline' | 'busy') => {
    if (socketRef.current && agentId) {
      socketRef.current.emit('agent-status', {
        agentId,
        status
      })
    }
  }

  return {
    isConnected,
    error,
    sendMessage,
    updateAgentStatus
  }
}
```

### 3.3 WebSocket Integration Points

1. **Real-time Chat**: Bidirectional communication with Claude agents
2. **Agent Status**: Live status updates (online/offline/busy)
3. **Notifications**: Real-time system notifications
4. **Collaborative Features**: Multi-user agent interactions
5. **Performance Monitoring**: Live agent performance metrics

---

## 4. Component Organization Best Practices

### 4.1 UI Component Structure

```typescript
// src/components/ui/Button/index.tsx
import { ButtonHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils/cn'
import styles from './Button.module.css'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'destructive'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, children, disabled, ...props }, ref) => {
    return (
      <button
        className={cn(
          styles.button,
          styles[variant],
          styles[size],
          loading && styles.loading,
          className
        )}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {loading && <span className={styles.spinner} />}
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'
```

### 4.2 Feature Component Structure

```typescript
// src/components/features/agent/AgentChat/index.tsx
import { useState } from 'react'
import { useWebSocket } from '@/hooks/useWebSocket'
import { MessageList } from './MessageList'
import { MessageInput } from './MessageInput'
import type { Agent, ChatMessage } from '@/types'

interface AgentChatProps {
  agent: Agent
  userId: string
}

export function AgentChat({ agent, userId }: AgentChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])

  const { isConnected, sendMessage } = useWebSocket({
    agentId: agent.id,
    onMessage: (data) => {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        content: data.message,
        sender: 'agent',
        timestamp: data.timestamp
      }])
    }
  })

  const handleSendMessage = (content: string) => {
    // Add user message
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      content,
      sender: 'user',
      timestamp: new Date().toISOString()
    }
    setMessages(prev => [...prev, userMessage])

    // Send to agent via WebSocket
    sendMessage(content, userId)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-hidden">
        <MessageList messages={messages} />
      </div>
      <MessageInput 
        onSend={handleSendMessage}
        disabled={!isConnected}
        placeholder={`Message ${agent.name}...`}
      />
    </div>
  )
}
```

### 4.3 Component Organization Principles

1. **Single Responsibility**: Each component has one clear purpose
2. **Composition over Inheritance**: Use composition patterns
3. **Props Interface**: Strong TypeScript interfaces for all props
4. **Co-location**: Keep tests and styles with components
5. **Barrel Exports**: Use index files for clean imports

---

## 5. TypeScript Integration Patterns

### 5.1 tsconfig.json Configuration

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": false,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "preserve",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "allowJs": true,
    "forceConsistentCasingInFileNames": true,
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"],
      "@/components/*": ["./src/components/*"],
      "@/lib/*": ["./src/lib/*"],
      "@/hooks/*": ["./src/hooks/*"],
      "@/types/*": ["./src/types/*"],
      "@/styles/*": ["./src/styles/*"]
    }
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts"
  ],
  "exclude": ["node_modules"]
}
```

### 5.2 Type Definitions Structure

```typescript
// src/types/agent.types.ts
export interface Agent {
  id: string
  name: string
  description: string
  model: 'claude-3-haiku' | 'claude-3-sonnet' | 'claude-3-opus'
  systemPrompt: string
  temperature: number
  maxTokens: number
  status: 'online' | 'offline' | 'busy'
  capabilities: AgentCapability[]
  createdAt: string
  updatedAt: string
  userId: string
}

export interface AgentCapability {
  id: string
  name: string
  description: string
  enabled: boolean
}

export interface CreateAgentRequest {
  name: string
  description: string
  model: Agent['model']
  systemPrompt: string
  temperature?: number
  maxTokens?: number
  capabilities?: string[]
}

export interface UpdateAgentRequest extends Partial<CreateAgentRequest> {
  status?: Agent['status']
}

// src/types/chat.types.ts
export interface ChatMessage {
  id: string
  content: string
  sender: 'user' | 'agent'
  timestamp: string
  agentId?: string
  userId?: string
}

export interface ChatSession {
  id: string
  agentId: string
  userId: string
  messages: ChatMessage[]
  startedAt: string
  endedAt?: string
  status: 'active' | 'ended'
}

// src/types/api.types.ts
export interface ApiResponse<T = any> {
  data?: T
  error?: string
  message?: string
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}
```

### 5.3 Type-Safe API Client

```typescript
// src/lib/api/agents.ts
import type { 
  Agent, 
  CreateAgentRequest, 
  UpdateAgentRequest,
  ApiResponse,
  PaginatedResponse 
} from '@/types'

const API_BASE = '/api'

export const agentsApi = {
  async getAll(params?: { 
    page?: number 
    limit?: number 
  }): Promise<PaginatedResponse<Agent>> {
    const searchParams = new URLSearchParams()
    if (params?.page) searchParams.set('page', params.page.toString())
    if (params?.limit) searchParams.set('limit', params.limit.toString())
    
    const response = await fetch(`${API_BASE}/agents?${searchParams}`)
    return response.json()
  },

  async getById(id: string): Promise<ApiResponse<Agent>> {
    const response = await fetch(`${API_BASE}/agents/${id}`)
    return response.json()
  },

  async create(data: CreateAgentRequest): Promise<ApiResponse<Agent>> {
    const response = await fetch(`${API_BASE}/agents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    return response.json()
  },

  async update(id: string, data: UpdateAgentRequest): Promise<ApiResponse<Agent>> {
    const response = await fetch(`${API_BASE}/agents/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    return response.json()
  },

  async delete(id: string): Promise<ApiResponse<void>> {
    const response = await fetch(`${API_BASE}/agents/${id}`, {
      method: 'DELETE'
    })
    return response.json()
  }
}
```

---

## 6. Configuration Files Needed

### 6.1 Next.js Configuration

```typescript
// next.config.ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    typedRoutes: true
  },
  typescript: {
    ignoreBuildErrors: false
  },
  eslint: {
    ignoreDuringBuilds: false
  },
  env: {
    CUSTOM_KEY: process.env.CUSTOM_KEY,
  },
  images: {
    domains: ['localhost'],
    formats: ['image/webp', 'image/avif']
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false
      }
    }
    return config
  }
}

export default nextConfig
```

### 6.2 ESLint Configuration

```javascript
// .eslintrc.js
import { FlatCompat } from '@eslint/eslintrc'

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
})

const eslintConfig = [
  ...compat.config({
    extends: [
      'next/core-web-vitals', 
      'next/typescript'
    ],
    rules: {
      '@typescript-eslint/no-unused-vars': 'error',
      '@typescript-eslint/no-explicit-any': 'warn',
      'prefer-const': 'error',
      'no-var': 'error'
    }
  }),
]

export default eslintConfig
```

### 6.3 Tailwind CSS Configuration

```typescript
// tailwind.config.ts
import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}

export default config
```

### 6.4 Jest Configuration

```typescript
// jest.config.ts
import type { Config } from 'jest'
import nextJest from 'next/jest.js'

const createJestConfig = nextJest({
  dir: './',
})

const config: Config = {
  coverageProvider: 'v8',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testPathIgnorePatterns: ['<rootDir>/.next/', '<rootDir>/node_modules/'],
  collectCoverageFrom: [
    'src/**/*.{js,jsx,ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.stories.{js,jsx,ts,tsx}',
  ],
}

export default createJestConfig(config)
```

---

## 7. Integration Points for WebSocket and External APIs

### 7.1 Claude SDK Integration

```typescript
// src/lib/claude/client.ts
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export interface ClaudeMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ClaudeStreamResponse {
  content: string
  finished: boolean
}

export class ClaudeClient {
  async sendMessage(
    messages: ClaudeMessage[],
    model: string = 'claude-3-haiku-20240307',
    systemPrompt?: string
  ): Promise<string> {
    try {
      const response = await anthropic.messages.create({
        model,
        max_tokens: 1024,
        system: systemPrompt,
        messages
      })

      return response.content[0].type === 'text' 
        ? response.content[0].text 
        : ''
    } catch (error) {
      console.error('Claude API error:', error)
      throw new Error('Failed to get response from Claude')
    }
  }

  async *streamMessage(
    messages: ClaudeMessage[],
    model: string = 'claude-3-haiku-20240307',
    systemPrompt?: string
  ): AsyncGenerator<ClaudeStreamResponse> {
    try {
      const stream = await anthropic.messages.create({
        model,
        max_tokens: 1024,
        system: systemPrompt,
        messages,
        stream: true
      })

      let content = ''
      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta') {
          const delta = chunk.delta.type === 'text_delta' 
            ? chunk.delta.text 
            : ''
          content += delta
          yield { content: delta, finished: false }
        }
      }
      
      yield { content: '', finished: true }
    } catch (error) {
      console.error('Claude streaming error:', error)
      throw new Error('Failed to stream response from Claude')
    }
  }
}

export const claudeClient = new ClaudeClient()
```

### 7.2 WebSocket-Claude Integration

```typescript
// src/lib/integration/websocket-claude.ts
import { claudeClient, ClaudeMessage } from '@/lib/claude/client'
import type { Agent } from '@/types'

export async function processMessageWithClaude(data: {
  agentId: string
  message: string
  userId: string
}): Promise<{ message: string; agentId: string }> {
  try {
    // Get agent configuration
    const agent = await getAgentById(data.agentId)
    if (!agent) {
      throw new Error('Agent not found')
    }

    // Prepare conversation history
    const messages: ClaudeMessage[] = [
      {
        role: 'user',
        content: data.message
      }
    ]

    // Get Claude response
    const response = await claudeClient.sendMessage(
      messages,
      agent.model,
      agent.systemPrompt
    )

    return {
      message: response,
      agentId: data.agentId
    }
  } catch (error) {
    console.error('Error processing message with Claude:', error)
    throw error
  }
}

export async function* streamMessageWithClaude(data: {
  agentId: string
  message: string
  userId: string
}): AsyncGenerator<{ content: string; finished: boolean; agentId: string }> {
  try {
    const agent = await getAgentById(data.agentId)
    if (!agent) {
      throw new Error('Agent not found')
    }

    const messages: ClaudeMessage[] = [
      {
        role: 'user',
        content: data.message
      }
    ]

    for await (const chunk of claudeClient.streamMessage(
      messages,
      agent.model,
      agent.systemPrompt
    )) {
      yield {
        ...chunk,
        agentId: data.agentId
      }
    }
  } catch (error) {
    console.error('Error streaming message with Claude:', error)
    throw error
  }
}
```

### 7.3 External API Integration Points

1. **Authentication APIs**: Integration with NextAuth.js or custom auth
2. **Database APIs**: Prisma/Drizzle ORM for data persistence
3. **File Storage**: AWS S3 or Vercel Blob for file uploads
4. **Monitoring**: Sentry for error tracking, analytics
5. **Deployment**: Vercel platform optimization

---

## 8. Key Patterns and Best Practices Summary

### 8.1 Performance Patterns

1. **Dynamic Imports**: Use for heavy components and libraries
2. **Streaming**: Implement streaming for real-time responses
3. **Caching**: Leverage Next.js built-in caching strategies
4. **Bundle Optimization**: Split code by routes and features
5. **Image Optimization**: Use Next.js Image component

### 8.2 Security Patterns

1. **API Route Protection**: Implement middleware for authentication
2. **Input Validation**: Use Zod or similar for runtime validation
3. **Environment Variables**: Secure API key management
4. **CORS Configuration**: Proper cross-origin resource sharing
5. **Rate Limiting**: Implement rate limiting for API routes

### 8.3 Development Patterns

1. **Type-First Development**: Define types before implementation
2. **Component Testing**: Unit tests for all components
3. **API Testing**: Integration tests for API routes
4. **Error Boundaries**: React error boundaries for error handling
5. **Logging**: Structured logging for debugging and monitoring

---

## 9. Deployment and Production Considerations

### 9.1 Environment Configuration

```bash
# .env.local
ANTHROPIC_API_KEY=your_anthropic_api_key
DATABASE_URL=your_database_url
NEXTAUTH_SECRET=your_nextauth_secret
NEXTAUTH_URL=http://localhost:3000

# .env.production
ANTHROPIC_API_KEY=prod_anthropic_api_key
DATABASE_URL=prod_database_url
NEXTAUTH_SECRET=prod_nextauth_secret
NEXTAUTH_URL=https://your-domain.com
```

### 9.2 Build Optimization

```typescript
// next.config.ts production optimizations
const nextConfig: NextConfig = {
  output: 'standalone', // For containerized deployments
  poweredByHeader: false,
  compress: true,
  generateEtags: false,
  httpAgentOptions: {
    keepAlive: true,
  },
  experimental: {
    serverComponentsExternalPackages: ['@anthropic-ai/sdk']
  }
}
```

---

## Conclusion

This research document provides a comprehensive foundation for implementing the ClaudeOps project using Next.js 15.5.3 with the App Router. The patterns and structures outlined here prioritize:

1. **Scalability**: Architecture that grows with the application
2. **Type Safety**: Full TypeScript integration throughout
3. **Real-time Capability**: WebSocket integration for live communication
4. **Developer Experience**: Well-organized codebase with clear patterns
5. **Production Readiness**: Configuration and patterns for deployment

The recommended structure balances modern Next.js 15 capabilities with proven architectural patterns, ensuring the project can efficiently handle real-time agent interactions while maintaining code quality and developer productivity.

---

**Research Sources:**
- Official Next.js 15 Documentation (Vercel)
- Community Best Practices (dev.to, levelup.gitconnected)
- WebSocket Integration Patterns (Medium, JavaScript.plainenglish.io)
- TypeScript Integration Guides (Official Next.js docs)
- Production Deployment Patterns (Vercel documentation)