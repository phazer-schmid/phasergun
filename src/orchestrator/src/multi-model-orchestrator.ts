import {
  GenerationOutput,
  SourceAttribution,
  Discrepancy,
  ConfidenceRating,
  ParsedDocument,
} from '@phasergun/shared-types';
import {
  EnhancedRAGService,
  FootnoteTracker,
  buildLLMPrompt,
  parseProcedureReferences,
  parseKnowledgeSourceScopes,
  DocumentLoader,
} from '@phasergun/rag-service';
import { ModelRouter, ModelRole } from '@phasergun/llm-service';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

type PipelineStep = NonNullable<GenerationOutput['pipelineTrace']>[number];
type ModelBreakdownEntry = NonNullable<NonNullable<GenerationOutput['usageStats']>['modelBreakdown']>[number];

// ---------------------------------------------------------------------------
// MultiModelOrchestrator
// ---------------------------------------------------------------------------

/**
 * Multi-model orchestration pipeline for regulatory document generation.
 *
 * Runs four specialised models in sequence:
 *   INGESTION → DRAFTER → AUDITOR → REVISER
 *
 * The INGESTION and REVISION steps are optional and can be disabled via
 * constructor options. The AUDIT step is also optional; REVISION is
 * automatically skipped when the auditor returns findings below the
 * configured threshold.
 *
 * The existing {@link OrchestratorService} (single-model) is not modified —
 * it remains the fallback path and can still be used independently.
 */
export class MultiModelOrchestrator {
  constructor(
    private ragService: EnhancedRAGService,
    private modelRouter: ModelRouter,
    private options: {
      /** Whether to run the context-compression ingestion step. Default: true. */
      enableIngestionStep?: boolean;
      /** Whether to run the regulatory compliance audit step. Default: true. */
      enableAuditStep?: boolean;
      /**
       * Whether to run the revision step when the audit returns findings.
       * Default: true. Has no effect when enableAuditStep is false.
       */
      enableRevisionStep?: boolean;
      /**
       * Minimum character length of audit findings text required to trigger
       * the revision step. Findings shorter than this threshold are treated
       * as "no findings". Default: 50.
       */
      auditFindingsThreshold?: number;
    } = {}
  ) {}

  /**
   * Run the full multi-model pipeline for a generation request.
   *
   * Mirrors the signature of {@link OrchestratorService.generateFromPrompt}
   * so the two orchestrators are interchangeable at the call site.
   */
  async generateFromPrompt(input: {
    projectPath: string;
    primaryContextPath: string;
    prompt: string;
    options?: { topKProcedures?: number; topKContext?: number };
  }): Promise<GenerationOutput> {
    console.log('=== MultiModelOrchestrator: Generate From Prompt ===');
    console.log(`Project: ${input.projectPath}`);
    console.log(`Prompt length: ${input.prompt.length} chars`);

    try {
      // ------------------------------------------------------------------
      // Pre-flight: reference parsing + RAG retrieval
      // (identical to OrchestratorService)
      // ------------------------------------------------------------------
      const references = this.parseReferenceNotation(input.prompt);
      console.log('[MultiModelOrchestrator] Parsed reference notation:');
      console.log('  - Procedures:', references.procedures.map(p =>
        p.categoryId ? `${p.subcategoryId}/${p.categoryId}` : p.subcategoryId));
      console.log('  - Master Record fields:', references.masterRecordFields);
      console.log('  - Context docs:', references.contextDocs);

      const hasProcedureRefs = references.procedures.length > 0;
      const hasContextRefs =
        references.masterRecordFields.length > 0 || references.contextDocs.length > 0;
      const hasAnyRefs = hasProcedureRefs || hasContextRefs;

      const { ragContext, metadata, procedureChunks, contextChunks, externalStandards } =
        await this.ragService.retrieveRelevantContext(
          input.projectPath,
          input.primaryContextPath,
          input.prompt,
          {
            procedureChunks: hasProcedureRefs
              ? (input.options?.topKProcedures ?? 5)
              : (input.options?.topKProcedures ?? 2),
            contextChunks: hasContextRefs
              ? (input.options?.topKContext ?? 5)
              : (input.options?.topKContext ?? 2),
            includeFullPrimary: true,
            includeSummaries: true,
          }
        );

      // Footnote tracker — wired identically to OrchestratorService
      const footnoteTracker = new FootnoteTracker();
      footnoteTracker.addFromRetrievalResults(procedureChunks, contextChunks);
      (externalStandards as Array<{ id: string; name: string; scope: string }>).forEach(s => {
        footnoteTracker.addStandardReference(s.name, s.scope);
      });

      console.log('[MultiModelOrchestrator] Context assembled:');
      console.log('  - Retrieval mode: ' + (hasAnyRefs ? 'bracket notation (boosted)' : 'semantic search (baseline)'));
      console.log('  - Procedures: ' + metadata.procedureChunksRetrieved + ' chunks');
      console.log('  - Context files: ' + metadata.contextChunksRetrieved + ' chunks');
      console.log('  - Estimated tokens: ' + metadata.totalTokensEstimate);

      // ------------------------------------------------------------------
      // Token resolution: [Master Record|FIELD] and [Doc|Name|FIELD]
      // (identical to OrchestratorService)
      // ------------------------------------------------------------------
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

      if (generationErrors.length > 0) {
        const errorList = generationErrors.map((e, i) => `${i + 1}. ${e}`).join('\n\n');
        console.error(
          `\n[MultiModelOrchestrator] ❌ GENERATION BLOCKED — ${generationErrors.length} missing required document(s):\n${errorList}\n`
        );
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

      // Pipeline accumulators
      const pipelineTrace: PipelineStep[] = [];
      const modelBreakdown: ModelBreakdownEntry[] = [];

      // ------------------------------------------------------------------
      // Step 1 — CONTEXT INGESTION (optional)
      // Compresses large ragContext before it reaches the DRAFTER.
      // ------------------------------------------------------------------
      const enableIngestion = this.options.enableIngestionStep !== false;
      let effectiveRagContext = ragContext;

      if (enableIngestion && metadata.totalTokensEstimate > 6000) {
        const assignment = this.modelRouter.getAssignment(ModelRole.INGESTION);
        console.log(
          `[MultiModelOrchestrator] Step 1 INGESTION — model: ${assignment.modelId}, ` +
          `context estimate: ${metadata.totalTokensEstimate} tokens (threshold: 6000)`
        );

        // Instruct the ingestion model to preserve the system-instruction sections
        // verbatim while condensing the retrieved document chunks.
        const ingestionPrompt =
          'Compress the following regulatory context for use as AI system context. ' +
          'Preserve verbatim any sections beginning with "GENERATION RULES" or "You are". ' +
          'Condense retrieved document sections to key requirements and procedural mandates only. ' +
          'Maintain structured formatting.\n\n' +
          ragContext;

        const t0 = Date.now();
        const ingestionResult = await this.modelRouter.generateIngestionPrompt(ingestionPrompt);
        const durationMs = Date.now() - t0;

        effectiveRagContext = ingestionResult.generatedText ?? ragContext;
        const tokens = ingestionResult.usageStats?.tokensUsed ?? 0;
        const cost = ingestionResult.usageStats?.cost ?? 0;

        console.log(
          `[MultiModelOrchestrator] Step 1 INGESTION: ${assignment.modelId} — ${durationMs}ms, ${tokens} tokens`
        );
        pipelineTrace.push({ step: 'ingestion', modelId: assignment.modelId, durationMs, tokensUsed: tokens, promptChars: ingestionPrompt.length, responseChars: effectiveRagContext.length });
        modelBreakdown.push({ role: ModelRole.INGESTION, modelId: assignment.modelId, tokensUsed: tokens, cost });
      } else if (enableIngestion) {
        console.log(
          `[MultiModelOrchestrator] Step 1 INGESTION: skipped — ` +
          `context ${metadata.totalTokensEstimate} tokens (threshold: 6000)`
        );
      } else {
        console.log('[MultiModelOrchestrator] Step 1 INGESTION: disabled');
      }

      // ------------------------------------------------------------------
      // Step 2 — DRAFT
      // ------------------------------------------------------------------
      const draftAssignment = this.modelRouter.getAssignment(ModelRole.DRAFTER);
      const fullPrompt = buildLLMPrompt(effectiveRagContext, resolvedPrompt);

      console.log(
        `[MultiModelOrchestrator] Step 2 DRAFT — model: ${draftAssignment.modelId}, ` +
        `prompt: ${fullPrompt.length} chars`
      );

      const t2 = Date.now();
      const draftResult = await this.modelRouter.generateDraft(fullPrompt);
      const draftDuration = Date.now() - t2;

      const draftText = draftResult.generatedText ?? '';
      const draftTokens = draftResult.usageStats?.tokensUsed ?? 0;
      const draftCost = draftResult.usageStats?.cost ?? 0;

      console.log(
        `[MultiModelOrchestrator] Step 2 DRAFT: ${draftAssignment.modelId} — ${draftDuration}ms, ${draftTokens} tokens`
      );
      pipelineTrace.push({ step: 'draft', modelId: draftAssignment.modelId, durationMs: draftDuration, tokensUsed: draftTokens, promptChars: fullPrompt.length, responseChars: draftText.length });
      modelBreakdown.push({ role: ModelRole.DRAFTER, modelId: draftAssignment.modelId, tokensUsed: draftTokens, cost: draftCost });

      if (!draftText || draftText.trim().length === 0) {
        console.error('[MultiModelOrchestrator] ⚠️  DRAFTER returned empty text');
        return {
          status: 'error',
          message: 'DRAFTER model returned empty content. This may indicate a stop sequence or content filtering issue.',
          timestamp: new Date().toISOString(),
          generatedContent:
            '[ERROR: No content generated by DRAFTER]\n\n' +
            `The DRAFTER model generated ${draftTokens} tokens but returned empty text.\n` +
            'Check server logs for details.',
          usageStats: { tokensUsed: draftTokens, cost: draftCost, modelBreakdown },
          pipelineTrace,
        };
      }

      // ------------------------------------------------------------------
      // Step 3 — AUDIT
      // ------------------------------------------------------------------
      const enableAudit = this.options.enableAuditStep !== false;
      let auditText = '';

      if (enableAudit) {
        const auditAssignment = this.modelRouter.getAssignment(ModelRole.AUDITOR);

        const auditPrompt = this.buildAuditPrompt(
          draftText,
          externalStandards as Array<{ id: string; name: string; scope: string }>
        );

        console.log(
          `[MultiModelOrchestrator] Step 3 AUDIT — model: ${auditAssignment.modelId}`
        );
        console.log(
          `[MultiModelOrchestrator] Audit prompt: ${auditPrompt.length} chars (was full ragContext)`
        );

        const t3 = Date.now();
        const auditResult = await this.modelRouter.generateAuditFindings(auditPrompt);
        const auditDuration = Date.now() - t3;

        auditText = auditResult.generatedText ?? '';
        const auditTokens = auditResult.usageStats?.tokensUsed ?? 0;
        const auditCost = auditResult.usageStats?.cost ?? 0;

        console.log(
          `[MultiModelOrchestrator] Step 3 AUDIT: ${auditAssignment.modelId} — ${auditDuration}ms, ${auditTokens} tokens`
        );
        pipelineTrace.push({ step: 'audit', modelId: auditAssignment.modelId, durationMs: auditDuration, tokensUsed: auditTokens, promptChars: auditPrompt.length, responseChars: auditText.length });
        modelBreakdown.push({ role: ModelRole.AUDITOR, modelId: auditAssignment.modelId, tokensUsed: auditTokens, cost: auditCost });
      } else {
        console.log('[MultiModelOrchestrator] Step 3 AUDIT: disabled');
      }

      // ------------------------------------------------------------------
      // Step 4 — REVISION (optional; only runs when audit found issues)
      // ------------------------------------------------------------------
      const enableRevision = this.options.enableRevisionStep !== false;
      const threshold = this.options.auditFindingsThreshold ?? 50;
      const isNoFindings =
        auditText === 'NO_FINDINGS' || auditText.trimStart().startsWith('NO_FINDINGS');
      if (isNoFindings) {
        console.log('[MultiModelOrchestrator] ✓ Audit: no findings — skipping revision step');
      }
      const hasFindings = !isNoFindings && auditText.length >= threshold;

      let finalContent = draftText;

      if (enableRevision && enableAudit && hasFindings) {
        const reviserAssignment = this.modelRouter.getAssignment(ModelRole.REVISER);

        const revisionPrompt = this.buildRevisionPrompt(
          resolvedPrompt,
          draftText,
          auditText,
          externalStandards as Array<{ id: string; name: string; scope: string }>
        );

        console.log(
          `[MultiModelOrchestrator] Step 4 REVISION — model: ${reviserAssignment.modelId}, ` +
          `audit findings: ${auditText.length} chars`
        );
        console.log(
          `[MultiModelOrchestrator] Revision prompt: ${revisionPrompt.length} chars`
        );

        const t4 = Date.now();
        const revisionResult = await this.modelRouter.generateRevisionFromPrompt(revisionPrompt);
        const revisionDuration = Date.now() - t4;

        finalContent = revisionResult.generatedText ?? draftText;
        const revisionTokens = revisionResult.usageStats?.tokensUsed ?? 0;
        const revisionCost = revisionResult.usageStats?.cost ?? 0;

        console.log(
          `[MultiModelOrchestrator] Step 4 REVISION: ${reviserAssignment.modelId} — ${revisionDuration}ms, ${revisionTokens} tokens`
        );
        pipelineTrace.push({ step: 'revision', modelId: reviserAssignment.modelId, durationMs: revisionDuration, tokensUsed: revisionTokens, promptChars: revisionPrompt.length, responseChars: finalContent.length });
        modelBreakdown.push({ role: ModelRole.REVISER, modelId: reviserAssignment.modelId, tokensUsed: revisionTokens, cost: revisionCost });
      } else if (enableRevision && enableAudit && !hasFindings) {
        console.log(
          `[MultiModelOrchestrator] Step 4 REVISION: skipped — ` +
          `audit findings ${auditText.length} chars < threshold ${threshold}`
        );
      } else {
        console.log('[MultiModelOrchestrator] Step 4 REVISION: disabled');
      }

      // ------------------------------------------------------------------
      // Step 5 — ASSEMBLE OUTPUT
      // ------------------------------------------------------------------
      const totalTokens = modelBreakdown.reduce((sum, m) => sum + m.tokensUsed, 0);
      const totalCost   = modelBreakdown.reduce((sum, m) => sum + m.cost, 0);

      const sourceAttributions = this.buildSourceAttributions(footnoteTracker);
      const discrepancies      = this.trackDiscrepancies(procedureChunks, contextChunks);
      const confidence         = this.buildConfidenceRating(references, metadata, {
        tokensUsed: totalTokens,
        cost: totalCost,
      });

      console.log(
        `[MultiModelOrchestrator] Step 5 ASSEMBLE — final content: ${finalContent.length} chars`
      );
      console.log('[MultiModelOrchestrator] === Token Efficiency Report ===');
      for (const s of pipelineTrace) {
        const approxInputTokens = Math.round(s.promptChars / 4);
        console.log(
          `  ${s.step.padEnd(10)} | ${s.modelId.padEnd(20)} | ` +
          `input: ~${approxInputTokens.toLocaleString()} tokens (${s.promptChars.toLocaleString()} chars) | ` +
          `output: ${s.responseChars.toLocaleString()} chars | ` +
          `${s.durationMs}ms`
        );
      }
      const totalPromptChars = pipelineTrace.reduce((sum, s) => sum + s.promptChars, 0);
      console.log(
        `  TOTAL input: ~${Math.round(totalPromptChars / 4).toLocaleString()} tokens ` +
        `(${totalPromptChars.toLocaleString()} chars across all steps)`
      );
      console.log(
        `  TOTAL billed: ${totalTokens.toLocaleString()} tokens, cost: $${totalCost.toFixed(4)}`
      );
      console.log('=== MultiModelOrchestrator: Complete ===\n');

      return {
        status: 'complete',
        message: 'Content generated successfully via multi-model pipeline',
        timestamp: new Date().toISOString(),
        generatedContent: finalContent,
        references: sourceAttributions,
        confidence,
        discrepancies,
        auditFindings: auditText || undefined,
        pipelineTrace,
        usageStats: {
          tokensUsed: totalTokens,
          cost: totalCost,
          modelBreakdown,
        },
        metadata: {
          sources: metadata.sources,
          footnotes: footnoteTracker.getSourcesArray(),
          footnotesMap: Object.fromEntries(footnoteTracker.getSources()),
        },
      };

    } catch (error) {
      console.error('[MultiModelOrchestrator] Error:', error);
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        timestamp: new Date().toISOString(),
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers — copied verbatim from OrchestratorService
  // (kept here to avoid cross-package coupling; only within orchestrator package)
  // ---------------------------------------------------------------------------

  /**
   * Build the prompt sent to the AUDITOR model.
   *
   * Intentionally lean — contains only the draft and the applicable regulatory
   * standards. The full RAG context is NOT included here; the auditor only
   * needs to evaluate the draft against known standards, not re-read all SOPs.
   *
   * The sentinel "NO_FINDINGS" (returned verbatim when the auditor finds no
   * gaps) is checked downstream to skip the revision step without a threshold
   * comparison.
   */
  private buildAuditPrompt(
    draftContent: string,
    externalStandards: Array<{ id: string; name: string; scope: string }>
  ): string {
    const fallback = [
      { id: 'iso14971', name: 'ISO 14971',        scope: 'Risk Management for Medical Devices' },
      { id: 'fda820',   name: 'FDA 21 CFR 820.30', scope: 'Design Controls' },
    ];
    const standards = externalStandards.length > 0 ? externalStandards : fallback;
    const standardsList = standards.map(s => `- ${s.name}: ${s.scope}`).join('\n');

    return (
      `=== REGULATORY STANDARDS ===\n${standardsList}\n\n` +
      `=== DRAFT DOCUMENT ===\n${draftContent}\n\n` +
      `=== TASK ===\n` +
      `You are a regulatory compliance auditor for medical device submissions. ` +
      `Review the draft document against each standard listed above. ` +
      `Return a NUMBERED LIST of findings only — no prose preamble. ` +
      `Each finding must cite the specific standard and clause it relates to. ` +
      `If there are no findings, respond with exactly: NO_FINDINGS`
    );
  }

  /**
   * Build the prompt sent to the REVISER model.
   *
   * Intentionally lean — contains only the original user task, the draft, and
   * the audit findings. The full RAG context is NOT included; the reviser's
   * job is to address identified findings within the existing draft, not to
   * re-retrieve knowledge.
   */
  private buildRevisionPrompt(
    originalUserPrompt: string,
    draftContent: string,
    auditFindings: string,
    externalStandards: Array<{ id: string; name: string; scope: string }>
  ): string {
    return (
      `=== ORIGINAL TASK ===\n${originalUserPrompt}\n\n` +
      `=== DRAFT ===\n${draftContent}\n\n` +
      `=== AUDIT FINDINGS ===\n${auditFindings}\n\n` +
      `=== TASK ===\n` +
      `Revise the draft to address all audit findings listed above. ` +
      `Preserve the document structure and submission voice. ` +
      `Do not introduce content not supported by the draft or findings. ` +
      `Write the complete revised document — not a diff or commentary.`
    );
  }

  /**
   * Parse reference_notation patterns from the prompt.
   * Extracts bracket-based references per primary-context.yaml.
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

    result.procedures = parseProcedureReferences(prompt);

    const masterRecordPattern = /\[Master Record\|([^\]]+)\]/gi;
    let match;
    while ((match = masterRecordPattern.exec(prompt)) !== null) {
      result.masterRecordFields.push(match[1].trim());
    }

    const contextPattern = /\[Context\|([^|\]]+)\|([^\]]+)\]/gi;
    while ((match = contextPattern.exec(prompt)) !== null) {
      result.contextDocs.push({
        folder: match[1].trim(),
        filename: match[2].trim(),
      });
    }

    result.knowledgeScopes = parseKnowledgeSourceScopes(prompt);
    if (result.knowledgeScopes.size > 0) {
      console.log(
        `[MultiModelOrchestrator] ℹ️  Knowledge source scopes: @${Array.from(result.knowledgeScopes).join(', @')} (full enforcement not yet implemented)`
      );
    }

    const legacyData = this.parseLegacyInputDataSection(prompt);
    if (legacyData.sops.length > 0) {
      console.log('[MultiModelOrchestrator] ℹ️  Found legacy INPUT DATA section, merging with bracket notation');
      result.procedures.push(...legacyData.sops.map(s => ({ subcategoryId: 'sops', categoryId: s })));
    }
    if (legacyData.includePrimaryContext) {
      console.log('[MultiModelOrchestrator] ℹ️  Legacy prompt requests primary context');
    }

    return result;
  }

  /**
   * Legacy support: Parse the old "INPUT DATA:" section format.
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

    const inputDataMatch = prompt.match(/INPUT DATA:?\s*(.*?)(?=\n+[A-Z][A-Z\s]*:|$)/is);
    if (!inputDataMatch) {
      return result;
    }

    const inputDataSection = inputDataMatch[1];

    const sopMatches = inputDataSection.match(/SOP\s*\d{4}|SOP\s+for\s+[\w\s]+/gi);
    if (sopMatches) {
      result.sops = sopMatches.map(s => s.trim());
    }

    if (/primary\s+context/i.test(inputDataSection)) {
      result.includePrimaryContext = true;
    }

    if (/device|product\s+information/i.test(inputDataSection)) {
      result.includePrimaryContext = true;
    }

    const contextMatches = inputDataSection.match(/(?:context|predicate|market)[\w\s]*/gi);
    if (contextMatches) {
      result.contextFiles = contextMatches.map(c => c.trim()).filter(c => c.length > 0);
    }

    return result;
  }

  /**
   * Resolve [Master Record|FIELD_NAME] tokens in the prompt.
   */
  private async resolveMasterRecordTokens(
    prompt: string,
    projectPath: string
  ): Promise<{ resolved: string; fileFound: boolean; unresolvedFields: string[] }> {
    const contextPath = path.join(projectPath, 'Context');
    const loader = new DocumentLoader();

    let masterRecord: ParsedDocument | null = null;
    try {
      masterRecord = await loader.loadMasterRecord(contextPath);
    } catch (err) {
      console.warn('[MultiModelOrchestrator] Could not load Master Record:', err);
      return { resolved: prompt, fileFound: false, unresolvedFields: [] };
    }

    if (!masterRecord) {
      return { resolved: prompt, fileFound: false, unresolvedFields: [] };
    }

    let fields = await DocumentLoader.parseMasterRecordFieldsFromFile(masterRecord.filePath);
    if (fields.size === 0) {
      console.warn('[MultiModelOrchestrator] HTML parse returned 0 fields — falling back to raw text parser');
      fields = DocumentLoader.parseMasterRecordFields(masterRecord.content);
      fields = DocumentLoader.synthesizeCompositeFields(fields);
    }
    console.log(`[MultiModelOrchestrator] Master Record parsed: ${fields.size} field(s) available`);

    const unresolvedFields: string[] = [];
    let resolved = prompt;
    const tokenPattern = /\[Master Record\|([^\]]+)\]/gi;
    resolved = resolved.replace(tokenPattern, (_match, fieldName) => {
      const key = fieldName.trim().toUpperCase();
      const value = fields.get(key);
      if (value !== undefined) {
        const preview = value.length > 60 ? value.substring(0, 60) + '…' : value;
        console.log(`[MultiModelOrchestrator] ✓ Resolved [Master Record|${key}] → "${preview}"`);
        return value;
      } else {
        unresolvedFields.push(key);
        console.warn(`[MultiModelOrchestrator] ⚠️  [Master Record|${key}] not found — substituting clean placeholder`);
        return `(${key}: not configured in Master Record)`;
      }
    });

    return { resolved, fileFound: true, unresolvedFields };
  }

  /**
   * Resolve [Doc|BootstrapDocName|FIELD_NAME] tokens in the prompt.
   */
  private async resolveDocFieldTokens(
    prompt: string,
    projectPath: string
  ): Promise<{ resolved: string; missingDocs: string[]; unresolvedFields: Array<{ doc: string; field: string }> }> {
    const contextPath = path.join(projectPath, 'Context');
    const loader = new DocumentLoader();

    const docNames = new Set<string>();
    const scanPattern = /\[Doc\|([^|\]]+)\|([^\]]+)\]/gi;
    let scanMatch;
    while ((scanMatch = scanPattern.exec(prompt)) !== null) {
      docNames.add(scanMatch[1].trim());
    }

    if (docNames.size === 0) return { resolved: prompt, missingDocs: [], unresolvedFields: [] };

    console.log(`[MultiModelOrchestrator] 📄 Resolving [Doc|...] tokens for: ${Array.from(docNames).join(', ')}`);

    const docFieldMaps = new Map<string, Map<string, string>>();
    const missingDocs: string[] = [];

    for (const docName of docNames) {
      const doc = await loader.loadBootstrapDocument(contextPath, docName);
      if (doc) {
        const fields = DocumentLoader.parseMasterRecordFields(doc.content);
        const key = docName.replace(/\.docx$/i, '').toLowerCase();
        docFieldMaps.set(key, fields);
        console.log(`[MultiModelOrchestrator] ✓ Parsed ${fields.size} field(s) from "${docName}"`);
      } else {
        console.warn(`[MultiModelOrchestrator] ⚠️  [Doc|${docName}|...] — bootstrap doc not found`);
        missingDocs.push(docName);
      }
    }

    const unresolvedFields: Array<{ doc: string; field: string }> = [];
    let resolved = prompt;
    const tokenPattern = /\[Doc\|([^|\]]+)\|([^\]]+)\]/gi;
    resolved = resolved.replace(tokenPattern, (_match, docName, fieldName) => {
      const key = docName.trim().replace(/\.docx$/i, '').toLowerCase();
      const fieldMap = docFieldMaps.get(key);
      if (!fieldMap) {
        return `(${fieldName.trim()}: document "${docName}" not found)`;
      }
      const fieldKey = fieldName.trim().toUpperCase();
      const value = fieldMap.get(fieldKey);
      if (value !== undefined) {
        const preview = value.length > 60 ? value.substring(0, 60) + '…' : value;
        console.log(`[MultiModelOrchestrator] ✓ Resolved [Doc|${docName}|${fieldKey}] → "${preview}"`);
        return value;
      } else {
        unresolvedFields.push({ doc: docName, field: fieldKey });
        console.warn(`[MultiModelOrchestrator] ⚠️  [Doc|${docName}|${fieldKey}] — field not found — substituting clean placeholder`);
        return `(${fieldKey}: not configured in ${docName})`;
      }
    });

    return { resolved, missingDocs, unresolvedFields };
  }

  /**
   * Build source attributions from footnote tracker.
   */
  private buildSourceAttributions(tracker: FootnoteTracker): SourceAttribution[] {
    const attributions: SourceAttribution[] = [];
    const sources = tracker.getSources();

    for (const [id, sourceRef] of sources) {
      let category: SourceAttribution['category'] = 'general';

      if (sourceRef.category === 'procedure') {
        category = 'procedure';
      } else if (sourceRef.category === 'context') {
        category = 'context';
      } else if (sourceRef.category === 'standard') {
        category = 'compliance';
      }

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
   * Track discrepancies between sources (placeholder for future enhancement).
   */
  private trackDiscrepancies(
    _procedureChunks: any[],
    _contextChunks: any[]
  ): Discrepancy[] {
    return [];
  }

  /**
   * Calculate confidence rating based on retrieval success and generation quality.
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
    const requestedCount =
      references.procedures.length +
      references.masterRecordFields.length +
      references.contextDocs.length;

    const retrievedCount =
      metadata.procedureChunksRetrieved + metadata.contextChunksRetrieved;
    const sourceCount  = metadata.sources.length;
    const tokensUsed   = usageStats?.tokensUsed || 0;

    let sourceAgreement: 'High' | 'Medium' | 'Low' = 'Medium';
    if (requestedCount === 0) {
      sourceAgreement = sourceCount >= 3 ? 'High' : sourceCount >= 1 ? 'Medium' : 'Low';
    } else {
      sourceAgreement = retrievedCount >= requestedCount ? 'High' :
                        retrievedCount >= requestedCount / 2 ? 'Medium' : 'Low';
    }

    let completeness: 'High' | 'Medium' | 'Low' = 'High';
    if (requestedCount > 0 && retrievedCount === 0) {
      completeness = 'Low';
    } else if (requestedCount > 0 && retrievedCount < requestedCount) {
      completeness = 'Medium';
    }

    const complianceAlignment: 'High' | 'Medium' | 'Low' = 'High';
    const procedureAdherence: 'High' | 'Medium' | 'Low' =
      metadata.procedureChunksRetrieved > 0 ? 'High' : 'Medium';

    let level: 'High' | 'Medium' | 'Low';
    if (sourceAgreement === 'High' && completeness === 'High' && tokensUsed > 100) {
      level = 'High';
    } else if (sourceAgreement === 'Low' || completeness === 'Low' || tokensUsed < 50) {
      level = 'Low';
    } else {
      level = 'Medium';
    }

    const rationale = this.buildConfidenceRationale(
      level, requestedCount, retrievedCount, sourceCount, tokensUsed
    );

    return {
      level,
      rationale,
      criteria: { sourceAgreement, completeness, complianceAlignment, procedureAdherence }
    };
  }

  /**
   * Build confidence rationale text.
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
