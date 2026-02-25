import { GenerationOutput, SourceAttribution, Discrepancy, ConfidenceRating } from '@phasergun/shared-types';
import { EnhancedRAGService, FootnoteTracker, SourceReference, buildLLMPrompt, parseProcedureReferences, parseKnowledgeSourceScopes } from '@phasergun/rag-service';
import { DocumentLoader } from '@phasergun/rag-service';
import { LLMService } from '@phasergun/llm-service';
import * as path from 'path';

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
      console.log(`[Orchestrator]   - Procedures requested:`, references.procedures.map(p => p.categoryId ? `${p.subcategoryId}/${p.categoryId}` : p.subcategoryId));
      console.log(`[Orchestrator]   - Master Record fields:`, references.masterRecordFields);
      console.log(`[Orchestrator]   - Context documents:`, references.contextDocs);
      
      // Step 2: Retrieve relevant context using intelligent filtering
      const hasProcedureRefs = references.procedures.length > 0;
      const hasContextRefs = references.masterRecordFields.length > 0 || references.contextDocs.length > 0;
      const hasAnyRefs = hasProcedureRefs || hasContextRefs;

      const { ragContext, metadata, procedureChunks, contextChunks, externalStandards } =
        await this.ragService.retrieveRelevantContext(
          input.projectPath,
          input.primaryContextPath,
          input.prompt,
          {
            // Use parsed references to boost retrieval, but always retrieve baseline chunks
            procedureChunks: hasProcedureRefs 
              ? (input.options?.topKProcedures ?? 5)
              : (input.options?.topKProcedures ?? 3),
            contextChunks: hasContextRefs
              ? (input.options?.topKContext ?? 5)
              : (input.options?.topKContext ?? 2),
            includeFullPrimary: true,  // Always include primary context YAML
            includeSummaries: true,  // Always include SOP summaries
          }
        );
      
      // Step 3: Initialize footnote tracker and track sources
      const footnoteTracker = new FootnoteTracker();
      footnoteTracker.addFromRetrievalResults(procedureChunks, contextChunks);

      // Always add external_standards (retrieval_priority: always per primary-context.yaml)
      externalStandards.forEach(s => {
        footnoteTracker.addStandardReference(s.name, s.scope);
      });
      
      console.log('[Orchestrator] Context assembled:');
      console.log('  - Retrieval mode: ' + (hasAnyRefs ? 'bracket notation (boosted)' : 'semantic search (baseline)'));
      console.log('  - Primary context: included');
      const procedureRefSummary = references.procedures.map(p => p.categoryId ? `${p.subcategoryId}/${p.categoryId}` : p.subcategoryId).join(', ');
      console.log('  - Procedures: ' + metadata.procedureChunksRetrieved + ' chunks' + (hasProcedureRefs ? ` (boosted for: ${procedureRefSummary})` : ''));
      console.log('  - Context files: ' + metadata.contextChunksRetrieved + ' chunks' + (hasContextRefs ? ' (boosted for explicit refs)' : ''));
      console.log('  - Footnotes tracked: ' + footnoteTracker.getSourceCount() + ' sources');
      console.log('  - Estimated tokens: ' + metadata.totalTokensEstimate);
      
      // Step 4a: Resolve [Master Record|FIELD] tokens server-side.
      // Returns file-found status so we can block generation if the file is missing.
      let resolvedPrompt = input.prompt;
      const generationErrors: string[] = [];

      if (references.masterRecordFields.length > 0) {
        const mrResult = await this.resolveMasterRecordTokens(resolvedPrompt, input.projectPath);
        resolvedPrompt = mrResult.resolved;
        if (!mrResult.fileFound) {
          generationErrors.push(
            `Master Record file not found in ${input.projectPath}/Context/\n` +
            `  Referenced fields: ${references.masterRecordFields.join(', ')}\n` +
            `  Fix: Add "Project-Master-Record.docx" (or any file with "master" and "record" in the name) to the Context folder.`
          );
        }
      }

      // Step 4b: Resolve [Doc|BootstrapName|FIELD] tokens server-side.
      const hasDocFieldRefs = /\[Doc\|[^|\]]+\|[^\]]+\]/i.test(resolvedPrompt);
      if (hasDocFieldRefs) {
        const dfResult = await this.resolveDocFieldTokens(resolvedPrompt, input.projectPath);
        resolvedPrompt = dfResult.resolved;
        for (const missingDoc of dfResult.missingDocs) {
          generationErrors.push(
            `Bootstrap document not found: "${missingDoc}"\n` +
            `  Fix: Add this file to the Context folder (version suffixes like -V4 are OK).`
          );
        }
      }

      // Step 4c: Block generation if any critical document references could not be satisfied.
      // PhaserGun never hallucinate missing information — it returns a clear error instead.
      if (generationErrors.length > 0) {
        const errorList = generationErrors.map((e, i) => `${i + 1}. ${e}`).join('\n\n');
        console.error(`\n[Orchestrator] ❌ GENERATION BLOCKED — ${generationErrors.length} missing required document(s):\n${errorList}\n`);
        return {
          status: 'error',
          message: `Generation blocked — required documents not found:\n\n${errorList}`,
          timestamp: new Date().toISOString(),
          generatedContent:
            `## ⚠️ Generation Blocked — Missing Required Documents\n\n` +
            `PhaserGun cannot generate this document because the following referenced files were not found:\n\n` +
            generationErrors.map((e, i) => `**${i + 1}.** ${e}`).join('\n\n') +
            `\n\nPlease add the missing files and try again.`,
        };
      }

      // Step 4d: Build the LLM prompt (single source of truth: prompt-builder.ts in rag-service)
      const fullPrompt = buildLLMPrompt(ragContext, resolvedPrompt);
      
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
   * Parse reference_notation patterns from the prompt.
   * Extracts bracket-based references per primary-context.yaml.
   *
   * Patterns:
   * - [Procedure|sops|design_control] → new format (subcategoryId + categoryId)
   * - [Procedure|Design Control Procedure] → legacy format (logs deprecation warning)
   * - [Master Record|{field}] → e.g., [Master Record|DEVICE_NAME]
   * - [Context|{folder}|{filename}] → e.g., [Context|Regulatory Strategy|predicate.docx]
   * - @{source_id} → knowledge source scope (e.g., @sops, @global_standards)
   */
  private parseReferenceNotation(prompt: string): {
    procedures: Array<{ subcategoryId: string; categoryId?: string }>;
    masterRecordFields: string[];
    contextDocs: Array<{ folder: string; filename: string }>;
    knowledgeScopes: Set<string>;
  } {
    const result = {
      procedures: [] as Array<{ subcategoryId: string; categoryId?: string }>,
      masterRecordFields: [] as string[],
      contextDocs: [] as Array<{ folder: string; filename: string }>,
      knowledgeScopes: new Set<string>(),
    };

    // Pattern 1: [Procedure|...] — delegated to reference-parser for new/legacy format handling
    result.procedures = parseProcedureReferences(prompt);

    // Pattern 2: [Master Record|{field}]
    const masterRecordPattern = /\[Master Record\|([^\]]+)\]/gi;
    let match;
    while ((match = masterRecordPattern.exec(prompt)) !== null) {
      result.masterRecordFields.push(match[1].trim());
    }

    // Pattern 3: [Context|{folder}|{filename}]
    const contextPattern = /\[Context\|([^|\]]+)\|([^\]]+)\]/gi;
    while ((match = contextPattern.exec(prompt)) !== null) {
      result.contextDocs.push({
        folder: match[1].trim(),
        filename: match[2].trim(),
      });
    }

    // Pattern 4: @{source_id} — knowledge source scope references
    result.knowledgeScopes = parseKnowledgeSourceScopes(prompt);
    if (result.knowledgeScopes.size > 0) {
      console.log(
        `[Orchestrator] ℹ️  Knowledge source scopes: @${Array.from(result.knowledgeScopes).join(', @')} (full enforcement not yet implemented)`
      );
    }

    // LEGACY SUPPORT: Also parse old "INPUT DATA:" section for backwards compatibility
    const legacyData = this.parseLegacyInputDataSection(prompt);
    if (legacyData.sops.length > 0) {
      console.log('[Orchestrator] ℹ️  Found legacy INPUT DATA section, merging with bracket notation');
      result.procedures.push(...legacyData.sops.map(s => ({ subcategoryId: 'sops', categoryId: s })));
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
   * Resolve [Master Record|FIELD_NAME] tokens in the prompt by looking up actual field
   * values from the Project-Master-Record.docx file on disk.
   *
   * Implements primary-context.yaml → generation_workflow.processing.step_4:
   *   "Retrieve [Master Record|field] values from @knowledge_sources.master_record"
   * and reference_notation.master_record_field:
   *   "PG replaces the reference with the field value and cites the source field"
   *
   * Unresolved fields (not found in the master record) are left as-is so the LLM
   * will at least see the bracket notation and can flag a discrepancy.
   */
  private async resolveMasterRecordTokens(
    prompt: string,
    projectPath: string
  ): Promise<{ resolved: string; fileFound: boolean; unresolvedFields: string[] }> {
    const contextPath = path.join(projectPath, 'Context');
    const loader = new DocumentLoader();

    let masterRecord: import('@phasergun/shared-types').ParsedDocument | null = null;
    try {
      masterRecord = await loader.loadMasterRecord(contextPath);
    } catch (err) {
      console.warn('[Orchestrator] Could not load Master Record:', err);
      return { resolved: prompt, fileFound: false, unresolvedFields: [] };
    }

    if (!masterRecord) {
      return { resolved: prompt, fileFound: false, unresolvedFields: [] };
    }

    // Prefer HTML-based parsing (handles bold+inline and table formats in Word docs).
    // Fall back to raw-text parsing if the file-based method returns nothing.
    let fields = await DocumentLoader.parseMasterRecordFieldsFromFile(masterRecord.filePath);
    if (fields.size === 0) {
      console.warn('[Orchestrator] HTML parse returned 0 fields — falling back to raw text parser');
      fields = DocumentLoader.parseMasterRecordFields(masterRecord.content);
      fields = DocumentLoader.synthesizeCompositeFields(fields);
    }
    console.log(`[Orchestrator] Master Record parsed: ${fields.size} field(s) available for substitution`);

    const unresolvedFields: string[] = [];
    let resolved = prompt;
    const tokenPattern = /\[Master Record\|([^\]]+)\]/gi;
    resolved = resolved.replace(tokenPattern, (_match, fieldName) => {
      const key = fieldName.trim().toUpperCase();
      const value = fields.get(key);
      if (value !== undefined) {
        const preview = value.length > 60 ? value.substring(0, 60) + '…' : value;
        console.log(`[Orchestrator] ✓ Resolved [Master Record|${key}] → "${preview}"`);
        return value;
      } else {
        unresolvedFields.push(key);
        console.warn(`[Orchestrator] ⚠️  [Master Record|${key}] not found in master record — substituting clean placeholder`);
        // Return clean text (no bracket notation) so the LLM doesn't output raw syntax
        return `(${key}: not configured in Master Record)`;
      }
    });

    return { resolved, fileFound: true, unresolvedFields };
  }

  /**
   * Resolve [Doc|BootstrapDocName|FIELD_NAME] tokens in the prompt by loading the referenced
   * bootstrap document from the project's Context folder and extracting field values.
   *
   * Implements primary-context.yaml → generation_workflow.processing.step_5:
   *   "Retrieve [Doc|document|field] values from bootstrap-resolved documents"
   * and reference_notation.document_field:
   *   "PG replaces the reference with the field value and cites the document and field"
   *
   * Unresolved fields are left as-is so the LLM can flag them.
   */
  private async resolveDocFieldTokens(
    prompt: string,
    projectPath: string
  ): Promise<{ resolved: string; missingDocs: string[]; unresolvedFields: Array<{ doc: string; field: string }> }> {
    const contextPath = path.join(projectPath, 'Context');
    const loader = new DocumentLoader();

    // Collect the unique bootstrap document names referenced in the prompt
    const docNames = new Set<string>();
    const scanPattern = /\[Doc\|([^|\]]+)\|([^\]]+)\]/gi;
    let scanMatch;
    while ((scanMatch = scanPattern.exec(prompt)) !== null) {
      docNames.add(scanMatch[1].trim());
    }

    if (docNames.size === 0) return { resolved: prompt, missingDocs: [], unresolvedFields: [] };

    console.log(`[Orchestrator] 📄 Resolving [Doc|...] tokens for: ${Array.from(docNames).join(', ')}`);

    // Load each referenced bootstrap document and parse its fields
    const docFieldMaps = new Map<string, Map<string, string>>();
    const missingDocs: string[] = [];

    for (const docName of docNames) {
      const doc = await loader.loadBootstrapDocument(contextPath, docName);
      if (doc) {
        const fields = DocumentLoader.parseMasterRecordFields(doc.content);
        const key = docName.replace(/\.docx$/i, '').toLowerCase();
        docFieldMaps.set(key, fields);
        console.log(`[Orchestrator] ✓ Parsed ${fields.size} field(s) from "${docName}"`);
      } else {
        console.warn(`[Orchestrator] ⚠️  [Doc|${docName}|...] — bootstrap doc not found`);
        missingDocs.push(docName);
      }
    }

    // Substitute every [Doc|DocName|FIELD] token
    const unresolvedFields: Array<{ doc: string; field: string }> = [];
    let resolved = prompt;
    const tokenPattern = /\[Doc\|([^|\]]+)\|([^\]]+)\]/gi;
    resolved = resolved.replace(tokenPattern, (_match, docName, fieldName) => {
      const key = docName.trim().replace(/\.docx$/i, '').toLowerCase();
      const fieldMap = docFieldMaps.get(key);
      if (!fieldMap) {
        // Missing doc already recorded above; use clean placeholder
        return `(${fieldName.trim()}: document "${docName}" not found)`;
      }
      const fieldKey = fieldName.trim().toUpperCase();
      const value = fieldMap.get(fieldKey);
      if (value !== undefined) {
        const preview = value.length > 60 ? value.substring(0, 60) + '…' : value;
        console.log(`[Orchestrator] ✓ Resolved [Doc|${docName}|${fieldKey}] → "${preview}"`);
        return value;
      } else {
        unresolvedFields.push({ doc: docName, field: fieldKey });
        console.warn(`[Orchestrator] ⚠️  [Doc|${docName}|${fieldKey}] — field not found — substituting clean placeholder`);
        return `(${fieldKey}: not configured in ${docName})`;
      }
    });

    return { resolved, missingDocs, unresolvedFields };
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
      procedures: Array<{ subcategoryId: string; categoryId?: string }>;
      masterRecordFields: string[];
      contextDocs: Array<{ folder: string; filename: string }>;
      knowledgeScopes?: Set<string>;
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
