import type { ChunkedDocumentPart } from './ChunkedDocumentPart';
import type { KnowledgeContext } from './KnowledgeContext';

/**
 * Represents the response from an LLM API call
 */
export interface LLMResponse {
  generatedText: string;
  usageStats: {
    tokensUsed: number;
    cost: number;
  };
}

/**
 * Interface contract for the LLM Service module
 */
export interface LLMService {
  generateText(prompt: string, context?: KnowledgeContext): Promise<LLMResponse>;
  assessDocument(doc: ChunkedDocumentPart[], guidelines: string): Promise<LLMResponse>;
}
