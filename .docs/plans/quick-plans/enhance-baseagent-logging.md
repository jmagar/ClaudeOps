# Enhanced Claude Action Logging for BaseAgent

Update the BaseAgent to include more comprehensive logging of Claude's actions similar to SystemHealthAgent's current implementation. The BaseAgent already has good logging infrastructure but could be enhanced to capture more detailed action information with structured formatting and performance metrics.

## Implementation

1. **Enhance processMessage method** in BaseAgent.ts to add more granular Claude action logging with structured formats
2. **Add action classification system** to categorize different types of Claude actions (tool use, reasoning, response generation)
3. **Implement performance timing** for individual actions and tool executions
4. **Expand error context logging** to include more debugging information and action history
5. **Add optional detailed logging modes** to control verbosity without breaking existing implementations
6. **Maintain backward compatibility** ensuring existing agents continue working without changes

## Key Files

**Files to Create**
- None

**Files to Update**
- /home/jmagar/code/agents/src/lib/agents/core/BaseAgent.ts

**Files to Read**
- /home/jmagar/code/agents/src/lib/agents/core/types.ts
- /home/jmagar/code/agents/src/lib/agents/systemHealthAgent.ts