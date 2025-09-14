import { NextRequest } from 'next/server';
import { 
  withErrorHandler, 
  handleAsyncOperation, 
  validateQueryParams,
  validateRequestBody
} from '@/lib/middleware/errorHandler';
import { costService } from '@/lib/services/costService';
import { z } from 'zod';
import type { CostAlert } from '@/lib/types/database';

/**
 * GET /api/costs/summary
 * Get comprehensive cost summary including alerts
 */
export const GET = withErrorHandler(
  async (req: NextRequest) => {
    const searchParams = req.nextUrl.searchParams;
    
    // Get budget parameters for alert checking
    const monthlyBudget = searchParams.get('monthlyBudget');
    const dailyBudget = searchParams.get('dailyBudget');
    const perExecutionBudget = searchParams.get('perExecutionBudget');
    
    const budgets = {
      ...(monthlyBudget && { monthly: parseFloat(monthlyBudget) }),
      ...(dailyBudget && { daily: parseFloat(dailyBudget) }),
      ...(perExecutionBudget && { perExecution: parseFloat(perExecutionBudget) })
    };
    
    // Get cost stats and alerts in parallel
    const [statsResult, alertsResult] = await Promise.all([
      costService.getCostStats(),
      Object.keys(budgets).length > 0 ? costService.checkCostAlerts(budgets) : null
    ]);
    
    if (!statsResult.success) {
      throw new Error(statsResult.error || 'Failed to get cost stats');
    }
    
    const summary = {
      stats: statsResult.data,
      alerts: alertsResult?.success ? alertsResult.data : []
    };
    
    return handleAsyncOperation(
      () => Promise.resolve({ success: true, data: summary })
    );
  }
);

/**
 * POST /api/costs/summary/alerts
 * Check cost alerts against budget thresholds
 */
export const POST = withErrorHandler<CostAlert[]>(
  async (req: NextRequest) => {
    const BudgetSchema = z.object({
      monthly: z.number().positive().optional(),
      daily: z.number().positive().optional(),
      perExecution: z.number().positive().optional()
    });
    
    const body = await req.json();
    const budgets = validateRequestBody(body, BudgetSchema);
    
    return handleAsyncOperation(
      () => costService.checkCostAlerts(budgets)
    );
  }
);

// Note: Additional endpoints like /monthly would need separate route files
// in src/app/api/costs/summary/monthly/route.ts