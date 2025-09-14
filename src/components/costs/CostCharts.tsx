'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, BarChart3, LineChart, PieChart } from 'lucide-react';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import {
  AreaChart,
  Area,
  LineChart as RechartsLineChart,
  Line,
  BarChart,
  Bar,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import type { CostTrendData } from '@/lib/types/database';

interface CostAnalysisData {
  id: string;
  executionId: string;
  modelUsed: string;
  agentType: string;
  totalCostUsd: number;
  inputTokens: number;
  outputTokens: number;
  timestamp: string;
}

interface AgentCostData {
  agentType: string;
  totalCost: number;
  executionCount: number;
  avgCost: number;
}

type PeriodType = 'day' | 'week' | 'month';
type ChartType = 'line' | 'area' | 'bar';

const chartConfig: ChartConfig = {
  totalCost: {
    label: 'Total Cost',
    color: 'hsl(var(--chart-1))',
  },
  executionCount: {
    label: 'Executions',
    color: 'hsl(var(--chart-2))',
  },
  tokenUsage: {
    label: 'Token Usage',
    color: 'hsl(var(--chart-3))',
  },
  averageCostPerExecution: {
    label: 'Avg Cost',
    color: 'hsl(var(--chart-4))',
  },
};

const agentColors = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
];

export function CostCharts() {
  const [trendData, setTrendData] = useState<CostTrendData[]>([]);
  const [agentData, setAgentData] = useState<AgentCostData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<PeriodType>('day');
  const [chartType, setChartType] = useState<ChartType>('area');
  const [days, setDays] = useState(30);

  useEffect(() => {
    fetchTrendData();
    fetchAgentData();
  }, [period, days]);

  const fetchTrendData = async () => {
    try {
      const response = await fetch(`/api/costs/trends?period=${period}&days=${days}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch trend data: ${response.statusText}`);
      }
      
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch trend data');
      }
      
      setTrendData(result.data);
    } catch (err) {
      console.error('Error fetching trend data:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const fetchAgentData = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/costs/breakdown');
      if (!response.ok) {
        throw new Error(`Failed to fetch agent data: ${response.statusText}`);
      }
      
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch agent data');
      }
      
      // Process the data to get agent breakdown
      const agentBreakdown: { [key: string]: AgentCostData } = {};
      
      result.data.forEach((item: CostAnalysisData) => {
        const agentType = item.agentType || 'unknown';
        if (!agentBreakdown[agentType]) {
          agentBreakdown[agentType] = {
            agentType,
            totalCost: 0,
            executionCount: 0,
            avgCost: 0,
          };
        }
        agentBreakdown[agentType].totalCost += item.totalCostUsd;
        agentBreakdown[agentType].executionCount += 1;
      });

      // Calculate averages and convert to array
      const agentDataArray = Object.values(agentBreakdown).map(agent => ({
        ...agent,
        avgCost: agent.totalCost / agent.executionCount,
      }));

      setAgentData(agentDataArray);
      setError(null);
    } catch (err) {
      console.error('Error fetching agent data:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 4,
      maximumFractionDigits: 4,
    }).format(value);
  };

  const formatDate = (dateString: string) => {
    if (period === 'day') {
      return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } else if (period === 'week') {
      return `Week ${dateString.split('-W')[1]}`;
    } else {
      return new Date(dateString + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    }
  };

  const renderTrendChart = () => {
    if (chartType === 'line') {
      return (
        <RechartsLineChart data={trendData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="period" tickFormatter={formatDate} />
          <YAxis tickFormatter={(value) => formatCurrency(value)} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Line
            type="monotone"
            dataKey="totalCost"
            stroke="var(--color-totalCost)"
            strokeWidth={2}
            dot={{ fill: "var(--color-totalCost)" }}
          />
        </RechartsLineChart>
      );
    } else if (chartType === 'area') {
      return (
        <AreaChart data={trendData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="period" tickFormatter={formatDate} />
          <YAxis tickFormatter={(value) => formatCurrency(value)} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Area
            type="monotone"
            dataKey="totalCost"
            stroke="var(--color-totalCost)"
            fill="var(--color-totalCost)"
            fillOpacity={0.6}
          />
        </AreaChart>
      );
    } else {
      return (
        <BarChart data={trendData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="period" tickFormatter={formatDate} />
          <YAxis tickFormatter={(value) => formatCurrency(value)} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Bar dataKey="totalCost" fill="var(--color-totalCost)" />
        </BarChart>
      );
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="animate-pulse">
          <CardHeader>
            <div className="h-6 bg-muted rounded w-32" />
          </CardHeader>
          <CardContent>
            <div className="h-64 bg-muted rounded w-full" />
          </CardContent>
        </Card>
        <Card className="animate-pulse">
          <CardHeader>
            <div className="h-6 bg-muted rounded w-32" />
          </CardHeader>
          <CardContent>
            <div className="h-64 bg-muted rounded w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          Failed to load chart data: {error}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
        <div className="flex gap-2">
          <Select value={period} onValueChange={(value) => setPeriod(value as PeriodType)}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Daily</SelectItem>
              <SelectItem value="week">Weekly</SelectItem>
              <SelectItem value="month">Monthly</SelectItem>
            </SelectContent>
          </Select>

          <Select value={chartType} onValueChange={(value) => setChartType(value as ChartType)}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Chart Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="area">Area</SelectItem>
              <SelectItem value="line">Line</SelectItem>
              <SelectItem value="bar">Bar</SelectItem>
            </SelectContent>
          </Select>

          <Select value={days.toString()} onValueChange={(value) => setDays(parseInt(value))}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Days" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 Days</SelectItem>
              <SelectItem value="30">30 Days</SelectItem>
              <SelectItem value="90">90 Days</SelectItem>
              <SelectItem value="365">1 Year</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center space-y-0 pb-2">
            <div className="grid gap-1">
              <CardTitle className="text-base flex items-center gap-2">
                <LineChart className="h-4 w-4" />
                Cost Trends
              </CardTitle>
              <CardDescription>
                Cost trends over the selected period
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="aspect-video">
              {renderTrendChart()}
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center space-y-0 pb-2">
            <div className="grid gap-1">
              <CardTitle className="text-base flex items-center gap-2">
                <PieChart className="h-4 w-4" />
                Costs by Agent Type
              </CardTitle>
              <CardDescription>
                Cost breakdown by agent type
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {agentData.length > 0 ? (
              <ChartContainer config={chartConfig} className="aspect-video">
                <RechartsPieChart>
                  <ChartTooltip
                    content={<ChartTooltipContent />}
                    formatter={(value, name) => [formatCurrency(Number(value)), name]}
                  />
                  <Pie
                    data={agentData}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    dataKey="totalCost"
                    label={({ agentType, percent }: any) => 
                      `${agentType} (${(percent * 100).toFixed(1)}%)`
                    }
                  >
                    {agentData.map((_, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={agentColors[index % agentColors.length]} 
                      />
                    ))}
                  </Pie>
                </RechartsPieChart>
              </ChartContainer>
            ) : (
              <div className="aspect-video flex items-center justify-center text-muted-foreground">
                No agent cost data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Execution Metrics
          </CardTitle>
          <CardDescription>
            Execution count and token usage over time
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="aspect-video">
            <AreaChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="period" tickFormatter={formatDate} />
              <YAxis yAxisId="left" orientation="left" />
              <YAxis yAxisId="right" orientation="right" />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="executionCount"
                stackId="1"
                stroke="var(--color-executionCount)"
                fill="var(--color-executionCount)"
                fillOpacity={0.6}
              />
              <Area
                yAxisId="right"
                type="monotone"
                dataKey="tokenUsage"
                stackId="2"
                stroke="var(--color-tokenUsage)"
                fill="var(--color-tokenUsage)"
                fillOpacity={0.4}
              />
            </AreaChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  );
}