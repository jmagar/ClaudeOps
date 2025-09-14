import { NextRequest } from 'next/server';
import { 
  withErrorHandler, 
  handleAsyncOperation, 
  validateRequestBody,
  validateQueryParams,
  createSuccessResponse
} from '@/lib/middleware/errorHandler';
import { 
  UpdateAgentConfigSchema,
  type UpdateAgentConfigRequest
} from '@/lib/middleware/validation';
import { agentService } from '@/lib/services/agentService';
import { z } from 'zod';
import type { AgentConfiguration } from '@/lib/types/database';

interface RouteContext {
  params: Promise<{ type: string }>;
}

/**
 * GET /api/agents/[type]
 * Get agent configuration by type
 */
export const GET = withErrorHandler<AgentConfiguration>(
  async (req: NextRequest, context: RouteContext) => {
    const { type } = await context.params;
    
    return handleAsyncOperation(
      () => agentService.getAgentByType(type)
    );
  }
);

/**
 * PUT /api/agents/[type]
 * Update agent configuration
 */
export const PUT = withErrorHandler<AgentConfiguration>(
  async (req: NextRequest, context: RouteContext) => {
    const { type } = await context.params;
    const body = await req.json();
    const validatedData = validateRequestBody(body, UpdateAgentConfigSchema);
    
    // Convert config object to JSON string if provided
    const updateData = {
      ...validatedData,
      config: validatedData.config || (body.config ? JSON.stringify(body.config) : undefined)
    };
    
    return handleAsyncOperation(
      () => agentService.updateAgentConfiguration(type, updateData)
    );
  }
);

/**
 * DELETE /api/agents/[type]
 * Delete agent configuration
 */
export const DELETE = withErrorHandler<void>(
  async (req: NextRequest, context: RouteContext) => {
    const { type } = await context.params;
    const searchParams = req.nextUrl.searchParams;
    const force = searchParams.get('force') === 'true';
    
    return handleAsyncOperation(
      () => agentService.deleteAgentConfiguration(type, force)
    );
  }
);

/**
 * PATCH /api/agents/[type]
 * Toggle agent enabled status
 */
export const PATCH = withErrorHandler<AgentConfiguration>(
  async (req: NextRequest, context: RouteContext) => {
    const { type } = await context.params;
    
    const EnabledToggleSchema = z.object({
      enabled: z.boolean()
    });
    
    const body = await req.json();
    const { enabled } = validateRequestBody(body, EnabledToggleSchema);
    
    return handleAsyncOperation(
      () => agentService.toggleAgentEnabled(type, enabled)
    );
  }
);

// Note: Additional endpoints like /summary, /can-execute would need separate route files
// in src/app/api/agents/[type]/summary/route.ts, src/app/api/agents/[type]/can-execute/route.ts