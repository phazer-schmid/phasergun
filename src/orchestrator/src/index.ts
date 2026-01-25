import { SourceFolderInput, AppStatusOutput } from '@fda-compliance/shared-types';
import { FileParser } from '@fda-compliance/file-parser';
import { Chunker } from '@fda-compliance/chunker';
import { EnhancedRAGService } from '@fda-compliance/rag-service';
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
    private enhancedRAGService: EnhancedRAGService,
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

      // Step 3: Load knowledge base (using enhanced RAG service)
      console.log('[Step 3/5] Loading Knowledge Base...');
      const primaryContextPath = process.env.PRIMARY_CONTEXT_PATH || 
        require('path').join(__dirname, '../../rag-service/knowledge-base/context/primary-context.yaml');
      await this.enhancedRAGService.loadKnowledge(input.folderPath, primaryContextPath);
      console.log('✓ Knowledge base ready\n');

      // Step 4: Retrieve relevant context using semantic search
      console.log('[Step 4/5] Retrieving Knowledge Context with Semantic Search...');
      const query = `Analyze documents for FDA 510(k) compliance across PDP phases`;
      const { ragContext } = await this.enhancedRAGService.retrieveRelevantContext(
        input.folderPath,
        primaryContextPath,
        query
      );
      console.log('✓ Retrieved semantic context\n');

      // Step 5: Generate LLM response
      console.log('[Step 5/5] Calling LLM Service Module...');
      const prompt = `${ragContext}\n\nAnalyze the following ${chunks.length} document chunks for FDA 510(k) compliance across all PDP phases.`;
      const llmResponse = await this.llmService.generateText(prompt);
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

  /**
   * Generate text for a specific prompt using semantic RAG
   */
  async generateFromPrompt(input: {
    projectPath: string;
    primaryContextPath: string;
    prompt: string;
    options?: {
      topKProcedures?: number;
      topKContext?: number;
    };
  }): Promise<{
    generatedText: string;
    sources: string[];
    usageStats: any;
  }> {
    console.log('=== Orchestrator: Generate From Prompt ===');
    console.log(`Project: ${input.projectPath}`);
    console.log(`Prompt length: ${input.prompt.length} chars`);
    
    try {
      // Step 1: Retrieve relevant context using semantic search
      const { ragContext, metadata } = await this.enhancedRAGService.retrieveRelevantContext(
        input.projectPath,
        input.primaryContextPath,
        input.prompt,
        {
          procedureChunks: input.options?.topKProcedures || 5,
          contextChunks: input.options?.topKContext || 5,
          includeFullPrimary: true
        }
      );
      
      console.log(`[Orchestrator] Context assembled:`);
      console.log(`  - Primary context: included`);
      console.log(`  - Procedures: ${metadata.procedureChunksRetrieved} chunks`);
      console.log(`  - Context files: ${metadata.contextChunksRetrieved} chunks`);
      console.log(`  - Estimated tokens: ${metadata.totalTokensEstimate}`);
      
      // Step 2: Combine RAG context + user prompt
      const fullPrompt = `${ragContext}\n\n=== USER REQUEST ===\n${input.prompt}`;
      
      // Step 3: Generate using LLM
      const response = await this.llmService.generateText(fullPrompt);
      
      console.log(`[Orchestrator] Generated ${response.usageStats.tokensUsed} tokens`);
      console.log('=== Orchestrator: Complete ===\n');
      
      return {
        generatedText: response.generatedText,
        sources: metadata.sources,
        usageStats: response.usageStats
      };
      
    } catch (error) {
      console.error('[Orchestrator] Error:', error);
      throw error;
    }
  }

  private constructPrompt(chunks: any[], context: any): string {
    return `Analyze the following DHF documents for FDA 510(k) compliance.

Documents: ${chunks.length} chunks from parsed DHF files
Context: ${context.contextSnippets.length} relevant guidelines and thinking documents

Provide a comprehensive analysis covering all four PDP phases.`;
  }
}
