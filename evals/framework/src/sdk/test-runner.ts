import { ServerManager } from './server-manager.js';
import { ClientManager } from './client-manager.js';
import { EventStreamHandler } from './event-stream-handler.js';
import { AutoApproveStrategy } from './approval/auto-approve-strategy.js';
import { AutoDenyStrategy } from './approval/auto-deny-strategy.js';
import { SmartApprovalStrategy } from './approval/smart-approval-strategy.js';
import { SessionReader } from '../collector/session-reader.js';
import { TimelineBuilder } from '../collector/timeline-builder.js';
import { EvaluatorRunner } from '../evaluators/evaluator-runner.js';
import { ApprovalGateEvaluator } from '../evaluators/approval-gate-evaluator.js';
import { ContextLoadingEvaluator } from '../evaluators/context-loading-evaluator.js';
import { DelegationEvaluator } from '../evaluators/delegation-evaluator.js';
import { ToolUsageEvaluator } from '../evaluators/tool-usage-evaluator.js';
import type { TestCase } from './test-case-schema.js';
import type { ApprovalStrategy } from './approval/approval-strategy.js';
import type { ServerEvent } from './event-stream-handler.js';
import type { AggregatedResult } from '../evaluators/evaluator-runner.js';
import { homedir } from 'os';
import { join } from 'path';

export interface TestRunnerConfig {
  /**
   * Port for opencode server (0 = random)
   */
  port?: number;

  /**
   * Enable debug logging
   */
  debug?: boolean;

  /**
   * Default timeout for tests (ms)
   */
  defaultTimeout?: number;

  /**
   * Project path for evaluators
   */
  projectPath?: string;

  /**
   * Run evaluators after test execution
   */
  runEvaluators?: boolean;

  /**
   * Default model to use for tests (format: provider/model)
   * Examples:
   * - "opencode/grok-code-fast" (free tier)
   * - "anthropic/claude-3-5-sonnet-20241022"
   * - "openai/gpt-4-turbo"
   */
  defaultModel?: string;
}

export interface TestResult {
  /**
   * Test case that was run
   */
  testCase: TestCase;

  /**
   * Session ID created for this test
   */
  sessionId: string;

  /**
   * Whether the test passed
   */
  passed: boolean;

  /**
   * Errors encountered during test execution
   */
  errors: string[];

  /**
   * Events captured during test
   */
  events: ServerEvent[];

  /**
   * Duration of test execution (ms)
   */
  duration: number;

  /**
   * Number of approvals given
   */
  approvalsGiven: number;

  /**
   * Path to recorded session data
   */
  sessionPath?: string;

  /**
   * Evaluation results from evaluators (if runEvaluators = true)
   */
  evaluation?: AggregatedResult;
}

export class TestRunner {
  private server: ServerManager;
  private client: ClientManager | null = null;
  private eventHandler: EventStreamHandler | null = null;
  private config: Required<TestRunnerConfig>;
  private evaluatorRunner: EvaluatorRunner | null = null;

  constructor(config: TestRunnerConfig = {}) {
    this.config = {
      port: config.port || 0,
      debug: config.debug || false,
      defaultTimeout: config.defaultTimeout || 60000,
      projectPath: config.projectPath || process.cwd(),
      runEvaluators: config.runEvaluators ?? true,
      defaultModel: config.defaultModel || 'opencode/grok-code-fast', // Free tier default
    };

    this.server = new ServerManager({
      port: this.config.port,
      timeout: 10000,
    });

    // Setup evaluators if enabled
    if (this.config.runEvaluators) {
      const sessionStoragePath = join(homedir(), '.local', 'share', 'opencode', 'storage');
      const sessionReader = new SessionReader(this.config.projectPath, sessionStoragePath);
      const timelineBuilder = new TimelineBuilder(sessionReader);

      this.evaluatorRunner = new EvaluatorRunner({
        sessionReader,
        timelineBuilder,
        evaluators: [
          new ApprovalGateEvaluator(),
          new ContextLoadingEvaluator(),
          new DelegationEvaluator(),
          new ToolUsageEvaluator(),
        ],
      });
    }
  }

  /**
   * Start the test runner (starts opencode server)
   */
  async start(): Promise<void> {
    this.log('Starting opencode server...');
    const { url } = await this.server.start();
    this.log(`Server started at ${url}`);

    this.client = new ClientManager({ baseUrl: url });
    this.eventHandler = new EventStreamHandler(url);
  }

  /**
   * Stop the test runner (stops server)
   */
  async stop(): Promise<void> {
    this.log('Stopping event handler...');
    if (this.eventHandler) {
      this.eventHandler.stopListening();
      this.eventHandler = null;
    }

    this.log('Stopping server...');
    await this.server.stop();
    this.client = null;
  }

  /**
   * Run a single test case
   */
  async runTest(testCase: TestCase): Promise<TestResult> {
    if (!this.client || !this.eventHandler) {
      throw new Error('Test runner not started. Call start() first.');
    }

    const startTime = Date.now();
    const errors: string[] = [];
    const events: ServerEvent[] = [];
    let sessionId = '';
    let approvalsGiven = 0;

    try {
      this.log(`\n${'='.repeat(60)}`);
      this.log(`Running test: ${testCase.id} - ${testCase.name}`);
      this.log(`${'='.repeat(60)}`);

      // Create approval strategy
      const approvalStrategy = this.createApprovalStrategy(testCase);
      this.log(`Approval strategy: ${approvalStrategy.describe()}`);

      // Setup event handler
      this.eventHandler.removeAllHandlers();
      
      this.eventHandler.onAny((event) => {
        events.push(event);
        if (this.config.debug) {
          this.log(`Event: ${event.type}`);
        }
      });

      this.eventHandler.onPermission(async (event) => {
        const approved = await approvalStrategy.shouldApprove(event);
        approvalsGiven++;
        this.log(`Permission ${approved ? 'APPROVED' : 'DENIED'}: ${event.properties.tool || 'unknown'}`);
        return approved;
      });

      // Start event listener in background
      const evtHandler = this.eventHandler;
      this.eventHandler.startListening().catch(err => {
        if (evtHandler.listening()) {
          errors.push(`Event stream error: ${err.message}`);
        }
      });

      // Wait for event handler to connect
      await this.sleep(2000);

      // Create session
      this.log('Creating session...');
      const session = await this.client.createSession(testCase.name);
      sessionId = session.id;
      this.log(`Session created: ${sessionId}`);

      // Send prompt
      this.log('Sending prompt...');
      this.log(`Prompt: ${testCase.prompt.substring(0, 100)}${testCase.prompt.length > 100 ? '...' : ''}`);
      
      // Use test case model, or fall back to default model
      const modelToUse = testCase.model || this.config.defaultModel;
      this.log(`Model: ${modelToUse}`);
      
      const timeout = testCase.timeout || this.config.defaultTimeout;
      const promptPromise = this.client.sendPrompt(sessionId, {
        text: testCase.prompt,
        model: modelToUse ? this.parseModel(modelToUse) : undefined,
      });

      // Wait for prompt with timeout
      const result = await this.withTimeout(promptPromise, timeout, 'Prompt execution timed out');
      this.log('Prompt completed');

      // Give time for final events to arrive
      await this.sleep(3000);

      // Stop event handler
      this.eventHandler.stopListening();

      const duration = Date.now() - startTime;

      // Run evaluators if enabled
      let evaluation: AggregatedResult | undefined;
      if (this.config.runEvaluators && this.evaluatorRunner) {
        this.log('Running evaluators...');
        try {
          evaluation = await this.evaluatorRunner.runAll(sessionId);
          this.log(`Evaluators completed: ${evaluation.totalViolations} violations found`);
          
          if (evaluation && evaluation.totalViolations > 0) {
            this.log(`  Errors: ${evaluation.violationsBySeverity.error}`);
            this.log(`  Warnings: ${evaluation.violationsBySeverity.warning}`);
          }
        } catch (error) {
          this.log(`Warning: Evaluators failed: ${(error as Error).message}`);
          errors.push(`Evaluator error: ${(error as Error).message}`);
        }
      }

      // Determine if test passed
      const passed = this.evaluateResult(testCase, events, errors, evaluation);

      this.log(`\nTest ${passed ? 'PASSED' : 'FAILED'}`);
      this.log(`Duration: ${duration}ms`);
      this.log(`Events captured: ${events.length}`);
      this.log(`Approvals given: ${approvalsGiven}`);
      this.log(`Errors: ${errors.length}`);

      return {
        testCase,
        sessionId,
        passed,
        errors,
        events,
        duration,
        approvalsGiven,
        evaluation,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      errors.push(`Test execution failed: ${(error as Error).message}`);

      this.log(`\nTest FAILED with exception`);
      this.log(`Error: ${(error as Error).message}`);

      return {
        testCase,
        sessionId,
        passed: false,
        errors,
        events,
        duration,
        approvalsGiven,
        evaluation: undefined,
      };
    }
  }

  /**
   * Run multiple test cases
   */
  async runTests(testCases: TestCase[]): Promise<TestResult[]> {
    const results: TestResult[] = [];

    for (const testCase of testCases) {
      const result = await this.runTest(testCase);
      results.push(result);

      // Clean up session after each test
      if (this.client && result.sessionId) {
        try {
          await this.client.deleteSession(result.sessionId);
          this.log(`Cleaned up session: ${result.sessionId}\n`);
        } catch (error) {
          this.log(`Failed to clean up session: ${(error as Error).message}\n`);
        }
      }
    }

    return results;
  }

  /**
   * Create approval strategy from test case config
   */
  private createApprovalStrategy(testCase: TestCase): ApprovalStrategy {
    const strategy = testCase.approvalStrategy;

    switch (strategy.type) {
      case 'auto-approve':
        return new AutoApproveStrategy();

      case 'auto-deny':
        return new AutoDenyStrategy();

      case 'smart':
        return new SmartApprovalStrategy({
          allowedTools: strategy.config?.allowedTools,
          deniedTools: strategy.config?.deniedTools,
          approvePatterns: strategy.config?.approvePatterns?.map(p => new RegExp(p)),
          denyPatterns: strategy.config?.denyPatterns?.map(p => new RegExp(p)),
          maxApprovals: strategy.config?.maxApprovals,
          defaultDecision: strategy.config?.defaultDecision,
        });

      default:
        throw new Error(`Unknown approval strategy: ${(strategy as any).type}`);
    }
  }

  /**
   * Evaluate if test result matches expected outcome
   */
  private evaluateResult(
    testCase: TestCase,
    events: ServerEvent[],
    errors: string[],
    evaluation?: AggregatedResult
  ): boolean {
    // Support both old and new schema
    const expected = testCase.expected;
    const behavior = testCase.behavior;
    const expectedViolations = testCase.expectedViolations;

    // If there were execution errors and test expects to pass, it fails
    if (errors.length > 0 && expected?.pass) {
      return false;
    }

    // Check minimum messages (deprecated)
    if (expected?.minMessages !== undefined) {
      const messageEvents = events.filter(e => e.type.includes('message'));
      if (messageEvents.length < expected.minMessages) {
        this.log(`Expected at least ${expected.minMessages} messages, got ${messageEvents.length}`);
        return false;
      }
    }

    // Check maximum messages (deprecated)
    if (expected?.maxMessages !== undefined) {
      const messageEvents = events.filter(e => e.type.includes('message'));
      if (messageEvents.length > expected.maxMessages) {
        this.log(`Expected at most ${expected.maxMessages} messages, got ${messageEvents.length}`);
        return false;
      }
    }

    // Check expected violations match actual violations (deprecated format)
    if (expected?.violations && evaluation) {
      const expectedViolationTypes = expected.violations.map(v => v.rule);
      const actualViolationTypes = evaluation.allViolations.map(v => {
        // Map violation types to rule names
        if (v.type.includes('approval')) return 'approval-gate' as const;
        if (v.type.includes('context')) return 'context-loading' as const;
        if (v.type.includes('delegation')) return 'delegation' as const;
        if (v.type.includes('tool')) return 'tool-usage' as const;
        return 'unknown' as const;
      });

      // Check if expected violations are found
      for (const expectedType of expectedViolationTypes) {
        // Only check for implemented rules
        if (['approval-gate', 'context-loading', 'delegation', 'tool-usage'].includes(expectedType)) {
          if (!actualViolationTypes.includes(expectedType as any)) {
            this.log(`Expected violation '${expectedType}' not found`);
            return false;
          }
        }
      }

      // If test expects to fail, violations should exist
      if (!expected?.pass && evaluation.totalViolations === 0) {
        this.log('Expected violations but none found');
        return false;
      }
    }

    // NEW: Check expected violations (new format)
    if (expectedViolations && evaluation) {
      for (const expectedViolation of expectedViolations) {
        const actualViolations = evaluation.allViolations.filter(v => {
          if (expectedViolation.rule === 'approval-gate') return v.type.includes('approval');
          if (expectedViolation.rule === 'context-loading') return v.type.includes('context');
          if (expectedViolation.rule === 'delegation') return v.type.includes('delegation');
          if (expectedViolation.rule === 'tool-usage') return v.type.includes('tool');
          return false;
        });

        if (expectedViolation.shouldViolate) {
          // Negative test: Should have violation
          if (actualViolations.length === 0) {
            this.log(`Expected ${expectedViolation.rule} violation but none found`);
            return false;
          }
        } else {
          // Positive test: Should NOT have violation
          if (actualViolations.length > 0) {
            this.log(`Unexpected ${expectedViolation.rule} violation found`);
            return false;
          }
        }
      }
    }

    // If test expects to pass, check no critical violations
    if (expected?.pass && evaluation) {
      if (evaluation.violationsBySeverity.error > 0) {
        this.log(`Expected pass but found ${evaluation.violationsBySeverity.error} error-level violations`);
        return false;
      }
    }

    // Default: pass if no errors (or use expected.pass if specified)
    return expected?.pass !== undefined ? (expected.pass ? errors.length === 0 : true) : errors.length === 0;
  }

  /**
   * Parse model string (provider/model format)
   */
  private parseModel(model: string): { providerID: string; modelID: string } {
    const [providerID, modelID] = model.split('/');
    if (!providerID || !modelID) {
      throw new Error(`Invalid model format: ${model}. Expected provider/model`);
    }
    return { providerID, modelID };
  }

  /**
   * Sleep for ms
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Run promise with timeout
   */
  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(message)), timeoutMs)
      ),
    ]);
  }

  /**
   * Log message
   */
  private log(message: string): void {
    if (this.config.debug || message.includes('PASSED') || message.includes('FAILED')) {
      console.log(message);
    }
  }
}
