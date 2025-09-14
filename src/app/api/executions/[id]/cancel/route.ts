import { NextRequest } from 'next/server';
import { 
  withErrorHandler, 
  handleAsyncOperation
} from '@/lib/middleware/errorHandler';
import { executionService } from '@/lib/services/executionService';
import type { Execution } from '@/lib/types/database';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/executions/[id]/cancel
 * Cancel a running execution
 */
export const POST = withErrorHandler<Execution>(
  async (req: NextRequest, context: RouteContext) => {
    const { id } = await context.params;
    
    // Get reason from request body if provided
    let reason: string | undefined;
    try {
      const body = await req.json();
      reason = body.reason;
    } catch {
      // Ignore JSON parsing errors for optional body
    }
    
    return handleAsyncOperation(
      () => executionService.cancelExecution(id, reason)
    );
  }
);