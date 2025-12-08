import { ParsedDocument, ChunkedDocumentPart } from '@fda-compliance/shared-types';
import { encode } from 'gpt-tokenizer';

/**
 * Chunker Interface
 * Responsible for breaking documents into smaller, processable chunks
 */
export interface Chunker {
  /**
   * Chunk documents into smaller parts for RAG processing
   * @param docs - Array of parsed documents
   * @returns Array of document chunks with metadata
   */
  chunkDocuments(docs: ParsedDocument[]): ChunkedDocumentPart[];
}

/**
 * Chunking Strategy Configuration
 */
export interface ChunkingStrategy {
  name: string;
  maxTokens: number;
  overlapTokens: number;
  splitters: string[];
  preserveStructure: boolean;
  reason?: string;
}

/**
 * Chunk with enhanced metadata
 */
export interface EnhancedChunk extends ChunkedDocumentPart {
  metadata: {
    // Original metadata from document
    fileName: string;
    totalParts: number;
    chunkIndex: number;
    
    // Enhanced metadata
    sourceId: string;
    sourceType: string;
    documentType?: string;
    phase?: string;
    category?: string;
    
    // Position tracking
    pageNumber?: number;
    section?: string;
    
    // Structured data
    requirementIds?: string[];
    riskIds?: string[];
    testCaseIds?: string[];
    standards?: string[];
    
    // Quality indicators
    isOCRExtracted?: boolean;
    qualityScore?: number;
    ocrConfidence?: number;
    
    // Chunking metadata
    chunkStrategy: string;
    tokenCount: number;
    charCount: number;
    
    // Source reference
    sourcePath: string;
    
    [key: string]: any;
  };
}

/**
 * Intelligent DHF-Aware Chunker
 * Adapts chunking strategy based on document type and metadata
 */
export class IntelligentChunker implements Chunker {
  
  private strategies = new Map<string, ChunkingStrategy>([
    ['ocr-low-confidence', {
      name: 'OCR Low Confidence',
      maxTokens: 2000,
      overlapTokens: 400,
      splitters: ['\n\n\n', '\n\n', '\n'],
      preserveStructure: true
    }],
    ['ocr-standard', {
      name: 'OCR Standard',
      maxTokens: 1500,
      overlapTokens: 300,
      splitters: ['\n\n', '\n'],
      preserveStructure: true
    }],
    ['risk-analysis', {
      name: 'Risk Analysis (FMEA)',
      maxTokens: 1000,
      overlapTokens: 100,
      splitters: [/\n(?=RISK-|HAZ-|Hazard)/i, '\n\n', '\n'],
      preserveStructure: true
    }],
    ['requirements', {
      name: 'Requirements Document',
      maxTokens: 1200,
      overlapTokens: 150,
      splitters: [/\n(?=REQ-|R-|\d+\.\d+\s+[A-Z])/i, '\n\n', '\n'],
      preserveStructure: true
    }],
    ['test-document', {
      name: 'Test Protocol/Report',
      maxTokens: 1000,
      overlapTokens: 100,
      splitters: [/\n(?=TC-|TEST-|Test Case)/i, '\n\n', '\n'],
      preserveStructure: true
    }],
    ['section-based', {
      name: 'Section-Based',
      maxTokens: 2000,
      overlapTokens: 200,
      splitters: ['\n## ', '\n### ', '\n\n', '\n'],
      preserveStructure: true
    }],
    ['search-optimized', {
      name: 'Search Optimized',
      maxTokens: 600,
      overlapTokens: 100,
      splitters: ['\n\n', '\n', '. ', ' '],
      preserveStructure: false
    }],
    ['semantic-default', {
      name: 'Semantic Default',
      maxTokens: 1000,
      overlapTokens: 100,
      splitters: ['\n\n', '\n', '. ', ' '],
      preserveStructure: true
    }]
  ]);
  
  chunkDocuments(docs: ParsedDocument[]): ChunkedDocumentPart[] {
    console.log(`[IntelligentChunker] Chunking ${docs.length} documents`);
    
    const allChunks: ChunkedDocumentPart[] = [];
    
    for (const doc of docs) {
      console.log(`  Processing: ${doc.fileName}`);
      const chunks = this.chunkDocument(doc);
      console.log(`    Created ${chunks.length} chunks using ${chunks[0]?.metadata.chunkStrategy || 'unknown'} strategy`);
      allChunks.push(...chunks);
    }
    
    console.log(`[IntelligentChunker] Total chunks created: ${allChunks.length}`);
    return allChunks;
  }
  
  /**
   * Chunk a single document with intelligent strategy selection
   */
  private chunkDocument(doc: ParsedDocument): EnhancedChunk[] {
    // Select best strategy based on document metadata
    const strategy = this.selectStrategy(doc);
    
    // Apply the strategy
    const rawChunks = this.applyStrategy(doc.content, strategy);
    
    // Enrich chunks with metadata
    return this.enrichChunks(rawChunks, doc, strategy);
  }
  
  /**
   * Select optimal chunking strategy based on document metadata
   */
  private selectStrategy(doc: ParsedDocument): ChunkingStrategy {
    const metadata = doc.metadata;
    
    // Strategy 1: Handle OCR documents with quality-based approach
    if (metadata.isOCRExtracted) {
      const ocrConfidence = metadata.ocrQuality?.averageConfidence || 
                           metadata.ocrConfidence || 
                           0.5;
      
      if (ocrConfidence < 0.7) {
        return {
          ...this.strategies.get('ocr-low-confidence')!,
          reason: `Low OCR confidence (${(ocrConfidence * 100).toFixed(0)}%)`
        };
      }
      
      return {
        ...this.strategies.get('ocr-standard')!,
        reason: `OCR extracted (confidence: ${(ocrConfidence * 100).toFixed(0)}%)`
      };
    }
    
    // Strategy 2: Document type specific strategies
    const docType = metadata.documentType;
    
    if (docType === 'risk-analysis') {
      return {
        ...this.strategies.get('risk-analysis')!,
        reason: 'Risk analysis / FMEA document'
      };
    }
    
    if (docType === 'design-input' || docType === 'design-output') {
      return {
        ...this.strategies.get('requirements')!,
        reason: 'Requirements document'
      };
    }
    
    if (docType === 'test-protocol' || docType === 'test-report' || docType === 'verification') {
      return {
        ...this.strategies.get('test-document')!,
        reason: 'Test document'
      };
    }
    
    // Strategy 3: Documents with clear section structure
    if (metadata.sections && Array.isArray(metadata.sections) && metadata.sections.length > 3) {
      return {
        ...this.strategies.get('section-based')!,
        reason: `Document has ${metadata.sections.length} sections`
      };
    }
    
    // Strategy 4: Large PDFs optimized for search
    if (doc.mimeType === 'application/pdf' && (metadata.pageCount || 0) > 50) {
      return {
        ...this.strategies.get('search-optimized')!,
        reason: `Large PDF (${metadata.pageCount} pages)`
      };
    }
    
    // Strategy 5: Documents with low conversion quality
    if (metadata.conversionQuality?.score && metadata.conversionQuality.score < 0.7) {
      return {
        ...this.strategies.get('ocr-standard')!,
        reason: `Low conversion quality (${(metadata.conversionQuality.score * 100).toFixed(0)}%)`
      };
    }
    
    // Default: Semantic chunking
    return {
      ...this.strategies.get('semantic-default')!,
      reason: 'Default semantic strategy'
    };
  }
  
  /**
   * Apply chunking strategy to content
   */
  private applyStrategy(content: string, strategy: ChunkingStrategy): string[] {
    // Use recursive character splitting with token-based sizing
    return this.recursiveTokenSplit(
      content,
      strategy.maxTokens,
      strategy.overlapTokens,
      strategy.splitters
    );
  }
  
  /**
   * Recursive token-based text splitting
   */
  private recursiveTokenSplit(
    text: string,
    maxTokens: number,
    overlapTokens: number,
    splitters: (string | RegExp)[]
  ): string[] {
    const chunks: string[] = [];
    
    // Try each splitter in order
    for (const splitter of splitters) {
      if (this.countTokens(text) <= maxTokens) {
        // Text is small enough, return as single chunk
        return [text];
      }
      
      // Split text
      const parts = typeof splitter === 'string' 
        ? text.split(splitter)
        : text.split(splitter);
      
      if (parts.length === 1) {
        // Splitter didn't split anything, try next
        continue;
      }
      
      // Merge parts into chunks respecting token limit
      let currentChunk = '';
      const separator = typeof splitter === 'string' ? splitter : '\n';
      
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const testChunk = currentChunk 
          ? currentChunk + separator + part
          : part;
        
        if (this.countTokens(testChunk) <= maxTokens) {
          currentChunk = testChunk;
        } else {
          // Current chunk would be too large
          if (currentChunk) {
            chunks.push(currentChunk);
          }
          
          // Start new chunk with current part
          if (this.countTokens(part) > maxTokens) {
            // Part itself is too large, needs further splitting
            const subChunks = this.recursiveTokenSplit(
              part,
              maxTokens,
              overlapTokens,
              splitters.slice(splitters.indexOf(splitter) + 1)
            );
            chunks.push(...subChunks);
            currentChunk = '';
          } else {
            currentChunk = part;
          }
        }
      }
      
      // Add final chunk
      if (currentChunk) {
        chunks.push(currentChunk);
      }
      
      // Add overlap between chunks
      if (overlapTokens > 0 && chunks.length > 1) {
        return this.addOverlap(chunks, overlapTokens);
      }
      
      return chunks;
    }
    
    // If no splitter worked, force split by tokens
    return this.forceSplitByTokens(text, maxTokens, overlapTokens);
  }
  
  /**
   * Add overlap between chunks
   */
  private addOverlap(chunks: string[], overlapTokens: number): string[] {
    const overlappedChunks: string[] = [];
    
    for (let i = 0; i < chunks.length; i++) {
      let chunk = chunks[i];
      
      // Add suffix from next chunk if exists
      if (i < chunks.length - 1) {
        const nextChunk = chunks[i + 1];
        const overlapText = this.getTokenPrefix(nextChunk, overlapTokens / 2);
        chunk = chunk + '\n' + overlapText;
      }
      
      overlappedChunks.push(chunk);
    }
    
    return overlappedChunks;
  }
  
  /**
   * Force split by token count when no separator works
   */
  private forceSplitByTokens(text: string, maxTokens: number, overlapTokens: number): string[] {
    const tokens = encode(text);
    const chunks: string[] = [];
    
    for (let i = 0; i < tokens.length; i += maxTokens - overlapTokens) {
      const chunkTokens = tokens.slice(i, i + maxTokens);
      // Note: In production, use proper decode function
      // For now, estimate by characters
      const chunkText = text.substring(
        Math.floor(i * 4),  // Rough estimate: 1 token ≈ 4 chars
        Math.floor((i + maxTokens) * 4)
      );
      chunks.push(chunkText);
    }
    
    return chunks;
  }
  
  /**
   * Get first N tokens of text
   */
  private getTokenPrefix(text: string, tokens: number): string {
    const encoded = encode(text);
    if (encoded.length <= tokens) return text;
    
    // Estimate characters
    const chars = Math.floor(tokens * 4);
    return text.substring(0, chars);
  }
  
  /**
   * Count tokens in text
   */
  private countTokens(text: string): number {
    try {
      return encode(text).length;
    } catch (error) {
      // Fallback: estimate 1 token per 4 characters
      return Math.ceil(text.length / 4);
    }
  }
  
  /**
   * Enrich chunks with metadata from document
   */
  private enrichChunks(
    rawChunks: string[],
    doc: ParsedDocument,
    strategy: ChunkingStrategy
  ): EnhancedChunk[] {
    return rawChunks.map((chunkText, index) => {
      // Find position in document
      const startIndex = doc.content.indexOf(chunkText);
      
      // Determine page number if available
      let pageNumber: number | undefined;
      if (doc.metadata.pageBreaks && Array.isArray(doc.metadata.pageBreaks)) {
        pageNumber = this.findPageNumber(startIndex, doc.metadata.pageBreaks);
      }
      
      // Determine section if available
      let section: string | undefined;
      if (doc.metadata.sections && Array.isArray(doc.metadata.sections)) {
        section = this.findSection(startIndex, doc.metadata.sections);
      }
      
      // Extract IDs present in this chunk
      const requirementIds = this.extractIdsInChunk(
        chunkText,
        doc.metadata.requirementIds || []
      );
      const riskIds = this.extractIdsInChunk(
        chunkText,
        doc.metadata.riskIds || []
      );
      const testCaseIds = this.extractIdsInChunk(
        chunkText,
        doc.metadata.testCaseIds || []
      );
      
      return {
        docId: doc.id,
        partId: index + 1,
        chunk: chunkText,
        metadata: {
          // Basic info
          fileName: doc.fileName,
          totalParts: rawChunks.length,
          chunkIndex: index,
          
          // Source info
          sourceId: doc.id,
          sourceType: doc.mimeType,
          sourcePath: doc.filePath,
          
          // Document classification
          documentType: doc.metadata.documentType,
          phase: doc.metadata.phase,
          category: doc.metadata.category,
          
          // Position tracking
          pageNumber,
          section,
          
          // Structured data
          requirementIds,
          riskIds,
          testCaseIds,
          standards: doc.metadata.standards,
          
          // Quality indicators
          isOCRExtracted: doc.metadata.isOCRExtracted,
          qualityScore: doc.metadata.conversionQuality?.score,
          ocrConfidence: doc.metadata.ocrQuality?.averageConfidence || doc.metadata.ocrConfidence,
          
          // Chunking metadata
          chunkStrategy: strategy.name,
          tokenCount: this.countTokens(chunkText),
          charCount: chunkText.length,
          
          // Copy other relevant metadata
          ...this.selectRelevantMetadata(doc.metadata)
        }
      };
    });
  }
  
  /**
   * Find page number for character index
   */
  private findPageNumber(charIndex: number, pageBreaks: any[]): number {
    for (let i = pageBreaks.length - 1; i >= 0; i--) {
      if (charIndex >= pageBreaks[i].charIndex) {
        return pageBreaks[i].page;
      }
    }
    return 1;
  }
  
  /**
   * Find section for character index
   */
  private findSection(charIndex: number, sections: any[]): string {
    for (let i = sections.length - 1; i >= 0; i--) {
      if (charIndex >= sections[i].startIndex) {
        return sections[i].title;
      }
    }
    return 'Introduction';
  }
  
  /**
   * Extract which IDs from document appear in this chunk
   */
  private extractIdsInChunk(chunkText: string, documentIds: string[]): string[] | undefined {
    if (!documentIds || documentIds.length === 0) return undefined;
    
    const foundIds = documentIds.filter(id => chunkText.includes(id));
    return foundIds.length > 0 ? foundIds : undefined;
  }
  
  /**
   * Select relevant metadata to include in chunk
   */
  private selectRelevantMetadata(docMetadata: any): any {
    const relevant: any = {};
    
    // Fields to potentially include
    const fieldsToCheck = [
      'pageCount',
      'wordCount',
      'hasImages',
      'hasTables',
      'author',
      'createdDate',
      'modifiedDate'
    ];
    
    fieldsToCheck.forEach(field => {
      if (docMetadata[field] !== undefined && docMetadata[field] !== null) {
        relevant[field] = docMetadata[field];
      }
    });
    
    return relevant;
  }
}

/**
 * Mock Implementation of Chunker
 * Creates fixed-size chunks for testing
 */
export class MockChunker implements Chunker {
  private readonly chunkSize = 200; // characters per chunk
  
  chunkDocuments(docs: ParsedDocument[]): ChunkedDocumentPart[] {
    console.log(`[MockChunker] Chunking ${docs.length} documents`);
    
    const chunks: ChunkedDocumentPart[] = [];
    
    docs.forEach(doc => {
      const content = doc.content;
      const numChunks = Math.ceil(content.length / this.chunkSize);
      
      for (let i = 0; i < numChunks; i++) {
        const start = i * this.chunkSize;
        const end = Math.min(start + this.chunkSize, content.length);
        const chunk = content.substring(start, end);
        
        chunks.push({
          docId: doc.id,
          partId: i + 1,
          chunk: chunk,
          metadata: {
            ...doc.metadata,
            fileName: doc.fileName,
            totalParts: numChunks,
            chunkIndex: i
          }
        });
      }
    });
    
    console.log(`[MockChunker] Created ${chunks.length} chunks`);
    return chunks;
  }
}
