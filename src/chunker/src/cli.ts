#!/usr/bin/env node
import { IntelligentChunker, MockChunker } from './index';
import { ParsedDocument } from '@phasergun/shared-types';

async function testIntelligentChunker() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║    INTELLIGENT DOCUMENT CHUNKER - COMPREHENSIVE TEST SUITE      ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');
  
  const chunker = new IntelligentChunker();
  
  // Test 1: Risk Analysis Document
  console.log('TEST 1: Risk Analysis Document (FMEA)');
  console.log('═'.repeat(70));
  const riskDoc: ParsedDocument = {
    id: 'risk-001',
    filePath: '/dhf/risk/fmea_analysis.pdf',
    fileName: 'fmea_analysis.pdf',
    content: `FAILURE MODE AND EFFECTS ANALYSIS
    
RISK-HAZ-001: Power Supply Failure
Failure Mode: Battery depletes during operation
Effect: Device shutdown, therapy interruption
Severity: 8, Occurrence: 3, Detection: 7, RPN: 168

RISK-HAZ-002: Flow Sensor Drift
Failure Mode: Sensor calibration degrades over time
Effect: Inaccurate medication delivery
Severity: 9, Occurrence: 2, Detection: 5, RPN: 90

RISK-HAZ-003: Software Malfunction
Failure Mode: Firmware crashes unexpectedly
Effect: Loss of device control
Severity: 10, Occurrence: 1, Detection: 6, RPN: 60`,
    mimeType: 'application/pdf',
    metadata: {
      documentType: 'risk-analysis',
      phase: 'design',
      category: 'risk-management',
      pageCount: 15,
      standards: ['ISO 14971'],
      riskIds: ['RISK-HAZ-001', 'RISK-HAZ-002', 'RISK-HAZ-003']
    }
  };
  
  const riskChunks = chunker.chunkDocuments([riskDoc]);
  console.log(`✓ Created ${riskChunks.length} chunks`);
  console.log(`  Strategy: ${riskChunks[0]?.metadata?.chunkStrategy}`);
  console.log(`  Risk IDs tracked: ${riskChunks[0]?.metadata?.riskIds?.join(', ')}\n`);
  
  // Test 2: Requirements Document
  console.log('TEST 2: Requirements Document');
  console.log('═'.repeat(70));
  const reqDoc: ParsedDocument = {
    id: 'req-001',
    filePath: '/dhf/design/requirements.docx',
    fileName: 'requirements.docx',
    content: `DESIGN INPUT REQUIREMENTS

REQ-001: The device shall operate continuously for minimum 8 hours on battery power.
Rationale: Clinical use case requires full day operation.
Standard: IEC 60601-1

REQ-002: The device shall deliver medication with ±5% accuracy at all flow rates.
Rationale: Patient safety requires precise dosing.
Standard: ISO 13485

REQ-003: The device shall alert user when battery reaches 20% capacity.
Rationale: Prevents unexpected shutdown during therapy.
Standard: IEC 60601-1`,
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    metadata: {
      documentType: 'design-input',
      phase: 'planning',
      category: 'requirements',
      wordCount: 250,
      hasTables: true,
      requirementIds: ['REQ-001', 'REQ-002', 'REQ-003'],
      standards: ['IEC 60601-1', 'ISO 13485']
    }
  };
  
  const reqChunks = chunker.chunkDocuments([reqDoc]);
  console.log(`✓ Created ${reqChunks.length} chunks`);
  console.log(`  Strategy: ${reqChunks[0]?.metadata?.chunkStrategy}`);
  console.log(`  Requirements tracked: ${reqChunks[0]?.metadata?.requirementIds?.join(', ')}\n`);
  
  // Test 3: OCR Extracted Document (Low Confidence)
  console.log('TEST 3: OCR Document (Low Confidence)');
  console.log('═'.repeat(70));
  const ocrDoc: ParsedDocument = {
    id: 'ocr-001',
    filePath: '/dhf/scanned/old_protocol.jpg',
    fileName: 'old_protocol.jpg',
    content: `Test Prot0col - Electrical Safety
    
Objective: Verify c0mpliance with IEC 60601-1
    
TC-001: Protective Earth Resistance
Result: 0.15 Ohm (PASS)
Requirement: < 0.2 0hm
    
TC-002: Earth Leakage Current
Result: 45 µA (PA5S)
Requirement: < 500 µA
    
Note: S0me OCR err0rs may be present in this document.`,
    mimeType: 'image/jpeg',
    metadata: {
      documentType: 'test-protocol',
      phase: 'verification',
      category: 'testing',
      width: 2550,
      height: 3300,
      isOCRExtracted: true,
      ocrQuality: {
        averageConfidence: 0.65,  // Low confidence
        lowConfidenceWords: 12,
        totalWords: 45
      },
      testCaseIds: ['TC-001', 'TC-002'],
      standards: ['IEC 60601-1']
    }
  };
  
  const ocrChunks = chunker.chunkDocuments([ocrDoc]);
  console.log(`✓ Created ${ocrChunks.length} chunks`);
  console.log(`  Strategy: ${ocrChunks[0]?.metadata?.chunkStrategy}`);
  console.log(`  OCR Confidence: ${((ocrChunks[0]?.metadata?.ocrConfidence || 0) * 100).toFixed(0)}%`);
  console.log(`  Token size: ${ocrChunks[0]?.metadata?.tokenCount} tokens (larger chunks for OCR)\n`);
  
  // Test 4: Large PDF with Sections
  console.log('TEST 4: Large Structured PDF');
  console.log('═'.repeat(70));
  const largeDoc: ParsedDocument = {
    id: 'spec-001',
    filePath: '/dhf/design/design_specification.pdf',
    fileName: 'design_specification.pdf',
    content: `DESIGN SPECIFICATION
    
## 1. INTRODUCTION
This document specifies the design requirements for the XYZ-1000 infusion pump.

## 2. SYSTEM OVERVIEW
The device consists of multiple subsystems working in coordination.

## 3. ELECTRICAL DESIGN
Power supply specifications and circuit designs.

## 4. SOFTWARE ARCHITECTURE
Firmware design and implementation details.

## 5. MECHANICAL DESIGN
Housing, assembly, and component specifications.`.repeat(5),  // Simulate larger doc
    mimeType: 'application/pdf',
    metadata: {
      documentType: 'design-output',
      phase: 'design',
      category: 'specifications',
      pageCount: 85,
      sections: [
        { title: '1. INTRODUCTION', level: 1, startIndex: 0, endIndex: 100 },
        { title: '2. SYSTEM OVERVIEW', level: 1, startIndex: 101, endIndex: 250 },
        { title: '3. ELECTRICAL DESIGN', level: 1, startIndex: 251, endIndex: 400 },
        { title: '4. SOFTWARE ARCHITECTURE', level: 1, startIndex: 401, endIndex: 550 },
        { title: '5. MECHANICAL DESIGN', level: 1, startIndex: 551, endIndex: 700 }
      ]
    }
  };
  
  const largeChunks = chunker.chunkDocuments([largeDoc]);
  console.log(`✓ Created ${largeChunks.length} chunks`);
  console.log(`  Strategy: ${largeChunks[0]?.metadata?.chunkStrategy}`);
  console.log(`  Document has ${largeDoc.metadata?.sections?.length} sections`);
  console.log(`  First chunk in section: "${largeChunks[0]?.metadata?.section}"\n`);
  
  // Test 5: Batch Processing Multiple Documents
  console.log('TEST 5: Batch Processing Multiple Document Types');
  console.log('═'.repeat(70));
  const allDocs = [riskDoc, reqDoc, ocrDoc, largeDoc];
  const allChunks = chunker.chunkDocuments(allDocs);
  
  console.log(`✓ Processed ${allDocs.length} documents`);
  console.log(`  Total chunks created: ${allChunks.length}`);
  
  // Show strategy distribution
  const strategyCount: {[key: string]: number} = {};
  allChunks.forEach(chunk => {
    const strategy = chunk.metadata?.chunkStrategy;
    if (strategy) {
      strategyCount[strategy] = (strategyCount[strategy] || 0) + 1;
    }
  });
  
  console.log('\n  Strategy Distribution:');
  Object.entries(strategyCount).forEach(([strategy, count]) => {
    console.log(`    - ${strategy}: ${count} chunks`);
  });
  
  // Test 6: Show Example Chunk with Full Metadata
  console.log('\n\nEXAMPLE: Complete Chunk with Metadata');
  console.log('═'.repeat(70));
  const exampleChunk = riskChunks[0];
  console.log('Chunk Text (first 200 chars):');
  console.log(exampleChunk.chunk.substring(0, 200));
  console.log('\nChunk Metadata:');
  console.log(JSON.stringify(exampleChunk.metadata, null, 2));
  
  console.log('\n' + '═'.repeat(70));
  console.log('✅ ALL TESTS COMPLETE');
  console.log('═'.repeat(70));
}

async function testMockChunker() {
  console.log('\n\nTEST: Mock Chunker (Simple Fixed-Size)');
  console.log('═'.repeat(70));
  
  const chunker = new MockChunker();
  
  const sampleDoc: ParsedDocument = {
    id: 'test-001',
    filePath: '/test/doc1.pdf',
    fileName: 'doc1.pdf',
    content: 'This is a test document with enough content to demonstrate chunking functionality. It contains multiple sentences and paragraphs that will be split into smaller chunks for processing by the RAG system. Each chunk will maintain metadata about its source document.',
    mimeType: 'application/pdf',
    metadata: { phase: 'testing' }
  };
  
  const chunks = chunker.chunkDocuments([sampleDoc]);
  
  console.log(`✓ Created ${chunks.length} chunks with fixed 200-char size\n`);
  
  chunks.forEach((chunk, index) => {
    console.log(`Chunk ${index + 1}:`);
    console.log(`  Content: "${chunk.chunk.substring(0, 50)}..."`);
    console.log(`  Length: ${chunk.chunk.length} chars\n`);
  });
}

async function main() {
  try {
    await testIntelligentChunker();
    await testMockChunker();
    
    console.log('\n✓ Chunker module comprehensive test complete\n');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main().catch(console.error);
