/**
 * Smoke test for TestRunner
 * Tests basic test execution flow
 */

import { TestRunner } from '../test-runner.js';
import type { TestCase } from '../test-case-schema.js';

async function testTestRunner() {
  console.log('🧪 Testing TestRunner...\n');

  const runner = new TestRunner({
    debug: true,
    defaultTimeout: 30000,
    runEvaluators: false, // Disable evaluators for smoke test
  });

  try {
    // Test 1: Start runner
    console.log('Test 1: Starting test runner...');
    await runner.start();
    console.log('✅ Test runner started\n');

    // Test 2: Create a simple test case
    console.log('Test 2: Creating test case...');
    const testCase: TestCase = {
      id: 'smoke-test-001',
      name: 'Simple Echo Test',
      description: 'Test that agent responds to a simple prompt',
      category: 'edge-case',
      prompt: 'Say "Hello from test runner" and nothing else.',
      approvalStrategy: {
        type: 'auto-approve',
      },
      expected: {
        pass: true,
        minMessages: 1,
      },
      timeout: 30000,
      tags: ['smoke', 'simple'],
    };
    console.log('✅ Test case created\n');

    // Test 3: Run the test
    console.log('Test 3: Running test case...');
    const result = await runner.runTest(testCase);
    console.log('✅ Test execution completed\n');

    // Test 4: Validate result
    console.log('Test 4: Validating result...');
    console.log(`  Session ID: ${result.sessionId}`);
    console.log(`  Passed: ${result.passed}`);
    console.log(`  Duration: ${result.duration}ms`);
    console.log(`  Events: ${result.events.length}`);
    console.log(`  Errors: ${result.errors.length}`);
    console.log(`  Approvals: ${result.approvalsGiven}`);

    if (!result.sessionId) {
      throw new Error('Expected sessionId to be set');
    }

    if (result.events.length === 0) {
      console.warn('⚠️  Warning: No events captured (might be OK for simple prompt)');
    }

    if (result.errors.length > 0) {
      console.error('Errors:', result.errors);
      throw new Error('Test execution had errors');
    }

    console.log('✅ Result validation passed\n');

    // Test 5: Stop runner
    console.log('Test 5: Stopping test runner...');
    await runner.stop();
    console.log('✅ Test runner stopped\n');

    console.log('🎉 All TestRunner tests passed!\n');
    console.log(`Final result: ${result.passed ? 'PASSED' : 'FAILED'}`);
    process.exit(result.passed ? 0 : 1);
  } catch (error) {
    console.error('❌ Test failed:', error);
    await runner.stop();
    process.exit(1);
  }
}

// Run the test
testTestRunner().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
