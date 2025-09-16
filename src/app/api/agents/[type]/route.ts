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
  params: { type: string };
}

// Schema for toggling agent enabled status
const EnabledToggleSchema = z.object({
  enabled: z.boolean()
});

// Schema for DELETE query params (force parameter)
const DeleteQuerySchema = z.object({
  force: z.preprocess(
    (val) => {
      if (val === 'true') return true;
      if (val === 'false') return false;
      return val;
    },
    z.boolean().default(false)
  )
});

/**
 * GET /api/agents/[type]
 * Get agent configuration by type
 */
export const GET = withErrorHandler<AgentConfiguration>(
  async (req: NextRequest, context: RouteContext) => {
    const { type } = context.params;
    
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
    const { type } = context.params;
    const body = await req.json();
    const validatedData = validateRequestBody(body, UpdateAgentConfigSchema);
    
    // Normalize config to a single JSON string deterministically
    let normalizedConfig: string | undefined;
    if (typeof validatedData.config === 'string') {
      normalizedConfig = validatedData.config;
    } else if (validatedData.config !== undefined) {
      normalizedConfig = JSON.stringify(validatedData.config);
    } else if (body.config !== undefined && typeof body.config !== 'string') {
      normalizedConfig = JSON.stringify(body.config);
    } else if (typeof body.config === 'string') {
      normalizedConfig = body.config;
    } else {
      normalizedConfig = undefined;
    }
    
    const updateData = {
      ...validatedData,
      config: normalizedConfig
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
    const { type } = context.params;
    const searchParams = req.nextUrl.searchParams;
    const { force } = validateQueryParams(searchParams, DeleteQuerySchema);
    
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
    const { type } = context.params;
    
    const body = await req.json();
    const { enabled } = validateRequestBody(body, EnabledToggleSchema);
    
    return handleAsyncOperation(
      () => agentService.toggleAgentEnabled(type, enabled)
    );
  }
);

// Note: Additional endpoints like /summary, /can-execute would need separate route files
// in src/app/api/agents/[type]/summary/route.ts, src/app/api/agents/[type]/can-execute/route.ts