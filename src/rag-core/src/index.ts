// Cache & concurrency primitives
export { CacheManager, KnowledgeCache } from './cache-manager';
export { LockManager, getLockManager, resetLockManager, Lock, LockOptions } from './lock-manager';

// Embedding
export { EmbeddingService, getEmbeddingService } from './embedding-service';

// Vector storage & retrieval
export { VectorStore, VectorEntry, SearchResult, createVectorStore } from './vector-store';

// Chunking
export { chunkSectionAware, chunkWithOverlap } from './chunking-strategy';
export { DocumentChunker, DocumentChunk, ChunkingOptions } from './document-chunker';

// Vector building
export { chunkAndEmbedDocument, buildVectorStore, ProcedureDoc } from './vector-builder';
