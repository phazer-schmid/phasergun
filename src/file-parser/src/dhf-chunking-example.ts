import { DHFAwareParser } from './dhf-parser';
import { ParsedDocument } from '@fda-compliance/shared-types';

/**
 * Example: Using Enhanced DHF Parser with Intelligent Chunking
 */

// ============================================================================
// STEP 1: Parse DHF Documents with Enhanced Metadata
// ============================================================================

async function parseDHFDocuments() {
  const parser = new DHFAwareParser();
  const documents = await parser.scanAndParseFolder('/path/to/dhf');
  
  console.log('Parsed Documents with Enhanced Metadata:\n');
  
  documents.forEach(doc => {
    console.log(`📄 ${doc.fileName}`);
    console.log(`   Type: ${doc.mimeType}`);
    console.log(`   DHF Type: ${doc.metadata.documentType}`);
    console.log(`   Phase: ${doc.metadata.phase}`);
    console.log(`   Category: ${doc.metadata.category}`);
    console.log(`   Standards: ${doc.metadata.standards?.join(', ') || 'None'}`);
    console.log(`   Requirements: ${doc.metadata.requirementIds?.length || 0} found`);
    console.log(`   Risks: ${doc.metadata.riskIds?.length || 0} found`);
    console.log(`   Sections: ${doc.metadata.sections?.length || 0}`);
    console.log(`   Quality Score: ${doc.metadata.conversionQuality?.score}`);
    
    if (doc.metadata.isOCRExtracted) {
      console.log(`   OCR Confidence: ${doc.metadata.ocrQuality?.averageConfidence}`);
    }
    console.log('');
  });
  
  return documents;
}

// ============================================================================
// STEP 2: Intelligent Chunking Based on Document Metadata
// ============================================================================

interface Chunk {
  text: string;
  metadata: {
    sourceDocument: string;
    sourceType: string;
    documentType?: string;
    chunkIndex: number;
    totalChunks: number;
    pageNumber?: number;
    section?: string;
    requirementIds?: string[];
    riskIds?: string[];
    isOCRExtracted?: boolean;
    qualityScore?: number;
    [key: string]: any;
  };
}

class IntelligentDHFChunker {
  
  chunk(doc: ParsedDocument): Chunk[] {
    console.log(`\n🔪 Chunking ${doc.fileName}...`);
    console.log(`   Document Type: ${doc.metadata.documentType}`);
    
    // Select chunking strategy based on document metadata
    const strategy = this.selectStrategy(doc);
    console.log(`   Selected Strategy: ${strategy.name}`);
    console.log(`   Chunk Size: ${strategy.maxTokens} tokens`);
    console.log(`   Overlap: ${strategy.overlap} tokens`);
    
    // Apply the strategy
    const rawChunks = this.applyStrategy(doc.content, strategy);
    
    // Enrich chunks with metadata from document
    const enrichedChunks = this.enrichChunks(rawChunks, doc);
    
    console.log(`   Created: ${enrichedChunks.length} chunks`);
    
    return enrichedChunks;
  }
  
  private selectStrategy(doc: ParsedDocument) {
    // 🎯 THIS IS WHERE METADATA MATTERS!
    
    // Strategy 1: OCR documents need larger chunks with more overlap
    if (doc.metadata.isOCRExtracted) {
      const confidence = doc.metadata.ocrQuality?.averageConfidence || 0.5;
      
      if (confidence < 0.7) {
        return {
          name: 'low-confidence-ocr',
          maxTokens: 2000,   // Larger chunks
          overlap: 400,      // High overlap to handle errors
          reason: 'Low OCR confidence detected'
        };
      }
      
      return {
        name: 'ocr-aware',
        maxTokens: 1500,
        overlap: 300,
        reason: 'OCR extracted document'
      };
    }
    
    // Strategy 2: Risk analysis - chunk by risk entries
    if (doc.metadata.documentType === 'risk-analysis') {
      return {
        name: 'risk-entry-based',
        maxTokens: 1000,
        overlap: 100,
        reason: 'FMEA/Risk analysis document'
      };
    }
    
    // Strategy 3: Requirements - chunk by requirement
    if (doc.metadata.documentType === 'design-input' || 
        doc.metadata.documentType === 'design-output') {
      return {
        name: 'requirement-based',
        maxTokens: 1200,
        overlap: 150,
        reason: 'Requirements document'
      };
    }
    
    // Strategy 4: Test protocols - chunk by test case
    if (doc.metadata.documentType === 'test-protocol' ||
        doc.metadata.documentType === 'test-report') {
      return {
        name: 'test-case-based',
        maxTokens: 1000,
        overlap: 100,
        reason: 'Test document'
      };
    }
    
    // Strategy 5: Documents with clear sections - use section boundaries
    if (doc.metadata.sections && doc.metadata.sections.length > 3) {
      return {
        name: 'section-based',
        maxTokens: 2000,
        overlap: 200,
        reason: 'Well-structured document with sections'
      };
    }
    
    // Strategy 6: Large PDFs - smaller chunks for search
    if (doc.mimeType === 'application/pdf' && 
        (doc.metadata.pageCount || 0) > 50) {
      return {
        name: 'search-optimized',
        maxTokens: 600,
        overlap: 100,
        reason: 'Large PDF document'
      };
    }
    
    // Default: Semantic chunking
    return {
      name: 'semantic',
      maxTokens: 1000,
      overlap: 100,
      reason: 'Default strategy'
    };
  }
  
  private applyStrategy(content: string, strategy: any): string[] {
    // Simplified - in production, use proper token-based chunking
    const chunks: string[] = [];
    const approxCharsPerToken = 4;
    const chunkSize = strategy.maxTokens * approxCharsPerToken;
    const overlapSize = strategy.overlap * approxCharsPerToken;
    
    for (let i = 0; i < content.length; i += chunkSize - overlapSize) {
      chunks.push(content.slice(i, i + chunkSize));
    }
    
    return chunks;
  }
  
  private enrichChunks(rawChunks: string[], doc: ParsedDocument): Chunk[] {
    return rawChunks.map((text, index) => {
      // Calculate which page this chunk is on (if PDF)
      let pageNumber: number | undefined;
      if (doc.metadata.pageBreaks) {
        const chunkStartIndex = this.getChunkStartIndex(doc.content, text);
        pageNumber = this.findPageNumber(chunkStartIndex, doc.metadata.pageBreaks);
      }
      
      // Find which section this chunk is in
      let section: string | undefined;
      if (doc.metadata.sections) {
        const chunkStartIndex = this.getChunkStartIndex(doc.content, text);
        section = this.findSection(chunkStartIndex, doc.metadata.sections);
      }
      
      // Extract requirement/risk IDs in this chunk
      const chunkReqIds = this.extractIdsFromChunk(
        text, 
        doc.metadata.requirementIds || []
      );
      const chunkRiskIds = this.extractIdsFromChunk(
        text,
        doc.metadata.riskIds || []
      );
      
      return {
        text,
        metadata: {
          // Identity
          sourceDocument: doc.fileName,
          sourceType: doc.mimeType,
          sourceId: doc.id,
          
          // Position
          chunkIndex: index,
          totalChunks: rawChunks.length,
          pageNumber,
          section,
          
          // DHF-specific metadata (from parser!)
          documentType: doc.metadata.documentType,
          phase: doc.metadata.phase,
          category: doc.metadata.category,
          standards: doc.metadata.standards,
          
          // IDs found in this chunk
          requirementIds: chunkReqIds,
          riskIds: chunkRiskIds,
          
          // Quality indicators (from parser!)
          isOCRExtracted: doc.metadata.isOCRExtracted,
          qualityScore: doc.metadata.conversionQuality?.score,
          ocrConfidence: doc.metadata.ocrQuality?.averageConfidence,
          
          // For traceability
          documentPath: doc.filePath
        }
      };
    });
  }
  
  private getChunkStartIndex(fullContent: string, chunkText: string): number {
    return fullContent.indexOf(chunkText);
  }
  
  private findPageNumber(charIndex: number, pageBreaks: any[]): number {
    for (let i = pageBreaks.length - 1; i >= 0; i--) {
      if (charIndex >= pageBreaks[i].charIndex) {
        return pageBreaks[i].page;
      }
    }
    return 1;
  }
  
  private findSection(charIndex: number, sections: any[]): string {
    for (let i = sections.length - 1; i >= 0; i--) {
      if (charIndex >= sections[i].startIndex) {
        return sections[i].title;
      }
    }
    return 'Introduction';
  }
  
  private extractIdsFromChunk(chunkText: string, documentIds: string[]): string[] {
    return documentIds.filter(id => chunkText.includes(id));
  }
}

// ============================================================================
// STEP 3: Complete Workflow Example
// ============================================================================

async function completeWorkflow() {
  console.log('='.repeat(70));
  console.log('DHF DOCUMENT PROCESSING WORKFLOW');
  console.log('='.repeat(70));
  
  // Parse documents with enhanced metadata
  console.log('\n📚 STEP 1: Parsing DHF Documents...\n');
  const parser = new DHFAwareParser();
  const documents = await parser.scanAndParseFolder('./sample-dhf');
  
  // Chunk documents intelligently
  console.log('\n🔪 STEP 2: Intelligent Chunking...\n');
  const chunker = new IntelligentDHFChunker();
  const allChunks: Chunk[] = [];
  
  for (const doc of documents) {
    const chunks = chunker.chunk(doc);
    allChunks.push(...chunks);
  }
  
  console.log('\n' + '='.repeat(70));
  console.log(`✅ COMPLETE: ${allChunks.length} total chunks created`);
  console.log('='.repeat(70));
  
  // Show example of what a chunk looks like
  if (allChunks.length > 0) {
    console.log('\n📋 Example Chunk:\n');
    const exampleChunk = allChunks[0];
    console.log('Text (first 200 chars):');
    console.log(exampleChunk.text.substring(0, 200) + '...\n');
    console.log('Metadata:');
    console.log(JSON.stringify(exampleChunk.metadata, null, 2));
  }
  
  return allChunks;
}

// ============================================================================
// STEP 4: Query Example with Rich Metadata
// ============================================================================

async function queryExample(chunks: Chunk[]) {
  console.log('\n' + '='.repeat(70));
  console.log('QUERY EXAMPLE: Using Metadata for Smart Filtering');
  console.log('='.repeat(70));
  
  // Example: Find all chunks related to risk analysis
  const riskChunks = chunks.filter(chunk => 
    chunk.metadata.documentType === 'risk-analysis'
  );
  
  console.log(`\n🔍 Risk Analysis chunks: ${riskChunks.length}`);
  
  // Example: Find high-quality, non-OCR chunks for critical analysis
  const highQualityChunks = chunks.filter(chunk =>
    !chunk.metadata.isOCRExtracted &&
    (chunk.metadata.qualityScore || 0) > 0.8
  );
  
  console.log(`✨ High-quality chunks: ${highQualityChunks.length}`);
  
  // Example: Find chunks with specific requirement IDs
  const reqChunks = chunks.filter(chunk =>
    chunk.metadata.requirementIds && 
    chunk.metadata.requirementIds.length > 0
  );
  
  console.log(`📋 Chunks with requirements: ${reqChunks.length}`);
  
  // Example: Find chunks from design phase
  const designChunks = chunks.filter(chunk =>
    chunk.metadata.phase === 'design'
  );
  
  console.log(`🎨 Design phase chunks: ${designChunks.length}`);
  
  console.log('\n' + '='.repeat(70));
  console.log('This metadata enables intelligent retrieval for RAG!');
  console.log('='.repeat(70));
}

// ============================================================================
// RUN THE EXAMPLE
// ============================================================================

async function main() {
  try {
    // Complete workflow
    const chunks = await completeWorkflow();
    
    // Query examples
    await queryExample(chunks);
    
  } catch (error) {
    console.error('Error:', error);
  }
}

// Export for use
export {
  IntelligentDHFChunker,
  completeWorkflow,
  queryExample
};

// Run if called directly
if (require.main === module) {
  main();
}
