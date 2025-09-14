'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Search, 
  Filter, 
  Download, 
  RefreshCw,
  AlertTriangle,
  Calendar,
  DollarSign,
  Cpu,
  BarChart3,
  TrendingUp,
  TrendingDown,
  ArrowUpDown
} from 'lucide-react';
import type { CostTracking } from '@/lib/types/database';

interface CostBreakdownData extends CostTracking {
  agentType?: string;
  executionDuration?: number;
  executionStatus?: string;
}

type SortField = 'timestamp' | 'totalCostUsd' | 'inputTokens' | 'outputTokens' | 'agentType';
type SortDirection = 'asc' | 'desc';

interface FilterState {
  dateFrom: string;
  dateTo: string;
  agentType: string;
  modelUsed: string;
  search: string;
}

export function CostBreakdown() {
  const [data, setData] = useState<CostBreakdownData[]>([]);
  const [filteredData, setFilteredData] = useState<CostBreakdownData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('timestamp');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(25);
  
  const [filters, setFilters] = useState<FilterState>({
    dateFrom: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days ago
    dateTo: new Date().toISOString().split('T')[0], // today
    agentType: '',
    modelUsed: '',
    search: '',
  });

  const [stats, setStats] = useState({
    totalCost: 0,
    totalExecutions: 0,
    totalTokens: 0,
    avgCostPerExecution: 0,
    mostExpensiveExecution: null as CostBreakdownData | null,
    leastExpensiveExecution: null as CostBreakdownData | null,
  });

  useEffect(() => {
    fetchCostData();
  }, []);

  useEffect(() => {
    applyFiltersAndSort();
  }, [data, filters, sortField, sortDirection]);

  useEffect(() => {
    calculateStats();
  }, [filteredData]);

  const fetchCostData = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        ...(filters.dateFrom && { dateFrom: filters.dateFrom }),
        ...(filters.dateTo && { dateTo: filters.dateTo }),
        ...(filters.agentType && { agentType: filters.agentType }),
        ...(filters.modelUsed && { modelUsed: filters.modelUsed }),
      });

      const response = await fetch(`/api/costs/breakdown?${params}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch cost data: ${response.statusText}`);
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch cost data');
      }

      setData(result.data);
      setError(null);
    } catch (err) {
      console.error('Error fetching cost data:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const applyFiltersAndSort = () => {
    let filtered = [...data];

    // Apply search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      filtered = filtered.filter(item => 
        item.executionId?.toLowerCase().includes(searchLower) ||
        item.modelUsed?.toLowerCase().includes(searchLower) ||
        item.agentType?.toLowerCase().includes(searchLower)
      );
    }

    // Apply date filters
    if (filters.dateFrom) {
      filtered = filtered.filter(item => 
        new Date(item.timestamp) >= new Date(filters.dateFrom)
      );
    }
    if (filters.dateTo) {
      filtered = filtered.filter(item => 
        new Date(item.timestamp) <= new Date(filters.dateTo + 'T23:59:59')
      );
    }

    // Apply other filters
    if (filters.agentType) {
      filtered = filtered.filter(item => item.agentType === filters.agentType);
    }
    if (filters.modelUsed) {
      filtered = filtered.filter(item => item.modelUsed === filters.modelUsed);
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aVal: any = a[sortField];
      let bVal: any = b[sortField];

      // Handle null/undefined values
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return sortDirection === 'asc' ? -1 : 1;
      if (bVal == null) return sortDirection === 'asc' ? 1 : -1;

      // Convert to numbers for numeric fields
      if (['totalCostUsd', 'inputTokens', 'outputTokens'].includes(sortField)) {
        aVal = Number(aVal);
        bVal = Number(bVal);
      }

      // Convert to dates for timestamp
      if (sortField === 'timestamp') {
        aVal = new Date(aVal);
        bVal = new Date(bVal);
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    setFilteredData(filtered);
    setCurrentPage(1); // Reset to first page when filters change
  };

  const calculateStats = () => {
    if (filteredData.length === 0) {
      setStats({
        totalCost: 0,
        totalExecutions: 0,
        totalTokens: 0,
        avgCostPerExecution: 0,
        mostExpensiveExecution: null,
        leastExpensiveExecution: null,
      });
      return;
    }

    const totalCost = filteredData.reduce((sum, item) => sum + (item.totalCostUsd || 0), 0);
    const totalTokens = filteredData.reduce((sum, item) => sum + (item.inputTokens || 0) + (item.outputTokens || 0), 0);
    const mostExpensive = filteredData.reduce((max, item) => 
      (item.totalCostUsd || 0) > (max?.totalCostUsd || 0) ? item : max
    );
    const leastExpensive = filteredData.reduce((min, item) => 
      (item.totalCostUsd || 0) < (min?.totalCostUsd || 0) ? item : min
    );

    setStats({
      totalCost,
      totalExecutions: filteredData.length,
      totalTokens,
      avgCostPerExecution: totalCost / filteredData.length,
      mostExpensiveExecution: mostExpensive,
      leastExpensiveExecution: leastExpensive,
    });
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const handleFilterChange = (key: keyof FilterState, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const handleRefresh = () => {
    fetchCostData();
  };

  const handleExport = () => {
    const csv = [
      ['Timestamp', 'Execution ID', 'Agent Type', 'Model', 'Cost (USD)', 'Input Tokens', 'Output Tokens', 'Total Tokens', 'Response Time (ms)', 'Cache Hit'].join(','),
      ...filteredData.map(item => [
        item.timestamp,
        item.executionId,
        item.agentType || '',
        item.modelUsed,
        item.totalCostUsd?.toFixed(6) || '0',
        item.inputTokens || '0',
        item.outputTokens || '0',
        (item.inputTokens || 0) + (item.outputTokens || 0),
        item.responseTime || '',
        item.cacheHit ? 'Yes' : 'No'
      ].join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cost-breakdown-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 4,
      maximumFractionDigits: 6,
    }).format(amount);
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-4 w-4 text-muted-foreground" />;
    }
    return sortDirection === 'asc' ? 
      <TrendingUp className="h-4 w-4" /> : 
      <TrendingDown className="h-4 w-4" />;
  };

  const uniqueAgentTypes = [...new Set(data.map(item => item.agentType).filter((type): type is string => Boolean(type)))];
  const uniqueModels = [...new Set(data.map(item => item.modelUsed).filter((model): model is string => Boolean(model)))];

  const paginatedData = filteredData.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );
  const totalPages = Math.ceil(filteredData.length / itemsPerPage);

  if (loading) {
    return (
      <Card className="animate-pulse">
        <CardHeader>
          <div className="h-6 bg-muted rounded w-32" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="h-8 bg-muted rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          Failed to load cost breakdown: {error}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Cost</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.totalCost)}</div>
            <p className="text-xs text-muted-foreground">
              From {stats.totalExecutions} executions
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg per Execution</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.avgCostPerExecution)}</div>
            <p className="text-xs text-muted-foreground">
              Based on filtered data
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Tokens</CardTitle>
            <Cpu className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalTokens.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              Input + Output tokens
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
                formatCurrency(stats.mostExpensiveExecution.totalCostUsd || 0) : 
                '$0.0000'
              }
            </div>
            <p className="text-xs text-muted-foreground">
              {stats.mostExpensiveExecution?.agentType || 'No data'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters & Search
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search executions..."
                  value={filters.search}
                  onChange={(e) => handleFilterChange('search', e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">From Date</label>
              <Input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">To Date</label>
              <Input
                type="date"
                value={filters.dateTo}
                onChange={(e) => handleFilterChange('dateTo', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Agent Type</label>
              <Select value={filters.agentType} onValueChange={(value) => handleFilterChange('agentType', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="All agents" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All agents</SelectItem>
                  {uniqueAgentTypes.map(type => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Model</label>
              <Select value={filters.modelUsed} onValueChange={(value) => handleFilterChange('modelUsed', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="All models" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All models</SelectItem>
                  {uniqueModels.map(model => (
                    <SelectItem key={model} value={model}>{model}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Actions</label>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleRefresh}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={handleExport}>
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Cost Breakdown ({filteredData.length} items)
            </span>
            <Badge variant="outline">
              Page {currentPage} of {totalPages}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="cursor-pointer" onClick={() => handleSort('timestamp')}>
                    <div className="flex items-center gap-2">
                      Timestamp
                      {getSortIcon('timestamp')}
                    </div>
                  </TableHead>
                  <TableHead>Execution ID</TableHead>
                  <TableHead className="cursor-pointer" onClick={() => handleSort('agentType')}>
                    <div className="flex items-center gap-2">
                      Agent Type
                      {getSortIcon('agentType')}
                    </div>
                  </TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead className="cursor-pointer text-right" onClick={() => handleSort('totalCostUsd')}>
                    <div className="flex items-center justify-end gap-2">
                      Cost (USD)
                      {getSortIcon('totalCostUsd')}
                    </div>
                  </TableHead>
                  <TableHead className="cursor-pointer text-right" onClick={() => handleSort('inputTokens')}>
                    <div className="flex items-center justify-end gap-2">
                      Input Tokens
                      {getSortIcon('inputTokens')}
                    </div>
                  </TableHead>
                  <TableHead className="cursor-pointer text-right" onClick={() => handleSort('outputTokens')}>
                    <div className="flex items-center justify-end gap-2">
                      Output Tokens
                      {getSortIcon('outputTokens')}
                    </div>
                  </TableHead>
                  <TableHead className="text-center">Cache</TableHead>
                  <TableHead className="text-right">Response Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedData.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono text-sm">
                      {formatTimestamp(item.timestamp)}
                    </TableCell>
                    <TableCell className="font-mono text-sm max-w-[120px] truncate" title={item.executionId || undefined}>
                      {item.executionId}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {item.agentType || 'Unknown'}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {item.modelUsed}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(item.totalCostUsd || 0)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {(item.inputTokens || 0).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {(item.outputTokens || 0).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-center">
                      {item.cacheHit ? (
                        <Badge variant="secondary" className="text-xs">Hit</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">Miss</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {item.responseTime ? `${item.responseTime}ms` : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredData.length)} of {filteredData.length} entries
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}