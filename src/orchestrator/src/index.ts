import { GenerationOutput, SourceAttribution, Discrepancy, ConfidenceRating } from '@phasergun/shared-types';
import { EnhancedRAGService, FootnoteTracker, SourceReference, assembleContext, enforceTokenLimit } from '@phasergun/rag-service';
import { LLMService } from '@phasergun/llm-service';
import type { SearchResult } from '@phasergun/rag-service';

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
   * Generate document content from a prompt using RAG.
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
      
      // Step 2: Retrieve context summaries and semantic context chunks
      const hasContextRefs = references.masterRecordFields.length > 0 || references.contextDocs.length > 0;

      const { 
        metadata, 
        procedureChunks: semanticProcedureChunks, 
        contextChunks, 
        sopSummaries,
        contextSummaries,
        masterChecklistContent
      } = await this.ragService.retrieveRelevantContext(
        input.projectPath,
        input.primaryContextPath,
        input.prompt,
        {
          procedureChunks: 0,  // Don't use semantic search for procedures - smart selection will handle it
          contextChunks: hasContextRefs
            ? (input.options?.topKContext ?? 5)
            : (input.options?.topKContext ?? 2),
          includeFullPrimary: true,
          includeSummaries: true,
        }
      );
      
      // Step 2b: Smart Procedure Identification
      // Use the LLM to review ALL SOP summaries and identify which are relevant
      const relevantProcedureNames = await this.identifyRelevantProcedures(
        sopSummaries,
        input.prompt
      );

      // Step 2c: Retrieve ALL chunks for each identified procedure
      let smartProcedureChunks: SearchResult[] = [];
      const smartProcedureFileNames = new Set<string>();

      for (const procInfo of relevantProcedureNames) {
        const fileName = procInfo.fileName;
        const entries = this.ragService.getEntriesByFileName(fileName);
        if (entries.length > 0) {
          smartProcedureFileNames.add(fileName);
          entries.forEach(entry => {
            smartProcedureChunks.push({ entry, similarity: 1.0 }); // Full retrieval, max similarity
          });
        } else {
          console.warn(`[Orchestrator] ⚠️  Procedure "${fileName}" identified as relevant but not found in vector store`);
        }
      }

      // Sort for determinism
      smartProcedureChunks.sort((a, b) => {
        const fileCmp = a.entry.metadata.fileName.localeCompare(b.entry.metadata.fileName);
        if (fileCmp !== 0) return fileCmp;
        return a.entry.metadata.chunkIndex - b.entry.metadata.chunkIndex;
      });

      console.log(`[Orchestrator] 📄 Smart procedure retrieval: ${smartProcedureChunks.length} chunks from ${smartProcedureFileNames.size} procedures`);
      
      // Step 3: Initialize footnote tracker and track sources
      const footnoteTracker = new FootnoteTracker();
      footnoteTracker.addFromRetrievalResults(smartProcedureChunks, contextChunks);
      
      // Add regulatory standards mentioned in the prompt (if any)
      this.addRegulatoryStandardsToTracker(input.prompt, footnoteTracker);
      
      // Add compliance standards to footnotes
      const primaryContext = await this.loadPrimaryContext(input.primaryContextPath);
      if (primaryContext?.compliance?.standards) {
        for (const std of primaryContext.compliance.standards) {
          footnoteTracker.addStandardReference(std.name, std.scope);
        }
      }
      
      console.log('[Orchestrator] Context assembled with smart procedure selection:');
      console.log('  - Primary context: included');
      console.log('  - Smart procedures: ' + smartProcedureChunks.length + ' chunks from ' + smartProcedureFileNames.size + ' files');
      console.log('  - Context files: ' + metadata.contextChunksRetrieved + ' chunks');
      console.log('  - Footnotes tracked: ' + footnoteTracker.getSourceCount() + ' sources');
      
      // Step 4: Extract compliance standards from primary context
      const complianceStandardsList = primaryContext?.compliance?.standards?.map((s: any) => ({
        id: s.id || 'unknown',
        name: s.name || 'Unknown',
        scope: s.scope || 'General'
      })) || [];
      
      // Step 5: Rebuild RAG context with smart procedure chunks + compliance awareness
      const ragContext = assembleContext(
        primaryContext,
        smartProcedureChunks,
        contextChunks,
        sopSummaries,
        contextSummaries,
        { includeFullPrimary: true },
        masterChecklistContent,
        complianceStandardsList,
        relevantProcedureNames
      );

      const finalRagContext = enforceTokenLimit(ragContext, 150000);
      console.log('  - Estimated tokens: ' + Math.ceil(finalRagContext.length / 4));
      
      // Step 5: Build the LLM prompt with enforcement rules
      const fullPrompt = this.buildLLMPrompt(finalRagContext, input.prompt);
      
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
      const finalText = response.generatedText;// + footnotes;
      
      // Step 8: Track discrepancies (placeholder for now)
      const discrepancies = this.trackDiscrepancies(smartProcedureChunks, contextChunks);
      
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
   * Build the full LLM prompt with RAG context + user task
   * 
   * BEFORE: Appended 8 lines of "MANDATORY ENFORCEMENT RULES" that duplicated
   * the context assembler's TIER 1 (scope, length, format, stop, no preamble).
   * Combined with TIER 1, this meant ~50 behavioral directives before the LLM
   * even saw the task — consuming attention budget and causing reference
   * resolution failures (e.g., [Master Record|Device Trade Name] printed literally).
   * 
   * AFTER: Lightweight frame. The prompt itself carries all behavioral rules.
   * The orchestrator just marks where the task begins and ends.
   */
  private buildLLMPrompt(ragContext: string, userPrompt: string): string {
    return `${ragContext}=== TASK ===

    ${userPrompt}

    === END TASK ===

    Write your response now.`;
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
   * Load the full primary-context.yaml object.
   */
  private async loadPrimaryContext(primaryContextPath: string): Promise<any> {
    const fs = await import('fs/promises');
    const yaml = await import('js-yaml');
    const fileContents = await fs.readFile(primaryContextPath, 'utf8');
    return yaml.load(fileContents) as any;
  }

  /**
   * Smart Procedure Identification
   *
   * Reviews ALL SOP summaries and the user's task to determine which
   * procedures are relevant — whether or not they're explicitly referenced
   * in the prompt. This replaces pure semantic top-K search for procedures.
   *
   * Returns an array of procedure file names that should be retrieved in full.
   */
  private async identifyRelevantProcedures(
    sopSummaries: Map<string, string>,
    userPrompt: string
  ): Promise<Array<{ fileName: string; reason: string }>> {
    if (sopSummaries.size === 0) {
      return [];
    }

    console.log(`[Orchestrator] 🧠 SMART PROCEDURE SELECTION: Analyzing ${sopSummaries.size} SOPs for relevance...`);

    // Build the summaries block
    const summaryBlock = Array.from(sopSummaries.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([fileName, summary]) => `### ${fileName}\n${summary}`)
      .join('\n\n');

    const prompt = `You are a regulatory documentation expert. You are about to generate content for a medical device project. Below are summaries of ALL company procedures (SOPs) available, followed by the user's generation task.

Your job: identify EVERY procedure that is relevant to this task. A procedure is relevant if:
1. It is explicitly referenced in the task (e.g., [Procedure|Design Control Procedure])
2. It governs the type of document being generated (e.g., a Design Control SOP is relevant when writing a Design and Development Plan)
3. It provides requirements, templates, or guidance that the generated content must follow
4. It defines processes that the generated content describes or references
5. It would be consulted by a regulatory professional writing this document

Be inclusive. It is better to include a marginally relevant procedure than to miss one that matters. Do NOT include procedures that are clearly unrelated to the task.

=== AVAILABLE PROCEDURES ===
${summaryBlock}
=== END PROCEDURES ===

=== USER TASK ===
${userPrompt.substring(0, 3000)}
=== END TASK ===

Respond with ONLY a valid JSON object (no markdown fences, no preamble):

{
  "relevant_procedures": [
    {
      "fileName": "Exact file name from the summaries above",
      "reason": "Brief reason why this procedure is relevant"
    }
  ]
}`;

    try {
      const response = await this.llmService.generateText(prompt);
      const rawText = response.generatedText.trim();
      const cleaned = rawText.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();

      let parsed: any;
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        console.error('[Orchestrator] ⚠️  Failed to parse procedure identification response — falling back to all procedures');
        // Fail safe: include all procedures
        return Array.from(sopSummaries.keys()).map(fileName => ({ 
          fileName, 
          reason: 'Included due to parsing failure' 
        }));
      }

      const relevant = (parsed.relevant_procedures || []).map((p: any) => {
        console.log(`[Orchestrator]    ✅ ${p.fileName}: ${p.reason}`);
        return { fileName: p.fileName, reason: p.reason || 'Relevant to task' };
      });

      // Also include any procedures explicitly referenced in the prompt via [Procedure|...] notation
      // that might have been missed by the LLM
      const explicitProcedurePattern = /\[Procedure\|([^\]]+)\]/gi;
      let match;
      while ((match = explicitProcedurePattern.exec(userPrompt)) !== null) {
        const refName = match[1].trim().toLowerCase();
        // Find matching SOP by partial name match
        for (const [fileName] of sopSummaries) {
          if (fileName.toLowerCase().includes(refName.toLowerCase()) ||
              refName.toLowerCase().includes(fileName.toLowerCase().replace(/\.docx|\.pdf|\.txt/gi, ''))) {
            if (!relevant.some((r: { fileName: string; reason: string }) => r.fileName === fileName)) {
              console.log(`[Orchestrator]    ✅ ${fileName}: (explicitly referenced in prompt)`);
              relevant.push({ fileName, reason: 'Explicitly referenced in prompt' });
            }
          }
        }
      }

      console.log(`[Orchestrator] 🧠 SMART PROCEDURE SELECTION: ${relevant.length} of ${sopSummaries.size} procedures identified as relevant`);

      return relevant;

    } catch (err) {
      console.error('[Orchestrator] ❌ Procedure identification failed — falling back to all procedures:', err);
      return Array.from(sopSummaries.keys()).map(fileName => ({ 
        fileName, 
        reason: 'Included due to identification failure' 
      }));
    }
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
