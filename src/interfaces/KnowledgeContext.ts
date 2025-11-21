/**
 * Represents relevant context retrieved from the knowledge base
 * Used to augment LLM prompts with domain-specific information
 */
export interface KnowledgeContext {
  contextSnippets: string[];
  sourceMetadata: {
    sourceName: string;
    path: string;
  }[];
}

/**
 * Interface contract for the RAG Service module
 */
export interface RAGService {
  initializeKnowledgeBase(): Promise<void>;
  retrieveContext(query: string): Promise<KnowledgeContext>;
}
