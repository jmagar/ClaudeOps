import { notFound } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui';

interface ExecutionPageProps {
  params: {
    id: string;
  };
}

// Loading component for the execution detail
function ExecutionDetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <div className="h-8 w-64 bg-gray-200 rounded animate-pulse mb-2" />
          <div className="h-4 w-48 bg-gray-200 rounded animate-pulse" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-20 bg-gray-200 rounded animate-pulse" />
          <div className="h-9 w-24 bg-gray-200 rounded animate-pulse" />
        </div>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <div className="h-6 w-32 bg-gray-200 rounded animate-pulse" />
            </CardHeader>
            <CardContent>
              <div className="h-96 bg-gray-100 rounded animate-pulse" />
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <div className="h-6 w-40 bg-gray-200 rounded animate-pulse" />
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="h-6 w-6 bg-gray-200 rounded-full animate-pulse" />
                    <div className="flex-1">
                      <div className="h-4 w-48 bg-gray-200 rounded animate-pulse mb-1" />
                      <div className="h-3 w-32 bg-gray-200 rounded animate-pulse" />
                    </div>
                    <div className="h-4 w-16 bg-gray-200 rounded animate-pulse" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
        
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="h-6 w-24 bg-gray-200 rounded animate-pulse" />
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <div className="h-4 w-20 bg-gray-200 rounded animate-pulse" />
                  <div className="h-4 w-16 bg-gray-200 rounded animate-pulse" />
                </div>
                <div className="flex justify-between">
                  <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
                  <div className="h-4 w-20 bg-gray-200 rounded animate-pulse" />
                </div>
                <div className="flex justify-between">
                  <div className="h-4 w-16 bg-gray-200 rounded animate-pulse" />
                  <div className="h-4 w-12 bg-gray-200 rounded animate-pulse" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// Dynamically import ExecutionDetail with loading skeleton
const ExecutionDetail = dynamic(() => import('@/components/executions/ExecutionDetail'), {
  loading: () => <ExecutionDetailSkeleton />
});

// Validate execution ID format
function isValidExecutionId(id: string): boolean {
  // Execution IDs should be UUIDs or similar format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const customIdRegex = /^exec_[a-zA-Z0-9_-]+$/; // Custom format like exec_timestamp_random
  return uuidRegex.test(id) || customIdRegex.test(id);
}

export default function ExecutionPage({ params }: ExecutionPageProps) {
  const { id } = params;
  
  // Validate execution ID format
  if (!isValidExecutionId(id)) {
    notFound();
  }

  return (
    <div className="container mx-auto p-6">
      <ExecutionDetail executionId={id} />
    </div>
  );
}

// Generate metadata for the page
export function generateMetadata({ params }: ExecutionPageProps) {
  const { id } = params;
  
  return {
    title: `Execution ${id.substring(0, 8)} - ClaudeOps`,
    description: `View details, logs, and progress for execution ${id}`,
  };
}