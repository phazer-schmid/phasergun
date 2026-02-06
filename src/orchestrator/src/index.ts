import { SourceFolderInput, AppStatusOutput } from '@phasergun/shared-types';
import { FileParser } from '@phasergun/file-parser';
import { Chunker } from '@phasergun/chunker';
import { EnhancedRAGService, FootnoteTracker, SourceReference } from '@phasergun/rag-service';
import { LLMService } from '@phasergun/llm-service';

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
   * Generate text for a specific prompt using semantic RAG with footnotes
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
    footnotes: SourceReference[];
    footnotesMap: { [key: string]: SourceReference };
    usageStats: any;
  }> {
    console.log('=== Orchestrator: Generate From Prompt ===');
    console.log(`Project: ${input.projectPath}`);
    console.log(`Prompt length: ${input.prompt.length} chars`);
    
    try {
      // Step 1: Parse prompt to extract requested input data
      const requestedData = this.parseInputDataSection(input.prompt);
      console.log(`[Orchestrator] Parsed INPUT DATA from prompt:`);
      console.log(`[Orchestrator]   - SOPs requested:`, requestedData.sops);
      console.log(`[Orchestrator]   - Primary Context: ${requestedData.includePrimaryContext ? 'YES' : 'NO'}`);
      console.log(`[Orchestrator]   - Context files requested:`, requestedData.contextFiles);
      
      // Step 2: Retrieve relevant context using intelligent filtering
      const { ragContext, metadata, procedureChunks, contextChunks } = 
        await this.enhancedRAGService.retrieveRelevantContext(
          input.projectPath,
          input.primaryContextPath,
          input.prompt,
          {
            // Dynamically set based on what's requested
            procedureChunks: requestedData.sops.length > 0 ? 3 : 0,  // Fewer chunks per SOP
            contextChunks: requestedData.includePrimaryContext ? 2 : 0,  // Minimal context chunks
            includeFullPrimary: true,  // Always include primary context YAML
            includeSummaries: requestedData.sops.length > 0,  // Only include SOP summaries if SOPs requested
          }
        );
      
      // Step 2: Initialize footnote tracker and track sources
      const footnoteTracker = new FootnoteTracker();
      footnoteTracker.addFromRetrievalResults(procedureChunks, contextChunks);
      
      // Add regulatory standards mentioned in the prompt (if any)
      // These are common standards that might be referenced
      if (input.prompt.match(/ISO\s*13485/i)) {
        footnoteTracker.addStandardReference('ISO 13485:2016', 'Quality Management Systems for Medical Devices');
      }
      if (input.prompt.match(/ISO\s*14971/i)) {
        footnoteTracker.addStandardReference('ISO 14971:2019', 'Risk Management for Medical Devices');
      }
      if (input.prompt.match(/21\s*CFR\s*820/i)) {
        footnoteTracker.addStandardReference('21 CFR Part 820', 'FDA Quality System Regulation');
      }
      if (input.prompt.match(/510\(k\)/i)) {
        footnoteTracker.addStandardReference('FDA 510(k) Guidance', 'Premarket Notification Requirements');
      }
      
      console.log(`[Orchestrator] Context assembled:`);
      console.log(`  - Primary context: included`);
      console.log(`  - Procedures: ${metadata.procedureChunksRetrieved} chunks`);
      console.log(`  - Context files: ${metadata.contextChunksRetrieved} chunks`);
      console.log(`  - Footnotes tracked: ${footnoteTracker.getSourceCount()} sources`);
      console.log(`  - Estimated tokens: ${metadata.totalTokensEstimate}`);
      
      // Step 3: Combine RAG context + user prompt with TIER 3 emphasis and constraint enforcement
      const fullPrompt = `${ragContext}=== YOUR SPECIFIC TASK ===

This is what you must do. Read carefully and follow these instructions precisely:

${input.prompt}

MANDATORY ENFORCEMENT RULES
You MUST follow these absolute constraints:

1. SCOPE: Write ONLY what is requested above. If it says "Purpose section" → write ONLY Purpose, nothing else
2. LENGTH: Respect ALL length limits (e.g., "2 paragraphs" = exactly 2 paragraphs, not 20)
3. FORMAT: Follow the exact format specified (paragraphs, bullets, tables, etc.)
4. STOP: When you complete the requested section, STOP immediately. Do NOT continue to other sections

VIOLATION PENALTY: Generating content beyond the requested scope will result in rejection.

Now write ONLY what was requested above. Begin immediately with the content - no preamble, no "Here is...", no analysis.`;
      
      console.log(`[Orchestrator] Full prompt length: ${fullPrompt.length} chars`);
      console.log(`[Orchestrator] Calling LLM service...`);
      
      // Step 4: Generate using LLM
      const response = await this.llmService.generateText(fullPrompt);
      
      console.log(`[Orchestrator] LLM response received:`);
      console.log(`  - Generated text length: ${response.generatedText?.length || 0} chars`);
      console.log(`  - Tokens used: ${response.usageStats?.tokensUsed || 0}`);
      console.log(`  - Text preview: ${response.generatedText?.substring(0, 100) || '(empty)'}`);
      
      // Check for empty response
      if (!response.generatedText || response.generatedText.trim().length === 0) {
        console.error('[Orchestrator] ⚠️  WARNING: LLM returned empty or blank text!');
        console.error('[Orchestrator] Tokens used:', response.usageStats?.tokensUsed);
        console.error('[Orchestrator] This likely indicates a stop sequence triggered too early or content was filtered.');
        
        // Return diagnostic message instead of blank
        return {
          generatedText: '[ERROR: No content generated]\n\n' +
                        'The LLM generated ' + (response.usageStats?.tokensUsed || 0) + ' tokens but returned empty text.\n' +
                        'Check server logs for details. This may indicate:\n' +
                        '- Stop sequences triggering too early\n' +
                        '- Content being filtered or stripped\n' +
                        '- API response parsing issue',
          sources: metadata.sources,
          footnotes: [],
          footnotesMap: {},
          usageStats: response.usageStats
        };
      }
      
      // Step 5: Append footnotes to generated text
      const footnotes = footnoteTracker.generateFootnotes();
      const finalText = response.generatedText + footnotes;
      
      console.log(`[Orchestrator] Generated ${response.usageStats.tokensUsed} tokens`);
      console.log(`[Orchestrator] Appended ${footnoteTracker.getSourceCount()} footnotes`);
      console.log('=== Orchestrator: Complete ===\n');
      
      return {
        generatedText: finalText,
        sources: metadata.sources,
        footnotes: footnoteTracker.getSourcesArray(),
        footnotesMap: Object.fromEntries(footnoteTracker.getSources()),
        usageStats: response.usageStats
      };
      
    } catch (error) {
      console.error('[Orchestrator] Error:', error);
      throw error;
    }
  }

  /**
   * Parse the INPUT DATA section from the prompt to extract requested resources
   */
  private parseInputDataSection(prompt: string): {
    sops: string[];
    includePrimaryContext: boolean;
    contextFiles: string[];
  } {
    const result = {
      sops: [] as string[],
      includePrimaryContext: false,
      contextFiles: [] as string[]
    };
    
    // Look for INPUT DATA section (very lenient matching)
    // Matches "INPUT DATA:" followed by content until next section (ALL CAPS + colon) or end
    // Allows single newline between sections (not just double)
    const inputDataMatch = prompt.match(/INPUT DATA:?\s*(.*?)(?=\n+[A-Z][A-Z\s]*:|$)/is);
    if (!inputDataMatch) {
      console.log('[Orchestrator] ⚠️  No INPUT DATA section found in prompt');
      console.log('[Orchestrator] Prompt preview:', prompt.substring(0, 200));
      console.log('[Orchestrator] Using minimal defaults');
      return result;
    }
    
    const inputDataSection = inputDataMatch[1];
    console.log('[Orchestrator] ✓ INPUT DATA section found and parsed');
    console.log('[Orchestrator] INPUT DATA content:', inputDataSection.substring(0, 200));
    
    // Extract SOP references (e.g., SOP0004, SOP for design control)
    const sopMatches = inputDataSection.match(/SOP\s*\d{4}|SOP\s+for\s+[\w\s]+/gi);
    if (sopMatches) {
      result.sops = sopMatches.map(s => s.trim());
    }
    
    // Check for Primary Context request
    if (/primary\s+context/i.test(inputDataSection)) {
      result.includePrimaryContext = true;
    }
    
    // Check for device information request (also implies primary context)
    if (/device|product\s+information/i.test(inputDataSection)) {
      result.includePrimaryContext = true;
    }
    
    // Extract other context file references
    const contextMatches = inputDataSection.match(/(?:context|predicate|market)[\w\s]*/gi);
    if (contextMatches) {
      result.contextFiles = contextMatches.map(c => c.trim()).filter(c => c.length > 0);
    }
    
    return result;
  }

  private constructPrompt(chunks: any[], context: any): string {
    return `Analyze the following DHF documents for FDA 510(k) compliance.

Documents: ${chunks.length} chunks from parsed DHF files
Context: ${context.contextSnippets.length} relevant guidelines and thinking documents

Provide a comprehensive analysis covering all four PDP phases.`;
  }
}
