import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import type { ApiResponse } from '../types/api';

export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code: string = 'INTERNAL_ERROR'
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class ValidationError extends ApiError {
  constructor(message: string, public field?: string, public value?: any) {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

export class NotFoundError extends ApiError {
  constructor(resource: string, id?: string) {
    super(`${resource}${id ? ` with id '${id}'` : ''} not found`, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends ApiError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends ApiError {
  constructor(message: string = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}

/**
 * Creates a standardized error response
 */
function createErrorResponse<T = never>(
  error: unknown,
  statusCode: number = 500
): NextResponse<ApiResponse<T>> {
  const timestamp = new Date().toISOString();

  // Handle Zod validation errors
  if (error instanceof ZodError) {
    const validationErrors = error.issues.map(e => ({
      field: e.path.join('.'),
      message: e.message,
      value: (e as any).received
    }));

    return NextResponse.json<ApiResponse<T>>({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: { validationErrors }
      },
      timestamp
    }, { status: 400 });
  }

  // Handle custom API errors
  if (error instanceof ApiError) {
    return NextResponse.json<ApiResponse<T>>({
      success: false,
      error: {
        code: error.code,
        message: error.message,
        details: error instanceof ValidationError ? {
          field: error.field,
          value: error.value
        } : undefined
      },
      timestamp
    }, { status: error.statusCode });
  }

  // Handle generic errors
  const message = error instanceof Error ? error.message : 'An unexpected error occurred';
  console.error('Unhandled API error:', error);

  return NextResponse.json<ApiResponse<T>>({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: process.env.NODE_ENV === 'development' ? message : 'Internal server error'
    },
    timestamp
  }, { status: statusCode });
}

/**
 * Wraps API route handlers with error handling
 */
export function withErrorHandler<T>(
  handler: (req: NextRequest, ...args: any[]) => Promise<NextResponse<ApiResponse<T>>>
) {
  return async (req: NextRequest, ...args: any[]): Promise<NextResponse<ApiResponse<T>>> => {
    try {
      return await handler(req, ...args);
    } catch (error) {
      return createErrorResponse<T>(error);
    }
  };
}

/**
 * Creates a success response
 */
export function createSuccessResponse<T>(
  data: T,
  statusCode: number = 200
): NextResponse<ApiResponse<T>> {
  return NextResponse.json<ApiResponse<T>>({
    success: true,
    data,
    timestamp: new Date().toISOString()
  }, { status: statusCode });
}

/**
 * Handles async operations and converts database results to API responses
 */
export async function handleAsyncOperation<T>(
  operation: () => Promise<{ success: boolean; data?: T; error?: string }>,
  successStatusCode: number = 200
): Promise<NextResponse<ApiResponse<T>>> {
  const result = await operation();
  
  if (!result.success) {
    throw new ApiError(result.error || 'Operation failed');
  }

  return createSuccessResponse(result.data as T, successStatusCode);
}

/**
 * Validates request body against schema
 */
export function validateRequestBody<T>(
  body: unknown,
  schema: { parse: (data: unknown) => T }
): T {
  try {
    return schema.parse(body);
  } catch (error) {
    if (error instanceof ZodError) {
      throw error;
    }
    throw new ValidationError('Invalid request body');
  }
}

/**
 * Validates query parameters
 */
export function validateQueryParams<T>(
  searchParams: URLSearchParams,
  schema: { parse: (data: unknown) => T }
): T {
  const queryObject = Object.fromEntries(searchParams);
  
  // Convert string values to appropriate types for common fields
  const convertedQuery = Object.entries(queryObject).reduce((acc, [key, value]) => {
    // Handle common numeric fields
    if (['page', 'limit', 'offset', 'pageSize'].includes(key)) {
      const numValue = parseInt(value);
      acc[key] = isNaN(numValue) ? value : numValue;
    }
    // Handle boolean fields
    else if (['includeSteps', 'includeCosts', 'includeConfig', 'enabled'].includes(key)) {
      acc[key] = value === 'true';
    }
    // Handle date fields
    else if (key.includes('Date') || key.includes('At')) {
      acc[key] = value ? new Date(value) : value;
    }
    else {
      acc[key] = value;
    }
    return acc;
  }, {} as Record<string, any>);

  try {
    return schema.parse(convertedQuery);
  } catch (error) {
    if (error instanceof ZodError) {
      throw error;
    }
    throw new ValidationError('Invalid query parameters');
  }
}

/**
 * Rate limiting helper (basic in-memory implementation)
 */
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

export function rateLimit(
  identifier: string,
  maxRequests: number = 100,
  windowMs: number = 60000 // 1 minute
): boolean {
  const now = Date.now();
  const key = identifier;
  
  const current = rateLimitStore.get(key);
  
  if (!current || now > current.resetTime) {
    rateLimitStore.set(key, { count: 1, resetTime: now + windowMs });
    return true;
  }
  
  if (current.count >= maxRequests) {
    return false;
  }
  
  current.count++;
  return true;
}

/**
 * Extracts client identifier for rate limiting
 */
export function getClientIdentifier(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  const realIp = req.headers.get('x-real-ip');
  const ip = forwarded?.split(',')[0] || realIp || 'unknown';
  return ip;
}

/**
 * Middleware for rate limiting
 */
export function withRateLimit(
  maxRequests: number = 100,
  windowMs: number = 60000
) {
  return function<T>(
    handler: (req: NextRequest, ...args: any[]) => Promise<NextResponse<ApiResponse<T>>>
  ) {
    return async (req: NextRequest, ...args: any[]): Promise<NextResponse<ApiResponse<T>>> => {
      const clientId = getClientIdentifier(req);
      
      if (!rateLimit(clientId, maxRequests, windowMs)) {
        throw new ApiError('Rate limit exceeded', 429, 'RATE_LIMIT_EXCEEDED');
      }
      
      return handler(req, ...args);
    };
  };
}