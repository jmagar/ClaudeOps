'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  AlertTriangle, 
  AlertCircle, 
  CheckCircle2, 
  RefreshCw, 
  Bell,
  BellOff,
  Settings,
  TrendingUp,
  DollarSign,
  Clock
} from 'lucide-react';
import type { CostAlert } from '@/lib/types/database';

interface CostAlertsProps {
  alerts: CostAlert[];
  budgets: {
    monthly: number;
    daily: number;
    perExecution: number;
  };
  onRefresh: () => void;
}

interface AlertHistory {
  id: string;
  type: string;
  message: string;
  timestamp: string;
  resolved: boolean;
  threshold: number;
  currentAmount: number;
}

export function CostAlerts({ alerts, budgets, onRefresh }: CostAlertsProps) {
  const [alertHistory, setAlertHistory] = useState<AlertHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  useEffect(() => {
    // Check browser notification permission
    if ('Notification' in window) {
      setNotificationsEnabled(Notification.permission === 'granted');
    }

    // Generate mock alert history for demonstration
    generateMockAlertHistory();
  }, []);

  useEffect(() => {
    // Show browser notifications for new alerts
    if (notificationsEnabled && alerts.length > 0) {
      alerts.forEach(alert => {
        if (alert.triggered) {
          new Notification('Budget Alert - ClaudeOps', {
            body: alert.message,
            icon: '/favicon.ico',
            tag: `budget-alert-${alert.type}`,
          });
        }
      });
    }
  }, [alerts, notificationsEnabled]);

  const generateMockAlertHistory = () => {
    // This would normally come from an API
    const mockHistory: AlertHistory[] = [
      {
        id: '1',
        type: 'monthly',
        message: 'Monthly budget warning: 85% of limit reached',
        timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
        resolved: false,
        threshold: 10.0,
        currentAmount: 8.5,
      },
      {
        id: '2',
        type: 'daily',
        message: 'Daily budget exceeded yesterday',
        timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
        resolved: true,
        threshold: 1.0,
        currentAmount: 1.25,
      },
      {
        id: '3',
        type: 'monthly',
        message: 'Monthly budget 80% threshold reached',
        timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
        resolved: true,
        threshold: 10.0,
        currentAmount: 8.0,
      },
    ];
    
    setAlertHistory(mockHistory);
  };

  const requestNotificationPermission = async () => {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      setNotificationsEnabled(permission === 'granted');
    }
  };

  const handleRefresh = async () => {
    setLoading(true);
    await onRefresh();
    setLoading(false);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 4,
      maximumFractionDigits: 4,
    }).format(amount);
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 60) {
      return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
    } else if (diffHours < 24) {
      return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    } else {
      return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
    }
  };

  const getAlertIcon = (type: string, triggered: boolean) => {
    if (triggered) {
      return <AlertTriangle className="h-4 w-4 text-red-500" />;
    }
    
    switch (type) {
      case 'monthly':
        return <DollarSign className="h-4 w-4 text-orange-500" />;
      case 'daily':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-blue-500" />;
    }
  };

  const getAlertVariant = (triggered: boolean) => {
    return triggered ? 'destructive' : 'default';
  };

  return (
    <div className="space-y-6">
      {/* Alert Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Alerts</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{alerts.filter(a => a.triggered).length}</div>
            <p className="text-xs text-muted-foreground">
              Critical budget alerts
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Warnings</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{alerts.filter(a => !a.triggered).length}</div>
            <p className="text-xs text-muted-foreground">
              Budget warnings
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Notifications</CardTitle>
            {notificationsEnabled ? (
              <Bell className="h-4 w-4 text-green-500" />
            ) : (
              <BellOff className="h-4 w-4 text-muted-foreground" />
            )}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {notificationsEnabled ? 'ON' : 'OFF'}
            </div>
            <p className="text-xs text-muted-foreground">
              Browser notifications
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button onClick={handleRefresh} disabled={loading} variant="outline" size="sm">
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {!notificationsEnabled && (
            <Button onClick={requestNotificationPermission} variant="outline" size="sm">
              <Bell className="h-4 w-4 mr-2" />
              Enable Notifications
            </Button>
          )}
        </div>
        <Badge variant="outline" className="flex items-center gap-1">
          <Settings className="h-3 w-3" />
          Auto-refresh every 5 minutes
        </Badge>
      </div>

      {/* Current Alerts */}
      {alerts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Current Alerts
            </CardTitle>
            <CardDescription>
              Active budget alerts that need your attention
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {alerts.map((alert, index) => (
              <Alert key={index} variant={getAlertVariant(alert.triggered)}>
                {getAlertIcon(alert.type, alert.triggered)}
                <AlertDescription className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p>{alert.message}</p>
                    <div className="flex items-center gap-2 text-xs">
                      <Badge variant="outline" className="text-xs">
                        {alert.type}
                      </Badge>
                      <span className="text-muted-foreground">
                        {formatCurrency(alert.currentAmount)} / {formatCurrency(alert.threshold)}
                      </span>
                      <span className="text-muted-foreground">
                        ({Math.round((alert.currentAmount / alert.threshold) * 100)}%)
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {alert.triggered && (
                      <Badge variant="destructive">
                        EXCEEDED
                      </Badge>
                    )}
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  </div>
                </AlertDescription>
              </Alert>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Alert History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Alert History
          </CardTitle>
          <CardDescription>
            Recent budget alerts and notifications
          </CardDescription>
        </CardHeader>
        <CardContent>
          {alertHistory.length === 0 ? (
            <div className="text-center py-6">
              <CheckCircle2 className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground">No alert history available</p>
            </div>
          ) : (
            <div className="space-y-3">
              {alertHistory.map((alert) => (
                <div
                  key={alert.id}
                  className="flex items-center justify-between p-3 rounded-lg border"
                >
                  <div className="flex items-center gap-3">
                    {alert.resolved ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      getAlertIcon(alert.type, !alert.resolved)
                    )}
                    <div className="space-y-1">
                      <p className="text-sm font-medium">{alert.message}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline" className="text-xs">
                          {alert.type}
                        </Badge>
                        <span>{formatTimestamp(alert.timestamp)}</span>
                        <span>
                          {formatCurrency(alert.currentAmount)} / {formatCurrency(alert.threshold)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={alert.resolved ? "secondary" : "destructive"}>
                      {alert.resolved ? "Resolved" : "Active"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Budget Status Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Budget Status
          </CardTitle>
          <CardDescription>
            Current spending against configured budgets
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {budgets.monthly > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Monthly Budget</span>
                  <span className="font-mono">{formatCurrency(budgets.monthly)}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  Configure threshold alerts in Budget Manager
                </div>
              </div>
            )}
            
            {budgets.daily > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Daily Budget</span>
                  <span className="font-mono">{formatCurrency(budgets.daily)}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  Resets daily at midnight UTC
                </div>
              </div>
            )}
            
            {budgets.perExecution > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Per-Execution Budget</span>
                  <span className="font-mono">{formatCurrency(budgets.perExecution)}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  Applied to each agent execution
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}