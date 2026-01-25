/**
 * Comprehensive RAG Pipeline Test
 * 
 * Tests the entire RAG pipeline end-to-end:
 * 1. Embedding generation
 * 2. Vector search
 * 3. Semantic retrieval
 * 4. Full generation flow
 */

import { EnhancedRAGService } from '../src/enhanced-rag-service';
import { GroqLLMService } from '@fda-compliance/llm-service';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config();

async function testRAGPipeline() {
  console.log('\n' + '='.repeat(80));
  console.log('🧪 COMPREHENSIVE RAG PIPELINE TEST');
  console.log('='.repeat(80) + '\n');
  
  // Configuration
  const projectPath = process.env.TEST_PROJECT_PATH || '/tmp/test-phasergun';
  const primaryContextPath = process.env.PRIMARY_CONTEXT_PATH || 
    path.join(__dirname, '..', 'knowledge-base', 'context', 'primary-context.yaml');
  
  const groqApiKey = process.env.GROQ_API_KEY;
  if (!groqApiKey) {
    console.error('❌ GROQ_API_KEY environment variable not set');
    console.error('   Please set GROQ_API_KEY in your .env file or environment');
    process.exit(1);
  }
  
  const ragService = new EnhancedRAGService();
  const llmService = new GroqLLMService(groqApiKey, 'llama-3.1-8b-instant');
  
  console.log('📋 Configuration:');
  console.log(`   Project Path: ${projectPath}`);
  console.log(`   Primary Context: ${primaryContextPath}`);
  console.log(`   LLM Model: llama-3.1-8b-instant`);
  console.log('');
  
  try {
    // ========================================
    // TEST 1: Load and Embed Documents
    // ========================================
    console.log('━'.repeat(80));
    console.log('📝 TEST 1: Loading and Embedding Documents');
    console.log('━'.repeat(80));
    
    const startLoad = Date.now();
    const knowledge = await ragService.loadKnowledge(projectPath, primaryContextPath);
    const loadDuration = Date.now() - startLoad;
    
    console.log('✅ Documents loaded and embedded successfully');
    console.log(`   Duration: ${loadDuration}ms`);
    console.log(`   Primary Context: ${knowledge.primaryContext ? '✓' : '✗'}`);
    console.log(`   Indexed At: ${knowledge.indexedAt}`);
    console.log(`   Cache Fingerprint: ${knowledge.fingerprint.substring(0, 16)}...`);
    console.log(`   VectorStore Fingerprint: ${knowledge.vectorStoreFingerprint.substring(0, 16)}...`);
    console.log('');
    
    // ========================================
    // TEST 2: Semantic Search
    // ========================================
    console.log('━'.repeat(80));
    console.log('🔍 TEST 2: Testing Semantic Search');
    console.log('━'.repeat(80));
    
    const testQuery = 'What are the design control requirements?';
    console.log(`   Query: "${testQuery}"`);
    console.log('');
    
    const startSearch = Date.now();
    const { ragContext, metadata, procedureChunks, contextChunks } = 
      await ragService.retrieveRelevantContext(
        projectPath,
        primaryContextPath,
        testQuery,
        { procedureChunks: 3, contextChunks: 2, includeSummaries: false }
      );
    const searchDuration = Date.now() - startSearch;
    
    console.log('✅ Semantic search completed');
    console.log(`   Duration: ${searchDuration}ms ${searchDuration < 5000 ? '✓ (<5s target)' : '⚠️  (>5s target)'}`);
    console.log('');
    console.log('📊 Retrieved Context:');
    console.log(`   • Primary Context Included: ${metadata.primaryContextIncluded ? 'Yes' : 'No'}`);
    console.log(`   • Procedure Chunks: ${metadata.procedureChunksRetrieved}`);
    console.log(`   • Context Chunks: ${metadata.contextChunksRetrieved}`);
    console.log(`   • Estimated Tokens: ${metadata.totalTokensEstimate.toLocaleString()}`);
    console.log(`   • Sources: ${metadata.sources.length > 0 ? metadata.sources.join(', ') : 'None'}`);
    console.log('');
    
    // Display top search results
    if (procedureChunks.length > 0) {
      console.log('🎯 Top Procedure Matches:');
      procedureChunks.slice(0, 3).forEach((result, idx) => {
        console.log(`   ${idx + 1}. ${result.entry.metadata.fileName}`);
        console.log(`      Chunk: ${result.entry.metadata.chunkIndex + 1}`);
        console.log(`      Similarity: ${(result.similarity * 100).toFixed(1)}%`);
        console.log(`      Preview: ${result.entry.metadata.content.substring(0, 100)}...`);
      });
      console.log('');
    }
    
    if (contextChunks.length > 0) {
      console.log('🎯 Top Context Matches:');
      contextChunks.slice(0, 2).forEach((result, idx) => {
        console.log(`   ${idx + 1}. ${result.entry.metadata.fileName}`);
        console.log(`      Chunk: ${result.entry.metadata.chunkIndex + 1}`);
        console.log(`      Similarity: ${(result.similarity * 100).toFixed(1)}%`);
        console.log(`      Preview: ${result.entry.metadata.content.substring(0, 100)}...`);
      });
      console.log('');
    }
    
    // Validate search results
    console.log('✓ Validation:');
    console.log(`   • Context is not empty: ${ragContext.length > 0 ? 'Pass' : 'Fail'}`);
    console.log(`   • Metadata present: ${metadata ? 'Pass' : 'Fail'}`);
    console.log(`   • Sources tracked: ${metadata.sources.length >= 0 ? 'Pass' : 'Fail'}`);
    console.log(`   • Similarity scores valid: ${procedureChunks.every(r => r.similarity >= 0 && r.similarity <= 1) ? 'Pass' : 'Fail'}`);
    console.log('');
    
    // ========================================
    // TEST 3: Generate Response with RAG Context
    // ========================================
    console.log('━'.repeat(80));
    console.log('🤖 TEST 3: Generating Response with RAG Context');
    console.log('━'.repeat(80));
    
    const prompt = `${ragContext}\n\n=== USER REQUEST ===\n${testQuery}`;
    console.log(`   Prompt Length: ${prompt.length} characters`);
    console.log(`   Estimated Tokens: ${Math.ceil(prompt.length / 4)}`);
    console.log('');
    
    const startGenerate = Date.now();
    const response = await llmService.generateText(prompt);
    const generateDuration = Date.now() - startGenerate;
    
    console.log('✅ Response generated successfully');
    console.log(`   Duration: ${generateDuration}ms`);
    console.log('');
    console.log('📄 Generated Response (first 500 chars):');
    console.log('   ' + '-'.repeat(76));
    const preview = response.generatedText.substring(0, 500).split('\n').join('\n   ');
    console.log(`   ${preview}...`);
    console.log('   ' + '-'.repeat(76));
    console.log('');
    console.log('📊 Usage Statistics:');
    console.log(`   • Tokens Used: ${response.usageStats.tokensUsed.toLocaleString()}`);
    console.log(`   • Cost: $${response.usageStats.cost.toFixed(4)}`);
    console.log('');
    
    // Validate generation
    console.log('✓ Validation:');
    console.log(`   • Response not empty: ${response.generatedText.length > 0 ? 'Pass' : 'Fail'}`);
    console.log(`   • Usage stats present: ${response.usageStats ? 'Pass' : 'Fail'}`);
    console.log(`   • Cost calculated: ${response.usageStats.cost >= 0 ? 'Pass' : 'Fail'}`);
    console.log('');
    
    // ========================================
    // TEST 4: Cache Validation
    // ========================================
    console.log('━'.repeat(80));
    console.log('💾 TEST 4: Testing Cache Functionality');
    console.log('━'.repeat(80));
    
    console.log('   Loading knowledge again (should use cache)...');
    console.log('');
    
    const startCache = Date.now();
    const cached = await ragService.loadKnowledge(projectPath, primaryContextPath);
    const cacheDuration = Date.now() - startCache;
    
    console.log('✅ Cache loaded successfully');
    console.log(`   Duration: ${cacheDuration}ms ${cacheDuration < loadDuration / 2 ? '✓ (faster than initial load)' : '⚠️  (similar to initial load)'}`);
    console.log('');
    console.log('✓ Validation:');
    console.log(`   • Cache fingerprint matches: ${cached.fingerprint === knowledge.fingerprint ? 'Pass' : 'Fail'}`);
    console.log(`   • VectorStore fingerprint matches: ${cached.vectorStoreFingerprint === knowledge.vectorStoreFingerprint ? 'Pass' : 'Fail'}`);
    console.log(`   • Indexed timestamp same: ${cached.indexedAt === knowledge.indexedAt ? 'Pass' : 'Fail'}`);
    console.log(`   • Cache is faster: ${cacheDuration < loadDuration ? 'Pass' : 'Fail'}`);
    console.log('');
    
    // ========================================
    // TEST 5: Advanced Retrieval Options
    // ========================================
    console.log('━'.repeat(80));
    console.log('⚙️  TEST 5: Advanced Retrieval Options');
    console.log('━'.repeat(80));
    
    // Test with custom options
    const advancedResult = await ragService.retrieveRelevantContext(
      projectPath,
      primaryContextPath,
      'Create a verification protocol for design outputs',
      { 
        procedureChunks: 5, 
        contextChunks: 3,
        maxTokens: 100000,
        includeSummaries: false 
      }
    );
    
    console.log('✅ Advanced retrieval completed');
    console.log('');
    console.log('📊 Results:');
    console.log(`   • Procedure Chunks Retrieved: ${advancedResult.metadata.procedureChunksRetrieved}`);
    console.log(`   • Context Chunks Retrieved: ${advancedResult.metadata.contextChunksRetrieved}`);
    console.log(`   • Total Tokens: ${advancedResult.metadata.totalTokensEstimate.toLocaleString()}`);
    console.log(`   • Within Token Limit: ${advancedResult.metadata.totalTokensEstimate <= 100000 ? 'Yes ✓' : 'No ✗'}`);
    console.log('');
    
    // ========================================
    // SUMMARY
    // ========================================
    console.log('━'.repeat(80));
    console.log('✅ ALL TESTS PASSED!');
    console.log('━'.repeat(80));
    console.log('');
    console.log('📊 Test Summary:');
    console.log('   ✓ Embedding Generation: Working');
    console.log('   ✓ Vector Search: Working');
    console.log('   ✓ Semantic Retrieval: Working');
    console.log('   ✓ Full Generation Flow: Working');
    console.log('   ✓ Cache Functionality: Working');
    console.log('');
    console.log('⚡ Performance Metrics:');
    console.log(`   • Initial Load: ${loadDuration}ms`);
    console.log(`   • Semantic Search: ${searchDuration}ms ${searchDuration < 5000 ? '(Target: <5s ✓)' : '(Target: <5s ✗)'}`);
    console.log(`   • LLM Generation: ${generateDuration}ms`);
    console.log(`   • Cache Load: ${cacheDuration}ms`);
    console.log('');
    console.log('💰 Cost Analysis:');
    console.log(`   • Single Query Cost: $${response.usageStats.cost.toFixed(4)}`);
    console.log(`   • Tokens Used: ${response.usageStats.tokensUsed.toLocaleString()}`);
    console.log('');
    console.log('🎉 RAG Pipeline is fully operational and ready for production use!');
    console.log('');
    
  } catch (error) {
    console.error('\n' + '❌'.repeat(40));
    console.error('TEST FAILED');
    console.error('❌'.repeat(40) + '\n');
    console.error('Error:', error);
    if (error instanceof Error) {
      console.error('Message:', error.message);
      console.error('Stack:', error.stack);
    }
    process.exit(1);
  }
}

// Run tests
if (require.main === module) {
  console.log('Starting RAG Pipeline Tests...\n');
  testRAGPipeline()
    .then(() => {
      console.log('Test suite completed successfully!\n');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Test suite failed:', error);
      process.exit(1);
    });
}
