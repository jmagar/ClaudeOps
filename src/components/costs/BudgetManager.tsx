'use client'

interface BudgetManagerProps {
  budgets: {
    monthly: number
    daily: number
    perExecution: number
  }
  onBudgetsChange: (budgets: { monthly: number; daily: number; perExecution: number }) => void
  onSave: () => Promise<void>
}

// Temporary stub component - will be implemented in future task
export function BudgetManager({ budgets, onBudgetsChange, onSave }: BudgetManagerProps) {
  return (
    <div className="p-4 text-center text-muted-foreground">
      <p>Budget Manager - Coming Soon</p>
      <p className="text-xs mt-2">Monthly: ${budgets.monthly}, Daily: ${budgets.daily}</p>
    </div>
  )
}