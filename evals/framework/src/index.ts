/**
 * OpenCode Evaluation Framework
 * 
 * Main entry point - exports all public APIs
 */

// Types
export * from './types';

// Configuration
export {
  defaultConfig,
  createConfig,
  encodeProjectPath,
  getProjectSessionPath,
  getSessionInfoPath,
  getSessionMessagePath,
  getSessionPartPath,
} from './config';

// Collector
export { SessionReader } from './collector/session-reader';
export { MessageParser } from './collector/message-parser';
export { TimelineBuilder } from './collector/timeline-builder';

// Evaluators
export { BaseEvaluator } from './evaluators/base-evaluator';
export { ApprovalGateEvaluator } from './evaluators/approval-gate-evaluator';
export { ContextLoadingEvaluator } from './evaluators/context-loading-evaluator';
export { DelegationEvaluator } from './evaluators/delegation-evaluator';
export { ToolUsageEvaluator } from './evaluators/tool-usage-evaluator';
export { EvaluatorRunner } from './evaluators/evaluator-runner';
export type { RunnerConfig, AggregatedResult } from './evaluators/evaluator-runner';

// Version
export const VERSION = '0.1.0';
