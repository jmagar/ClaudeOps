import { Metadata } from 'next';
import { CostDashboard } from '@/components/costs/CostDashboard';

export const metadata: Metadata = {
  title: 'Cost Tracking - ClaudeOps',
  description: 'Monitor AI agent execution costs, manage budgets, and analyze spending trends.',
};


export default function CostPage() {
  return (
    <div className="container mx-auto py-6">
      <div className="space-y-2 mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Cost Tracking</h1>
        <p className="text-muted-foreground">
          Monitor AI agent execution costs, manage budgets, and analyze spending trends.
        </p>
      </div>

      <CostDashboard />
    </div>
  );
}