/**
 * Quick test script to verify the framework works with real session data
 */

const { SessionReader, MessageParser, TimelineBuilder } = require('./dist/index.js');

// Test with the opencode-agents project
const projectPath = '/Users/darrenhinde/Documents/GitHub/opencode-agents';

console.log('🔍 Testing OpenCode Evaluation Framework\n');
console.log('Project:', projectPath);
console.log('─'.repeat(60));

// Create reader
const reader = new SessionReader(projectPath);

// List sessions
console.log('\n📋 Listing sessions...');
const sessions = reader.listSessions();
console.log(`Found ${sessions.length} sessions`);

if (sessions.length > 0) {
  // Show first 3 sessions
  console.log('\nMost recent sessions:');
  sessions.slice(0, 3).forEach((session, i) => {
    const date = new Date(session.time.created).toLocaleString();
    console.log(`  ${i + 1}. ${session.id}`);
    console.log(`     Title: ${session.title.substring(0, 60)}...`);
    console.log(`     Created: ${date}`);
  });

  // Test with first session
  const testSession = sessions[0];
  console.log('\n─'.repeat(60));
  console.log(`\n🧪 Testing with session: ${testSession.id}\n`);

  // Get messages
  const messages = reader.getMessages(testSession.id);
  console.log(`📨 Messages: ${messages.length}`);

  // Create parser
  const parser = new MessageParser();

  // Analyze messages
  let userMessages = 0;
  let assistantMessages = 0;
  let agents = new Set();
  let models = new Set();

  messages.forEach(msg => {
    if (msg.role === 'user') userMessages++;
    if (msg.role === 'assistant') {
      assistantMessages++;
      const agent = parser.getAgent(msg);
      if (agent) agents.add(agent);
      const model = parser.getModel(msg);
      if (model) models.add(model.modelID);
    }
  });

  console.log(`  - User messages: ${userMessages}`);
  console.log(`  - Assistant messages: ${assistantMessages}`);
  console.log(`  - Agents: ${Array.from(agents).join(', ') || 'none'}`);
  console.log(`  - Models: ${Array.from(models).join(', ') || 'none'}`);

  // Build timeline
  console.log('\n⏱️  Building timeline...');
  const builder = new TimelineBuilder(reader);
  const timeline = builder.buildTimeline(testSession.id);
  
  const summary = builder.getSummary(timeline);
  console.log(`  - Total events: ${summary.totalEvents}`);
  console.log(`  - User messages: ${summary.userMessages}`);
  console.log(`  - Assistant messages: ${summary.assistantMessages}`);
  console.log(`  - Tool calls: ${summary.toolCalls}`);
  console.log(`  - Tools used: ${summary.tools.join(', ') || 'none'}`);
  console.log(`  - Duration: ${(summary.duration / 1000).toFixed(2)}s`);

  // Check for execution tools
  const toolCalls = builder.getToolCalls(timeline);
  const executionTools = ['bash', 'write', 'edit', 'task'];
  const usedExecutionTools = summary.tools.filter(t => executionTools.includes(t));

  if (usedExecutionTools.length > 0) {
    console.log(`\n⚙️  Execution tools used: ${usedExecutionTools.join(', ')}`);
    
    // Check for approval
    const assistantMsgs = builder.getAssistantMessages(timeline);
    let foundApproval = false;
    
    for (const event of assistantMsgs) {
      if (parser.hasApprovalRequest(event.data.parts)) {
        foundApproval = true;
        break;
      }
    }
    
    console.log(`  - Approval requested: ${foundApproval ? '✅ Yes' : '❌ No'}`);
  }

  console.log('\n─'.repeat(60));
  console.log('\n✅ Framework test completed successfully!\n');
} else {
  console.log('\n⚠️  No sessions found for this project');
  console.log('   Try running OpenCode in this project first to generate session data.\n');
}
