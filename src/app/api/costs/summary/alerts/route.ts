import { NextRequest } from 'next/server';
import { 
  withErrorHandler, 
  handleAsyncOperation, 
  validateRequestBody
} from '@/lib/middleware/errorHandler';
import { costService } from '@/lib/services/costService';
import { z } from 'zod';
import type { CostAlert } from '@/lib/types/database';

/**
 * POST /api/costs/summary/alerts
 * Check cost alerts against budget thresholds
 */
export const POST = withErrorHandler<CostAlert[]>(
  async (req: NextRequest) => {
    const BudgetSchema = z.object({
      monthly: z.coerce.number().positive().optional(),
      daily: z.coerce.number().positive().optional(),
      perExecution: z.coerce.number().positive().optional()
    });
    
    const body = await req.json();
    const budgets = validateRequestBody(body, BudgetSchema);
    
    return handleAsyncOperation(
      () => costService.checkCostAlerts(budgets)
    );
  }
);