/**
 * Inspect a real session to understand the data structure
 */

const {
  createConfig,
  SessionReader,
  TimelineBuilder,
  MessageParser
} = require('./dist');

async function main() {
  const config = createConfig({
    projectPath: '/Users/darrenhinde/Documents/GitHub/opencode-agents'
  });
  
  const sessionReader = new SessionReader(config.projectPath, config.sessionStoragePath);
  const timelineBuilder = new TimelineBuilder(sessionReader);
  
  const sessions = sessionReader.listSessions();
  
  // Find session with execution tools
  for (const session of sessions.slice(0, 20)) {
    const timeline = timelineBuilder.buildTimeline(session.id);
    const execTools = timeline.filter(e => 
      e.type === 'tool_call' && 
      ['bash', 'write', 'edit', 'task'].includes(e.data?.tool)
    );
    
    if (execTools.length > 0) {
      console.log('Found session with execution tools:');
      console.log(`Session ID: ${session.id}`);
      console.log(`Title: ${session.title.substring(0, 60)}...`);
      console.log(`\nTimeline (${timeline.length} events):\n`);
      
      timeline.slice(0, 10).forEach((event, idx) => {
        console.log(`${idx + 1}. [${event.type}] @ ${event.timestamp}`);
        if (event.type === 'text') {
          console.log(`   Text: ${(event.data?.text || '').substring(0, 80)}...`);
        } else if (event.type === 'tool_call') {
          console.log(`   Tool: ${event.data?.tool}`);
          console.log(`   Input: ${JSON.stringify(event.data?.input || {}).substring(0, 80)}...`);
        }
      });
      
      console.log('\n\nFull timeline structure (first event):');
      console.log(JSON.stringify(timeline[0], null, 2));
      
      break;
    }
  }
}

main().catch(console.error);
