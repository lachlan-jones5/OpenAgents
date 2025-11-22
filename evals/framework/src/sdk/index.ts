// Server and client management
export { ServerManager } from './server-manager.js';
export type { ServerConfig } from './server-manager.js';

export { ClientManager } from './client-manager.js';
export type { ClientConfig, PromptOptions, SessionInfo } from './client-manager.js';

export { EventStreamHandler } from './event-stream-handler.js';
export type {
  EventType,
  ServerEvent,
  PermissionRequestEvent,
  EventHandler,
  PermissionHandler,
} from './event-stream-handler.js';

// Approval strategies
export type { ApprovalStrategy, ApprovalDecision } from './approval/approval-strategy.js';
export { AutoApproveStrategy } from './approval/auto-approve-strategy.js';
export { AutoDenyStrategy } from './approval/auto-deny-strategy.js';
export { SmartApprovalStrategy } from './approval/smart-approval-strategy.js';
export type { SmartApprovalConfig } from './approval/smart-approval-strategy.js';
