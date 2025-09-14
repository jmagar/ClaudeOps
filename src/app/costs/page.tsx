import { Metadata } from 'next';
import { Suspense } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CostDashboard } from '@/components/costs/CostDashboard';

export const metadata: Metadata = {
  title: 'Cost Tracking - ClaudeOps',
  description: 'Monitor AI agent execution costs, manage budgets, and analyze spending trends.',
};

function CostPageLoading() {
  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-8 w-16" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-3 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function CostPage() {
  return (
    <div className="container mx-auto py-6">
      <div className="space-y-2 mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Cost Tracking</h1>
        <p className="text-muted-foreground">
          Monitor AI agent execution costs, manage budgets, and analyze spending trends.
        </p>
      </div>

      <Suspense fallback={<CostPageLoading />}>
        <CostDashboard />
      </Suspense>
    </div>
  );
}