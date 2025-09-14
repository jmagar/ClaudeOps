'use client';

import React, { useMemo, useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, DollarSign, Zap, Clock, Activity } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';

interface CostData {
  current: number;
  total: number;
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
    cacheHits?: number;
  };
}

interface CostTrackerProps {
  executionId: string;
  cost: CostData;
  agentType: string;
  className?: string;
}

// Cost thresholds for different badge variants
const COST_THRESHOLDS = {
  low: 0.01,      // $0.01
  medium: 0.05,   // $0.05
  high: 0.20,     // $0.20
  very_high: 1.00 // $1.00
};

// Estimated cost ranges for different agent types
const AGENT_COST_ESTIMATES = {
  'system-health': { min: 0.02, max: 0.08, avg: 0.05 },
  'docker-janitor': { min: 0.05, max: 0.15, avg: 0.10 },
  'backup-validator': { min: 0.01, max: 0.05, avg: 0.03 },
  'default': { min: 0.01, max: 0.10, avg: 0.05 }
};

// Token pricing (Claude 3.5 Sonnet rates as of 2024)
const TOKEN_PRICING = {
  inputTokens: 3.00 / 1_000_000,  // $3.00 per million tokens
  outputTokens: 15.00 / 1_000_000, // $15.00 per million tokens
  cacheHits: 0.30 / 1_000_000     // $0.30 per million cached tokens
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 4,
    maximumFractionDigits: 4
  }).format(amount);
}

function formatTokens(tokens: number): string {
  if (tokens < 1000) return tokens.toString();
  if (tokens < 1_000_000) return `${(tokens / 1000).toFixed(1)}K`;
  return `${(tokens / 1_000_000).toFixed(2)}M`;
}

function getCostBadgeVariant(cost: number): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (cost >= COST_THRESHOLDS.very_high) return 'destructive';
  if (cost >= COST_THRESHOLDS.high) return 'secondary';
  if (cost >= COST_THRESHOLDS.medium) return 'default';
  return 'outline';
}

function getCostTrendIcon(current: number, estimated: number) {
  if (current > estimated * 1.2) return <TrendingUp className="h-4 w-4 text-red-500" />;
  if (current < estimated * 0.8) return <TrendingDown className="h-4 w-4 text-green-500" />;
  return <Activity className="h-4 w-4 text-blue-500" />;
}

export default function CostTracker({ 
  executionId, 
  cost, 
  agentType, 
  className = '' 
}: CostTrackerProps) {
  const [monthlyCost, setMonthlyCost] = useState(0);
  const [dailyCost, setDailyCost] = useState(0);
  const [loading, setLoading] = useState(true);

  // Fetch cost context data
  useEffect(() => {
    const fetchCostContext = async () => {
      try {
        setLoading(true);
        
        // Fetch current month costs
        const monthlyResponse = await fetch('/api/costs/summary?period=month');
        if (monthlyResponse.ok) {
          const monthlyData = await monthlyResponse.json();
          setMonthlyCost(monthlyData.total || 0);
        }
        
        // Fetch current day costs
        const dailyResponse = await fetch('/api/costs/summary?period=day');
        if (dailyResponse.ok) {
          const dailyData = await dailyResponse.json();
          setDailyCost(dailyData.total || 0);
        }
      } catch (error) {
        console.error('Failed to fetch cost context:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchCostContext();
  }, []);

  // Calculate token cost breakdown
  const tokenCostBreakdown = useMemo(() => {
    if (!cost.tokenUsage) return null;
    
    const { inputTokens, outputTokens, cacheHits = 0 } = cost.tokenUsage;
    
    return {
      inputCost: inputTokens * TOKEN_PRICING.inputTokens,
      outputCost: outputTokens * TOKEN_PRICING.outputTokens,
      cacheCost: cacheHits * TOKEN_PRICING.cacheHits,
      totalTokenCost: 
        (inputTokens * TOKEN_PRICING.inputTokens) + 
        (outputTokens * TOKEN_PRICING.outputTokens) + 
        (cacheHits * TOKEN_PRICING.cacheHits)
    };
  }, [cost.tokenUsage]);

  // Get agent cost estimates
  const agentEstimate = AGENT_COST_ESTIMATES[agentType as keyof typeof AGENT_COST_ESTIMATES] 
    || AGENT_COST_ESTIMATES.default;

  // Calculate progress based on estimated cost
  const costProgress = Math.min((cost.current / agentEstimate.max) * 100, 100);
  
  // Determine if cost is trending high
  const isHighCost = cost.current > agentEstimate.avg * 1.5;
  const isLowCost = cost.current < agentEstimate.avg * 0.5;

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-green-600" />
            Cost Tracking
          </div>
          <Badge variant={getCostBadgeVariant(cost.current)}>
            {formatCurrency(cost.current)}
          </Badge>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Current Execution Cost */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Current Execution</span>
            <div className="flex items-center gap-1">
              {getCostTrendIcon(cost.current, agentEstimate.avg)}
              <span className="font-medium">{formatCurrency(cost.current)}</span>
            </div>
          </div>
          
          {/* Cost progress bar */}
          <div className="space-y-2">
            <Progress value={costProgress} className="h-2" />
            <div className="flex justify-between text-xs text-gray-500">
              <span>Estimated: {formatCurrency(agentEstimate.min)} - {formatCurrency(agentEstimate.max)}</span>
              <span>Avg: {formatCurrency(agentEstimate.avg)}</span>
            </div>
          </div>

          {/* Cost trend indicator */}
          {isHighCost && (
            <div className="px-3 py-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                <span>Cost is higher than average for this agent type</span>
              </div>
            </div>
          )}
          
          {isLowCost && (
            <div className="px-3 py-2 bg-green-50 border border-green-200 rounded text-sm text-green-700">
              <div className="flex items-center gap-2">
                <TrendingDown className="h-4 w-4" />
                <span>Cost is lower than average - efficient execution</span>
              </div>
            </div>
          )}
        </div>

        {/* Token Usage Breakdown */}
        {tokenCostBreakdown && (
          <div className="space-y-3">
            <div className="text-sm font-medium text-gray-900 border-t pt-3">Token Usage</div>
            
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Input tokens:</span>
                <span className="font-mono">
                  {formatTokens(cost.tokenUsage!.inputTokens)} 
                  <span className="text-gray-500 ml-1">
                    ({formatCurrency(tokenCostBreakdown.inputCost)})
                  </span>
                </span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-gray-600">Output tokens:</span>
                <span className="font-mono">
                  {formatTokens(cost.tokenUsage!.outputTokens)}
                  <span className="text-gray-500 ml-1">
                    ({formatCurrency(tokenCostBreakdown.outputCost)})
                  </span>
                </span>
              </div>
              
              {cost.tokenUsage!.cacheHits && cost.tokenUsage!.cacheHits > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Cache hits:</span>
                  <span className="font-mono text-green-600">
                    {formatTokens(cost.tokenUsage!.cacheHits)}
                    <span className="text-gray-500 ml-1">
                      ({formatCurrency(tokenCostBreakdown.cacheCost)})
                    </span>
                  </span>
                </div>
              )}
              
              <div className="border-t pt-2 flex justify-between font-medium">
                <span>Total token cost:</span>
                <span className="font-mono">{formatCurrency(tokenCostBreakdown.totalTokenCost)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Cost Context */}
        {!loading && (
          <div className="space-y-3">
            <div className="text-sm font-medium text-gray-900 border-t pt-3">Cost Context</div>
            
            <div className="grid grid-cols-2 gap-3">
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <div className="text-xs text-gray-500 mb-1">Today's Total</div>
                <div className="text-sm font-medium">{formatCurrency(dailyCost)}</div>
                <div className="text-xs text-gray-500 mt-1">
                  +{(() => {
                    const guardedPercent = dailyCost === 0 ? 0 : (cost.current / dailyCost) * 100;
                    return isFinite(guardedPercent) ? guardedPercent.toFixed(1) : '0.0';
                  })()}%
                </div>
              </div>
              
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <div className="text-xs text-gray-500 mb-1">This Month</div>
                <div className="text-sm font-medium">{formatCurrency(monthlyCost)}</div>
                <div className="text-xs text-gray-500 mt-1">
                  +{(() => {
                    const guardedPercent = monthlyCost === 0 ? 0 : (cost.current / monthlyCost) * 100;
                    return isFinite(guardedPercent) ? guardedPercent.toFixed(1) : '0.0';
                  })()}%
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Cost Efficiency Metrics */}
        <div className="space-y-3">
          <div className="text-sm font-medium text-gray-900 border-t pt-3">Efficiency Metrics</div>
          
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-gray-600 flex items-center gap-1">
                <Zap className="h-3 w-3" />
                Cost per token:
              </span>
              <span className="font-mono">
                {cost.tokenUsage && (cost.tokenUsage.inputTokens + cost.tokenUsage.outputTokens) > 0
                  ? formatCurrency(cost.current / (cost.tokenUsage.inputTokens + cost.tokenUsage.outputTokens))
                  : 'N/A'
                }
              </span>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-gray-600 flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Estimated time:
              </span>
              <span className="text-gray-500">
                {/* This would be calculated based on typical execution times */}
                ~2-5 min
              </span>
            </div>
          </div>
        </div>

        {/* Cost Optimization Tips */}
        {isHighCost && (
          <div className="bg-blue-50 border border-blue-200 rounded p-3">
            <div className="text-sm font-medium text-blue-900 mb-2">💡 Cost Optimization Tips</div>
            <ul className="text-xs text-blue-800 space-y-1">
              <li>• Consider adjusting the agent configuration</li>
              <li>• Review if all data collection is necessary</li>
              <li>• Check for redundant analysis steps</li>
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}