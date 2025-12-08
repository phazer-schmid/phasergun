import { ComprehensiveFileParser, MockFileParser } from './index';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Example 1: Basic folder scanning
 */
async function example1_basicScanning() {
  console.log('\n=== Example 1: Basic Folder Scanning ===\n');
  
  const parser = new ComprehensiveFileParser();
  const documents = await parser.scanAndParseFolder('./sample-documents');
  
  console.log(`Found ${documents.length} documents`);
  
  documents.forEach(doc => {
    console.log(`\n${doc.fileName}:`);
    console.log(`  Type: ${doc.mimeType}`);
    console.log(`  Size: ${doc.metadata.fileSize} bytes`);
    console.log(`  Content preview: ${doc.content.substring(0, 100)}...`);
  });
}

/**
 * Example 2: Processing specific file types
 */
async function example2_fileTypeFiltering() {
  console.log('\n=== Example 2: File Type Filtering ===\n');
  
  const parser = new ComprehensiveFileParser();
  const documents = await parser.scanAndParseFolder('./dhf-documents');
  
  // Filter by file type
  const pdfDocs = documents.filter(doc => doc.mimeType === 'application/pdf');
  const wordDocs = documents.filter(doc => doc.mimeType.includes('word'));
  const images = documents.filter(doc => doc.mimeType.startsWith('image/'));
  
  console.log(`PDFs: ${pdfDocs.length}`);
  console.log(`Word Documents: ${wordDocs.length}`);
  console.log(`Images: ${images.length}`);
  
  // Process images with OCR
  images.forEach(img => {
    console.log(`\nImage: ${img.fileName}`);
    console.log(`  Dimensions: ${img.metadata.width}x${img.metadata.height}`);
    console.log(`  Format: ${img.metadata.format}`);
    console.log(`  OCR Text: ${img.content.substring(0, 200)}...`);
  });
}

/**
 * Example 3: Extracting metadata
 */
async function example3_metadataExtraction() {
  console.log('\n=== Example 3: Metadata Extraction ===\n');
  
  const parser = new ComprehensiveFileParser();
  const documents = await parser.scanAndParseFolder('./documents');
  
  documents.forEach(doc => {
    console.log(`\n${doc.fileName}:`);
    
    // PDF-specific metadata
    if (doc.metadata.pageCount) {
      console.log(`  Pages: ${doc.metadata.pageCount}`);
    }
    
    // Word document metadata
    if (doc.metadata.wordCount) {
      console.log(`  Words: ${doc.metadata.wordCount}`);
    }
    
    if (doc.metadata.hasImages) {
      console.log(`  Contains images: Yes`);
    }
    
    if (doc.metadata.hasTables) {
      console.log(`  Contains tables: Yes`);
    }
    
    // Image metadata
    if (doc.metadata.width && doc.metadata.height) {
      console.log(`  Image size: ${doc.metadata.width}x${doc.metadata.height}`);
      console.log(`  Color space: ${doc.metadata.space}`);
      console.log(`  Bit depth: ${doc.metadata.depth}`);
    }
  });
}

/**
 * Example 4: Content analysis
 */
async function example4_contentAnalysis() {
  console.log('\n=== Example 4: Content Analysis ===\n');
  
  const parser = new ComprehensiveFileParser();
  const documents = await parser.scanAndParseFolder('./compliance-docs');
  
  // Search for specific terms
  const searchTerms = ['ISO 13485', 'risk analysis', 'design input', 'validation'];
  
  searchTerms.forEach(term => {
    const matches = documents.filter(doc => 
      doc.content.toLowerCase().includes(term.toLowerCase())
    );
    
    console.log(`\nDocuments containing "${term}": ${matches.length}`);
    matches.forEach(doc => {
      console.log(`  - ${doc.fileName}`);
    });
  });
}

/**
 * Example 5: Document classification
 */
async function example5_documentClassification() {
  console.log('\n=== Example 5: Document Classification ===\n');
  
  const parser = new ComprehensiveFileParser();
  const documents = await parser.scanAndParseFolder('./dhf');
  
  // Classify documents based on content
  const classifications = {
    'Design Input': /design input|user need|requirement/i,
    'Risk Analysis': /risk|fmea|hazard/i,
    'Verification': /verification|test|protocol/i,
    'Validation': /validation|clinical/i,
    'Design Output': /design output|specification|drawing/i
  };
  
  const classified: { [key: string]: typeof documents } = {};
  
  Object.entries(classifications).forEach(([category, pattern]) => {
    classified[category] = documents.filter(doc => 
      pattern.test(doc.content) || pattern.test(doc.fileName)
    );
  });
  
  Object.entries(classified).forEach(([category, docs]) => {
    console.log(`\n${category}: ${docs.length} documents`);
    docs.forEach(doc => {
      console.log(`  - ${doc.fileName}`);
    });
  });
}

/**
 * Example 6: Export to JSON
 */
async function example6_exportToJson() {
  console.log('\n=== Example 6: Export to JSON ===\n');
  
  const parser = new ComprehensiveFileParser();
  const documents = await parser.scanAndParseFolder('./documents');
  
  // Create summary object
  const summary = {
    totalDocuments: documents.length,
    parsedAt: new Date().toISOString(),
    fileTypes: {} as { [key: string]: number },
    documents: documents.map(doc => ({
      id: doc.id,
      fileName: doc.fileName,
      mimeType: doc.mimeType,
      contentLength: doc.content.length,
      metadata: doc.metadata
    }))
  };
  
  // Count file types
  documents.forEach(doc => {
    const type = doc.mimeType;
    summary.fileTypes[type] = (summary.fileTypes[type] || 0) + 1;
  });
  
  // Save to file
  await fs.writeFile(
    './parsed-documents.json',
    JSON.stringify(summary, null, 2)
  );
  
  console.log('Export complete: parsed-documents.json');
  console.log(`Total documents: ${summary.totalDocuments}`);
  console.log('File types:', summary.fileTypes);
}

/**
 * Example 7: Image OCR showcase
 */
async function example7_imageOcr() {
  console.log('\n=== Example 7: Image OCR Demonstration ===\n');
  
  const parser = new ComprehensiveFileParser();
  const documents = await parser.scanAndParseFolder('./scanned-docs');
  
  const images = documents.filter(doc => doc.mimeType.startsWith('image/'));
  
  console.log(`Processing ${images.length} images with OCR...\n`);
  
  images.forEach(img => {
    console.log(`Image: ${img.fileName}`);
    console.log(`  Resolution: ${img.metadata.width}x${img.metadata.height} @ ${img.metadata.density || 'default'} DPI`);
    console.log(`  Format: ${img.metadata.format}`);
    console.log(`  Has Alpha: ${img.metadata.hasAlpha}`);
    console.log(`  Extracted Text (first 300 chars):`);
    console.log(`  ${img.content.substring(0, 300)}...`);
    console.log('');
  });
}

/**
 * Example 8: PowerPoint slide extraction
 */
async function example8_powerPointParsing() {
  console.log('\n=== Example 8: PowerPoint Parsing ===\n');
  
  const parser = new ComprehensiveFileParser();
  const documents = await parser.scanAndParseFolder('./presentations');
  
  const presentations = documents.filter(doc => 
    doc.mimeType.includes('presentation')
  );
  
  presentations.forEach(ppt => {
    console.log(`\nPresentation: ${ppt.fileName}`);
    console.log(`  File size: ${(ppt.metadata.fileSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Content length: ${ppt.content.length} characters`);
    console.log(`  Preview:\n${ppt.content.substring(0, 500)}...`);
  });
}

/**
 * Example 9: Using mock parser for testing
 */
async function example9_mockParser() {
  console.log('\n=== Example 9: Mock Parser for Testing ===\n');
  
  const mockParser = new MockFileParser();
  const documents = await mockParser.scanAndParseFolder('/test/path');
  
  console.log(`Mock parser returned ${documents.length} documents`);
  
  documents.forEach(doc => {
    console.log(`\n${doc.fileName}:`);
    console.log(`  Type: ${doc.mimeType}`);
    console.log(`  Content: ${doc.content}`);
    console.log(`  Metadata:`, doc.metadata);
  });
}

/**
 * Example 10: Error handling
 */
async function example10_errorHandling() {
  console.log('\n=== Example 10: Error Handling ===\n');
  
  const parser = new ComprehensiveFileParser();
  
  try {
    const documents = await parser.scanAndParseFolder('./non-existent-folder');
    console.log(`Parsed ${documents.length} documents`);
  } catch (error) {
    console.error('Error occurred:', error);
    console.log('Parser gracefully handled the error');
  }
  
  // The parser will continue processing other files even if some fail
  try {
    const documents = await parser.scanAndParseFolder('./mixed-quality-docs');
    console.log(`Successfully parsed ${documents.length} documents`);
    console.log('Failed files were logged but didn\'t stop the process');
  } catch (error) {
    console.error('Critical error:', error);
  }
}

// Main execution
async function main() {
  console.log('='.repeat(70));
  console.log('File Parser Examples');
  console.log('='.repeat(70));
  
  // Uncomment the examples you want to run:
  
  // await example1_basicScanning();
  // await example2_fileTypeFiltering();
  // await example3_metadataExtraction();
  // await example4_contentAnalysis();
  // await example5_documentClassification();
  // await example6_exportToJson();
  // await example7_imageOcr();
  // await example8_powerPointParsing();
  await example9_mockParser();
  // await example10_errorHandling();
  
  console.log('\n' + '='.repeat(70));
  console.log('Examples complete');
  console.log('='.repeat(70));
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

export {
  example1_basicScanning,
  example2_fileTypeFiltering,
  example3_metadataExtraction,
  example4_contentAnalysis,
  example5_documentClassification,
  example6_exportToJson,
  example7_imageOcr,
  example8_powerPointParsing,
  example9_mockParser,
  example10_errorHandling
};
