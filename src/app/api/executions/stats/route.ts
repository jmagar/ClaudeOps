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
    
    return handleAsyncOperation<ExecutionStats & { trends?: ExecutionTrends }>(async () => {
      if (includeTrends) {
        // Fetch stats and trends in parallel
        const [stats, trends] = await Promise.all([
          executionService.getExecutionStats(),
          executionService.getExecutionTrends()
        ]);
        
        // Unwrap the stats from the service response
        const statsData = stats.success ? stats.data : undefined;
        const trendsData = trends.success ? trends.data : undefined;
        
        if (!statsData) {
          return { success: false, error: stats.error || 'Failed to fetch stats' };
        }
        
        return { success: true, data: { ...statsData, trends: trendsData } };
      } else {
        const statsResult = await executionService.getExecutionStats();
        if (!statsResult.success) {
          return { success: false, error: statsResult.error || 'Failed to fetch stats' };
        }
        return { success: true, data: statsResult.data };
      }
    });
  }
);