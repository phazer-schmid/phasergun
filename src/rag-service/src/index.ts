import { KnowledgeContext, ChunkedDocumentPart } from '@fda-compliance/shared-types';

/**
 * RAG Service Interface
 * Responsible for knowledge base management and context retrieval
 */
export interface RAGService {
  /**
   * Initialize the knowledge base with regulatory guidelines and reference docs
   */
  initializeKnowledgeBase(): Promise<void>;
  
  /**
   * Index document chunks into the knowledge base
   * @param chunks - Document chunks to index
   */
  indexDocuments(chunks: ChunkedDocumentPart[]): Promise<void>;
  
  /**
   * Retrieve relevant context for a given query
   * @param query - The search query or user question
   * @param topK - Number of top results to return (default: 5)
   * @returns Knowledge context with relevant snippets and sources
   */
  retrieveContext(query: string, topK?: number): Promise<KnowledgeContext>;
  
  /**
   * Clear all indexed documents from the knowledge base
   */
  clearDocuments(): Promise<void>;
}

/**
 * In-Memory RAG Service Implementation
 * Uses simple keyword matching and can be extended with vector embeddings
 */
export class InMemoryRAGService implements RAGService {
  private initialized = false;
  private indexedChunks: ChunkedDocumentPart[] = [];
  private referenceDocuments: Array<{
    content: string;
    source: string;
    category: string;
  }> = [];
  
  async initializeKnowledgeBase(): Promise<void> {
    console.log('[RAGService] Initializing knowledge base...');
    
    // Load regulatory and reference documents
    this.referenceDocuments = [
      {
        content: 'FDA 510(k) submissions require demonstration of substantial equivalence to a predicate device. Key elements include device description, intended use, technological characteristics, performance data, and risk analysis.',
        source: 'FDA 510(k) Guidance',
        category: 'regulatory'
      },
      {
        content: 'ISO 13485 requires documented procedures for design and development. Design History File (DHF) must contain all design inputs, outputs, verification, validation, design review records, and design transfer documentation.',
        source: 'ISO 13485:2016',
        category: 'standard'
      },
      {
        content: 'ISO 14971 defines a process for risk management throughout product lifecycle. Risk analysis must identify hazards, estimate risks, evaluate risk acceptability, and implement risk control measures. Residual risk must be acceptable.',
        source: 'ISO 14971 Risk Management',
        category: 'standard'
      },
      {
        content: 'Design controls require: design planning, design input requirements, design output specifications, design review checkpoints, design verification testing, design validation with users, and design transfer to manufacturing.',
        source: 'FDA Design Control Guidance',
        category: 'regulatory'
      },
      {
        content: 'Verification confirms design outputs meet design inputs. Validation ensures device meets user needs and intended use. Both require documented protocols, acceptance criteria, and test results.',
        source: 'FDA Verification and Validation',
        category: 'regulatory'
      },
      {
        content: 'Traceability matrix links design inputs to outputs, verification, validation, and risk controls. Essential for demonstrating completeness and compliance. Must be maintained throughout product development.',
        source: 'DHF Best Practices',
        category: 'guidance'
      },
      {
        content: 'Design reviews conducted at major milestones: concept, detailed design, final design. Reviews verify requirements are met, identify issues, assess risks, and ensure design progresses appropriately.',
        source: 'Design Review Standards',
        category: 'guidance'
      },
      {
        content: 'Test protocols must define: test purpose, acceptance criteria, test methods, equipment, sample size, pass/fail criteria, and documentation requirements. Protocols approved before testing begins.',
        source: 'GMP Testing Guidelines',
        category: 'guidance'
      }
    ];
    
    console.log(`[RAGService] Loaded ${this.referenceDocuments.length} reference documents`);
    this.initialized = true;
  }
  
  async indexDocuments(chunks: ChunkedDocumentPart[]): Promise<void> {
    if (!this.initialized) {
      throw new Error('RAG Service not initialized. Call initializeKnowledgeBase() first.');
    }
    
    console.log(`[RAGService] Indexing ${chunks.length} document chunks...`);
    
    // Add chunks to indexed collection
    this.indexedChunks.push(...chunks);
    
    console.log(`[RAGService] Total indexed chunks: ${this.indexedChunks.length}`);
  }
  
  async retrieveContext(query: string, topK: number = 5): Promise<KnowledgeContext> {
    if (!this.initialized) {
      throw new Error('RAG Service not initialized. Call initializeKnowledgeBase() first.');
    }
    
    console.log(`[RAGService] Retrieving context for query: "${query.substring(0, 100)}..."`);
    
    // Simple keyword-based relevance scoring
    const queryTokens = this.tokenize(query.toLowerCase());
    
    // Score reference documents
    const scoredReferences = this.referenceDocuments.map(doc => ({
      doc,
      score: this.calculateRelevanceScore(queryTokens, doc.content)
    }));
    
    // Score indexed chunks
    const scoredChunks = this.indexedChunks.map(chunk => ({
      chunk,
      score: this.calculateRelevanceScore(queryTokens, chunk.chunk)
    }));
    
    // Combine and sort by relevance with stable tie-breaking
    const allResults = [
      ...scoredReferences.map((sr, idx) => ({
        content: sr.doc.content,
        source: sr.doc.source,
        path: sr.doc.category,
        score: sr.score,
        originalIndex: idx,
        type: 'reference' as const
      })),
      ...scoredChunks.map((sc, idx) => ({
        content: sc.chunk.chunk,
        source: (sc.chunk.metadata?.fileName as string) || 'Unknown',
        path: (sc.chunk.metadata?.sourcePath as string) || 'indexed-document',
        score: sc.score,
        originalIndex: idx,
        type: 'chunk' as const
      }))
    ];
    
    // Sort by score (descending), then by type (references first), then by original index
    // This ensures deterministic ordering even with tied scores
    const topResults = allResults
      .sort((a, b) => {
        // Primary: score (descending)
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        // Secondary: type (references before chunks)
        if (a.type !== b.type) {
          return a.type === 'reference' ? -1 : 1;
        }
        // Tertiary: original index (stable ordering)
        return a.originalIndex - b.originalIndex;
      })
      .slice(0, topK);
    
    console.log(`[RAGService] Retrieved ${topResults.length} relevant contexts (scores: ${topResults.map(r => r.score.toFixed(2)).join(', ')})`);
    
    return {
      contextSnippets: topResults.map(r => r.content),
      sourceMetadata: topResults.map(r => ({
        sourceName: r.source,
        path: r.path
      }))
    };
  }
  
  async clearDocuments(): Promise<void> {
    console.log('[RAGService] Clearing indexed documents...');
    this.indexedChunks = [];
  }
  
  /**
   * Tokenize text into words
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(token => token.length > 2); // Filter out very short words
  }
  
  /**
   * Calculate relevance score using simple keyword matching
   * Can be extended with TF-IDF, BM25, or vector embeddings
   */
  private calculateRelevanceScore(queryTokens: string[], content: string): number {
    const contentTokens = this.tokenize(content);
    const contentTokenSet = new Set(contentTokens);
    
    // Count matching tokens
    let matches = 0;
    for (const token of queryTokens) {
      if (contentTokenSet.has(token)) {
        matches++;
      }
    }
    
    // Normalized score (0-1)
    return queryTokens.length > 0 ? matches / queryTokens.length : 0;
  }
}

/**
 * Mock Implementation of RAG Service
 * Returns static thinking document and regulatory context
 */
export class MockRAGService implements RAGService {
  async initializeKnowledgeBase(): Promise<void> {
    console.log('[MockRAGService] Initializing knowledge base...');
    
    // Simulate loading thinking documents and regulatory guidelines
    await new Promise(resolve => setTimeout(resolve, 300));
    
    console.log('[MockRAGService] Loaded:');
    console.log('  - Primary Thinking Document (PDP execution strategy)');
    console.log('  - FDA 510(k) Guidelines');
    console.log('  - ISO 13485 Standards');
    console.log('  - ISO 14971 Risk Management');
  }
  
  async indexDocuments(_chunks: ChunkedDocumentPart[]): Promise<void> {
    console.log(`[MockRAGService] Indexing ${_chunks.length} chunks (mock - no actual indexing)`);
  }
  
  async retrieveContext(query: string, _topK?: number): Promise<KnowledgeContext> {
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
  
  async clearDocuments(): Promise<void> {
    console.log('[MockRAGService] Clearing documents (mock)');
  }
}
