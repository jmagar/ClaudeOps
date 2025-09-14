import { NextRequest } from 'next/server';
import { 
  withErrorHandler, 
  handleAsyncOperation, 
  validateQueryParams
} from '@/lib/middleware/errorHandler';
import { costService } from '@/lib/services/costService';
import { z } from 'zod';

// Budget query parameters schema
const BudgetQuerySchema = z.object({
  monthlyBudget: z.coerce.number().refine(v => !Number.isNaN(v) && v > 0, {
    message: "monthlyBudget must be a positive number"
  }).optional(),
  dailyBudget: z.coerce.number().refine(v => !Number.isNaN(v) && v > 0, {
    message: "dailyBudget must be a positive number"
  }).optional(),
  perExecutionBudget: z.coerce.number().refine(v => !Number.isNaN(v) && v > 0, {
    message: "perExecutionBudget must be a positive number"
  }).optional()
});

type BudgetQuery = z.infer<typeof BudgetQuerySchema>;

/**
 * GET /api/costs/summary
 * Get comprehensive cost summary including alerts
 */
export const GET = withErrorHandler(
  async (req: NextRequest) => {
    const searchParams = req.nextUrl.searchParams;
    
    // Validate budget parameters
    const queryParams = validateQueryParams(searchParams, BudgetQuerySchema);
    
    // Build budgets object with only defined values
    const budgets: Record<string, number> = {};
    if (queryParams.monthlyBudget !== undefined) {
      budgets.monthly = queryParams.monthlyBudget;
    }
    if (queryParams.dailyBudget !== undefined) {
      budgets.daily = queryParams.dailyBudget;
    }
    if (queryParams.perExecutionBudget !== undefined) {
      budgets.perExecution = queryParams.perExecutionBudget;
    }
    
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

// Note: Additional endpoints like /monthly would need separate route files
// in src/app/api/costs/summary/monthly/route.ts