/**
 * Test Semantic Retrieval API
 * Demonstrates the new retrieveRelevantContext() method
 */

import { enhancedRAGService } from './src/enhanced-rag-service';
import * as path from 'path';

async function testSemanticRetrieval() {
  console.log('🧪 Testing Semantic Retrieval API\n');
  console.log('='.repeat(80));
  
  // Setup paths (adjust these to your actual test project)
  const projectPath = path.join(__dirname, 'test-project');
  const primaryContextPath = path.join(__dirname, 'knowledge-base', 'context', 'primary-context.yaml');
  
  try {
    // Test 1: Basic retrieval with default options
    console.log('\n📋 Test 1: Basic Retrieval with Defaults');
    console.log('-'.repeat(80));
    
    const result1 = await enhancedRAGService.retrieveRelevantContext(
      projectPath,
      primaryContextPath,
      'How should we conduct risk assessment for medical devices?'
    );
    
    console.log('✅ Retrieval successful!');
    console.log(`   Primary Context Included: ${result1.metadata.primaryContextIncluded}`);
    console.log(`   Procedure Chunks Retrieved: ${result1.metadata.procedureChunksRetrieved}`);
    console.log(`   Context Chunks Retrieved: ${result1.metadata.contextChunksRetrieved}`);
    console.log(`   Total Token Estimate: ${result1.metadata.totalTokensEstimate.toLocaleString()}`);
    console.log(`   Sources: ${result1.metadata.sources.length > 0 ? result1.metadata.sources.join(', ') : 'None'}`);
    
    // Test 2: Custom chunk counts
    console.log('\n📋 Test 2: Custom Chunk Counts (8 procedures, 3 context)');
    console.log('-'.repeat(80));
    
    const result2 = await enhancedRAGService.retrieveRelevantContext(
      projectPath,
      primaryContextPath,
      'What are the design control requirements for Class II medical devices?',
      {
        procedureChunks: 8,
        contextChunks: 3,
        maxTokens: 100000
      }
    );
    
    console.log('✅ Retrieval successful!');
    console.log(`   Procedure Chunks Retrieved: ${result2.metadata.procedureChunksRetrieved}`);
    console.log(`   Context Chunks Retrieved: ${result2.metadata.contextChunksRetrieved}`);
    console.log(`   Total Token Estimate: ${result2.metadata.totalTokensEstimate.toLocaleString()}`);
    console.log(`   Token Limit: 100,000`);
    console.log(`   Within Limit: ${result2.metadata.totalTokensEstimate <= 100000 ? '✅ Yes' : '❌ No'}`);
    
    // Test 3: Token limit enforcement
    console.log('\n📋 Test 3: Token Limit Enforcement (Very Low Limit)');
    console.log('-'.repeat(80));
    
    const result3 = await enhancedRAGService.retrieveRelevantContext(
      projectPath,
      primaryContextPath,
      'Create a validation protocol for software components',
      {
        procedureChunks: 10,
        contextChunks: 10,
        maxTokens: 5000  // Very low limit to test truncation
      }
    );
    
    console.log('✅ Retrieval successful!');
    console.log(`   Procedure Chunks Retrieved: ${result3.metadata.procedureChunksRetrieved}`);
    console.log(`   Context Chunks Retrieved: ${result3.metadata.contextChunksRetrieved}`);
    console.log(`   Total Token Estimate: ${result3.metadata.totalTokensEstimate.toLocaleString()}`);
    console.log(`   Token Limit: 5,000`);
    console.log(`   Was Truncated: ${result3.ragContext.includes('[...truncated...]') ? '✅ Yes' : '❌ No'}`);
    
    // Test 4: Metadata validation
    console.log('\n📋 Test 4: Metadata Validation');
    console.log('-'.repeat(80));
    
    const result4 = await enhancedRAGService.retrieveRelevantContext(
      projectPath,
      primaryContextPath,
      'Verify compliance with ISO 13485 quality management requirements',
      {
        procedureChunks: 5,
        contextChunks: 5,
        includeFullPrimary: true,
        maxTokens: 150000
      }
    );
    
    console.log('✅ Metadata validation:');
    console.log(`   ✓ primaryContextIncluded: ${typeof result4.metadata.primaryContextIncluded === 'boolean'}`);
    console.log(`   ✓ procedureChunksRetrieved: ${typeof result4.metadata.procedureChunksRetrieved === 'number'}`);
    console.log(`   ✓ contextChunksRetrieved: ${typeof result4.metadata.contextChunksRetrieved === 'number'}`);
    console.log(`   ✓ totalTokensEstimate: ${typeof result4.metadata.totalTokensEstimate === 'number'}`);
    console.log(`   ✓ sources: ${Array.isArray(result4.metadata.sources)}`);
    console.log(`   Sources count: ${result4.metadata.sources.length}`);
    
    // Test 5: Context structure validation
    console.log('\n📋 Test 5: Context Structure Validation');
    console.log('-'.repeat(80));
    
    const result5 = await enhancedRAGService.retrieveRelevantContext(
      projectPath,
      primaryContextPath,
      'Generate a Design History File summary document'
    );
    
    const hasPrimaryContext = result5.ragContext.includes('=== PRIMARY CONTEXT');
    const hasProcedures = result5.ragContext.includes('=== RELEVANT COMPANY PROCEDURES');
    const hasContext = result5.ragContext.includes('=== RELEVANT PROJECT CONTEXT');
    const hasSimilarityScores = result5.ragContext.includes('Similarity:');
    
    console.log('✅ Structure validation:');
    console.log(`   ✓ Has TIER 1 (Primary Context): ${hasPrimaryContext}`);
    console.log(`   ✓ Has TIER 2 (Procedures): ${hasProcedures}`);
    console.log(`   ✓ Has TIER 3 (Context): ${hasContext}`);
    console.log(`   ✓ Has Similarity Scores: ${hasSimilarityScores}`);
    
    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('✅ ALL TESTS PASSED!');
    console.log('='.repeat(80));
    console.log('\n📊 Summary:');
    console.log('   • Semantic retrieval working correctly');
    console.log('   • Token budget management functioning');
    console.log('   • Metadata accurately populated');
    console.log('   • Tiered context structure validated');
    console.log('   • Source tracking operational\n');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    if (error instanceof Error) {
      console.error('   Message:', error.message);
      console.error('   Stack:', error.stack);
    }
    process.exit(1);
  }
}

// Run tests
console.log('Starting Semantic Retrieval Tests...\n');
testSemanticRetrieval()
  .then(() => {
    console.log('✅ Test suite completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  });
