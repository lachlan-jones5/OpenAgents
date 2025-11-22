/**
 * ToolUsageEvaluator - Checks if appropriate tools are used
 * 
 * Rules:
 * 1. Use specialized tools instead of bash when possible
 * 2. Use Read instead of cat/head/tail
 * 3. Use Edit instead of sed/awk
 * 4. Use Write instead of echo/cat with heredoc
 * 5. Use Glob/Grep instead of find/grep in bash
 * 6. Use List instead of ls
 * 
 * Checks:
 * - Detect bash commands that could use specialized tools
 * - Track which tools are being used correctly
 * - Report warnings for suboptimal tool usage
 */

import { BaseEvaluator } from './base-evaluator.js';
import {
  TimelineEvent,
  SessionInfo,
  EvaluationResult,
  Violation,
  Evidence,
  Check,
  ToolUsageCheck
} from '../types/index.js';

export class ToolUsageEvaluator extends BaseEvaluator {
  name = 'tool-usage';
  description = 'Validates appropriate tool usage over bash alternatives';

  // Patterns for detecting suboptimal bash usage
  // NOTE: grep, rg, npm, git, and other valid bash commands are ALLOWED
  private bashAntiPatterns = [
    { pattern: /\bcat\s+[^\s|>]+(?!\s*[|>])/i, tool: 'read', message: 'Use Read tool instead of cat for reading files' },
    { pattern: /\bhead\s+/i, tool: 'read', message: 'Use Read tool instead of head' },
    { pattern: /\btail\s+/i, tool: 'read', message: 'Use Read tool instead of tail' },
    { pattern: /\bls\s+(?!-[al]*\s)/i, tool: 'list', message: 'Use List tool instead of ls (unless ls -la for detailed info)' },
    { pattern: /\bfind\s+.*-name/i, tool: 'glob', message: 'Use Glob tool instead of find for pattern matching' },
    { pattern: /echo\s+.*>\s*[^\s]+/i, tool: 'write', message: 'Use Write tool instead of echo redirection' },
    { pattern: /cat\s*<<.*EOF/i, tool: 'write', message: 'Use Write tool instead of cat with heredoc' }
  ];
  
  // Allowed bash commands that should NOT be flagged
  private allowedBashCommands = [
    /^\s*grep\s+/i,          // grep is fine (OpenCode docs say to use rg/grep)
    /^\s*rg\s+/i,            // ripgrep is preferred
    /^\s*npm\s+/i,           // npm commands
    /^\s*yarn\s+/i,          // yarn commands
    /^\s*pnpm\s+/i,          // pnpm commands
    /^\s*git\s+/i,           // git commands
    /^\s*node\s+/i,          // node execution
    /^\s*python\s+/i,        // python execution
    /^\s*docker\s+/i,        // docker commands
    /^\s*curl\s+/i,          // API calls
    /^\s*wget\s+/i,          // downloads
    /^\s*mkdir\s+/i,         // directory creation (no specialized tool)
    /^\s*rm\s+/i,            // deletion (requires approval anyway)
    /^\s*mv\s+/i,            // moving files
    /^\s*cp\s+/i,            // copying files
    /^\s*chmod\s+/i,         // permissions
    /^\s*ls\s+-[la]+/i,      // ls -la for detailed directory info
    /^\s*cd\s+/i,            // navigation
    /^\s*pwd\s*/i,           // current directory
    /^\s*which\s+/i,         // command location
    /^\s*echo\s+[^>]+$/i,    // echo to stdout (not redirection)
    /\|/,                    // Any command with pipes is complex bash
  ];

  async evaluate(timeline: TimelineEvent[], sessionInfo: SessionInfo): Promise<EvaluationResult> {
    const checks: Check[] = [];
    const violations: Violation[] = [];
    const evidence: Evidence[] = [];

    // Get all bash tool calls
    const bashCalls = this.getToolCallsByName(timeline, 'bash');

    if (bashCalls.length === 0) {
      // No bash calls - perfect tool usage
      checks.push({
        name: 'no-bash-usage',
        passed: true,
        weight: 100,
        evidence: [
          this.createEvidence(
            'tool-usage',
            'No bash commands used - specialized tools preferred',
            { bashCallCount: 0 }
          )
        ]
      });

      return this.buildResult(this.name, checks, violations, evidence, {
        bashCallCount: 0,
        toolUsageChecks: []
      });
    }

    // Check each bash call for anti-patterns
    const toolUsageChecks: ToolUsageCheck[] = [];

    for (const bashCall of bashCalls) {
      const command = bashCall.data?.input?.command || '';
      const antiPattern = this.detectAntiPattern(command);

      const check: ToolUsageCheck = {
        correctToolUsed: !antiPattern,
        evidence: []
      };

      if (antiPattern) {
        check.toolUsed = 'bash';
        check.expectedTool = antiPattern.tool;
        check.reason = antiPattern.message;
        check.evidence.push(
          `Command: ${command}`,
          `Issue: ${antiPattern.message}`,
          `Suggested tool: ${antiPattern.tool}`
        );

        // Add check (failed)
        checks.push({
          name: `tool-usage-${bashCall.timestamp}`,
          passed: false,
          weight: 100 / bashCalls.length,
          evidence: check.evidence.map(e =>
            this.createEvidence('suboptimal-tool', e, { command, suggestedTool: antiPattern.tool })
          )
        });

        // Add violation (warning - not critical)
        violations.push(
          this.createViolation(
            'suboptimal-tool-usage',
            'info',
            antiPattern.message,
            bashCall.timestamp,
            {
              command,
              suggestedTool: antiPattern.tool,
              actualTool: 'bash'
            }
          )
        );
      } else {
        check.toolUsed = 'bash';
        check.evidence.push(
          `Command: ${command}`,
          `Appropriate bash usage (no specialized tool alternative)`
        );

        // Add check (passed)
        checks.push({
          name: `tool-usage-${bashCall.timestamp}`,
          passed: true,
          weight: 100 / bashCalls.length,
          evidence: check.evidence.map(e =>
            this.createEvidence('appropriate-tool', e, { command })
          )
        });
      }

      toolUsageChecks.push(check);
    }

    // Add general evidence
    evidence.push(
      this.createEvidence(
        'bash-calls',
        `${bashCalls.length} bash commands analyzed`,
        {
          bashCallCount: bashCalls.length,
          commands: bashCalls.map(call => call.data?.input?.command)
        }
      )
    );

    const antiPatternCount = toolUsageChecks.filter(c => !c.correctToolUsed).length;
    evidence.push(
      this.createEvidence(
        'anti-patterns',
        `${antiPatternCount} suboptimal tool usage patterns detected`,
        {
          antiPatternCount,
          totalBashCalls: bashCalls.length,
          percentage: Math.round((antiPatternCount / bashCalls.length) * 100)
        }
      )
    );

    return this.buildResult(this.name, checks, violations, evidence, {
      bashCallCount: bashCalls.length,
      antiPatternCount,
      toolUsageChecks
    });
  }

  /**
   * Detect anti-patterns in bash commands
   */
  private detectAntiPattern(command: string): { pattern: RegExp; tool: string; message: string } | null {
    // First check if this is an allowed bash command
    for (const allowed of this.allowedBashCommands) {
      if (allowed.test(command)) {
        return null; // This is fine, not an anti-pattern
      }
    }
    
    // Then check for anti-patterns
    for (const antiPattern of this.bashAntiPatterns) {
      if (antiPattern.pattern.test(command)) {
        return antiPattern;
      }
    }
    return null;
  }
}
