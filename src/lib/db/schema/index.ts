export * from './executions';
export * from './executionSteps';
export * from './executionCosts';
export * from './agentConfigs';
export * from './schedules';
export * from './systemMetrics';

// Relations for Drizzle queries
import { relations } from 'drizzle-orm';
import { 
  executions, 
  executionSteps, 
  agentConfigurations, 
  costTracking,
  schedules 
} from './';

export const executionsRelations = relations(executions, ({ many, one }) => ({
  steps: many(executionSteps),
  costBreakdown: many(costTracking),
  agentConfig: one(agentConfigurations, {
    fields: [executions.agentType],
    references: [agentConfigurations.agentType],
  }),
}));

export const executionStepsRelations = relations(executionSteps, ({ one }) => ({
  execution: one(executions, {
    fields: [executionSteps.executionId],
    references: [executions.id],
  }),
}));

export const costTrackingRelations = relations(costTracking, ({ one }) => ({
  execution: one(executions, {
    fields: [costTracking.executionId],
    references: [executions.id],
  }),
}));

export const schedulesRelations = relations(schedules, ({ one }) => ({
  agentConfig: one(agentConfigurations, {
    fields: [schedules.agentType],
    references: [agentConfigurations.agentType],
  }),
}));