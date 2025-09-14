import { NextRequest } from 'next/server';
import { 
  withErrorHandler, 
  handleAsyncOperation, 
  validateRequestBody,
  validateQueryParams
} from '@/lib/middleware/errorHandler';
import { 
  CreateAgentConfigSchema,
  AgentListQuerySchema,
  type CreateAgentConfigRequest,
  type AgentListQuery
} from '@/lib/middleware/validation';
import { agentService } from '@/lib/services/agentService';
import type { AgentConfiguration, PaginatedResult, AgentPerformance } from '@/lib/types/database';

/**
 * GET /api/agents
 * List agent configurations with filtering and pagination
 */
export const GET = withErrorHandler<PaginatedResult<AgentConfiguration>>(
  async (req: NextRequest) => {
    const searchParams = req.nextUrl.searchParams;
    const queryParams = validateQueryParams(searchParams, AgentListQuerySchema);
    
    const { page, limit, ...options } = queryParams;
    
    // Convert page to offset
    const offset = (page - 1) * limit;
    
    const listOptions = {
      ...options,
      limit,
      offset
    };

    return handleAsyncOperation(
      () => agentService.getAgentConfigurations(listOptions)
    );
  }
);

/**
 * POST /api/agents
 * Create a new agent configuration
 */
export const POST = withErrorHandler<AgentConfiguration>(
  async (req: NextRequest) => {
    const body = await req.json();
    const validatedData = validateRequestBody(body, CreateAgentConfigSchema);
    
    // Convert config object to JSON string if provided
    const agentData = {
      ...validatedData,
      config: validatedData.config || (body.config ? JSON.stringify(body.config) : undefined)
    };
    
    return handleAsyncOperation(
      () => agentService.createAgentConfiguration(agentData),
      201
    );
  }
);

// Note: Additional endpoints like /enabled, /performance would need separate route files
// in src/app/api/agents/enabled/route.ts, src/app/api/agents/performance/route.ts