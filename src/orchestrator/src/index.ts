import { GenerationOutput, SourceAttribution, Discrepancy, ConfidenceRating } from '@phasergun/shared-types';
import { EnhancedRAGService, FootnoteTracker, SourceReference } from '@phasergun/rag-service';
import { LLMService } from '@phasergun/llm-service';

/**
 * Orchestrator Service
 * Coordinates the complete generation workflow per primary-context.yaml
 */
export class OrchestratorService {
  constructor(
    private ragService: EnhancedRAGService,
    private llmService: LLMService
  ) {}

  /**
   * Generate DHF document content from a prompt using RAG.
   * Implements primary-context.yaml → generation_workflow.processing
   * 
   * Workflow Steps:
   * 1. Parse reference_notation patterns in the prompt
   * 2. Retrieve referenced documents from knowledge_sources via RAG service
   * 3. Validate retrieved content against compliance standards
   * 4. Generate content adhering to procedures
   * 5. Track conflicts/discrepancies between sources
   * 6. Calculate confidence rating
   */
  async generateFromPrompt(input: {
    projectPath: string;
    primaryContextPath: string;
    prompt: string;
    options?: { topKProcedures?: number; topKContext?: number };
  }): Promise<GenerationOutput> {
    console.log('=== Orchestrator: Generate From Prompt ===');
    console.log(`Project: ${input.projectPath}`);
    console.log(`Prompt length: ${input.prompt.length} chars`);
    
    try {
      // Step 1: Parse reference notation from prompt
      const references = this.parseReferenceNotation(input.prompt);
      console.log(`[Orchestrator] Parsed reference notation from prompt:`);
      console.log(`[Orchestrator]   - Procedures requested:`, references.procedures);
      console.log(`[Orchestrator]   - Master Record fields:`, references.masterRecordFields);
      console.log(`[Orchestrator]   - Context documents:`, references.contextDocs);
      
      // Step 2: Retrieve relevant context using intelligent filtering
      const { ragContext, metadata, procedureChunks, contextChunks } = 
        await this.ragService.retrieveRelevantContext(
          input.projectPath,
          input.primaryContextPath,
          input.prompt,
          {
            // Use parsed references to guide retrieval
            procedureChunks: references.procedures.length > 0 ? (input.options?.topKProcedures ?? 3) : 0,
            contextChunks: references.masterRecordFields.length > 0 || references.contextDocs.length > 0 
              ? (input.options?.topKContext ?? 2) 
              : 0,
            includeFullPrimary: true,  // Always include primary context YAML
            includeSummaries: references.procedures.length > 0,  // Only include SOP summaries if procedures requested
          }
        );
      
      // Step 3: Initialize footnote tracker and track sources
      const footnoteTracker = new FootnoteTracker();
      footnoteTracker.addFromRetrievalResults(procedureChunks, contextChunks);
      
      // Add regulatory standards mentioned in the prompt (if any)
      this.addRegulatoryStandardsToTracker(input.prompt, footnoteTracker);
      
      console.log(`[Orchestrator] Context assembled:`);
      console.log(`  - Primary context: included`);
      console.log(`  - Procedures: ${metadata.procedureChunksRetrieved} chunks`);
      console.log(`  - Context files: ${metadata.contextChunksRetrieved} chunks`);
      console.log(`  - Footnotes tracked: ${footnoteTracker.getSourceCount()} sources`);
      console.log(`  - Estimated tokens: ${metadata.totalTokensEstimate}`);
      
      // Step 4: Build the LLM prompt with enforcement rules
      const fullPrompt = this.buildLLMPrompt(ragContext, input.prompt);
      
      console.log(`[Orchestrator] Full prompt length: ${fullPrompt.length} chars`);
      console.log(`[Orchestrator] Calling LLM service...`);
      
      // Step 5: Generate via LLM
      const response = await this.llmService.generateText(fullPrompt);
      
      console.log(`[Orchestrator] LLM response received:`);
      console.log(`  - Generated text length: ${response.generatedText?.length || 0} chars`);
      console.log(`  - Tokens used: ${response.usageStats?.tokensUsed || 0}`);
      
      // Check for empty response
      if (!response.generatedText || response.generatedText.trim().length === 0) {
        console.error('[Orchestrator] ⚠️  WARNING: LLM returned empty or blank text!');
        
        return {
          status: 'error',
          message: 'LLM generated empty content. This may indicate a stop sequence triggered too early or content filtering.',
          timestamp: new Date().toISOString(),
          generatedContent: '[ERROR: No content generated]\n\n' +
                          'The LLM generated ' + (response.usageStats?.tokensUsed || 0) + ' tokens but returned empty text.\n' +
                          'Check server logs for details.',
          usageStats: response.usageStats
        };
      }
      
      // Step 6: Build source attributions from footnote tracker
      const sourceAttributions = this.buildSourceAttributions(footnoteTracker);
      
      // Step 7: Append footnotes to generated text
      const footnotes = footnoteTracker.generateFootnotes();
      const finalText = response.generatedText + footnotes;
      
      // Step 8: Track discrepancies (placeholder for now)
      const discrepancies = this.trackDiscrepancies(procedureChunks, contextChunks);
      
      // Step 9: Calculate confidence rating
      const confidence = this.buildConfidenceRating(
        references,
        metadata,
        response.usageStats
      );
      
      console.log(`[Orchestrator] Generated ${response.usageStats.tokensUsed} tokens`);
      console.log(`[Orchestrator] Appended ${footnoteTracker.getSourceCount()} footnotes`);
      console.log(`[Orchestrator] Confidence: ${confidence.level}`);
      console.log('=== Orchestrator: Complete ===\n');
      
      return {
        status: 'complete',
        message: 'Content generated successfully',
        timestamp: new Date().toISOString(),
        generatedContent: finalText,
        references: sourceAttributions,
        confidence: confidence,
        discrepancies: discrepancies,
        usageStats: response.usageStats,
        metadata: {
          sources: metadata.sources,
          footnotes: footnoteTracker.getSourcesArray(),
          footnotesMap: Object.fromEntries(footnoteTracker.getSources())
        }
      };
      
    } catch (error) {
      console.error('[Orchestrator] Error:', error);
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Parse reference_notation patterns from the prompt
   * Extracts bracket-based references per primary-context.yaml
   * 
   * Patterns:
   * - [Procedure|{category}] → e.g., [Procedure|Design Control Procedure]
   * - [Master Record|{field}] → e.g., [Master Record|DEVICE_NAME]
   * - [Context|{folder}|{filename}] → e.g., [Context|Regulatory Strategy|predicate.docx]
   */
  private parseReferenceNotation(prompt: string): {
    procedures: string[];
    masterRecordFields: string[];
    contextDocs: Array<{ folder: string; filename: string }>;
  } {
    const result = {
      procedures: [] as string[],
      masterRecordFields: [] as string[],
      contextDocs: [] as Array<{ folder: string; filename: string }>
    };
    
    // Pattern 1: [Procedure|{category}]
    const procedurePattern = /\[Procedure\|([^\]]+)\]/gi;
    let match;
    while ((match = procedurePattern.exec(prompt)) !== null) {
      result.procedures.push(match[1].trim());
    }
    
    // Pattern 2: [Master Record|{field}]
    const masterRecordPattern = /\[Master Record\|([^\]]+)\]/gi;
    while ((match = masterRecordPattern.exec(prompt)) !== null) {
      result.masterRecordFields.push(match[1].trim());
    }
    
    // Pattern 3: [Context|{folder}|{filename}]
    const contextPattern = /\[Context\|([^|\]]+)\|([^\]]+)\]/gi;
    while ((match = contextPattern.exec(prompt)) !== null) {
      result.contextDocs.push({
        folder: match[1].trim(),
        filename: match[2].trim()
      });
    }
    
    // LEGACY SUPPORT: Also parse old "INPUT DATA:" section for backwards compatibility
    // This ensures existing prompts still work during transition
    const legacyData = this.parseLegacyInputDataSection(prompt);
    if (legacyData.sops.length > 0) {
      console.log('[Orchestrator] ℹ️  Found legacy INPUT DATA section, merging with bracket notation');
      result.procedures.push(...legacyData.sops);
    }
    if (legacyData.includePrimaryContext) {
      console.log('[Orchestrator] ℹ️  Legacy prompt requests primary context');
    }
    
    return result;
  }

  /**
   * Legacy support: Parse the old "INPUT DATA:" section format
   * This ensures backwards compatibility with existing prompts
   */
  private parseLegacyInputDataSection(prompt: string): {
    sops: string[];
    includePrimaryContext: boolean;
    contextFiles: string[];
  } {
    const result = {
      sops: [] as string[],
      includePrimaryContext: false,
      contextFiles: [] as string[]
    };
    
    // Look for INPUT DATA section
    const inputDataMatch = prompt.match(/INPUT DATA:?\s*(.*?)(?=\n+[A-Z][A-Z\s]*:|$)/is);
    if (!inputDataMatch) {
      return result;
    }
    
    const inputDataSection = inputDataMatch[1];
    
    // Extract SOP references
    const sopMatches = inputDataSection.match(/SOP\s*\d{4}|SOP\s+for\s+[\w\s]+/gi);
    if (sopMatches) {
      result.sops = sopMatches.map(s => s.trim());
    }
    
    // Check for Primary Context request
    if (/primary\s+context/i.test(inputDataSection)) {
      result.includePrimaryContext = true;
    }
    
    // Check for device information request
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

  /**
   * Add regulatory standards to footnote tracker based on prompt content
   */
  private addRegulatoryStandardsToTracker(prompt: string, tracker: FootnoteTracker): void {
    if (prompt.match(/ISO\s*13485/i)) {
      tracker.addStandardReference('ISO 13485:2016', 'Quality Management Systems for Medical Devices');
    }
    if (prompt.match(/ISO\s*14971/i)) {
      tracker.addStandardReference('ISO 14971:2019', 'Risk Management for Medical Devices');
    }
    if (prompt.match(/21\s*CFR\s*820/i)) {
      tracker.addStandardReference('21 CFR Part 820', 'FDA Quality System Regulation');
    }
    if (prompt.match(/510\(k\)/i)) {
      tracker.addStandardReference('FDA 510(k) Guidance', 'Premarket Notification Requirements');
    }
  }

  /**
   * Build the full LLM prompt with RAG context + user task + enforcement rules
   */
  private buildLLMPrompt(ragContext: string, userPrompt: string): string {
    return `${ragContext}=== YOUR SPECIFIC TASK ===

This is what you must do. Read carefully and follow these instructions precisely:

${userPrompt}

MANDATORY ENFORCEMENT RULES
You MUST follow these absolute constraints:

1. SCOPE: Write ONLY what is requested above. If it says "Purpose section" → write ONLY Purpose, nothing else
2. LENGTH: Respect ALL length limits (e.g., "2 paragraphs" = exactly 2 paragraphs, not 20)
3. FORMAT: Follow the exact format specified (paragraphs, bullets, tables, etc.)
4. STOP: When you complete the requested section, STOP immediately. Do NOT continue to other sections

VIOLATION PENALTY: Generating content beyond the requested scope will result in rejection.

Now write ONLY what was requested above. Begin immediately with the content - no preamble, no "Here is...", no analysis.`;
  }

  /**
   * Build source attributions from footnote tracker
   */
  private buildSourceAttributions(tracker: FootnoteTracker): SourceAttribution[] {
    const attributions: SourceAttribution[] = [];
    const sources = tracker.getSources();
    
    for (const [id, sourceRef] of sources) {
      // Map SourceReference category to SourceAttribution category
      let category: SourceAttribution['category'] = 'general';
      
      if (sourceRef.category === 'procedure') {
        category = 'procedure';
      } else if (sourceRef.category === 'context') {
        category = 'context';
      } else if (sourceRef.category === 'standard') {
        category = 'compliance';
      }
      
      // Build section information from chunk index or citation text
      const section = sourceRef.chunkIndex !== undefined 
        ? `Section ${sourceRef.chunkIndex + 1}` 
        : sourceRef.citationText;
      
      attributions.push({
        id,
        fileName: sourceRef.fileName,
        category,
        section,
        usage: 'Referenced in generated content'
      });
    }
    
    return attributions;
  }

  /**
   * Track discrepancies between sources (placeholder for future enhancement)
   */
  private trackDiscrepancies(
    procedureChunks: any[],
    contextChunks: any[]
  ): Discrepancy[] {
    // TODO: Future enhancement - analyze chunks for conflicts
    // For now, return empty array
    return [];
  }

  /**
   * Calculate confidence rating based on retrieval success and generation quality
   */
  private buildConfidenceRating(
    references: {
      procedures: string[];
      masterRecordFields: string[];
      contextDocs: Array<{ folder: string; filename: string }>;
    },
    metadata: {
      procedureChunksRetrieved: number;
      contextChunksRetrieved: number;
      sources: string[];
    },
    usageStats: any
  ): ConfidenceRating {
    // Calculate confidence based on:
    // 1. Were requested sources found?
    // 2. How many sources were retrieved?
    // 3. Token usage (indicates content was generated)
    
    const requestedCount = references.procedures.length + 
                          references.masterRecordFields.length + 
                          references.contextDocs.length;
    
    const retrievedCount = metadata.procedureChunksRetrieved + metadata.contextChunksRetrieved;
    const sourceCount = metadata.sources.length;
    const tokensUsed = usageStats?.tokensUsed || 0;
    
    // Determine source agreement level
    let sourceAgreement: 'High' | 'Medium' | 'Low' = 'Medium';
    if (requestedCount === 0) {
      // No specific sources requested, use general quality indicators
      sourceAgreement = sourceCount >= 3 ? 'High' : sourceCount >= 1 ? 'Medium' : 'Low';
    } else {
      // Specific sources requested, check if they were found
      sourceAgreement = retrievedCount >= requestedCount ? 'High' : 
                       retrievedCount >= requestedCount / 2 ? 'Medium' : 'Low';
    }
    
    // Determine completeness
    let completeness: 'High' | 'Medium' | 'Low' = 'High';
    if (requestedCount > 0 && retrievedCount === 0) {
      completeness = 'Low';
    } else if (requestedCount > 0 && retrievedCount < requestedCount) {
      completeness = 'Medium';
    }
    
    // Compliance alignment (assume high for now since we use primary context)
    const complianceAlignment: 'High' | 'Medium' | 'Low' = 'High';
    
    // Procedure adherence (assume high if procedures were retrieved)
    const procedureAdherence: 'High' | 'Medium' | 'Low' = 
      metadata.procedureChunksRetrieved > 0 ? 'High' : 'Medium';
    
    // Overall level
    let level: 'High' | 'Medium' | 'Low';
    if (sourceAgreement === 'High' && completeness === 'High' && tokensUsed > 100) {
      level = 'High';
    } else if (sourceAgreement === 'Low' || completeness === 'Low' || tokensUsed < 50) {
      level = 'Low';
    } else {
      level = 'Medium';
    }
    
    // Build rationale
    const rationale = this.buildConfidenceRationale(
      level,
      requestedCount,
      retrievedCount,
      sourceCount,
      tokensUsed
    );
    
    return {
      level,
      rationale,
      criteria: {
        sourceAgreement,
        completeness,
        complianceAlignment,
        procedureAdherence
      }
    };
  }

  /**
   * Build confidence rationale text
   */
  private buildConfidenceRationale(
    level: 'High' | 'Medium' | 'Low',
    requestedCount: number,
    retrievedCount: number,
    sourceCount: number,
    tokensUsed: number
  ): string {
    const parts: string[] = [];
    
    parts.push(`Confidence level: ${level}.`);
    
    if (requestedCount > 0) {
      parts.push(`Retrieved ${retrievedCount} of ${requestedCount} requested sources.`);
    } else {
      parts.push(`Retrieved ${retrievedCount} relevant chunks from ${sourceCount} sources.`);
    }
    
    parts.push(`Generated ${tokensUsed} tokens.`);
    
    if (level === 'High') {
      parts.push('All required information was available and content was generated successfully.');
    } else if (level === 'Low') {
      parts.push('Some required sources were missing or content generation was limited.');
    } else {
      parts.push('Content generated with adequate source coverage.');
    }
    
    return parts.join(' ');
  }
}
