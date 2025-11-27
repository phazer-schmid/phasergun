import { ParsedDocument, ChunkedDocumentPart } from '@fda-compliance/shared-types';

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
