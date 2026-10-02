import { Tool } from '../tools/registry.js';

export interface PlanStep {
  id: number;
  description: string;
  status: 'pending' | 'completed' | 'failed';
  result?: string;
}

export class Planner {
  private currentPlan: PlanStep[] = [];

  createPlan(goal: string, tools: Tool[]): string {
    // In Phase 5, the "planner" is the LLM itself. 
    // This class provides a structure to track the plan if we want 
    // to explicitly maintain a state.
    return `Plan for goal: ${goal}\n1. Analyze the request.\n2. Execute necessary tools.\n3. Verify result.\n4. Provide final answer.`;
  }

  updatePlan(stepId: number, status: 'completed' | 'failed', result?: string) {
    const step = this.currentPlan.find(s => s.id === stepId);
    if (step) {
      step.status = status;
      step.result = result;
    }
  }

  getPlan() {
    return this.currentPlan;
  }
}
