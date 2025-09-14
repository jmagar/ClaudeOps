import { NextRequest } from 'next/server';
import { 
  withErrorHandler, 
  handleAsyncOperation, 
  validateRequestBody,
  validateQueryParams,
  NotFoundError
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
  params: Promise<{ id: string }>;
}

/**
 * GET /api/executions/[id]
 * Get execution by ID with optional related data
 */
export const GET = withErrorHandler<Execution | ExecutionWithDetails>(
  async (req: NextRequest, context: RouteContext) => {
    const { id } = await context.params;
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
    const { id } = await context.params;
    const body = await req.json();
    const validatedData = validateRequestBody(body, UpdateExecutionSchema);
    
    // Convert arrays/objects to JSON strings if provided
    const updateData = {
      ...validatedData,
      logs: validatedData.logs || (body.logs ? JSON.stringify(body.logs) : undefined),
      aiAnalysis: validatedData.aiAnalysis || (body.aiAnalysis ? JSON.stringify(body.aiAnalysis) : undefined)
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
    const { id } = await context.params;
    const searchParams = req.nextUrl.searchParams;
    const hardDelete = searchParams.get('hard') === 'true';
    
    return handleAsyncOperation(
      () => executionService.deleteExecution(id, hardDelete)
    );
  }
);

// Note: Additional endpoints like /steps would need separate route files
// in src/app/api/executions/[id]/steps/route.ts