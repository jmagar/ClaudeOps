'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { DollarSign, TrendingUp, TrendingDown, AlertTriangle, Calendar, Calculator } from 'lucide-react';
import { CostCharts } from './CostCharts';
import { BudgetManager } from './BudgetManager';
import { CostAlerts } from './CostAlerts';
import { CostBreakdown } from './CostBreakdown';
import type { CostStats, CostAlert } from '@/lib/types/database';

interface CostSummary {
  stats: CostStats;
  alerts: CostAlert[];
}

export function CostDashboard() {
  const [costSummary, setCostSummary] = useState<CostSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [budgets, setBudgets] = useState({
    monthly: 10.0,
    daily: 1.0,
    perExecution: 0.5,
  });

  useEffect(() => {
    fetchCostSummary();
  }, [budgets]);

  const fetchCostSummary = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        monthlyBudget: budgets.monthly.toString(),
        dailyBudget: budgets.daily.toString(),
        perExecutionBudget: budgets.perExecution.toString(),
      });
      
      const response = await fetch(`/api/costs/summary?${params}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch cost summary: ${response.statusText}`);
      }
      
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch cost summary');
      }
      
      setCostSummary(result.data);
      setError(null);
    } catch (err) {
      console.error('Error fetching cost summary:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 4,
      maximumFractionDigits: 4,
    }).format(amount);
  };

  const calculateMonthOverMonthChange = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="pb-2">
                <div className="h-4 bg-muted rounded w-20" />
                <div className="h-8 bg-muted rounded w-16" />
              </CardHeader>
              <CardContent>
                <div className="h-3 bg-muted rounded w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
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
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          Failed to load cost data: {error}
        </AlertDescription>
      </Alert>
    );
  }

  if (!costSummary) {
    return (
      <Alert>
        <AlertDescription>
          No cost data available. Execute some agents to see cost tracking.
        </AlertDescription>
      </Alert>
    );
  }

  const { stats, alerts } = costSummary;
  const monthOverMonthChange = calculateMonthOverMonthChange(stats.currentMonth, stats.lastMonth);
  const isIncreasing = monthOverMonthChange > 0;

  return (
    <div className="space-y-6">
      {/* Cost Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Current Month</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.currentMonth)}</div>
            <div className="flex items-center space-x-1 text-xs text-muted-foreground">
              {isIncreasing ? (
                <TrendingUp className="h-3 w-3 text-red-500" />
              ) : (
                <TrendingDown className="h-3 w-3 text-green-500" />
              )}
              <span className={isIncreasing ? "text-red-500" : "text-green-500"}>
                {Math.abs(monthOverMonthChange).toFixed(1)}%
              </span>
              <span>from last month</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Year to Date</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.yearToDate)}</div>
            <p className="text-xs text-muted-foreground">
              Total tokens: {stats.totalTokens.toLocaleString()}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg per Execution</CardTitle>
            <Calculator className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.averagePerExecution)}</div>
            <p className="text-xs text-muted-foreground">
              Based on current month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Most Expensive</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.mostExpensiveExecution ? 
                formatCurrency(stats.mostExpensiveExecution.cost) : 
                '$0.0000'
              }
            </div>
            <p className="text-xs text-muted-foreground">
              {stats.mostExpensiveExecution ? 
                stats.mostExpensiveExecution.agentType : 
                'No executions yet'
              }
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((alert, index) => (
            <Alert key={index} variant={alert.triggered ? "destructive" : "default"}>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="flex items-center justify-between">
                <span>{alert.message}</span>
                <Badge variant={alert.triggered ? "destructive" : "secondary"}>
                  {alert.type}
                </Badge>
              </AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      {/* Main Content Tabs */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="breakdown">Breakdown</TabsTrigger>
          <TabsTrigger value="budgets">Budgets</TabsTrigger>
          <TabsTrigger value="alerts">Alerts</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <CostCharts />
        </TabsContent>

        <TabsContent value="breakdown" className="space-y-6">
          <CostBreakdown />
        </TabsContent>

        <TabsContent value="budgets" className="space-y-6">
          <BudgetManager 
            budgets={budgets}
            onBudgetsChange={setBudgets}
            onSave={fetchCostSummary}
          />
        </TabsContent>

        <TabsContent value="alerts" className="space-y-6">
          <CostAlerts 
            alerts={alerts}
            budgets={budgets}
            onRefresh={fetchCostSummary}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}