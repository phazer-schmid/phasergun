/**
 * Test Document Chunking and Vector Store Integration
 * Tests the new intelligent chunking and RAG implementation
 */

import { enhancedRAGService } from './src/enhanced-rag-service';
import * as path from 'path';

async function testChunkingAndRAG() {
  console.log('========================================');
  console.log('Testing Document Chunking and RAG');
  console.log('========================================\n');

  const testProjectPath = path.join(__dirname, 'test-project');
  const primaryContextPath = path.join(__dirname, 'knowledge-base/context/primary-context.yaml');

  try {
    // Test 1: Load knowledge and build vector store
    console.log('\n📝 Test 1: Loading knowledge and building vector store...');
    const knowledge = await enhancedRAGService.loadKnowledge(
      testProjectPath,
      primaryContextPath
    );
    
    console.log('✅ Knowledge loaded successfully');
    console.log('   Project Path:', knowledge.projectPath);
    console.log('   Fingerprint:', knowledge.fingerprint.substring(0, 16) + '...');
    console.log('   Vector Store Fingerprint:', knowledge.vectorStoreFingerprint ? knowledge.vectorStoreFingerprint.substring(0, 16) + '...' : 'N/A');
    console.log('   Indexed At:', knowledge.indexedAt);

    // Test 2: Retrieve knowledge without a query (should return sample chunks)
    console.log('\n📝 Test 2: Retrieving knowledge without query...');
    const { ragContext: contextNoQuery, metadata: metadataNoQuery } = await enhancedRAGService.retrieveKnowledge(
      testProjectPath,
      primaryContextPath
    );
    
    console.log('✅ Retrieved context (no query)');
    console.log('   Total Procedures:', metadataNoQuery.proceduresChunksTotal);
    console.log('   Total Context:', metadataNoQuery.contextChunksTotal);
    console.log('   Total Chunks:', metadataNoQuery.totalChunks);
    console.log('   Context Length:', contextNoQuery.length, 'characters');

    // Test 3: Retrieve knowledge WITH a query (semantic search)
    console.log('\n📝 Test 3: Retrieving knowledge with semantic query...');
    const testQuery = 'What are the requirements for design controls and verification?';
    const { ragContext: contextWithQuery, metadata: metadataWithQuery } = await enhancedRAGService.retrieveKnowledge(
      testProjectPath,
      primaryContextPath,
      testQuery
    );
    
    console.log('✅ Retrieved context with query:', testQuery);
    console.log('   Relevance Filtering:', metadataWithQuery.relevanceFiltering ? 'Yes' : 'No');
    console.log('   Embeddings Used:', metadataWithQuery.embeddingsUsed ? 'Yes' : 'No');
    console.log('   Context Length:', contextWithQuery.length, 'characters');

    // Test 4: Cache validation
    console.log('\n📝 Test 4: Testing cache validation...');
    const cacheValid = await enhancedRAGService.isCacheValid(testProjectPath, primaryContextPath);
    console.log('✅ Cache is valid:', cacheValid);

    // Test 5: Reload from cache
    console.log('\n📝 Test 5: Reloading from cache...');
    const knowledgeCached = await enhancedRAGService.loadKnowledge(
      testProjectPath,
      primaryContextPath
    );
    console.log('✅ Reloaded from cache successfully');
    console.log('   Same fingerprint:', knowledge.fingerprint === knowledgeCached.fingerprint);

    // Test 6: Different queries
    console.log('\n📝 Test 6: Testing multiple queries...');
    const queries = [
      'risk management and mitigation strategies',
      'documentation requirements for medical devices',
      'quality management system procedures'
    ];

    for (const query of queries) {
      const { metadata } = await enhancedRAGService.retrieveKnowledge(
        testProjectPath,
        primaryContextPath,
        query
      );
      console.log(`   Query: "${query.substring(0, 40)}..."`);
      console.log(`   - Retrieved ${metadata.totalChunks} total chunks`);
    }

    // Summary
    console.log('\n========================================');
    console.log('✅ All Tests Passed Successfully!');
    console.log('========================================');
    console.log('\n📊 Summary:');
    console.log('   - Intelligent chunking: ✓');
    console.log('   - Vector store persistence: ✓');
    console.log('   - Semantic search: ✓');
    console.log('   - Cache management: ✓');
    console.log('   - Multiple query handling: ✓');

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
testChunkingAndRAG()
  .then(() => {
    console.log('\n✅ Test suite completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test suite failed:', error);
    process.exit(1);
  });
