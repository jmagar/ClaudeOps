'use client'

import { useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { DollarSign, Save } from 'lucide-react'

interface BudgetManagerProps {
  budgets: {
    monthly: number
    daily: number
    perExecution: number
  }
  onBudgetsChange: (budgets: { monthly: number; daily: number; perExecution: number }) => void
  onSave: () => Promise<void>
}

export function BudgetManager({ budgets, onBudgetsChange, onSave }: BudgetManagerProps) {
  const [localBudgets, setLocalBudgets] = useState(budgets)
  const [saving, setSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)

  const handleInputChange = useCallback((field: keyof typeof budgets, value: string) => {
    const numValue = parseFloat(value) || 0
    const newBudgets = { ...localBudgets, [field]: numValue }
    setLocalBudgets(newBudgets)
    setHasChanges(true)
    
    // Debounced update to parent
    setTimeout(() => {
      onBudgetsChange(newBudgets)
    }, 300)
  }, [localBudgets, onBudgetsChange])

  const handleSave = useCallback(async () => {
    if (!hasChanges) return
    
    try {
      setSaving(true)
      await onSave()
      setHasChanges(false)
    } catch (error) {
      console.error('Failed to save budgets:', error)
    } finally {
      setSaving(false)
    }
  }, [hasChanges, onSave])

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <DollarSign className="h-5 w-5" />
            <span>Budget Configuration</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <Label htmlFor="monthly-budget">Monthly Budget ($)</Label>
              <Input
                id="monthly-budget"
                type="number"
                step="0.01"
                min="0"
                value={localBudgets.monthly}
                onChange={(e) => handleInputChange('monthly', e.target.value)}
                placeholder="0.00"
              />
              <p className="text-xs text-muted-foreground">
                Maximum spending per calendar month
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="daily-budget">Daily Budget ($)</Label>
              <Input
                id="daily-budget"
                type="number"
                step="0.01"
                min="0"
                value={localBudgets.daily}
                onChange={(e) => handleInputChange('daily', e.target.value)}
                placeholder="0.00"
              />
              <p className="text-xs text-muted-foreground">
                Maximum spending per day
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="execution-budget">Per Execution Budget ($)</Label>
              <Input
                id="execution-budget"
                type="number"
                step="0.01"
                min="0"
                value={localBudgets.perExecution}
                onChange={(e) => handleInputChange('perExecution', e.target.value)}
                placeholder="0.00"
              />
              <p className="text-xs text-muted-foreground">
                Maximum cost per individual execution
              </p>
            </div>
          </div>

          <div className="flex justify-between items-center pt-4 border-t">
            <div className="text-sm text-muted-foreground">
              {hasChanges ? 'You have unsaved changes' : 'All changes saved'}
            </div>
            <Button 
              onClick={handleSave}
              disabled={!hasChanges || saving}
              className="flex items-center space-x-2"
            >
              <Save className="h-4 w-4" />
              <span>{saving ? 'Saving...' : 'Save Budgets'}</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Current Budget Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-lg font-semibold">${localBudgets.monthly.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">Monthly</p>
            </div>
            <div>
              <p className="text-lg font-semibold">${localBudgets.daily.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">Daily</p>
            </div>
            <div>
              <p className="text-lg font-semibold">${localBudgets.perExecution.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">Per Execution</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}