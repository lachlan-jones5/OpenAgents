/**
 * Framework configuration
 * 
 * Default configuration for the evaluation framework.
 * Can be overridden by passing custom config to components.
 */

import { FrameworkConfig } from './types';
import * as path from 'path';
import * as os from 'os';

/**
 * Get default session storage path
 * OpenCode stores sessions in ~/.local/share/opencode/
 */
const getDefaultSessionStoragePath = (): string => {
  const homeDir = os.homedir();
  return path.join(homeDir, '.local', 'share', 'opencode');
};

/**
 * Default framework configuration
 */
export const defaultConfig: FrameworkConfig = {
  projectPath: process.cwd(),
  sessionStoragePath: getDefaultSessionStoragePath(),
  resultsPath: path.join(process.cwd(), 'evals', 'results'),
  passThreshold: 75,
};

/**
 * Create custom configuration by merging with defaults
 */
export const createConfig = (overrides: Partial<FrameworkConfig> = {}): FrameworkConfig => {
  return {
    ...defaultConfig,
    ...overrides,
  };
};

/**
 * Encode project path for OpenCode storage
 * OpenCode replaces slashes with dashes in project paths
 * Example: /Users/user/project -> Users-user-project
 */
export const encodeProjectPath = (projectPath: string): string => {
  // Remove leading slash and replace remaining slashes with dashes
  return projectPath.replace(/^\//, '').replace(/\//g, '-');
};

/**
 * Get session storage path for a specific project
 */
export const getProjectSessionPath = (
  projectPath: string,
  sessionStoragePath: string = getDefaultSessionStoragePath()
): string => {
  const encodedPath = encodeProjectPath(projectPath);
  return path.join(sessionStoragePath, 'project', encodedPath, 'storage', 'session');
};

/**
 * Get session info path
 */
export const getSessionInfoPath = (
  projectPath: string,
  sessionStoragePath?: string
): string => {
  return path.join(getProjectSessionPath(projectPath, sessionStoragePath), 'info');
};

/**
 * Get session message path
 */
export const getSessionMessagePath = (
  projectPath: string,
  sessionStoragePath?: string
): string => {
  return path.join(getProjectSessionPath(projectPath, sessionStoragePath), 'message');
};

/**
 * Get session part path
 */
export const getSessionPartPath = (
  projectPath: string,
  sessionStoragePath?: string
): string => {
  return path.join(getProjectSessionPath(projectPath, sessionStoragePath), 'part');
};
