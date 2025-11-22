/**
 * Smoke test for ServerManager
 * Tests basic server start/stop functionality
 */

import { ServerManager } from '../server-manager.js';

async function testServerManager() {
  console.log('🧪 Testing ServerManager...\n');

  const server = new ServerManager({
    port: 0, // Random port
    timeout: 10000, // 10 second timeout
  });

  try {
    // Test 1: Start server
    console.log('Test 1: Starting server...');
    const { url, port } = await server.start();
    console.log(`✅ Server started at ${url} (port ${port})\n`);

    // Test 2: Check server is running
    console.log('Test 2: Checking server status...');
    if (!server.running()) {
      throw new Error('Server should be running');
    }
    console.log('✅ Server is running\n');

    // Test 3: Get URL
    console.log('Test 3: Getting server URL...');
    const serverUrl = server.getUrl();
    if (!serverUrl) {
      throw new Error('Server URL should not be null');
    }
    console.log(`✅ Server URL: ${serverUrl}\n`);

    // Test 4: Verify server responds
    console.log('Test 4: Verifying server responds...');
    const response = await fetch(serverUrl);
    if (!response.ok) {
      throw new Error('Server should respond with 200');
    }
    const html = await response.text();
    if (!html.includes('OpenCode')) {
      throw new Error('Response should contain "OpenCode"');
    }
    console.log('✅ Server responds correctly\n');

    // Test 5: Stop server
    console.log('Test 5: Stopping server...');
    await server.stop();
    console.log('✅ Server stopped\n');

    // Test 6: Verify server is not running
    console.log('Test 6: Verifying server stopped...');
    if (server.running()) {
      throw new Error('Server should not be running');
    }
    console.log('✅ Server is not running\n');

    console.log('🎉 All ServerManager tests passed!\n');
  } catch (error) {
    console.error('❌ Test failed:', error);
    await server.stop(); // Cleanup
    process.exit(1);
  }
}

// Run the test
testServerManager().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
