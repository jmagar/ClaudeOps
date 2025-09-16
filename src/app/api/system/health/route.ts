export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const revalidate = 0;

import { NextRequest } from 'next/server';
import { 
  withErrorHandler, 
  handleAsyncOperation, 
  validateQueryParams,
  createSuccessResponse
} from '@/lib/middleware/errorHandler';
import { 
  HealthCheckQuerySchema,
  type HealthCheckQuery
} from '@/lib/middleware/validation';
import { isDatabaseHealthy } from '@/lib/db/connection';
import { promises as fs } from 'fs';
import { join } from 'path';
import type { HealthCheckResponse } from '@/lib/types/api';

/**
 * GET /api/system/health
 * Comprehensive system health check
 */
export const GET = withErrorHandler<HealthCheckResponse>(
  async (req: NextRequest) => {
    const searchParams = req.nextUrl.searchParams;
    const options = validateQueryParams(searchParams, HealthCheckQuerySchema);
    
    const checks: HealthCheckResponse['checks'] = {
      database: { status: 'down' },
      fileSystem: { status: 'down' },
      externalServices: {
        claude: { status: 'down' }
      }
    };
    
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    
    // Check database connectivity
    if (options.includeDatabase) {
      try {
        const dbStart = Date.now();
        // Use the existing health check function
        const isHealthy = isDatabaseHealthy();
        const dbTime = Date.now() - dbStart;
        
        if (isHealthy) {
          checks.database = {
            status: 'up',
            responseTime: dbTime
          };
        } else {
          throw new Error('Database health check failed');
        }
      } catch (error) {
        checks.database = {
          status: 'down',
          error: error instanceof Error ? error.message : 'Database connection failed'
        };
        overallStatus = 'unhealthy';
      }
    }
    
    // Check file system
    if (options.includeFileSystem) {
      try {
        const dataPath = join(process.cwd(), 'data');
        await fs.access(dataPath);
        
        const stats = await fs.stat(dataPath);
        const diskStats = typeof fs.statfs === 'function' 
          ? await fs.statfs(dataPath).catch(() => null)
          : null;
        
        checks.fileSystem = {
          status: 'up',
          freeSpace: diskStats?.bavail ? diskStats.bavail * diskStats.bsize : undefined,
          totalSpace: diskStats?.blocks ? diskStats.blocks * diskStats.bsize : undefined
        };
      } catch (error) {
        checks.fileSystem = {
          status: 'down',
          error: error instanceof Error ? error.message : 'File system check failed'
        };
        if (overallStatus !== 'unhealthy') {
          overallStatus = 'degraded';
        }
      }
    }
    
    // Check external services (Claude API)
    if (options.includeExternalServices) {
      try {
        const claudeStart = Date.now();
        
        // Simple check - just verify the API key is configured
        if (!process.env.ANTHROPIC_API_KEY) {
          throw new Error('Claude API key not configured');
        }
        
        // For a more thorough check, you could make an actual API call
        // but for health checks, we'll just verify configuration
        const claudeTime = Date.now() - claudeStart;
        
        checks.externalServices.claude = {
          status: 'up',
          responseTime: claudeTime
        };
      } catch (error) {
        checks.externalServices.claude = {
          status: 'down',
          error: error instanceof Error ? error.message : 'Claude API check failed'
        };
        if (overallStatus !== 'unhealthy') {
          overallStatus = 'degraded';
        }
      }
    }
    
    // Calculate uptime (simplified - would need more sophisticated tracking)
    const uptime = process.uptime() * 1000; // Convert to milliseconds
    
    const healthResponse: HealthCheckResponse = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      checks,
      version: process.env.npm_package_version || '0.1.0',
      uptime
    };
    
    return createSuccessResponse(healthResponse);
  }
);

// Note: Additional endpoints like /ping, /detailed would need separate route files
// in src/app/api/system/health/ping/route.ts, src/app/api/system/health/detailed/route.ts