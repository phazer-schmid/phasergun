#!/usr/bin/env node
import { createFileSource, FileSourceType, FileSourceConfig } from './index';

async function main() {
  console.log('=== File Source Module CLI Test ===\n');

  // Test Local Filesystem
  console.log('--- Testing Local Filesystem Source ---\n');
  const localSource = createFileSource(FileSourceType.LOCAL_FILESYSTEM);
  await localSource.initialize({ type: FileSourceType.LOCAL_FILESYSTEM });
  
  const localContents = await localSource.listFolder('/sample/dhf/folder');
  console.log(`Found ${localContents.folders.length} folders and ${localContents.files.length} files\n`);
  
  localContents.folders.forEach(folder => {
    console.log(`  📁 ${folder.name}`);
  });
  localContents.files.forEach(file => {
    console.log(`  📄 ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);
  });

  console.log('\n--- Testing Google Drive Source ---\n');
  const googleSource = createFileSource(FileSourceType.GOOGLE_DRIVE);
  await googleSource.initialize({ 
    type: FileSourceType.GOOGLE_DRIVE,
    credentials: { accessToken: 'mock-token' }
  });
  
  const googleContents = await googleSource.listFolder('root');
  console.log(`Found ${googleContents.folders.length} folders and ${googleContents.files.length} files\n`);
  
  googleContents.folders.forEach(folder => {
    console.log(`  📁 ${folder.name}`);
  });
  googleContents.files.forEach(file => {
    console.log(`  📄 ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);
  });

  console.log('\n--- Testing Dropbox Source ---\n');
  const dropboxSource = createFileSource(FileSourceType.DROPBOX);
  await dropboxSource.initialize({ 
    type: FileSourceType.DROPBOX,
    credentials: { accessToken: 'mock-token' }
  });
  
  const dropboxContents = await dropboxSource.listFolder('/dhf');
  console.log(`Found ${dropboxContents.folders.length} folders and ${dropboxContents.files.length} files\n`);
  
  dropboxContents.folders.forEach(folder => {
    console.log(`  📁 ${folder.name}`);
  });
  dropboxContents.files.forEach(file => {
    console.log(`  📄 ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);
  });

  console.log('\n✓ File Source module test complete\n');
}

main().catch(console.error);
