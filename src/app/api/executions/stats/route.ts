import { NextRequest } from 'next/server';
import { 
  withErrorHandler, 
  handleAsyncOperation
} from '@/lib/middleware/errorHandler';
import { executionService } from '@/lib/services/executionService';
import type { ExecutionStats } from '@/lib/types/database';

interface ExecutionTrends {
  totalChange: number;
  completionRateChange: number;
  averageDurationChange: number;
  costChange: number;
}

/**
 * GET /api/executions/stats
 * Get execution statistics with trends
 */
export const GET = withErrorHandler<ExecutionStats & { trends?: ExecutionTrends }>(
  async (req: NextRequest) => {
    const searchParams = req.nextUrl.searchParams;
    const includeTrends = searchParams.get('includeTrends') !== 'false'; // default to true
    
    return handleAsyncOperation(async () => {
      if (includeTrends) {
        // Fetch stats and trends in parallel
        const [stats, trends] = await Promise.all([
          executionService.getExecutionStats(),
          executionService.getExecutionTrends()
        ]);
        return { ...stats, trends };
      } else {
        return await executionService.getExecutionStats();
      }
    });
  }
);