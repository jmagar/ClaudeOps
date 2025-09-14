import { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import type { ApiResponse } from '../types/api';

export interface AuthContext {
  user?: {
    id: string;
    role: 'admin' | 'user';
  };
}

/**
 * Simple API key or internal service authentication
 * This should be replaced with proper session-based auth in production
 */
export async function authenticateRequest(request: NextRequest): Promise<{ authenticated: boolean; user?: AuthContext['user']; error?: string }> {
  const apiKey = request.headers.get('x-api-key');
  const internalToken = request.headers.get('x-internal-token');
  const userAgent = request.headers.get('user-agent') || '';
  
  // Allow internal service calls (from same origin or with internal token)
  if (internalToken === process.env.INTERNAL_SERVICE_TOKEN && process.env.INTERNAL_SERVICE_TOKEN) {
    return {
      authenticated: true,
      user: { id: 'system', role: 'admin' }
    };
  }
  
  // Check for localhost development access
  if (process.env.NODE_ENV === 'development') {
    const origin = request.headers.get('origin');
    const referer = request.headers.get('referer');
    
    if (origin?.includes('localhost') || referer?.includes('localhost')) {
      return {
        authenticated: true,
        user: { id: 'dev-user', role: 'admin' }
      };
    }
  }
  
  // Check for API key (basic implementation)
  if (apiKey) {
    // In production, validate against database or external service
    const validApiKeys = process.env.ADMIN_API_KEYS?.split(',') || [];
    
    if (validApiKeys.includes(apiKey)) {
      return {
        authenticated: true,
        user: { id: 'api-user', role: 'admin' }
      };
    }
  }
  
  return {
    authenticated: false,
    error: 'Authentication required'
  };
}

/**
 * Check if user has required role for admin operations
 */
export function hasAdminRole(user?: AuthContext['user']): boolean {
  return user?.role === 'admin';
}

/**
 * CSRF protection for state-changing operations
 */
export function validateCSRFToken(request: NextRequest): boolean {
  // For POST/PUT/DELETE requests, check CSRF token or origin
  const method = request.method;
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
    const csrfToken = request.headers.get('x-csrf-token');
    const origin = request.headers.get('origin');
    const referer = request.headers.get('referer');
    
    // Allow if CSRF token matches expected value
    if (csrfToken && csrfToken === process.env.CSRF_TOKEN) {
      return true;
    }
    
    // Allow same-origin requests
    if (origin && referer && new URL(referer).origin === origin) {
      return true;
    }
    
    // Allow localhost in development
    if (process.env.NODE_ENV === 'development' && 
        (origin?.includes('localhost') || referer?.includes('localhost'))) {
      return true;
    }
    
    return false;
  }
  
  return true; // GET requests don't need CSRF protection
}

/**
 * Create authentication response
 */
export function createAuthErrorResponse<T = any>(message: string, status: number = 401): NextResponse<ApiResponse<T>> {
  return NextResponse.json<ApiResponse<T>>(
    { 
      success: false, 
      error: {
        code: status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN',
        message
      },
      timestamp: new Date().toISOString()
    },
    { status }
  );
}