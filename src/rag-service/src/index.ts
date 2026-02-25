// Export EnhancedRAGService for semantic retrieval
export { EnhancedRAGService, enhancedRAGService } from './enhanced-rag-service';
export { FootnoteTracker, SourceReference } from './footnote-tracker';

// Document loader
export { DocumentLoader, CategorizedContextFile, CategorizedProcedureFile } from './document-loader';

// Prompt building (single source of truth for all LLM-injected instructions)
export {
  buildLLMPrompt,
  buildSystemSection,
  RULE_WRITE_AS_AUTHOR,
  RULE_RESOLVE_BRACKET_NOTATION,
  RULE_USE_PROCEDURAL_LANGUAGE,
  RULE_NO_INLINE_FOOTNOTES,
  RULE_TONE,
  RULE_MARKDOWN_FORMAT,
  RULE_WRITE_ONLY_REQUESTED,
} from './prompt-builder';

// Reference parsing
export {
  parseExplicitContextReferences,
  parseMasterChecklistReference,
  parseProcedureReferences,
  parseKnowledgeSourceScopes,
  parseBootstrapReferences,
  parseDocFieldReferences,
  filterContextResults,
  filterProcedureResults,
} from './reference-parser';

// Context assembly
export { assembleContext, extractExternalStandards } from './context-assembler';

// Re-export rag-core primitives for consumers that depend on @phasergun/rag-service
export { VectorStore, VectorEntry, SearchResult, EmbeddingService, LockManager, getLockManager } from '@phasergun/rag-core';
