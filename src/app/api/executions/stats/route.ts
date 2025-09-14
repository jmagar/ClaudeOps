import { NextRequest } from 'next/server';
import { 
  withErrorHandler, 
  handleAsyncOperation
} from '@/lib/middleware/errorHandler';
import { executionService } from '@/lib/services/executionService';
import type { ExecutionStats } from '@/lib/types/database';

/**
 * GET /api/executions/stats
 * Get execution statistics with trends
 */
export const GET = withErrorHandler<ExecutionStats & { trends?: any }>(
  async (req: NextRequest) => {
    const searchParams = req.nextUrl.searchParams;
    const includeTrends = searchParams.get('includeTrends') !== 'false'; // default to true
    
    return handleAsyncOperation(async () => {
      // Get basic stats
      const stats = await executionService.getExecutionStats();
      
      // Add trend data if requested
      if (includeTrends) {
        const trends = await executionService.getExecutionTrends();
        return {
          ...stats,
          trends
        };
      }
      
      return stats;
    });
  }
);