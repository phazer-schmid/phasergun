import { SourceFolderInput, AppStatusOutput } from '@fda-compliance/shared-types';
import { FileParser } from '@fda-compliance/file-parser';
import { Chunker } from '@fda-compliance/chunker';
import { RAGService } from '@fda-compliance/rag-service';
import { LLMService } from '@fda-compliance/llm-service';

/**
 * Orchestrator Interface
 * Coordinates the complete analysis workflow
 */
export interface Orchestrator {
  runAnalysis(input: SourceFolderInput): Promise<AppStatusOutput>;
}

/**
 * Orchestrator Service Implementation
 * Coordinates workflow across all modules
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
      console.log(`Input folder: ${input.folderPath}`);
      console.log(`Source type: ${input.sourceType || 'local'}`);
      console.log('');

      // Step 1: Parse documents from folder
      console.log('[Step 1/5] Calling File Parser Module...');
      const parsedDocuments = await this.fileParser.scanAndParseFolder(input.folderPath);
      console.log(`✓ Parsed ${parsedDocuments.length} documents\n`);

      // Step 2: Chunk documents
      console.log('[Step 2/5] Calling Chunker Module...');
      const chunks = this.chunker.chunkDocuments(parsedDocuments);
      console.log(`✓ Created ${chunks.length} chunks\n`);

      // Step 3: Initialize RAG service
      console.log('[Step 3/5] Initializing RAG Service Module...');
      await this.ragService.initializeKnowledgeBase();
      console.log('✓ RAG Service ready\n');

      // Step 4: Retrieve relevant context
      console.log('[Step 4/5] Retrieving Knowledge Context...');
      const query = `Analyze documents for FDA 510(k) compliance across PDP phases`;
      const context = await this.ragService.retrieveContext(query);
      console.log(`✓ Retrieved context from ${context.sourceMetadata.length} sources\n`);

      // Step 5: Generate LLM response
      console.log('[Step 5/5] Calling LLM Service Module...');
      const prompt = this.constructPrompt(chunks, context);
      const llmResponse = await this.llmService.generateText(prompt, context);
      console.log(`✓ Generated response (${llmResponse.usageStats.tokensUsed} tokens used)\n`);

      console.log('=== Orchestrator: Analysis Complete ===\n');

      return {
        status: 'complete',
        message: 'Analysis completed successfully - Full path traversed through all modules',
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

  private constructPrompt(chunks: any[], context: any): string {
    return `Analyze the following DHF documents for FDA 510(k) compliance.

Documents: ${chunks.length} chunks from parsed DHF files
Context: ${context.contextSnippets.length} relevant guidelines and thinking documents

Provide a comprehensive analysis covering all four PDP phases.`;
  }
}
