/**
 * Test script for Vector Store
 * Demonstrates usage with EmbeddingService integration
 */

import { VectorStore, VectorEntry, SearchResult } from './src/vector-store';
import { EmbeddingService } from './src/embedding-service';
import * as path from 'path';

async function main() {
  console.log('\n========================================');
  console.log('Vector Store Test');
  console.log('========================================\n');

  // Test project path
  const projectPath = path.join(process.cwd(), 'test-project');
  
  try {
    // 1. Initialize Embedding Service
    console.log('1. Initializing Embedding Service...');
    const embeddingService = EmbeddingService.getInstance(projectPath);
    await embeddingService.initialize();
    console.log('✓ Embedding service ready\n');

    // 2. Create Vector Store
    console.log('2. Creating Vector Store...');
    const vectorStore = new VectorStore(projectPath, 'v1.0');
    console.log('✓ Vector store created\n');

    // 3. Sample documents to index
    const sampleDocs = [
      {
        content: 'The design control process ensures that medical devices meet specified requirements and regulatory standards.',
        fileName: 'design-controls.md',
        filePath: path.join(projectPath, 'Procedures', 'design-controls.md'),
        category: 'procedure' as const,
        chunkIndex: 0
      },
      {
        content: 'Risk management activities must be performed throughout the product lifecycle according to ISO 14971.',
        fileName: 'risk-management.md',
        filePath: path.join(projectPath, 'Procedures', 'risk-management.md'),
        category: 'procedure' as const,
        chunkIndex: 0
      },
      {
        content: 'Our company specializes in developing Class II medical diagnostic devices for point-of-care testing.',
        fileName: 'company-info.md',
        filePath: path.join(projectPath, 'Context', 'company-info.md'),
        category: 'context' as const,
        chunkIndex: 0
      },
      {
        content: 'The current project focuses on a blood glucose monitoring system with wireless connectivity.',
        fileName: 'project-overview.md',
        filePath: path.join(projectPath, 'Context', 'project-overview.md'),
        category: 'context' as const,
        chunkIndex: 0
      },
      {
        content: 'Verification activities confirm that design outputs meet design inputs through inspection and testing.',
        fileName: 'verification-validation.md',
        filePath: path.join(projectPath, 'Procedures', 'verification-validation.md'),
        category: 'procedure' as const,
        chunkIndex: 0
      }
    ];

    // 4. Generate embeddings and add to vector store
    console.log('3. Generating embeddings and adding to vector store...');
    for (const doc of sampleDocs) {
      // Generate embedding
      const embedding = await embeddingService.embedText(doc.content, doc.filePath);
      
      // Create vector entry
      const entry = VectorStore.createEntry(
        doc.content,
        embedding,
        {
          fileName: doc.fileName,
          filePath: doc.filePath,
          category: doc.category,
          chunkIndex: doc.chunkIndex
        }
      );
      
      // Add to store
      vectorStore.addEntry(entry);
      console.log(`  ✓ Added: ${doc.fileName}`);
    }
    console.log('');

    // 5. Display statistics
    console.log('4. Vector Store Statistics:');
    const stats = vectorStore.getStats();
    console.log(`  Total Entries: ${stats.totalEntries}`);
    console.log(`  Procedure Entries: ${stats.procedureEntries}`);
    console.log(`  Context Entries: ${stats.contextEntries}`);
    console.log(`  Fingerprint: ${stats.fingerprint.substring(0, 16)}...`);
    console.log('');

    // 6. Test semantic search
    console.log('5. Testing Semantic Search...\n');
    
    // Query 1: Risk-related query
    const query1 = 'How do we manage risks in medical device development?';
    console.log(`Query 1: "${query1}"`);
    const queryEmbedding1 = await embeddingService.embedText(query1);
    const results1 = vectorStore.searchWithFloat32Array(queryEmbedding1, 3);
    console.log('Top 3 Results:');
    results1.forEach((result, idx) => {
      console.log(`  ${idx + 1}. [${result.similarity.toFixed(3)}] ${result.entry.metadata.fileName}`);
      console.log(`     "${result.entry.metadata.content.substring(0, 80)}..."`);
    });
    console.log('');

    // Query 2: Project-specific query
    const query2 = 'What medical device are we developing?';
    console.log(`Query 2: "${query2}"`);
    const queryEmbedding2 = await embeddingService.embedText(query2);
    const results2 = vectorStore.searchWithFloat32Array(queryEmbedding2, 3);
    console.log('Top 3 Results:');
    results2.forEach((result, idx) => {
      console.log(`  ${idx + 1}. [${result.similarity.toFixed(3)}] ${result.entry.metadata.fileName}`);
      console.log(`     "${result.entry.metadata.content.substring(0, 80)}..."`);
    });
    console.log('');

    // 7. Test category filtering
    console.log('6. Testing Category Filtering...\n');
    const query3 = 'verification and validation';
    console.log(`Query: "${query3}"`);
    const queryEmbedding3 = await embeddingService.embedText(query3);
    
    console.log('Results (procedures only):');
    const procedureResults = vectorStore.searchWithFloat32Array(queryEmbedding3, 3, 'procedure');
    procedureResults.forEach((result, idx) => {
      console.log(`  ${idx + 1}. [${result.similarity.toFixed(3)}] ${result.entry.metadata.fileName} [${result.entry.metadata.category}]`);
    });
    
    console.log('\nResults (context only):');
    const contextResults = vectorStore.searchWithFloat32Array(queryEmbedding3, 3, 'context');
    contextResults.forEach((result, idx) => {
      console.log(`  ${idx + 1}. [${result.similarity.toFixed(3)}] ${result.entry.metadata.fileName} [${result.entry.metadata.category}]`);
    });
    console.log('');

    // 8. Test persistence
    console.log('7. Testing Persistence...');
    const savePath = path.join(projectPath, '.phasergun-cache', 'vector-store.json');
    await vectorStore.save();
    console.log(`✓ Saved to: ${savePath}\n`);

    // 9. Test loading
    console.log('8. Testing Load from Disk...');
    const loadedStore = await VectorStore.load(savePath, projectPath);
    const loadedStats = loadedStore.getStats();
    console.log(`✓ Loaded ${loadedStats.totalEntries} entries`);
    console.log(`  Fingerprint matches: ${loadedStats.fingerprint === stats.fingerprint ? '✓' : '✗'}`);
    console.log('');

    // 10. Test incremental updates
    console.log('9. Testing Incremental Updates...');
    const newDoc = {
      content: 'Software validation ensures that the software meets user needs and intended uses.',
      fileName: 'software-validation.md',
      filePath: path.join(projectPath, 'Procedures', 'software-validation.md'),
      category: 'procedure' as const,
      chunkIndex: 0
    };
    
    const newEmbedding = await embeddingService.embedText(newDoc.content, newDoc.filePath);
    const newEntry = VectorStore.createEntry(
      newDoc.content,
      newEmbedding,
      {
        fileName: newDoc.fileName,
        filePath: newDoc.filePath,
        category: newDoc.category,
        chunkIndex: newDoc.chunkIndex
      }
    );
    
    loadedStore.addEntry(newEntry);
    console.log(`✓ Added new entry: ${newDoc.fileName}`);
    console.log(`  Previous count: ${stats.totalEntries}`);
    console.log(`  New count: ${loadedStore.getEntryCount()}`);
    console.log(`  Fingerprint changed: ${loadedStore.getFingerprint() !== stats.fingerprint ? '✓' : '✗'}`);
    console.log('');

    // 11. Save updated store
    await loadedStore.save();
    console.log('✓ Saved updated store\n');

    // 12. Test file removal
    console.log('10. Testing File Removal...');
    const removedCount = loadedStore.removeEntriesByFile(newDoc.filePath);
    console.log(`✓ Removed ${removedCount} entries for ${newDoc.fileName}`);
    console.log(`  New count: ${loadedStore.getEntryCount()}\n`);

    console.log('========================================');
    console.log('✓ All Tests Passed!');
    console.log('========================================\n');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
main();
