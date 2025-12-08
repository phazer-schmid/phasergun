import type { SourceFolderInput, AppStatusOutput } from '@fda-compliance/shared-types';
import type { FileParser } from '../file-parser/src';
import type { Chunker } from '../chunker/src';
import type { RAGService } from '../rag-service/src';
import type { LLMService } from '../llm-service/src';

/**
 * Interface for the Orchestrator
 */
export interface Orchestrator {
  runAnalysis(input: SourceFolderInput): Promise<AppStatusOutput>;
}

/**
 * Main Orchestrator implementation
 * Coordinates the entire analysis workflow across all modules
 */
export class OrchestratorService implements Orchestrator {
  constructor(
    private fileParser: FileParser,
    private chunker: Chunker,
    private ragService: RAGService,
    private llmService: LLMService
  ) {}

  async runAnalysis(input: SourceFolderInput): Promise<AppStatusOutput> {
    try {
      console.log('=== Orchestrator: Starting Analysis ===');
      console.log('Input folder:', input.folderPath);

      // Step 1: Parse documents from folder
      console.log('\n[Step 1] Calling File Parser...');
      const parsedDocuments = await this.fileParser.scanAndParseFolder(input.folderPath);
      console.log(`✓ Parsed ${parsedDocuments.length} documents`);

      // Step 2: Chunk documents
      console.log('\n[Step 2] Calling Chunker...');
      const chunks = this.chunker.chunkDocuments(parsedDocuments);
      console.log(`✓ Created ${chunks.length} chunks`);

      // Step 3: Initialize RAG service (if not already initialized)
      console.log('\n[Step 3] Initializing RAG Service...');
      await this.ragService.initializeKnowledgeBase();
      console.log('✓ RAG Service ready');

      // Step 4: Index the document chunks
      console.log('\n[Step 4] Indexing document chunks...');
      await this.ragService.indexDocuments(chunks);
      console.log('✓ Documents indexed into knowledge base');

      // Step 5: Create analysis query based on documents
      console.log('\n[Step 5] Building analysis query...');
      const documentTypes = parsedDocuments.map(doc => doc.metadata?.documentType || 'Unknown').join(', ');
      const query = `Analyze Design History File (DHF) documents for FDA 510(k) regulatory compliance. Document types: ${documentTypes}. Identify gaps, verify completeness, assess risk management, and provide compliance recommendations.`;
      console.log(`Query: ${query.substring(0, 100)}...`);

      // Step 6: Retrieve relevant context (from indexed docs + regulatory guidelines)
      console.log('\n[Step 6] Retrieving knowledge context...');
      const context = await this.ragService.retrieveContext(query, 8); // Get top 8 relevant contexts
      console.log(`✓ Retrieved ${context.contextSnippets.length} contexts from ${context.sourceMetadata.length} sources`);

      // Step 7: Generate LLM response
      console.log('\n[Step 7] Calling LLM Service...');
      const prompt = this.constructPrompt(parsedDocuments, chunks, context);
      const llmResponse = await this.llmService.generateText(prompt, context);
      console.log(`✓ Generated response (${llmResponse.usageStats.tokensUsed} tokens used)`);

      console.log('\n=== Orchestrator: Analysis Complete ===\n');

      return {
        status: 'complete',
        message: 'Analysis completed successfully',
        detailedReport: llmResponse.generatedText,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('Orchestrator error:', error);
      
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        timestamp: new Date().toISOString()
      };
    }
  }

  private constructPrompt(documents: any[], chunks: any[], context: any): string {
    const documentSummary = documents.map(doc => 
      `- ${doc.metadata.fileName || 'Unknown'} (${doc.metadata.documentType || 'Unknown Type'})`
    ).join('\n');

    return `You are a regulatory compliance expert analyzing Design History File (DHF) documents for FDA 510(k) submission.

DOCUMENTS ANALYZED:
${documentSummary}

Total chunks analyzed: ${chunks.length}

REGULATORY CONTEXT:
${context.contextSnippets.map((snippet: string, i: number) => 
  `${i + 1}. ${snippet}`
).join('\n\n')}

TASK:
Analyze the documents for regulatory compliance and provide:
1. Document completeness assessment
2. Gap analysis (missing or incomplete sections)
3. Risk management evaluation
4. Traceability verification
5. Specific recommendations for improvement

Focus on FDA 510(k) requirements, ISO 13485 standards, and ISO 14971 risk management principles.
    `;
  }
}
