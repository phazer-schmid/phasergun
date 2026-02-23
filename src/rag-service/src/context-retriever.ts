import { VectorStore, SearchResult, EmbeddingService } from '@phasergun/rag-core';

export interface RetrievalOptions {
  topK?: number;
  minSimilarity?: number;
  category?: 'procedure' | 'context';
  contextCategory?: string;
}

export class ContextRetriever {
  async retrieveRelevantContext(
    query: string,
    vectorStore: VectorStore,
    embeddingService: EmbeddingService,
    options: RetrievalOptions = {}
  ): Promise<SearchResult[]> {
    const { topK = 10, minSimilarity = 0.0, category } = options;
    
    console.log('[ContextRetriever] Retrieving relevant context for query...');
    console.log(`[ContextRetriever] Query: "${query.substring(0, 100)}${query.length > 100 ? '...' : ''}"`);
    
    const queryEmbedding = await embeddingService.embedText(query);
    const queryEmbeddingArray = VectorStore.float32ArrayToNumbers(queryEmbedding);
    
    const results = vectorStore.search(queryEmbeddingArray, topK, category);
    
    const filteredResults = results.filter(r => r.similarity >= minSimilarity);
    
    console.log(`[ContextRetriever] Found ${filteredResults.length} relevant chunks (similarity >= ${minSimilarity})`);
    
    if (filteredResults.length > 0) {
      const avgSimilarity = filteredResults.reduce((sum, r) => sum + r.similarity, 0) / filteredResults.length;
      console.log(`[ContextRetriever] Average similarity: ${avgSimilarity.toFixed(3)}`);
      console.log(`[ContextRetriever] Top similarity: ${filteredResults[0].similarity.toFixed(3)}`);
    }
    
    return filteredResults;
  }

  buildRAGContext(
    searchResults: SearchResult[],
    primaryContext: any,
    sopSummaries: Map<string, string>,
    contextSummaries: Map<string, string>,
    maxTokens: number = 150000
  ): string {
    console.log('[ContextRetriever] Building RAG context...');
    
    let contextParts: string[] = [];
    
    contextParts.push('# PRIMARY CONTEXT');
    contextParts.push('');
    contextParts.push(JSON.stringify(primaryContext, null, 2));
    contextParts.push('');
    
    const procedureResults = searchResults.filter(r => r.entry.metadata.category === 'procedure');
    const contextResults = searchResults.filter(r => r.entry.metadata.category === 'context');
    
    if (procedureResults.length > 0) {
      contextParts.push('# RELEVANT PROCEDURES');
      contextParts.push('');
      
      for (const result of procedureResults) {
        const fileName = result.entry.metadata.fileName;
        const summary = sopSummaries.get(fileName);
        
        if (summary) {
          contextParts.push(`## ${fileName}`);
          contextParts.push(`**Summary:** ${summary}`);
          contextParts.push('');
        }
        
        contextParts.push(`**Relevant Section (Similarity: ${result.similarity.toFixed(3)}):**`);
        contextParts.push(result.entry.metadata.content);
        contextParts.push('');
      }
    }
    
    if (contextResults.length > 0) {
      contextParts.push('# RELEVANT CONTEXT FILES');
      contextParts.push('');
      
      for (const result of contextResults) {
        const fileName = result.entry.metadata.fileName;
        const summary = contextSummaries.get(fileName);
        const contextCategory = result.entry.metadata.contextCategory || 'general';
        
        if (summary) {
          contextParts.push(`## ${fileName} (Category: ${contextCategory})`);
          contextParts.push(`**Summary:** ${summary}`);
          contextParts.push('');
        }
        
        contextParts.push(`**Relevant Section (Similarity: ${result.similarity.toFixed(3)}):**`);
        contextParts.push(result.entry.metadata.content);
        contextParts.push('');
      }
    }
    
    const fullContext = contextParts.join('\n');
    
    const estimatedTokens = Math.ceil(fullContext.length / 4);
    console.log(`[ContextRetriever] RAG context built: ${fullContext.length} chars (~${estimatedTokens} tokens)`);
    
    if (estimatedTokens > maxTokens) {
      console.warn(`[ContextRetriever] Context exceeds token limit (${estimatedTokens} > ${maxTokens}), truncating...`);
      const truncateLength = maxTokens * 4;
      return fullContext.substring(0, truncateLength) + '\n\n[... truncated ...]';
    }
    
    return fullContext;
  }

  async searchProcedures(
    query: string,
    vectorStore: VectorStore,
    embeddingService: EmbeddingService,
    topK: number = 5
  ): Promise<SearchResult[]> {
    return await this.retrieveRelevantContext(query, vectorStore, embeddingService, {
      topK,
      category: 'procedure'
    });
  }

  async searchContext(
    query: string,
    vectorStore: VectorStore,
    embeddingService: EmbeddingService,
    topK: number = 5,
    contextCategory?: string
  ): Promise<SearchResult[]> {
    return await this.retrieveRelevantContext(query, vectorStore, embeddingService, {
      topK,
      category: 'context',
      contextCategory
    });
  }
}
