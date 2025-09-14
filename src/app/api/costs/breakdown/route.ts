import { NextRequest } from 'next/server';
import { 
  withErrorHandler, 
  handleAsyncOperation, 
  validateQueryParams
} from '@/lib/middleware/errorHandler';
import { 
  CostAnalysisQuerySchema,
  type CostAnalysisQuery
} from '@/lib/middleware/validation';
import { costService } from '@/lib/services/costService';
import type { CostTracking } from '@/lib/types/database';

/**
 * GET /api/costs/breakdown
 * Get detailed cost breakdown with filtering
 */
export const GET = withErrorHandler<CostTracking[]>(
  async (req: NextRequest) => {
    const searchParams = req.nextUrl.searchParams;
    const filterParams = validateQueryParams(searchParams, CostAnalysisQuerySchema);
    
    const { page, limit, ...filters } = filterParams;
    
    return handleAsyncOperation(
      () => costService.getCostAnalysis(filters)
    );
  }
);