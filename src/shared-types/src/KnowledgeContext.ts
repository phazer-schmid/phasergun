/**
 * Context assembled from knowledge_sources for LLM prompt augmentation.
 * Maps to primary-context.yaml → knowledge_sources
 */
export interface KnowledgeContext {
  /** Assembled RAG context string ready for LLM prompt */
  ragContext: string;
  /** Metadata about what was retrieved */
  metadata: RetrievalMetadata;
}

export interface RetrievalMetadata {
  procedureChunksRetrieved: number;
  contextChunksRetrieved: number;
  totalTokensEstimate: number;
  sources: string[];
  primaryContextIncluded: boolean;
}
