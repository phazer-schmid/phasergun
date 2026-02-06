import type { KnowledgeContext } from './KnowledgeContext';

/**
 * Response from an LLM API call
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
}
