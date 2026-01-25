#!/usr/bin/env ts-node

/**
 * Test SOP Summarization Feature
 * 
 * Tests the new executive summary generation for SOPs including:
 * - Summary generation with Groq/Llama
 * - Cache creation and validation
 * - Cache invalidation on content changes
 * - Integration with retrieveRelevantContext
 */

import { EnhancedRAGService } from './src/enhanced-rag-service';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

// Test configuration
const TEST_PROJECT_PATH = path.join(__dirname, 'test-sop-project');
const PRIMARY_CONTEXT_PATH = path.join(__dirname, 'knowledge-base/context/primary-context.yaml');
const PROCEDURES_PATH = path.join(TEST_PROJECT_PATH, 'Procedures');
const CACHE_PATH = path.join(TEST_PROJECT_PATH, '.phasergun-cache');
const SUMMARY_CACHE_PATH = path.join(CACHE_PATH, 'sop-summaries.json');

// Test SOP documents
const TEST_SOPS = [
  {
    fileName: 'SOP-Design-Control.md',
    content: `# Standard Operating Procedure: Design Control

## Purpose
This SOP establishes the design control procedures to ensure that medical device designs meet user needs and intended uses while complying with FDA 21 CFR 820.30.

## Scope
Applies to all design and development activities for Class II and Class III medical devices.

## Definitions
- Design Input: Physical and performance requirements of a device
- Design Output: Results of design effort at each design phase
- Design Review: Documented, comprehensive, systematic examination

## Procedure
1. Design Planning
   - Establish design plan with phases, milestones, and reviews
   - Assign responsibilities and resources
   - Document in Design History File (DHF)

2. Design Inputs
   - Identify user needs and requirements
   - Include regulatory and safety requirements
   - Review and approve inputs

3. Design Outputs
   - Translate inputs into detailed specifications
   - Include acceptance criteria
   - Verify outputs meet inputs

4. Design Verification
   - Confirm outputs meet input requirements
   - Conduct testing per protocols
   - Document results

5. Design Validation
   - Ensure device meets user needs
   - Conduct clinical or simulated use testing
   - Document validation results

## References
- FDA 21 CFR 820.30
- ISO 13485:2016
- ISO 14971 (Risk Management)
`
  },
  {
    fileName: 'SOP-Risk-Management.md',
    content: `# Standard Operating Procedure: Risk Management

## Purpose
Define the risk management process throughout the product lifecycle per ISO 14971.

## Scope
All medical device projects from concept through post-market surveillance.

## Risk Management Activities

### 1. Risk Analysis
- Identify hazards
- Estimate risks for each hazardous situation
- Document in Risk Management File (RMF)

### 2. Risk Evaluation
- Compare estimated risks against acceptability criteria
- Determine which risks require reduction

### 3. Risk Control
- Implement risk control measures
- Verify effectiveness of controls
- Re-evaluate residual risk

### 4. Risk/Benefit Analysis
- Analyze residual risks against benefits
- Document justification

### 5. Risk Management Review
- Review completeness of risk management activities
- Ensure risks are acceptable

## Documentation
All risk management activities documented in Risk Management File (RMF).

## References
- ISO 14971:2019
- FDA Guidance on Risk Management
`
  },
  {
    fileName: 'SOP-Document-Control.md',
    content: `# Standard Operating Procedure: Document Control

## Purpose
Establish controls for creation, review, approval, distribution, and revision of quality system documents.

## Scope
All controlled documents including SOPs, work instructions, forms, and specifications.

## Document Types
1. Level 1: Quality Manual
2. Level 2: Procedures (SOPs)
3. Level 3: Work Instructions
4. Level 4: Forms and Records

## Document Lifecycle

### Creation
- Use approved templates
- Assign unique document number
- Include revision history

### Review and Approval
- Technical review by subject matter expert
- Quality review for compliance
- Management approval

### Distribution
- Controlled distribution to authorized personnel
- Electronic distribution via document management system
- Obsolete documents removed from use

### Revision
- Document change request required
- Track changes and rationale
- Increment revision number
- Re-approval required

## References
- FDA 21 CFR 820.40
- ISO 13485:2016 Section 4.2.4
`
  }
];

/**
 * Setup test environment
 */
async function setupTestEnvironment(): Promise<void> {
  console.log('\n[Setup] Creating test environment...');
  
  // Create test project structure
  await fs.mkdir(PROCEDURES_PATH, { recursive: true });
  await fs.mkdir(path.join(TEST_PROJECT_PATH, 'Context'), { recursive: true });
  
  // Write test SOP files
  for (const sop of TEST_SOPS) {
    const filePath = path.join(PROCEDURES_PATH, sop.fileName);
    await fs.writeFile(filePath, sop.content, 'utf-8');
    console.log(`[Setup] Created ${sop.fileName}`);
  }
  
  console.log('[Setup] ✓ Test environment ready\n');
}

/**
 * Cleanup test environment
 */
async function cleanupTestEnvironment(): Promise<void> {
  console.log('\n[Cleanup] Removing test environment...');
  
  try {
    await fs.rm(TEST_PROJECT_PATH, { recursive: true, force: true });
    console.log('[Cleanup] ✓ Test environment cleaned\n');
  } catch (error) {
    console.warn('[Cleanup] Warning: Could not fully clean test environment:', error);
  }
}

/**
 * Test 1: Summary Generation
 */
async function testSummaryGeneration(): Promise<boolean> {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('TEST 1: SOP Summary Generation');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  try {
    const ragService = new EnhancedRAGService();
    
    console.log('[Test] Calling retrieveRelevantContext with summaries enabled...');
    const result = await ragService.retrieveRelevantContext(
      TEST_PROJECT_PATH,
      PRIMARY_CONTEXT_PATH,
      'Analyze design control requirements',
      {
        includeSummaries: true,
        summaryWordCount: 250,
        procedureChunks: 3,
        contextChunks: 2
      }
    );
    
    console.log(`[Test] Metadata:
  - Summaries generated: ${result.metadata.summariesGenerated}
  - Procedure chunks: ${result.metadata.procedureChunksRetrieved}
  - Total tokens estimate: ${result.metadata.totalTokensEstimate}
`);
    
    // Verify summaries were generated
    if (result.metadata.summariesGenerated !== TEST_SOPS.length) {
      console.error(`[Test] ✗ Expected ${TEST_SOPS.length} summaries, got ${result.metadata.summariesGenerated}`);
      return false;
    }
    
    // Verify context includes summaries section
    if (!result.ragContext.includes('COMPANY PROCEDURES OVERVIEW')) {
      console.error('[Test] ✗ Context missing summaries section');
      return false;
    }
    
    // Verify each SOP is mentioned in summaries
    for (const sop of TEST_SOPS) {
      if (!result.ragContext.includes(sop.fileName)) {
        console.error(`[Test] ✗ Summary missing for ${sop.fileName}`);
        return false;
      }
    }
    
    console.log('[Test] ✓ All summaries generated successfully');
    console.log('[Test] ✓ Context includes summaries section');
    console.log('[Test] ✓ All SOPs referenced in context\n');
    
    return true;
  } catch (error) {
    console.error('[Test] ✗ Error during summary generation:', error);
    return false;
  }
}

/**
 * Test 2: Cache Creation and Validation
 */
async function testCacheCreation(): Promise<boolean> {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('TEST 2: Cache Creation and Validation');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  try {
    // Check if cache file was created
    console.log('[Test] Checking cache file existence...');
    await fs.access(SUMMARY_CACHE_PATH);
    console.log('[Test] ✓ Cache file exists at:', SUMMARY_CACHE_PATH);
    
    // Read and parse cache
    const cacheContent = await fs.readFile(SUMMARY_CACHE_PATH, 'utf-8');
    const cache = JSON.parse(cacheContent);
    
    console.log(`[Test] Cache contains ${Object.keys(cache).length} entries\n`);
    
    // Validate cache structure
    for (const sop of TEST_SOPS) {
      const cacheEntry = cache[sop.fileName];
      
      if (!cacheEntry) {
        console.error(`[Test] ✗ Missing cache entry for ${sop.fileName}`);
        return false;
      }
      
      // Check required fields
      if (!cacheEntry.hash) {
        console.error(`[Test] ✗ Missing hash for ${sop.fileName}`);
        return false;
      }
      
      if (!cacheEntry.summary) {
        console.error(`[Test] ✗ Missing summary for ${sop.fileName}`);
        return false;
      }
      
      if (!cacheEntry.generatedAt) {
        console.error(`[Test] ✗ Missing generatedAt for ${sop.fileName}`);
        return false;
      }
      
      // Verify hash is correct
      const expectedHash = crypto.createHash('sha256').update(sop.content).digest('hex');
      if (cacheEntry.hash !== expectedHash) {
        console.error(`[Test] ✗ Hash mismatch for ${sop.fileName}`);
        return false;
      }
      
      console.log(`[Test] ✓ ${sop.fileName}:
  - Hash: ${cacheEntry.hash.substring(0, 16)}...
  - Summary length: ${cacheEntry.summary.split(/\s+/).length} words
  - Generated: ${cacheEntry.generatedAt}
`);
    }
    
    console.log('[Test] ✓ All cache entries valid\n');
    return true;
  } catch (error) {
    console.error('[Test] ✗ Cache validation failed:', error);
    return false;
  }
}

/**
 * Test 3: Cache Reuse (No Regeneration)
 */
async function testCacheReuse(): Promise<boolean> {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('TEST 3: Cache Reuse (No Regeneration)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  try {
    // Read original cache timestamps
    const originalCache = JSON.parse(await fs.readFile(SUMMARY_CACHE_PATH, 'utf-8'));
    const originalTimestamps = Object.entries(originalCache).map(([name, entry]: [string, any]) => ({
      name,
      timestamp: entry.generatedAt
    }));
    
    console.log('[Test] Original cache timestamps:', originalTimestamps);
    
    // Wait a moment to ensure timestamps would differ if regenerated
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Call service again
    console.log('[Test] Calling retrieveRelevantContext again...');
    const ragService = new EnhancedRAGService();
    await ragService.retrieveRelevantContext(
      TEST_PROJECT_PATH,
      PRIMARY_CONTEXT_PATH,
      'Analyze risk management procedures',
      {
        includeSummaries: true,
        procedureChunks: 3
      }
    );
    
    // Read updated cache
    const updatedCache = JSON.parse(await fs.readFile(SUMMARY_CACHE_PATH, 'utf-8'));
    
    // Verify timestamps haven't changed (summaries were reused)
    for (const { name, timestamp } of originalTimestamps) {
      if (updatedCache[name].generatedAt !== timestamp) {
        console.error(`[Test] ✗ Summary regenerated for ${name} (timestamps differ)`);
        return false;
      }
    }
    
    console.log('[Test] ✓ All summaries reused from cache (no regeneration)');
    console.log('[Test] ✓ Cache working correctly\n');
    
    return true;
  } catch (error) {
    console.error('[Test] ✗ Cache reuse test failed:', error);
    return false;
  }
}

/**
 * Test 4: Cache Invalidation on Content Change
 */
async function testCacheInvalidation(): Promise<boolean> {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('TEST 4: Cache Invalidation on Content Change');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  try {
    // Read original cache
    const originalCache = JSON.parse(await fs.readFile(SUMMARY_CACHE_PATH, 'utf-8'));
    const testFileName = TEST_SOPS[0].fileName;
    const originalHash = originalCache[testFileName].hash;
    const originalTimestamp = originalCache[testFileName].generatedAt;
    
    console.log(`[Test] Original hash for ${testFileName}: ${originalHash.substring(0, 16)}...`);
    
    // Modify one SOP file
    const filePath = path.join(PROCEDURES_PATH, testFileName);
    const modifiedContent = TEST_SOPS[0].content + '\n\n## Additional Section\nThis is a new section added for testing.';
    await fs.writeFile(filePath, modifiedContent, 'utf-8');
    console.log(`[Test] Modified ${testFileName}`);
    
    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Clear RAG service cache to force reload
    const ragService = new EnhancedRAGService();
    ragService.clearCache();
    
    // Call service again
    console.log('[Test] Calling retrieveRelevantContext after modification...');
    await ragService.retrieveRelevantContext(
      TEST_PROJECT_PATH,
      PRIMARY_CONTEXT_PATH,
      'Analyze design control requirements',
      {
        includeSummaries: true,
        procedureChunks: 3
      }
    );
    
    // Read updated cache
    const updatedCache = JSON.parse(await fs.readFile(SUMMARY_CACHE_PATH, 'utf-8'));
    const newHash = updatedCache[testFileName].hash;
    const newTimestamp = updatedCache[testFileName].generatedAt;
    
    console.log(`[Test] New hash for ${testFileName}: ${newHash.substring(0, 16)}...`);
    
    // Verify hash changed
    if (newHash === originalHash) {
      console.error('[Test] ✗ Hash did not change after content modification');
      return false;
    }
    
    // Verify timestamp changed (summary regenerated)
    if (newTimestamp === originalTimestamp) {
      console.error('[Test] ✗ Summary was not regenerated (timestamp unchanged)');
      return false;
    }
    
    console.log('[Test] ✓ Hash changed correctly');
    console.log('[Test] ✓ Summary regenerated for modified SOP');
    console.log('[Test] ✓ Cache invalidation working correctly\n');
    
    return true;
  } catch (error) {
    console.error('[Test] ✗ Cache invalidation test failed:', error);
    return false;
  }
}

/**
 * Test 5: Disable Summaries Option
 */
async function testDisableSummaries(): Promise<boolean> {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('TEST 5: Disable Summaries Option');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  try {
    const ragService = new EnhancedRAGService();
    
    console.log('[Test] Calling retrieveRelevantContext with summaries disabled...');
    const result = await ragService.retrieveRelevantContext(
      TEST_PROJECT_PATH,
      PRIMARY_CONTEXT_PATH,
      'Analyze design control requirements',
      {
        includeSummaries: false,
        procedureChunks: 3
      }
    );
    
    // Verify no summaries generated
    if (result.metadata.summariesGenerated !== 0) {
      console.error(`[Test] ✗ Expected 0 summaries, got ${result.metadata.summariesGenerated}`);
      return false;
    }
    
    // Verify context doesn't include summaries section
    if (result.ragContext.includes('COMPANY PROCEDURES OVERVIEW')) {
      console.error('[Test] ✗ Context should not include summaries section');
      return false;
    }
    
    console.log('[Test] ✓ No summaries generated when disabled');
    console.log('[Test] ✓ Context excludes summaries section\n');
    
    return true;
  } catch (error) {
    console.error('[Test] ✗ Disable summaries test failed:', error);
    return false;
  }
}

/**
 * Main test runner
 */
async function runTests(): Promise<void> {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║   SOP SUMMARIZATION TEST SUITE         ║');
  console.log('╚════════════════════════════════════════╝\n');
  
  let allPassed = true;
  
  try {
    // Setup
    await setupTestEnvironment();
    
    // Check for GROQ_API_KEY
    if (!process.env.GROQ_API_KEY) {
      console.error('❌ GROQ_API_KEY environment variable not set!');
      console.error('   Set it with: export GROQ_API_KEY=your_key_here\n');
      process.exit(1);
    }
    
    // Run tests
    const tests = [
      { name: 'Summary Generation', fn: testSummaryGeneration },
      { name: 'Cache Creation', fn: testCacheCreation },
      { name: 'Cache Reuse', fn: testCacheReuse },
      { name: 'Cache Invalidation', fn: testCacheInvalidation },
      { name: 'Disable Summaries', fn: testDisableSummaries }
    ];
    
    const results: { name: string; passed: boolean }[] = [];
    
    for (const test of tests) {
      const passed = await test.fn();
      results.push({ name: test.name, passed });
      allPassed = allPassed && passed;
    }
    
    // Summary
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║         TEST RESULTS SUMMARY           ║');
    console.log('╚════════════════════════════════════════╝\n');
    
    for (const result of results) {
      const status = result.passed ? '✓ PASS' : '✗ FAIL';
      const icon = result.passed ? '✅' : '❌';
      console.log(`${icon} ${status}: ${result.name}`);
    }
    
    const passedCount = results.filter(r => r.passed).length;
    console.log(`\nTotal: ${passedCount}/${results.length} tests passed\n`);
    
  } catch (error) {
    console.error('\n❌ Test suite failed with error:', error);
    allPassed = false;
  } finally {
    // Cleanup
    await cleanupTestEnvironment();
  }
  
  // Exit with appropriate code
  process.exit(allPassed ? 0 : 1);
}

// Run tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
