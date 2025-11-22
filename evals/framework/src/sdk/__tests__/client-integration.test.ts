/**
 * Integration test for ClientManager + EventStreamHandler + Approval Strategies
 * Tests end-to-end flow: server start -> create session -> send prompt -> handle events
 */

import { ServerManager } from '../server-manager.js';
import { ClientManager } from '../client-manager.js';
import { EventStreamHandler } from '../event-stream-handler.js';
import { AutoApproveStrategy } from '../approval/auto-approve-strategy.js';

async function testClientIntegration() {
  console.log('🧪 Testing ClientManager + EventStreamHandler Integration...\n');

  const server = new ServerManager({
    port: 0, // Random port
    timeout: 10000,
  });

  let client: ClientManager | null = null;
  let eventHandler: EventStreamHandler | null = null;

  try {
    // Test 1: Start server
    console.log('Test 1: Starting server...');
    const { url } = await server.start();
    console.log(`✅ Server started at ${url}\n`);

    // Test 2: Create client
    console.log('Test 2: Creating client...');
    client = new ClientManager({ baseUrl: url });
    console.log('✅ Client created\n');

    // Test 3: Create session
    console.log('Test 3: Creating session...');
    const session = await client.createSession('Smoke Test Session');
    console.log(`✅ Session created: ${session.id}\n`);

    // Test 4: Setup event handler with auto-approve strategy
    console.log('Test 4: Setting up event handler with auto-approve...');
    eventHandler = new EventStreamHandler(url);
    const approvalStrategy = new AutoApproveStrategy();
    
    const events: string[] = [];
    
    // Listen to all events for debugging
    eventHandler.on('session.updated', (event) => {
      events.push('session.updated');
      console.log(`  📨 Event: session.updated`);
    });
    
    eventHandler.on('message.created', (event) => {
      events.push('message.created');
      console.log(`  📨 Event: message.created`);
    });
    
    eventHandler.on('message.updated', (event) => {
      events.push('message.updated');
      console.log(`  📨 Event: message.updated`);
    });
    
    eventHandler.on('part.created', (event) => {
      events.push('part.created');
      console.log(`  📨 Event: part.created`);
    });
    
    eventHandler.on('part.updated', (event) => {
      events.push('part.updated');
      console.log(`  📨 Event: part.updated`);
    });
    
    eventHandler.onPermission(async (event) => {
      console.log(`  🔐 Permission requested: ${event.properties.tool || 'unknown'}`);
      const approved = await approvalStrategy.shouldApprove(event);
      console.log(`  ✅ Auto-approved: ${approved}`);
      return approved;
    });

    // Start listening in background (don't await - it runs until stopped)
    const evtHandler = eventHandler; // Capture for closure
    eventHandler.startListening().catch(err => {
      if (evtHandler.listening()) {
        console.error('Event stream error:', err);
      }
    });
    
    // Give event handler time to connect and subscribe
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log('✅ Event handler listening\n');

    // Test 5: Send a simple prompt (no tools needed)
    console.log('Test 5: Sending simple prompt...');
    const result = await client.sendPrompt(session.id, {
      text: 'Say "Hello from smoke test" and nothing else.',
      noReply: false,
    });
    console.log(`✅ Prompt sent, got response\n`);

    // Give events time to be received
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Test 6: Check we received events
    console.log('Test 6: Verifying events received...');
    console.log(`  Total events captured: ${events.length}`);
    console.log(`  Event types: ${[...new Set(events)].join(', ')}`);
    
    if (events.length === 0) {
      console.error('❌ No events received - event handler may not be working properly');
      throw new Error('Expected to receive events from the server');
    } else {
      console.log(`✅ Received ${events.length} events\n`);
    }

    // Test 7: List sessions
    console.log('Test 7: Listing sessions...');
    const sessions = await client.listSessions();
    const foundSession = sessions.find(s => s.id === session.id);
    if (!foundSession) {
      throw new Error('Session should be in list');
    }
    console.log(`✅ Found session in list (${sessions.length} total sessions)\n`);

    // Cleanup
    console.log('Cleanup: Stopping event handler...');
    if (eventHandler) {
      eventHandler.stopListening();
    }
    await new Promise(resolve => setTimeout(resolve, 500));
    console.log('✅ Event handler stopped\n');

    console.log('Cleanup: Deleting session...');
    await client.deleteSession(session.id);
    console.log('✅ Session deleted\n');

    console.log('Cleanup: Stopping server...');
    await server.stop();
    console.log('✅ Server stopped\n');

    console.log('🎉 All integration tests passed!\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Test failed:', error);
    
    // Cleanup on error
    if (eventHandler) {
      eventHandler.stopListening();
    }
    await server.stop();
    process.exit(1);
  }
}

// Run the test
testClientIntegration().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
