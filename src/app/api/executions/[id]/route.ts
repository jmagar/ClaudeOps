import { NextRequest } from 'next/server';
import { z } from 'zod';
import { 
  withErrorHandler, 
  handleAsyncOperation, 
  validateRequestBody,
  validateQueryParams,
  ValidationError
} from '@/lib/middleware/errorHandler';
import { 
  UpdateExecutionSchema,
  ExecutionDetailQuerySchema,
  type UpdateExecutionRequest,
  type ExecutionDetailQuery
} from '@/lib/middleware/validation';
import { executionService } from '@/lib/services/executionService';
import type { Execution, ExecutionWithDetails } from '@/lib/types/database';

interface RouteContext {
  params: { id: string };
}

// Schema for DELETE query validation
const DeleteExecutionQuerySchema = z.object({
  hard: z.coerce.boolean().optional().default(false)
});

/**
 * GET /api/executions/[id]
 * Get execution by ID with optional related data
 */
export const GET = withErrorHandler<Execution | ExecutionWithDetails>(
  async (req: NextRequest, context: RouteContext) => {
    const { id } = context.params;
    const searchParams = req.nextUrl.searchParams;
    const queryOptions = validateQueryParams(searchParams, ExecutionDetailQuerySchema);
    
    return handleAsyncOperation(
      () => executionService.getExecutionById(id, queryOptions)
    );
  }
);

/**
 * PUT /api/executions/[id]
 * Update execution
 */
export const PUT = withErrorHandler<Execution>(
  async (req: NextRequest, context: RouteContext) => {
    const { id } = context.params;
    const body = await req.json();
    const validatedData = validateRequestBody(body, UpdateExecutionSchema);
    
    // Handle logs and aiAnalysis: only stringify if they're not already strings
    const updateData = {
      ...validatedData,
      logs: validatedData.logs ?? (body.logs !== undefined ? 
        (typeof body.logs === 'string' ? body.logs : JSON.stringify(body.logs)) : undefined),
      aiAnalysis: validatedData.aiAnalysis ?? (body.aiAnalysis !== undefined ? 
        (typeof body.aiAnalysis === 'string' ? body.aiAnalysis : JSON.stringify(body.aiAnalysis)) : undefined)
    };
    
    return handleAsyncOperation(
      () => executionService.updateExecution(id, updateData)
    );
  }
);

/**
 * DELETE /api/executions/[id]
 * Delete execution (soft delete by default)
 */
export const DELETE = withErrorHandler<void>(
  async (req: NextRequest, context: RouteContext) => {
    const { id } = context.params;
    const searchParams = req.nextUrl.searchParams;
    
    try {
      const queryOptions = validateQueryParams(searchParams, DeleteExecutionQuerySchema);
      const { hard: hardDelete } = queryOptions;
      
      return handleAsyncOperation(
        () => executionService.deleteExecution(id, hardDelete)
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return handleAsyncOperation(
        () => Promise.reject(new ValidationError('Invalid query parameters', message))
      );
    }
  }
);

// Note: Additional endpoints like /steps would need separate route files
// in src/app/api/executions/[id]/steps/route.ts