/**
 * Test evaluators with real OpenCode session data
 */

const {
  createConfig,
  SessionReader,
  TimelineBuilder,
  EvaluatorRunner,
  ApprovalGateEvaluator,
  ContextLoadingEvaluator,
  DelegationEvaluator,
  ToolUsageEvaluator
} = require('./dist');

async function main() {
  console.log('='.repeat(80));
  console.log('EVALUATOR TEST');
  console.log('='.repeat(80));
  console.log('');

  // Create config
  const config = createConfig({
    projectPath: '/Users/darrenhinde/Documents/GitHub/opencode-agents'
  });
  console.log(`Project path: ${config.projectPath}`);
  console.log(`Session storage: ${config.sessionStoragePath}`);
  console.log('');

  // Create session reader and timeline builder
  const sessionReader = new SessionReader(config.projectPath, config.sessionStoragePath);
  const timelineBuilder = new TimelineBuilder(sessionReader);

  // List available sessions
  console.log('Finding sessions...');
  const sessions = sessionReader.listSessions();
  console.log(`Found ${sessions.length} sessions`);
  console.log('');

  if (sessions.length === 0) {
    console.log('No sessions found. Exiting.');
    return;
  }

  // Pick the most recent session
  const latestSession = sessions[0];
  console.log(`Testing with session: ${latestSession.id}`);
  console.log(`Title: ${latestSession.title}`);
  const createdDate = new Date(latestSession.created);
  console.log(`Created: ${isNaN(createdDate.getTime()) ? 'Unknown' : createdDate.toISOString()}`);
  console.log('');

  // Create evaluators
  const evaluators = [
    new ApprovalGateEvaluator(),
    new ContextLoadingEvaluator(),
    new DelegationEvaluator(),
    new ToolUsageEvaluator()
  ];

  console.log(`Registered ${evaluators.length} evaluators:`);
  evaluators.forEach((e, idx) => {
    console.log(`  ${idx + 1}. ${e.name} - ${e.description}`);
  });
  console.log('');

  // Create runner
  const runner = new EvaluatorRunner({
    sessionReader,
    timelineBuilder,
    evaluators
  });

  // Run evaluators
  console.log('-'.repeat(80));
  console.log('Running evaluators...');
  console.log('-'.repeat(80));
  console.log('');

  const result = await runner.runAll(latestSession.id);

  // Generate and print report
  console.log('');
  console.log(runner.generateReport(result));

  // Test batch evaluation with first 3 sessions
  if (sessions.length > 1) {
    console.log('');
    console.log('');
    console.log('='.repeat(80));
    console.log('BATCH EVALUATION TEST (first 3 sessions)');
    console.log('='.repeat(80));
    console.log('');

    const sessionIds = sessions.slice(0, Math.min(3, sessions.length)).map(s => s.id);
    const batchResults = await runner.runBatch(sessionIds);

    console.log('');
    console.log(runner.generateBatchSummary(batchResults));
  }

  console.log('');
  console.log('✓ Evaluator test complete!');
}

main().catch(error => {
  console.error('Error running evaluator test:', error);
  process.exit(1);
});
