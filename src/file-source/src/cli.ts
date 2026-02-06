#!/usr/bin/env node
import * as path from 'path';
import { createFileSource, FileMetadata } from './index';

/**
 * Format file size in human-readable format
 */
function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

/**
 * Format date in readable format
 */
function formatDate(date: Date): string {
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
}

/**
 * Print tree structure recursively
 */
function printTree(node: FileMetadata, indent: string = '', isLast: boolean = true): void {
  const icon = node.isFolder ? '📁' : '📄';
  const prefix = isLast ? '└── ' : '├── ';
  const info = node.isFolder 
    ? `(${node.children?.length || 0} items)`
    : `(${formatSize(node.size)})`;
  
  console.log(`${indent}${prefix}${icon} ${node.name} ${info}`);

  if (node.children && node.children.length > 0) {
    const newIndent = indent + (isLast ? '    ' : '│   ');
    node.children.forEach((child, index) => {
      const childIsLast = index === node.children!.length - 1;
      printTree(child, newIndent, childIsLast);
    });
  }
}

/**
 * Main CLI function
 */
async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  File Source Module - Real Filesystem Adapter Test');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Get folder path from CLI argument or use default
  const args = process.argv.slice(2);
  const defaultPath = path.join(__dirname, '../../..', 'orchestrator/test-project');
  const folderPath = args[0] || defaultPath;
  
  console.log(`📂 Target Folder: ${path.resolve(folderPath)}\n`);

  // Create file source
  const fileSource = createFileSource();

  try {
    // Test 1: List folder (recursive)
    console.log('─────────────────────────────────────────────────────────');
    console.log('Test 1: List Folder (Recursive)');
    console.log('─────────────────────────────────────────────────────────\n');
    
    const contents = await fileSource.listFolder(folderPath);
    console.log(`✓ Found ${contents.files.length} files and ${contents.folders.length} folders\n`);
    
    if (contents.folders.length > 0) {
      console.log('Folders:');
      contents.folders.slice(0, 5).forEach(folder => {
        console.log(`  📁 ${folder.name}`);
        console.log(`     Path: ${folder.path}`);
        console.log(`     Modified: ${formatDate(folder.modifiedTime)}`);
      });
      if (contents.folders.length > 5) {
        console.log(`  ... and ${contents.folders.length - 5} more folders`);
      }
      console.log();
    }

    if (contents.files.length > 0) {
      console.log('Files:');
      contents.files.slice(0, 10).forEach(file => {
        console.log(`  📄 ${file.name}`);
        console.log(`     Size: ${formatSize(file.size)}`);
        console.log(`     Type: ${file.mimeType}`);
        console.log(`     Modified: ${formatDate(file.modifiedTime)}`);
      });
      if (contents.files.length > 10) {
        console.log(`  ... and ${contents.files.length - 10} more files`);
      }
      console.log();
    }

    // Test 2: List folder (flat, non-recursive)
    console.log('─────────────────────────────────────────────────────────');
    console.log('Test 2: List Folder (Flat - Top Level Only)');
    console.log('─────────────────────────────────────────────────────────\n');
    
    const flatContents = await fileSource.listFolderFlat(folderPath);
    console.log(`✓ Found ${flatContents.files.length} files and ${flatContents.folders.length} folders (top level)\n`);
    
    if (flatContents.folders.length > 0) {
      console.log('Top-level Folders:');
      flatContents.folders.forEach(folder => {
        console.log(`  📁 ${folder.name}`);
      });
      console.log();
    }

    if (flatContents.files.length > 0) {
      console.log('Top-level Files:');
      flatContents.files.forEach(file => {
        console.log(`  📄 ${file.name} (${formatSize(file.size)})`);
      });
      console.log();
    }

    // Test 3: Build tree structure
    console.log('─────────────────────────────────────────────────────────');
    console.log('Test 3: Tree Structure');
    console.log('─────────────────────────────────────────────────────────\n');
    
    const tree = await fileSource.listTree(folderPath);
    printTree(tree);
    console.log();

    // Test 4: Get file metadata
    if (contents.files.length > 0) {
      console.log('─────────────────────────────────────────────────────────');
      console.log('Test 4: Get File Metadata');
      console.log('─────────────────────────────────────────────────────────\n');
      
      const testFile = contents.files[0];
      const metadata = await fileSource.getFileMetadata(testFile.path);
      console.log(`✓ Metadata for: ${metadata.name}`);
      console.log(`  Path: ${metadata.path}`);
      console.log(`  Size: ${formatSize(metadata.size)}`);
      console.log(`  MIME Type: ${metadata.mimeType}`);
      console.log(`  Modified: ${formatDate(metadata.modifiedTime)}`);
      console.log(`  Is Folder: ${metadata.isFolder}`);
      console.log();
    }

    // Test 5: Read file content
    if (contents.files.length > 0) {
      console.log('─────────────────────────────────────────────────────────');
      console.log('Test 5: Read File Content');
      console.log('─────────────────────────────────────────────────────────\n');
      
      // Find a text file to read
      const textFile = contents.files.find(f => 
        f.mimeType === 'text/plain' || 
        f.mimeType === 'text/markdown' ||
        f.mimeType === 'text/yaml'
      );

      if (textFile) {
        const content = await fileSource.readFile(textFile.path);
        console.log(`✓ Read file: ${textFile.name}`);
        console.log(`  Content length: ${content.length} characters`);
        console.log(`  Preview (first 200 chars):`);
        console.log(`  ${content.substring(0, 200).replace(/\n/g, '\n  ')}...`);
        console.log();
      } else {
        console.log('ℹ No text files found to read');
        console.log();
      }
    }

    // Test 6: Download file (as buffer)
    if (contents.files.length > 0) {
      console.log('─────────────────────────────────────────────────────────');
      console.log('Test 6: Download File (Binary)');
      console.log('─────────────────────────────────────────────────────────\n');
      
      const testFile = contents.files[0];
      const buffer = await fileSource.downloadFile(testFile.path);
      console.log(`✓ Downloaded: ${testFile.name}`);
      console.log(`  Buffer size: ${buffer.length} bytes`);
      console.log(`  First 32 bytes (hex): ${buffer.subarray(0, 32).toString('hex')}`);
      console.log();
    }

    // Test 7: Search files
    console.log('─────────────────────────────────────────────────────────');
    console.log('Test 7: Search Files');
    console.log('─────────────────────────────────────────────────────────\n');
    
    // Try different search queries
    const searchQueries = ['doc', 'txt', 'project', 'test'];
    
    for (const query of searchQueries) {
      const results = await fileSource.searchFiles(query, folderPath);
      console.log(`Search for "${query}": ${results.length} results`);
      if (results.length > 0) {
        results.slice(0, 3).forEach(file => {
          console.log(`  📄 ${file.name} (${formatSize(file.size)})`);
        });
        if (results.length > 3) {
          console.log(`  ... and ${results.length - 3} more results`);
        }
      }
    }
    console.log();

    // Summary
    console.log('═══════════════════════════════════════════════════════════');
    console.log('✓ All Tests Completed Successfully!');
    console.log('═══════════════════════════════════════════════════════════');
    console.log();
    console.log('Summary:');
    console.log(`  - Total files: ${contents.files.length}`);
    console.log(`  - Total folders: ${contents.folders.length}`);
    console.log(`  - Total size: ${formatSize(contents.files.reduce((sum, f) => sum + f.size, 0))}`);
    console.log();
    console.log('Supported file types:');
    console.log('  .docx, .pdf, .txt, .md, .xlsx, .yaml, .yml');
    console.log();

  } catch (error) {
    console.error('\n❌ ERROR:', error instanceof Error ? error.message : error);
    console.error('\nUsage:');
    console.error('  npm run test');
    console.error('  npm run test /path/to/folder');
    console.error('  ts-node cli.ts /path/to/folder');
    console.error();
    console.error('Default test path:');
    console.error(`  ${defaultPath}`);
    console.error();
    process.exit(1);
  }
}

// Run CLI
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
