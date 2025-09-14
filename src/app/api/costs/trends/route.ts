import { NextRequest } from 'next/server';
import { 
  withErrorHandler, 
  handleAsyncOperation, 
  validateQueryParams
} from '@/lib/middleware/errorHandler';
import { costService } from '@/lib/services/costService';
import { z } from 'zod';
import type { CostTrendData } from '@/lib/types/database';

const CostTrendsQuerySchema = z.object({
  period: z.enum(['day', 'week', 'month']).optional().default('day'),
  days: z.coerce.number().min(1).max(365).optional().default(30),
});

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