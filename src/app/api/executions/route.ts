import { NextRequest } from 'next/server';
import { 
  withErrorHandler, 
  handleAsyncOperation, 
  validateRequestBody,
  validateQueryParams,
  createSuccessResponse
} from '@/lib/middleware/errorHandler';
import { 
  CreateExecutionSchema, 
  ExecutionFilterSchema,
  type CreateExecutionRequest,
  type ExecutionFilterParams
} from '@/lib/middleware/validation';
import { executionService } from '@/lib/services/executionService';
import type { ApiResponse, PaginatedApiResponse } from '@/lib/types/api';
import type { Execution, PaginatedResult } from '@/lib/types/database';

/**
 * GET /api/executions
 * List executions with filtering, pagination, and sorting
 */
export const GET = withErrorHandler<PaginatedResult<Execution>>(
  async (req: NextRequest) => {
    const searchParams = req.nextUrl.searchParams;
    const filterParams = validateQueryParams(searchParams, ExecutionFilterSchema);
    
    const {
      page = 1,
      limit = 20,
      sortBy,
      sortOrder,
      ...filters
    } = filterParams;

    // Clamp page to at least 1 to prevent negative offset
    const safePage = Math.max(1, page);
    
    // Convert page to offset
    const offset = (safePage - 1) * limit;
    
    const executionFilter = {
      ...filters,
      limit,
      offset,
      sortBy,
      sortOrder
    };

    // Include related data options
    const includeSteps = searchParams.get('includeSteps') === 'true';
    const includeCosts = searchParams.get('includeCosts') === 'true';

    return handleAsyncOperation(
      () => executionService.getExecutions(executionFilter, { includeSteps, includeCosts })
    );
  }
);

/**
 * POST /api/executions
 * Create a new execution
 */
export const POST = withErrorHandler<Execution>(
  async (req: NextRequest) => {
    const body = await req.json();
    const executionData = validateRequestBody(body, CreateExecutionSchema);
    
    // Add default values
    const newExecutionData = {
      ...executionData,
      status: 'pending' as const,
      startedAt: new Date().toISOString(),
      nodeId: executionData.nodeId || 'localhost',
    };

    return handleAsyncOperation(
      () => executionService.createExecution(newExecutionData),
      201
    );
  }
);

// Note: Additional endpoints like /stats, /recent, /running would need separate route files
// in src/app/api/executions/stats/route.ts, src/app/api/executions/recent/route.ts, etc.