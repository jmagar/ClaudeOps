import { NextRequest } from 'next/server';
import { 
  withErrorHandler, 
  handleAsyncOperation, 
  validateRequestBody,
  validateQueryParams
} from '@/lib/middleware/errorHandler';
import { 
  RecordCostSchema,
  CostAnalysisQuerySchema
} from '@/lib/middleware/validation';
import { costService } from '@/lib/services/costService';
import type { CostTracking } from '@/lib/types/database';
import type { PaginationResponse } from '@/lib/types/api';

/**
 * GET /api/costs
 * Get cost analysis with filtering
 */
export const GET = withErrorHandler<CostTracking[]>(
  async (req: NextRequest) => {
    const searchParams = req.nextUrl.searchParams;
    const filterParams = validateQueryParams(searchParams, CostAnalysisQuerySchema);
    
    return handleAsyncOperation(
      () => costService.getCostAnalysis(filterParams)
    );
  }
);

/**
 * POST /api/costs
 * Record cost data for an execution
 */
export const POST = withErrorHandler<CostTracking>(
  async (req: NextRequest) => {
    const body = await req.json();
    const costData = validateRequestBody(body, RecordCostSchema);
    
    return handleAsyncOperation(
      () => costService.recordCost(costData),
      201
    );
  }
);

// Note: Additional endpoints like /current, /stats, /trends, /from-tokens would need separate route files
// in src/app/api/costs/current/route.ts, src/app/api/costs/stats/route.ts, etc.