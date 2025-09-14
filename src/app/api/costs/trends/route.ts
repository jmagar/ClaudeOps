import { NextRequest } from 'next/server';
import { 
  withErrorHandler, 
  handleAsyncOperation, 
  validateQueryParams
} from '@/lib/middleware/errorHandler';
import { CostTrendsQuerySchema } from '@/lib/middleware/validation';
import { costService } from '@/lib/services/costService';
import type { CostTrendData } from '@/lib/types/database';

/**
 * GET /api/costs/trends
 * Get cost trends over time
 */
export const GET = withErrorHandler<CostTrendData[]>(
  async (req: NextRequest) => {
    const searchParams = req.nextUrl.searchParams;
    const { period, days } = validateQueryParams(searchParams, CostTrendsQuerySchema);
    
    return handleAsyncOperation(
      () => costService.getCostTrends(period, days)
    );
  }
);