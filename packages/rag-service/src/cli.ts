#!/usr/bin/env node
import { MockRAGService } from './index';

async function main() {
  console.log('=== RAG Service CLI Test ===\n');
  
  const ragService = new MockRAGService();
  
  // Initialize knowledge base
  await ragService.initializeKnowledgeBase();
  
  console.log('\n--- Testing Context Retrieval ---\n');
  
  const testQuery = 'Analyze design inputs for FDA 510(k) compliance';
  console.log(`Query: "${testQuery}"\n`);
  
  const context = await ragService.retrieveContext(testQuery);
  
  console.log('\n=== Results ===');
  console.log(`Context Snippets (${context.contextSnippets.length}):\n`);
  
  context.contextSnippets.forEach((snippet, index) => {
    console.log(`${index + 1}. ${snippet}\n`);
  });
  
  console.log(`\nSources (${context.sourceMetadata.length}):\n`);
  
  context.sourceMetadata.forEach((source, index) => {
    console.log(`${index + 1}. ${source.sourceName}`);
    console.log(`   Path: ${source.path}\n`);
  });
  
  console.log('✓ RAG Service module test complete\n');
}

main().catch(console.error);
