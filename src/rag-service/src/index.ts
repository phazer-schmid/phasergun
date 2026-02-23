// Export EnhancedRAGService for semantic retrieval
export { EnhancedRAGService, enhancedRAGService } from './enhanced-rag-service';
export { FootnoteTracker, SourceReference } from './footnote-tracker';

// Re-export rag-core primitives for consumers that depend on @phasergun/rag-service
export { VectorStore, VectorEntry, SearchResult, EmbeddingService, LockManager, getLockManager } from '@phasergun/rag-core';
