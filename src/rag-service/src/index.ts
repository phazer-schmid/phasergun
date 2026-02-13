// Export EnhancedRAGService for semantic retrieval
export { EnhancedRAGService, enhancedRAGService } from './enhanced-rag-service';
export { VectorStore, VectorEntry, SearchResult } from './vector-store';
export { FootnoteTracker, SourceReference } from './footnote-tracker';
export { EmbeddingService } from './embedding-service';
export { LockManager, getLockManager } from './lock-manager';
export { ComplianceValidator } from './compliance-validator';
export { assembleContext, estimateTokens, enforceTokenLimit } from './context-assembler';
