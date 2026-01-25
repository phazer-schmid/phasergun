/**
 * Test script for embedding service
 * Run with: ts-node src/rag-service/test-embeddings.ts
 */

import { EmbeddingService } from './src/embedding-service';

async function testEmbeddingService() {
  console.log('='.repeat(60));
  console.log('Testing Embedding Service');
  console.log('='.repeat(60));
  console.log();

  try {
    // Initialize embedding service
    console.log('1. Initializing embedding service...');
    const embeddingService = EmbeddingService.getInstance(process.cwd());
    await embeddingService.initialize();
    
    const modelInfo = embeddingService.getModelInfo();
    console.log(`   ✓ Model: ${modelInfo.name}`);
    console.log(`   ✓ Version: ${modelInfo.version}`);
    console.log(`   ✓ Dimensions: ${modelInfo.dimensions}`);
    console.log();

    // Test single embedding
    console.log('2. Testing single text embedding...');
    const text1 = 'Risk assessment for medical device';
    const embedding1 = await embeddingService.embedText(text1);
    console.log(`   ✓ Text: "${text1}"`);
    console.log(`   ✓ Embedding dimensions: ${embedding1.length}`);
    console.log(`   ✓ First 5 values: [${Array.from(embedding1.slice(0, 5)).map(v => v.toFixed(4)).join(', ')}...]`);
    console.log();

    // Test batch embedding
    console.log('3. Testing batch embeddings...');
    const texts = [
      'Device malfunction investigation procedure',
      'Hazard analysis and risk evaluation',
      'Design control documentation requirements',
      'Verification and validation protocols'
    ];
    
    const embeddings = await embeddingService.embedBatch(texts);
    console.log(`   ✓ Embedded ${embeddings.length} texts`);
    console.log(`   ✓ Each embedding has ${embeddings[0].length} dimensions`);
    console.log();

    // Test cosine similarity
    console.log('4. Testing cosine similarity...');
    const query = 'risk management process';
    const queryEmbedding = await embeddingService.embedText(query);
    
    console.log(`   Query: "${query}"`);
    console.log('   Similarities:');
    
    for (let i = 0; i < texts.length; i++) {
      const similarity = EmbeddingService.cosineSimilarity(queryEmbedding, embeddings[i]);
      console.log(`   - "${texts[i]}": ${(similarity * 100).toFixed(2)}%`);
    }
    console.log();

    // Test top-K retrieval
    console.log('5. Testing top-K retrieval...');
    const topK = EmbeddingService.findTopK(queryEmbedding, embeddings, 2);
    console.log(`   Top 2 most similar texts to "${query}":`);
    topK.forEach((match, idx) => {
      console.log(`   ${idx + 1}. "${texts[match.index]}" (${(match.similarity * 100).toFixed(2)}%)`);
    });
    console.log();

    // Test caching
    console.log('6. Testing embedding cache...');
    console.log('   First call (should generate embedding):');
    const start1 = Date.now();
    await embeddingService.embedText(text1, '/test/path.txt');
    const time1 = Date.now() - start1;
    console.log(`   Time: ${time1}ms`);
    
    console.log('   Second call (should use cache):');
    const start2 = Date.now();
    await embeddingService.embedText(text1, '/test/path.txt');
    const time2 = Date.now() - start2;
    console.log(`   Time: ${time2}ms`);
    console.log(`   ✓ Cache speedup: ${(time1 / Math.max(time2, 1)).toFixed(1)}x faster`);
    console.log();

    console.log('='.repeat(60));
    console.log('✅ All tests passed!');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run tests
testEmbeddingService();
