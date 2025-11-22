/**
 * DelegationEvaluator - Validates the 4+ file delegation rule
 * 
 * Rules:
 * 1. When a task involves 4+ files, agent should delegate to task-manager
 * 2. Agent can execute directly for 1-3 files
 * 3. Exception: User explicitly says "don't delegate" or "just do it"
 * 4. Delegation should happen BEFORE direct execution starts
 * 
 * Checks:
 * - Count files affected by write/edit tool calls
 * - Check if task tool was used for delegation
 * - Report violations where 4+ files are modified without delegation
 * - Track whether delegation was appropriate
 */

import { BaseEvaluator } from './base-evaluator.js';
import {
  TimelineEvent,
  SessionInfo,
  EvaluationResult,
  Violation,
  Evidence,
  Check,
  DelegationCheck
} from '../types/index.js';

export class DelegationEvaluator extends BaseEvaluator {
  name = 'delegation';
  description = 'Validates 4+ file delegation rule for complex tasks';

  // Delegation threshold
  private readonly DELEGATION_THRESHOLD = 4;

  async evaluate(timeline: TimelineEvent[], sessionInfo: SessionInfo): Promise<EvaluationResult> {
    const checks: Check[] = [];
    const violations: Violation[] = [];
    const evidence: Evidence[] = [];

    // Get file modification tools (write, edit)
    const fileModTools = this.getFileModificationTools(timeline);
    
    // Count affected files
    const fileCount = this.countAffectedFiles(fileModTools);

    // Get delegation tool calls (task tool)
    const delegationCalls = this.getToolCallsByName(timeline, 'task');
    const didDelegate = delegationCalls.length > 0;

    // Determine if delegation was required
    const shouldDelegate = fileCount >= this.DELEGATION_THRESHOLD;

    // Check if user said not to delegate
    const userMessages = this.getUserMessages(timeline);
    const skipDelegation = this.shouldSkipDelegation(userMessages);

    // Build check
    const check: DelegationCheck = {
      shouldDelegate,
      didDelegate,
      fileCount,
      delegationThreshold: this.DELEGATION_THRESHOLD,
      evidence: []
    };

    if (fileCount === 0) {
      // No files modified - N/A
      check.evidence.push('No files were modified in this session');
      checks.push({
        name: 'no-file-modifications',
        passed: true,
        weight: 100,
        evidence: [
          this.createEvidence(
            'file-count',
            'No file modifications detected',
            { fileCount: 0 }
          )
        ]
      });
    } else if (shouldDelegate && !didDelegate && !skipDelegation) {
      // Should have delegated but didn't
      check.evidence.push(
        `File count: ${fileCount} (threshold: ${this.DELEGATION_THRESHOLD})`,
        `Delegation required but not used`,
        `Files affected: ${fileCount}`
      );

      checks.push({
        name: 'delegation-required',
        passed: false,
        weight: 100,
        evidence: check.evidence.map(e =>
          this.createEvidence('delegation-check', e, { fileCount, shouldDelegate, didDelegate })
        )
      });

      violations.push(
        this.createViolation(
          'missing-delegation',
          'warning',
          `Task modified ${fileCount} files (>= ${this.DELEGATION_THRESHOLD}) without delegating to task-manager`,
          fileModTools[0]?.timestamp || Date.now(),
          {
            fileCount,
            threshold: this.DELEGATION_THRESHOLD,
            filesAffected: this.getAffectedFilePaths(fileModTools)
          }
        )
      );
    } else if (shouldDelegate && didDelegate) {
      // Correctly delegated
      check.evidence.push(
        `File count: ${fileCount} (threshold: ${this.DELEGATION_THRESHOLD})`,
        `Correctly delegated to task-manager`,
        `Delegation calls: ${delegationCalls.length}`
      );

      checks.push({
        name: 'delegation-correct',
        passed: true,
        weight: 100,
        evidence: check.evidence.map(e =>
          this.createEvidence('delegation-check', e, { fileCount, shouldDelegate, didDelegate })
        )
      });
    } else if (!shouldDelegate && didDelegate) {
      // Over-delegated (delegated when not needed)
      check.evidence.push(
        `File count: ${fileCount} (threshold: ${this.DELEGATION_THRESHOLD})`,
        `Delegated unnecessarily (< ${this.DELEGATION_THRESHOLD} files)`,
        `This is acceptable but not required`
      );

      checks.push({
        name: 'over-delegation',
        passed: true, // Not a violation, just a note
        weight: 100,
        evidence: check.evidence.map(e =>
          this.createEvidence('delegation-check', e, { fileCount, shouldDelegate, didDelegate })
        )
      });

      evidence.push(
        this.createEvidence(
          'over-delegation',
          'Delegated for task with < 4 files (acceptable but not required)',
          { fileCount, delegationCalls: delegationCalls.length }
        )
      );
    } else {
      // Correctly executed directly (< 4 files, no delegation)
      check.evidence.push(
        `File count: ${fileCount} (threshold: ${this.DELEGATION_THRESHOLD})`,
        `Correctly executed directly (< ${this.DELEGATION_THRESHOLD} files)`,
        `No delegation required`
      );

      checks.push({
        name: 'direct-execution-correct',
        passed: true,
        weight: 100,
        evidence: check.evidence.map(e =>
          this.createEvidence('delegation-check', e, { fileCount, shouldDelegate, didDelegate })
        )
      });
    }

    // Add general evidence
    evidence.push(
      this.createEvidence(
        'file-modifications',
        `${fileCount} files affected by this task`,
        {
          fileCount,
          files: this.getAffectedFilePaths(fileModTools),
          threshold: this.DELEGATION_THRESHOLD
        }
      )
    );

    if (delegationCalls.length > 0) {
      evidence.push(
        this.createEvidence(
          'delegation-calls',
          `${delegationCalls.length} delegation calls made`,
          {
            delegations: delegationCalls.map(call => ({
              timestamp: call.timestamp,
              agent: call.data?.input?.subagent_type,
              prompt: call.data?.input?.prompt?.substring(0, 100)
            }))
          }
        )
      );
    }

    if (skipDelegation) {
      evidence.push(
        this.createEvidence(
          'skip-delegation',
          'User explicitly requested to skip delegation',
          { userMessages: userMessages.map(m => m.data) }
        )
      );
    }

    return this.buildResult(this.name, checks, violations, evidence, {
      fileCount,
      delegationThreshold: this.DELEGATION_THRESHOLD,
      shouldDelegate,
      didDelegate,
      skipDelegation,
      delegationCheck: check
    });
  }

  /**
   * Get file modification tool calls (write, edit)
   */
  private getFileModificationTools(timeline: TimelineEvent[]): TimelineEvent[] {
    return this.getToolCalls(timeline).filter(event =>
      event.data?.tool === 'write' || event.data?.tool === 'edit'
    );
  }

  /**
   * Get affected file paths from tool calls
   */
  private getAffectedFilePaths(toolCalls: TimelineEvent[]): string[] {
    const files = new Set<string>();
    
    for (const call of toolCalls) {
      const input = call.data?.input;
      if (input?.filePath) {
        files.add(input.filePath);
      }
      if (input?.path) {
        files.add(input.path);
      }
    }

    return Array.from(files);
  }

  /**
   * Check if user said to skip delegation
   */
  private shouldSkipDelegation(userMessages: TimelineEvent[]): boolean {
    const skipPatterns = [
      /don't\s+delegate/i,
      /no\s+delegation/i,
      /just\s+do\s+it/i,
      /do\s+it\s+yourself/i,
      /without\s+delegat/i,
      /skip\s+delegation/i
    ];

    for (const msg of userMessages) {
      const text = msg.data?.text || msg.data?.content || '';
      if (skipPatterns.some(pattern => pattern.test(text))) {
        return true;
      }
    }

    return false;
  }
}
