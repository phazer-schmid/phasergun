import type { SourceFolderInput } from '@/interfaces/SourceFolderInput';
import type { AppStatusOutput } from '@/interfaces/AppStatusOutput';
import type { FileParser } from '@/interfaces/ParsedDocument';
import type { Chunker } from '@/interfaces/ChunkedDocumentPart';
import type { RAGService } from '@/interfaces/KnowledgeContext';
import type { LLMService } from '@/interfaces/LLMResponse';

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

      // Step 4: Retrieve relevant context
      console.log('\n[Step 4] Retrieving knowledge context...');
      const query = `Analyze documents for FDA 510(k) compliance`;
      const context = await this.ragService.retrieveContext(query);
      console.log(`✓ Retrieved context from ${context.sourceMetadata.length} sources`);

      // Step 5: Generate LLM response
      console.log('\n[Step 5] Calling LLM Service...');
      const prompt = this.constructPrompt(chunks, context);
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

  private constructPrompt(chunks: any[], context: any): string {
    return `Analyze the following documents for regulatory compliance...
    
Documents: ${chunks.length} chunks
Context: ${context.contextSnippets.length} relevant guidelines
    `;
  }
}
