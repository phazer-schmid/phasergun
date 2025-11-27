/**
 * Represents a chunk of a larger document
 * Used for processing and embedding in vector databases
 */
export interface ChunkedDocumentPart {
  docId: string;
  partId: number;
  chunk: string;
  metadata?: Record<string, any>;
}

/**
 * Interface contract for the Chunking module
 */
export interface Chunker {
  chunkDocuments(docs: import('./ParsedDocument').ParsedDocument[]): ChunkedDocumentPart[];
}
