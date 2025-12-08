import type { ChunkedDocumentPart, ParsedDocument } from '@fda-compliance/shared-types';
import type { Chunker } from '../chunker/src';

/**
 * Mock implementation of Chunker
 * Simulates breaking documents into smaller, processable chunks
 */
export class MockChunker implements Chunker {
  chunkDocuments(docs: ParsedDocument[]): ChunkedDocumentPart[] {
    console.log(`[MockChunker] Chunking ${docs.length} documents`);

    const chunks: ChunkedDocumentPart[] = [];

    docs.forEach(doc => {
      // Simulate creating 3 chunks per document
      for (let i = 0; i < 3; i++) {
        chunks.push({
          docId: doc.id,
          partId: i + 1,
          chunk: `${doc.content} - Part ${i + 1}`,
          metadata: {
            originalFileName: doc.fileName,
            chunkSize: 500,
            overlap: 50
          }
        });
      }
    });

    return chunks;
  }
}
