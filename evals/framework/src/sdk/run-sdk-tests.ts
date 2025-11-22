#!/usr/bin/env node

/**
 * Main CLI entry point for SDK-based test execution
 * 
 * Usage:
 *   npm run eval:sdk
 *   npm run eval:sdk -- --debug
 *   npm run eval:sdk -- --no-evaluators
 *   npm run eval:sdk -- --model=opencode/grok-code-fast
 *   npm run eval:sdk -- --model=anthropic/claude-3-5-sonnet-20241022
 *   npm run eval:sdk -- --pattern="developer/*.yaml" --model=openai/gpt-4-turbo
 * 
 * Options:
 *   --debug              Enable debug logging
 *   --no-evaluators      Skip running evaluators (faster)
 *   --model=PROVIDER/MODEL  Override default model (default: opencode/grok-code-fast)
 *   --pattern=GLOB       Run specific test files (default: star-star/star.yaml)
 *   --timeout=MS         Test timeout in milliseconds (default: 60000)
 */

import { TestRunner } from './test-runner.js';
import { loadTestCase, loadTestCases } from './test-case-loader.js';
import glob from 'glob';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { TestResult } from './test-runner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface CliArgs {
  debug: boolean;
  noEvaluators: boolean;
  pattern?: string;
  timeout?: number;
  model?: string;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  
  return {
    debug: args.includes('--debug'),
    noEvaluators: args.includes('--no-evaluators'),
    pattern: args.find(a => a.startsWith('--pattern='))?.split('=')[1],
    timeout: parseInt(args.find(a => a.startsWith('--timeout='))?.split('=')[1] || '60000'),
    model: args.find(a => a.startsWith('--model='))?.split('=')[1],
  };
}

function printResults(results: TestResult[]): void {
  const passed = results.filter(r => r.passed).length;
  const failed = results.length - passed;
  
  console.log('\n' + '='.repeat(70));
  console.log('TEST RESULTS');
  console.log('='.repeat(70));
  
  results.forEach((result, idx) => {
    const icon = result.passed ? '✅' : '❌';
    console.log(`\n${idx + 1}. ${icon} ${result.testCase.id} - ${result.testCase.name}`);
    console.log(`   Duration: ${result.duration}ms`);
    console.log(`   Events: ${result.events.length}`);
    console.log(`   Approvals: ${result.approvalsGiven}`);
    
    if (result.evaluation) {
      console.log(`   Violations: ${result.evaluation.totalViolations} (${result.evaluation.violationsBySeverity.error} errors, ${result.evaluation.violationsBySeverity.warning} warnings)`);
    }
    
    if (result.errors.length > 0) {
      console.log(`   Errors:`);
      result.errors.forEach(err => console.log(`     - ${err}`));
    }
  });
  
  console.log('\n' + '='.repeat(70));
  console.log(`SUMMARY: ${passed}/${results.length} tests passed (${failed} failed)`);
  console.log('='.repeat(70) + '\n');
  
  // Print failed tests details
  if (failed > 0) {
    console.log('\nFailed Tests:');
    results.filter(r => !r.passed).forEach(result => {
      console.log(`\n  ❌ ${result.testCase.id}`);
      if (result.errors.length > 0) {
        console.log(`     Errors: ${result.errors.join(', ')}`);
      }
      if (result.evaluation && result.evaluation.totalViolations > 0) {
        console.log(`     Violations: ${result.evaluation.totalViolations}`);
        result.evaluation.allViolations.forEach(v => {
          console.log(`       - [${v.severity}] ${v.type}: ${v.message}`);
        });
      }
    });
    console.log();
  }
}

async function main() {
  const args = parseArgs();
  
  console.log('🚀 OpenCode SDK Test Runner\n');
  
  // Find test files
  const testDir = join(__dirname, '../../..', 'opencode/openagent/sdk-tests');
  const pattern = args.pattern || '**/*.yaml';
  const testFiles = glob.sync(pattern, { cwd: testDir, absolute: true });
  
  if (testFiles.length === 0) {
    console.error(`❌ No test files found matching pattern: ${pattern}`);
    process.exit(1);
  }
  
  console.log(`Found ${testFiles.length} test file(s):\n`);
  testFiles.forEach((f: string, idx: number) => {
    const relativePath = f.replace(testDir + '/', '');
    console.log(`  ${idx + 1}. ${relativePath}`);
  });
  console.log();
  
  // Load test cases
  console.log('Loading test cases...');
  const testCases = await loadTestCases(testFiles);
  console.log(`✅ Loaded ${testCases.length} test case(s)\n`);
  
  // Create test runner
  const runner = new TestRunner({
    debug: args.debug,
    defaultTimeout: args.timeout,
    runEvaluators: !args.noEvaluators,
    defaultModel: args.model, // Will use 'opencode/grok-code-fast' if not specified
  });
  
  if (args.model) {
    console.log(`Using model: ${args.model}`);
  } else {
    console.log('Using default model: opencode/grok-code-fast (free tier)');
  }
  console.log();
  
  try {
    // Start runner
    console.log('Starting test runner...');
    await runner.start();
    console.log('✅ Test runner started\n');
    
    // Run tests
    console.log('Running tests...\n');
    const results = await runner.runTests(testCases);
    
    // Stop runner
    console.log('\nStopping test runner...');
    await runner.stop();
    console.log('✅ Test runner stopped\n');
    
    // Print results
    printResults(results);
    
    // Exit with appropriate code
    const allPassed = results.every(r => r.passed);
    process.exit(allPassed ? 0 : 1);
  } catch (error) {
    console.error('\n❌ Fatal error:', (error as Error).message);
    console.error((error as Error).stack);
    
    try {
      await runner.stop();
    } catch {
      // Ignore cleanup errors
    }
    
    process.exit(1);
  }
}

// Run main
main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
