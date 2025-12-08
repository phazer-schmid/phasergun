import type { KnowledgeContext } from '@fda-compliance/shared-types';
import type { RAGService } from '../rag-service/src';

/**
 * Mock implementation of RAGService
 * Simulates retrieving relevant context from a knowledge base
 */
export class MockRAGService implements RAGService {
  private isInitialized = false;

  async initializeKnowledgeBase(): Promise<void> {
    console.log('[MockRAGService] Initializing knowledge base...');
    await this.delay(200);
    this.isInitialized = true;
    console.log('[MockRAGService] Knowledge base initialized');
  }

  async retrieveContext(query: string): Promise<KnowledgeContext> {
    if (!this.isInitialized) {
      throw new Error('Knowledge base not initialized');
    }

    console.log(`[MockRAGService] Retrieving context for query: "${query}"`);
    await this.delay(400);

    return {
      contextSnippets: [
        'ISO 13485 requires documented procedures for design control',
        'FDA 510(k) submissions must include a Device Description',
        'Design History File must contain all design and development records'
      ],
      sourceMetadata: [
        {
          sourceName: 'ISO 13485:2016',
          path: '/knowledge/iso-13485.pdf'
        },
        {
          sourceName: 'FDA Guidance Document',
          path: '/knowledge/fda-510k-guidance.pdf'
        },
        {
          sourceName: 'PDP Guidebook',
          path: '/knowledge/pdp-guidebook.pdf'
        }
      ]
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
