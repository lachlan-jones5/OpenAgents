/**
 * OpenAgent Synthetic Test Runner
 * 
 * Loads synthetic test sessions, runs evaluators, compares actual vs expected results
 */

const fs = require('fs');
const path = require('path');

// Import framework from evals/framework
const {
  ApprovalGateEvaluator,
  ContextLoadingEvaluator,
  DelegationEvaluator,
  ToolUsageEvaluator
} = require('../../framework/dist');

// Mock SessionInfo for synthetic tests
function createMockSessionInfo(testId) {
  return {
    id: `synthetic_${testId}`,
    version: '1.0',
    title: `Synthetic Test: ${testId}`,
    time: {
      created: Date.now(),
      updated: Date.now()
    }
  };
}

// Load test cases
function loadTestCases(testsDir) {
  const testCases = [];
  const categories = fs.readdirSync(testsDir);
  
  for (const category of categories) {
    const categoryPath = path.join(testsDir, category);
    if (!fs.statSync(categoryPath).isDirectory()) continue;
    
    const tests = fs.readdirSync(categoryPath);
    for (const testName of tests) {
      const testPath = path.join(categoryPath, testName);
      if (!fs.statSync(testPath).isDirectory()) continue;
      
      const timelinePath = path.join(testPath, 'timeline.json');
      const expectedPath = path.join(testPath, 'expected.json');
      
      if (fs.existsSync(timelinePath) && fs.existsSync(expectedPath)) {
        testCases.push({
          id: testName,
          category,
          timeline: JSON.parse(fs.readFileSync(timelinePath, 'utf-8')),
          expected: JSON.parse(fs.readFileSync(expectedPath, 'utf-8'))
        });
      }
    }
  }
  
  return testCases;
}

// Compare actual vs expected
function compareResults(actual, expected, evaluatorName) {
  const issues = [];
  
  // Check passed
  if (actual.passed !== expected.passed) {
    issues.push(`  ✗ Passed mismatch: got ${actual.passed}, expected ${expected.passed}`);
  }
  
  // Check score
  if (actual.score !== expected.score) {
    issues.push(`  ✗ Score mismatch: got ${actual.score}, expected ${expected.score}`);
  }
  
  // Check violation count
  if (actual.violations.length !== expected.violation_count) {
    issues.push(`  ✗ Violation count: got ${actual.violations.length}, expected ${expected.violation_count}`);
  }
  
  // Check violation types (if violations exist)
  if (expected.violations && expected.violations.length > 0) {
    for (const expectedViolation of expected.violations) {
      const found = actual.violations.some(v => 
        v.type === expectedViolation.type && 
        v.severity === expectedViolation.severity
      );
      if (!found) {
        issues.push(`  ✗ Missing violation: ${expectedViolation.type} (${expectedViolation.severity})`);
      }
    }
  }
  
  return issues;
}

// Run single test
async function runTest(testCase) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`TEST: ${testCase.id}`);
  console.log(`Category: ${testCase.category}`);
  console.log(`Description: ${testCase.expected.description}`);
  console.log('='.repeat(80));
  
  const sessionInfo = createMockSessionInfo(testCase.id);
  const timeline = testCase.timeline;
  
  // Create evaluators
  const evaluators = {
    ApprovalGateEvaluator: new ApprovalGateEvaluator(),
    ContextLoadingEvaluator: new ContextLoadingEvaluator(),
    DelegationEvaluator: new DelegationEvaluator(),
    ToolUsageEvaluator: new ToolUsageEvaluator()
  };
  
  const results = {};
  const allIssues = [];
  
  // Run each evaluator
  for (const [name, evaluator] of Object.entries(evaluators)) {
    console.log(`\nRunning ${name}...`);
    const actual = await evaluator.evaluate(timeline, sessionInfo);
    const expected = testCase.expected.expected_results[name];
    
    results[name] = actual;
    
    // Display actual results
    console.log(`  Status: ${actual.passed ? '✓ PASS' : '✗ FAIL'}`);
    console.log(`  Score: ${actual.score}/100`);
    console.log(`  Violations: ${actual.violations.length}`);
    
    if (actual.violations.length > 0) {
      actual.violations.forEach(v => {
        console.log(`    - [${v.severity.toUpperCase()}] ${v.type}: ${v.message}`);
      });
    }
    
    // Compare with expected
    const issues = compareResults(actual, expected, name);
    if (issues.length > 0) {
      console.log(`\n  ❌ ISSUES FOUND:`);
      issues.forEach(issue => console.log(issue));
      allIssues.push(...issues.map(i => `${name}: ${i}`));
    } else {
      console.log(`  ✅ Matches expected behavior`);
    }
  }
  
  // Overall test result
  const testPassed = allIssues.length === 0;
  console.log(`\n${'─'.repeat(80)}`);
  console.log(`TEST RESULT: ${testPassed ? '✅ PASS' : '❌ FAIL'}`);
  if (!testPassed) {
    console.log(`\nIssues (${allIssues.length}):`);
    allIssues.forEach(issue => console.log(`  ${issue}`));
  }
  
  return {
    id: testCase.id,
    passed: testPassed,
    issues: allIssues,
    results
  };
}

// Main
async function main() {
  console.log('='.repeat(80));
  console.log('OPENAGENT SYNTHETIC TEST SUITE');
  console.log('='.repeat(80));
  
  const testsDir = path.join(__dirname, 'tests');
  const testCases = loadTestCases(testsDir);
  
  console.log(`\nFound ${testCases.length} test cases:\n`);
  testCases.forEach((tc, idx) => {
    console.log(`  ${idx + 1}. ${tc.category}/${tc.id}`);
  });
  
  // Run all tests
  const testResults = [];
  for (const testCase of testCases) {
    const result = await runTest(testCase);
    testResults.push(result);
  }
  
  // Summary
  console.log('\n\n' + '='.repeat(80));
  console.log('TEST SUMMARY');
  console.log('='.repeat(80));
  
  const passedCount = testResults.filter(r => r.passed).length;
  const failedCount = testResults.length - passedCount;
  const passRate = Math.round((passedCount / testResults.length) * 100);
  
  console.log(`\nTotal Tests: ${testResults.length}`);
  console.log(`Passed: ${passedCount} (${passRate}%)`);
  console.log(`Failed: ${failedCount} (${100 - passRate}%)`);
  
  console.log(`\nTest Results:`);
  testResults.forEach((result, idx) => {
    const status = result.passed ? '✅' : '❌';
    console.log(`  ${status} ${result.id}`);
    if (!result.passed) {
      console.log(`     Issues: ${result.issues.length}`);
    }
  });
  
  if (failedCount > 0) {
    console.log(`\n${'='.repeat(80)}`);
    console.log('FAILED TESTS - DETAILED ISSUES');
    console.log('='.repeat(80));
    
    testResults.filter(r => !r.passed).forEach(result => {
      console.log(`\n${result.id}:`);
      result.issues.forEach(issue => console.log(`  ${issue}`));
    });
  }
  
  console.log('\n' + '='.repeat(80));
  console.log(`FINAL RESULT: ${failedCount === 0 ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
  console.log('='.repeat(80));
  
  process.exit(failedCount > 0 ? 1 : 0);
}

main().catch(error => {
  console.error('Error running tests:', error);
  process.exit(1);
});
