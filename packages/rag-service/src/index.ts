import { KnowledgeContext } from '@fda-compliance/shared-types';

/**
 * RAG Service Interface
 * Responsible for knowledge base management and context retrieval
 */
export interface RAGService {
  /**
   * Initialize the knowledge base with thinking documents and regulatory guidelines
   */
  initializeKnowledgeBase(): Promise<void>;
  
  /**
   * Retrieve relevant context for a given query
   * @param query - The search query or user question
   * @returns Knowledge context with relevant snippets and sources
   */
  retrieveContext(query: string): Promise<KnowledgeContext>;
}

/**
 * Mock Implementation of RAG Service
 * Returns static thinking document and regulatory context
 */
export class MockRAGService implements RAGService {
  private initialized = false;
  
  async initializeKnowledgeBase(): Promise<void> {
    console.log('[MockRAGService] Initializing knowledge base...');
    
    // Simulate loading thinking documents and regulatory guidelines
    await new Promise(resolve => setTimeout(resolve, 300));
    
    console.log('[MockRAGService] Loaded:');
    console.log('  - Primary Thinking Document (PDP execution strategy)');
    console.log('  - FDA 510(k) Guidelines');
    console.log('  - ISO 13485 Standards');
    console.log('  - ISO 14971 Risk Management');
    
    this.initialized = true;
  }
  
  async retrieveContext(query: string): Promise<KnowledgeContext> {
    console.log(`[MockRAGService] Retrieving context for query: "${query.substring(0, 50)}..."`);
    
    // Simulate vector search delay
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Return mock context based on thinking document
    const context: KnowledgeContext = {
      contextSnippets: [
        'PRIMARY CONTEXT: This system guides users through the 4-phase Product Development Process (PDP): Planning, Design, Development, and Testing.',
        'EXECUTION STRATEGY: Analyze DHF documents against FDA 510(k) requirements, identify gaps, and provide actionable recommendations.',
        'REGULATORY GUIDANCE: Per FDA 510(k) guidance, substantial equivalence must be demonstrated through performance data and design comparisons.',
        'RISK ASSESSMENT: ISO 14971 requires systematic risk analysis throughout the device lifecycle with documented risk controls.'
      ],
      sourceMetadata: [
        {
          sourceName: 'Primary Thinking Document',
          path: '/knowledge-base/thinking-docs/primary-context.md'
        },
        {
          sourceName: 'FDA 510(k) Guidance',
          path: '/knowledge-base/regulatory/510k-guidance.pdf'
        },
        {
          sourceName: 'ISO 14971 Risk Management',
          path: '/knowledge-base/standards/iso-14971.pdf'
        }
      ]
    };
    
    console.log(`[MockRAGService] Retrieved ${context.contextSnippets.length} context snippets from ${context.sourceMetadata.length} sources`);
    
    return context;
  }
}
