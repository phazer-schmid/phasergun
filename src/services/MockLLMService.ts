import type { LLMResponse, ChunkedDocumentPart, KnowledgeContext } from '@fda-compliance/shared-types';
import type { LLMService } from '../llm-service/src';

/**
 * Mock implementation of LLMService
 * Simulates calling an LLM API for text generation
 */
export class MockLLMService implements LLMService {
  async generateText(prompt: string, context?: KnowledgeContext): Promise<LLMResponse> {
    console.log('[MockLLMService] Generating text with prompt length:', prompt.length);
    if (context) {
      console.log('[MockLLMService] Using context from:', context.sourceMetadata.length, 'sources');
    }

    await this.delay(600);

    return {
      generatedText: 'The application has successfully traversed all modules: File Parsing → Chunking → RAG Retrieval → LLM Processing. All systems operational.',
      usageStats: {
        tokensUsed: 150,
        cost: 0.0023
      }
    };
  }

  async assessDocument(doc: ChunkedDocumentPart[], guidelines: string): Promise<LLMResponse> {
    console.log(`[MockLLMService] Assessing ${doc.length} document chunks against guidelines`);
    await this.delay(800);

    return {
      generatedText: `Document assessment complete. Analyzed ${doc.length} chunks. Mock compliance status: PASS`,
      usageStats: {
        tokensUsed: 250,
        cost: 0.0038
      }
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
