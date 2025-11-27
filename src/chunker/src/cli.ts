#!/usr/bin/env node
import { MockChunker } from './index';
import { ParsedDocument } from '@fda-compliance/shared-types';

async function main() {
  console.log('=== Chunker CLI Test ===\n');
  
  const chunker = new MockChunker();
  
  // Create sample documents
  const sampleDocs: ParsedDocument[] = [
    {
      id: 'test-001',
      filePath: '/test/doc1.pdf',
      fileName: 'doc1.pdf',
      content: 'This is a test document with enough content to demonstrate chunking functionality. It contains multiple sentences and paragraphs that will be split into smaller chunks for processing by the RAG system. Each chunk will maintain metadata about its source document.',
      mimeType: 'application/pdf',
      metadata: { phase: 'testing' }
    }
  ];
  
  console.log(`Testing with ${sampleDocs.length} document(s)\n`);
  
  const chunks = chunker.chunkDocuments(sampleDocs);
  
  console.log('\n=== Results ===');
  console.log(`Total chunks created: ${chunks.length}\n`);
  
  chunks.forEach((chunk, index) => {
    console.log(`Chunk ${index + 1}:`);
    console.log(`  Doc ID: ${chunk.docId}`);
    console.log(`  Part ID: ${chunk.partId}`);
    console.log(`  Content: ${chunk.chunk.substring(0, 60)}...`);
    console.log(`  Metadata: ${JSON.stringify(chunk.metadata)}`);
    console.log('');
  });
  
  console.log('✓ Chunker module test complete\n');
}

main().catch(console.error);
