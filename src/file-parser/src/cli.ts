#!/usr/bin/env node
import { MockFileParser } from './index';

async function main() {
  console.log('=== File Parser CLI Test ===\n');
  
  const parser = new MockFileParser();
  const testPath = process.argv[2] || '/test/rag/folder';
  
  console.log(`Testing with folder: ${testPath}\n`);
  
  const docs = await parser.scanAndParseFolder(testPath);
  
  console.log('\n=== Results ===');
  console.log(`Total documents found: ${docs.length}\n`);
  
  docs.forEach((doc, index) => {
    console.log(`Document ${index + 1}:`);
    console.log(`  ID: ${doc.id}`);
    console.log(`  File: ${doc.fileName}`);
    console.log(`  Type: ${doc.mimeType}`);
    console.log(`  Phase: ${doc.metadata?.phase || 'unknown'}`);
    console.log(`  Content Preview: ${doc.content.substring(0, 80)}...`);
    console.log('');
  });
  
  console.log('✓ File Parser module test complete\n');
}

main().catch(console.error);
