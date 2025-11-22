/**
 * Test YAML test case schema and loader
 */

import { loadTestCase } from '../test-case-loader.js';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function testYamlLoader() {
  console.log('🧪 Testing YAML Test Case Loader...\n');

  try {
    // Test 1: Load sample test case
    console.log('Test 1: Loading sample test case...');
    const testCasePath = join(
      __dirname,
      '../../../..',
      'opencode/openagent/sdk-tests/developer/install-dependencies.yaml'
    );
    
    const testCase = await loadTestCase(testCasePath);
    
    console.log(`✅ Loaded test case: ${testCase.id}`);
    console.log(`   Name: ${testCase.name}`);
    console.log(`   Category: ${testCase.category}`);
    console.log(`   Approval: ${testCase.approvalStrategy.type}`);
    console.log(`   Expected pass: ${testCase.expected?.pass || 'not specified'}`);
    console.log();

    // Test 2: Validate schema fields
    console.log('Test 2: Validating required fields...');
    
    if (!testCase.id) throw new Error('Missing id');
    if (!testCase.name) throw new Error('Missing name');
    if (!testCase.description) throw new Error('Missing description');
    if (!testCase.category) throw new Error('Missing category');
    if (!testCase.prompt) throw new Error('Missing prompt');
    if (!testCase.approvalStrategy) throw new Error('Missing approvalStrategy');
    if (!testCase.expected) throw new Error('Missing expected');
    
    console.log('✅ All required fields present\n');

    // Test 3: Validate approval strategy
    console.log('Test 3: Validating approval strategy...');
    
    if (testCase.approvalStrategy.type !== 'auto-approve') {
      throw new Error(`Expected auto-approve, got ${testCase.approvalStrategy.type}`);
    }
    
    console.log('✅ Approval strategy valid\n');

    // Test 4: Validate expected results
    console.log('Test 4: Validating expected results...');
    
    if (!testCase.expected) {
      throw new Error('Expected results should be defined');
    }
    
    if (testCase.expected.pass !== true) {
      throw new Error('Expected pass should be true');
    }
    
    if (!testCase.expected.minMessages) {
      throw new Error('Expected minMessages to be defined');
    }
    
    if (!testCase.expected.toolCalls || testCase.expected.toolCalls.length === 0) {
      throw new Error('Expected toolCalls to be defined');
    }
    
    console.log(`✅ Expected: pass=${testCase.expected.pass}, minMessages=${testCase.expected.minMessages}`);
    console.log(`✅ Tool calls: ${testCase.expected.toolCalls.join(', ')}\n`);

    // Test 5: Validate optional fields
    console.log('Test 5: Validating optional fields...');
    
    if (testCase.timeout) {
      console.log(`✅ Timeout: ${testCase.timeout}ms`);
    }
    
    if (testCase.tags && testCase.tags.length > 0) {
      console.log(`✅ Tags: ${testCase.tags.join(', ')}`);
    }
    
    console.log();

    console.log('🎉 All YAML loader tests passed!\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
testYamlLoader().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
