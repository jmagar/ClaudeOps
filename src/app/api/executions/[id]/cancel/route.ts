import { NextRequest } from 'next/server';
import { z } from 'zod';
import { 
  withErrorHandler, 
  handleAsyncOperation
} from '@/lib/middleware/errorHandler';
import { executionService } from '@/lib/services/executionService';
import type { Execution } from '@/lib/types/database';

interface RouteContext {
  params: { id: string };
}

// Schema for cancel request body validation
const CancelExecutionBodySchema = z.object({
  reason: z.string().optional()
}).optional();

/**
 * POST /api/executions/[id]/cancel
 * Cancel a running execution
 */
export const POST = withErrorHandler<Execution>(
  async (req: NextRequest, context: RouteContext) => {
    const { id } = context.params;
    
    // Validate request body and extract reason
    let reason: string | undefined;
    try {
      const body = await req.json();
      const validatedBody = CancelExecutionBodySchema.parse(body);
      reason = validatedBody?.reason;
      
      // Type check reason to ensure it's a string or undefined
      if (reason !== undefined && typeof reason !== 'string') {
        return handleAsyncOperation(
          () => Promise.reject(new Error('Reason must be a string')),
          400
        );
      }
    } catch (error) {
      // If JSON parsing fails or validation fails, return 400
      if (error instanceof SyntaxError) {
        // Empty body is OK, continue with no reason
        reason = undefined;
      } else {
        return handleAsyncOperation(
          () => Promise.reject(new Error('Invalid request body')),
          400
        );
      }
    }
    
    return handleAsyncOperation(
      () => executionService.cancelExecution(id, reason),
      202 // Return 202 Accepted for cancellation requests
    );
  }
);