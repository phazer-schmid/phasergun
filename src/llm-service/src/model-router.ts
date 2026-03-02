import { LLMResponse, KnowledgeContext } from '@phasergun/shared-types';
import { LLMService } from './index';
import { AnthropicLLMService } from './anthropic-service';
import { OpenAILLMService } from './openai-service';
import {
  ProviderConfig,
  ProviderMode,
  ModelRole,
  ModelAssignment,
  buildProviderConfigFromEnv,
} from './provider-config';

// ---------------------------------------------------------------------------
// Static prompt prefixes
// ---------------------------------------------------------------------------

/**
 * System instruction prepended to every ingestion prompt.
 * Skipped when the raw prompt already looks like a JSON object (starts with "{").
 */
const INGESTION_PREFIX =
  'Respond in structured JSON. Be concise.';

/**
 * System instruction prepended to every audit prompt.
 * Instructs the reasoning model to act as a strict regulatory compliance
 * auditor and return an exhaustive structured findings list.
 */
const AUDITOR_PREFIX =
  'You are a regulatory compliance auditor. ' +
  'Identify gaps, missing justifications, and logic errors. ' +
  'Respond with a structured list of findings. Be exhaustive.';

// ---------------------------------------------------------------------------
// ModelRouter
// ---------------------------------------------------------------------------

/**
 * Central orchestration hub for the multi-model generation pipeline.
 *
 * Holds exactly one {@link LLMService} per generative {@link ModelRole} and
 * exposes role-specific generation methods with appropriate prompt shaping
 * for each role's purpose. The EMBEDDINGS role is intentionally excluded —
 * vector embedding is owned by `rag-core`.
 *
 * Model routing rules:
 * - DIRECT mode + modelId starts with "claude-" → {@link AnthropicLLMService}
 * - Everything else → {@link OpenAILLMService} (covers Azure Foundry too)
 */
export class ModelRouter {
  private services: Map<ModelRole, LLMService>;

  /**
   * Constructs a router and eagerly instantiates one LLM service per
   * generative role (INGESTION, DRAFTER, AUDITOR, REVISER).
   *
   * @param config - Fully-resolved provider configuration. Use
   *   {@link buildProviderConfigFromEnv} or {@link createModelRouter} to
   *   obtain one from environment variables.
   */
  constructor(private config: ProviderConfig) {
    this.services = new Map();

    for (const role of [
      ModelRole.INGESTION,
      ModelRole.DRAFTER,
      ModelRole.AUDITOR,
      ModelRole.REVISER,
    ] as ModelRole[]) {
      this.services.set(role, this.instantiateService(role));
    }
  }

  // ---------------------------------------------------------------------------
  // Public inspection
  // ---------------------------------------------------------------------------

  /**
   * Return the {@link ModelAssignment} for a given role.
   *
   * Useful for callers that need to surface model IDs in logs or traces
   * (e.g., {@link MultiModelOrchestrator}) without holding a separate
   * reference to the {@link ProviderConfig}.
   */
  getAssignment(role: ModelRole): ModelAssignment {
    return this.config.roleAssignments[role];
  }

  // ---------------------------------------------------------------------------
  // Public generation methods
  // ---------------------------------------------------------------------------

  /**
   * Run a fast structured-extraction pass against the INGESTION model.
   *
   * Use for: SOP parsing, chunk summarisation, field extraction.
   *
   * A "Respond in structured JSON. Be concise." instruction is prepended to
   * the prompt unless the prompt already opens with a `{` (i.e., the caller
   * is passing a pre-formed JSON task and wants no extra wrapping).
   *
   * @param prompt  - Task prompt.
   * @param context - Optional RAG knowledge context.
   */
  async generateIngestionPrompt(
    prompt: string,
    context?: KnowledgeContext
  ): Promise<LLMResponse> {
    const enriched = prompt.trimStart().startsWith('{')
      ? prompt
      : `${INGESTION_PREFIX}\n\n${prompt}`;

    return this.service(ModelRole.INGESTION).generateText(enriched, context);
  }

  /**
   * Generate a primary DHF narrative draft using the DRAFTER model.
   *
   * Use for: writing DHF sections, tables, submission narrative.
   *
   * @param prompt  - Task prompt (typically assembled by the orchestrator).
   * @param context - Optional RAG knowledge context.
   */
  async generateDraft(
    prompt: string,
    context?: KnowledgeContext
  ): Promise<LLMResponse> {
    return this.service(ModelRole.DRAFTER).generateText(prompt, context);
  }

  /**
   * Run an ISO 14971 / 820.30 compliance gap analysis using the AUDITOR model.
   *
   * Use for: identifying missing justifications, logic errors, regulatory gaps
   * in a draft document before the final revision pass.
   *
   * A regulatory auditor persona and exhaustive-findings instruction are
   * prepended to every prompt.
   *
   * @param prompt  - Draft content or specific compliance question.
   * @param context - Optional RAG knowledge context.
   */
  async generateAuditFindings(
    prompt: string,
    context?: KnowledgeContext
  ): Promise<LLMResponse> {
    const enriched = `${AUDITOR_PREFIX}\n\n${prompt}`;
    return this.service(ModelRole.AUDITOR).generateText(enriched, context);
  }

  /**
   * Produce a revised document that incorporates audit findings.
   *
   * The method builds a structured prompt that surfaces the original task,
   * the draft, and the audit findings as system-level context (before the
   * `=== TASK ===` marker), so the REVISER model treats them as "things I
   * know" rather than user instructions it can argue with.
   *
   * @param draftContent    - Raw draft produced by {@link generateDraft}.
   * @param auditFindings   - Findings text produced by {@link generateAuditFindings}.
   * @param originalPrompt  - The original generation task prompt.
   * @param context         - Optional RAG knowledge context.
   */
  async generateRevision(
    draftContent: string,
    auditFindings: string,
    originalPrompt: string,
    context?: KnowledgeContext
  ): Promise<LLMResponse> {
    const combined =
      `=== ORIGINAL TASK ===\n${originalPrompt}\n\n` +
      `=== DRAFT ===\n${draftContent}\n\n` +
      `=== AUDIT FINDINGS ===\n${auditFindings}\n\n` +
      `=== TASK ===\n` +
      `Revise the draft to address all audit findings while preserving ` +
      `the structure and submission voice of the original draft.`;

    return this.service(ModelRole.REVISER).generateText(combined, context);
  }

  /**
   * Produce a revised document from a fully pre-assembled revision prompt.
   *
   * Use when the orchestrator builds the complete structured prompt itself
   * (e.g. to include regulatory standards context or custom task instructions)
   * and needs to route directly to the REVISER model without additional
   * wrapping by this class.
   *
   * @param prompt  - Fully-assembled revision prompt.
   * @param context - Optional RAG knowledge context.
   */
  async generateRevisionFromPrompt(
    prompt: string,
    context?: KnowledgeContext
  ): Promise<LLMResponse> {
    return this.service(ModelRole.REVISER).generateText(prompt, context);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /** Retrieve the LLMService for a role, throwing if it was never wired. */
  private service(role: ModelRole): LLMService {
    const svc = this.services.get(role);
    if (!svc) {
      throw new Error(`[ModelRouter] No service registered for role: ${role}`);
    }
    return svc;
  }

  /**
   * Instantiate the appropriate {@link LLMService} for a given role.
   *
   * Routing logic:
   * - DIRECT mode + modelId starts with "claude-" → AnthropicLLMService
   * - All other cases (OpenAI models, Azure Foundry) → OpenAILLMService
   */
  private instantiateService(role: ModelRole): LLMService {
    const { modelId } = this.config.roleAssignments[role];

    if (
      this.config.mode === ProviderMode.DIRECT &&
      modelId.startsWith('claude-')
    ) {
      if (!this.config.anthropicApiKey) {
        throw new Error(
          `[ModelRouter] anthropicApiKey is required for role ${role} (model: ${modelId})`
        );
      }
      console.log(
        `[ModelRouter] Role ${role} → AnthropicLLMService (${modelId})`
      );
      return new AnthropicLLMService(this.config.anthropicApiKey, modelId);
    }

    console.log(
      `[ModelRouter] Role ${role} → OpenAILLMService (${modelId})`
    );
    return new OpenAILLMService(this.config, role);
  }
}

// ---------------------------------------------------------------------------
// Convenience factory
// ---------------------------------------------------------------------------

/**
 * Build a {@link ModelRouter} from environment variables, with optional
 * programmatic overrides merged on top.
 *
 * `roleAssignments` overrides are shallow-merged per-role, so passing
 * `{ roleAssignments: { [ModelRole.DRAFTER]: { modelId: 'gpt-4o', maxTokens: 4096 } } }`
 * only replaces the DRAFTER entry while leaving other roles at their
 * env-derived values.
 *
 * @param overrides - Partial {@link ProviderConfig} to layer on top of the
 *   env-derived base configuration.
 */
export function createModelRouter(overrides?: Partial<ProviderConfig>): ModelRouter {
  const base = buildProviderConfigFromEnv();

  if (!overrides) {
    return new ModelRouter(base);
  }

  const merged: ProviderConfig = {
    ...base,
    ...overrides,
    // Deep-merge roleAssignments so a partial override doesn't wipe out all
    // other roles — callers only need to supply the roles they want to change.
    roleAssignments: {
      ...base.roleAssignments,
      ...(overrides.roleAssignments ?? {}),
    },
  };

  return new ModelRouter(merged);
}
