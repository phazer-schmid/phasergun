/**
 * Provider Configuration Layer
 *
 * Decouples model selection and endpoint routing from generation logic.
 * Supports direct API calls (OpenAI, Anthropic) today and Azure AI Foundry
 * tomorrow — switch via env var, no code changes needed.
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/**
 * Where to route LLM API calls.
 *
 * - DIRECT: Call provider APIs directly (api.openai.com, api.anthropic.com, etc.)
 * - AZURE_FOUNDRY: Route through an Azure AI Foundry endpoint (same models,
 *   different base URL + API key auth)
 */
export enum ProviderMode {
  DIRECT = 'direct',
  AZURE_FOUNDRY = 'azure_foundry',
}

/**
 * Functional role each model plays in the multi-model generation pipeline.
 *
 * - INGESTION:  Fast structured extraction (cheap, high-throughput)
 * - DRAFTER:    Primary narrative author (highest quality prose)
 * - AUDITOR:    Compliance reasoning and gap analysis (reasoning model)
 * - REVISER:    Final-pass rewriter after audit findings (matches DRAFTER by default)
 * - EMBEDDINGS: Vector embedding model (no generation, used by rag-core)
 */
export enum ModelRole {
  INGESTION = 'ingestion',
  DRAFTER = 'drafter',
  AUDITOR = 'auditor',
  REVISER = 'reviser',
  EMBEDDINGS = 'embeddings',
}

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

/**
 * Per-role model assignment.
 *
 * `temperature` is intentionally optional: the o1/o3 family does not accept a
 * temperature parameter, so omitting it lets each provider service fall back
 * to the provider default rather than sending an unsupported field.
 */
export interface ModelAssignment {
  /** Model identifier as accepted by the target provider, e.g. "gpt-4.1" or "o3-mini". */
  modelId: string;
  /** Maximum output tokens for this role. Use 0 for embedding models. */
  maxTokens: number;
  /**
   * Sampling temperature. Omit entirely for reasoning models (o1, o3 family)
   * that do not support this parameter.
   */
  temperature?: number;
}

/**
 * Top-level provider configuration.
 *
 * Construct via {@link buildProviderConfigFromEnv} for production use,
 * or assemble manually for tests and local overrides.
 */
export interface ProviderConfig {
  /** Routing mode — direct provider APIs or Azure AI Foundry. */
  mode: ProviderMode;

  // --- Direct-mode credentials ---
  /** OpenAI API key. Required when mode is DIRECT and any OpenAI model is used. */
  openaiApiKey?: string;
  /** Anthropic API key. Required when mode is DIRECT and any Anthropic model is used. */
  anthropicApiKey?: string;

  // --- Azure Foundry settings (only used when mode === AZURE_FOUNDRY) ---
  /**
   * Azure AI Foundry endpoint URL.
   * Example: "https://my-hub.openai.azure.com"
   */
  azureEndpoint?: string;
  /** Azure API key for the Foundry endpoint. */
  azureApiKey?: string;
  /**
   * Azure OpenAI API version string.
   * Defaults to "2024-12-01-preview" when not supplied.
   */
  azureApiVersion?: string;
  /**
   * Optional deployment name prefix for Azure.
   * When set, model IDs are prefixed before resolving the Azure deployment name.
   * Example: prefix "phaser-" + modelId "gpt-4o-mini" → deployment "phaser-gpt-4o-mini".
   */
  azureDeploymentPrefix?: string;

  /**
   * Per-role model assignments. Every role in {@link ModelRole} must have an
   * entry. Use {@link DEFAULT_DIRECT_CONFIG} as a baseline and spread overrides.
   */
  roleAssignments: Record<ModelRole, ModelAssignment>;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/**
 * Default configuration for direct-mode API calls.
 *
 * Role defaults:
 * - INGESTION:  gpt-4o-mini  (fast, cheap structured extraction)
 * - DRAFTER:    gpt-4.1      (primary narrative generation)
 * - AUDITOR:    o3-mini      (compliance reasoning; no temperature)
 * - REVISER:    gpt-4.1      (final-pass rewrite; slightly lower temperature than DRAFTER)
 * - EMBEDDINGS: text-embedding-3-large (1536-dim, best retrieval accuracy)
 */
export const DEFAULT_DIRECT_CONFIG: ProviderConfig = {
  mode: ProviderMode.DIRECT,
  roleAssignments: {
    [ModelRole.INGESTION]: {
      modelId: 'gpt-4o-mini',
      maxTokens: 4096,
      temperature: 0.2,
    },
    [ModelRole.DRAFTER]: {
      modelId: 'gpt-4.1',
      maxTokens: 8192,
      temperature: 0.3,
    },
    [ModelRole.AUDITOR]: {
      modelId: 'o3-mini',
      maxTokens: 4096,
      // temperature intentionally omitted — o3-mini does not support it
    },
    [ModelRole.REVISER]: {
      modelId: 'gpt-4.1',
      maxTokens: 8192,
      temperature: 0.2,
    },
    [ModelRole.EMBEDDINGS]: {
      modelId: 'text-embedding-3-large',
      maxTokens: 0,
    },
  },
};

// ---------------------------------------------------------------------------
// Environment builder
// ---------------------------------------------------------------------------

/**
 * Build a {@link ProviderConfig} by reading environment variables and merging
 * any per-role overrides on top of {@link DEFAULT_DIRECT_CONFIG}.
 *
 * Recognised environment variables:
 *
 * | Variable                | Effect                                          |
 * |-------------------------|-------------------------------------------------|
 * | PROVIDER_MODE           | "direct" (default) or "azure_foundry"           |
 * | OPENAI_API_KEY          | OpenAI API key for direct mode                  |
 * | ANTHROPIC_API_KEY       | Anthropic API key for direct mode               |
 * | AZURE_ENDPOINT          | Azure Foundry endpoint URL                      |
 * | AZURE_API_KEY           | Azure Foundry API key                           |
 * | AZURE_API_VERSION       | Azure API version (default: 2024-12-01-preview) |
 * | AZURE_DEPLOYMENT_PREFIX | Prefix prepended to model IDs for Azure deploys |
 * | MODEL_INGESTION         | Override modelId for INGESTION role             |
 * | MODEL_DRAFTER           | Override modelId for DRAFTER role               |
 * | MODEL_AUDITOR           | Override modelId for AUDITOR role               |
 * | MODEL_REVISER           | Override modelId for REVISER role               |
 * | MODEL_EMBEDDINGS        | Override modelId for EMBEDDINGS role            |
 * | TOKENS_INGESTION        | Override maxTokens for INGESTION role           |
 * | TOKENS_DRAFTER          | Override maxTokens for DRAFTER role             |
 * | TOKENS_AUDITOR          | Override maxTokens for AUDITOR role             |
 * | TOKENS_REVISER          | Override maxTokens for REVISER role             |
 */
export function buildProviderConfigFromEnv(): ProviderConfig {
  // Determine provider mode
  const modeRaw = (process.env.PROVIDER_MODE ?? 'direct').toLowerCase();
  const mode: ProviderMode =
    modeRaw === ProviderMode.AZURE_FOUNDRY
      ? ProviderMode.AZURE_FOUNDRY
      : ProviderMode.DIRECT;

  // Start from a deep copy of the defaults so we never mutate the constant
  const roleAssignments: Record<ModelRole, ModelAssignment> = {
    [ModelRole.INGESTION]: { ...DEFAULT_DIRECT_CONFIG.roleAssignments[ModelRole.INGESTION] },
    [ModelRole.DRAFTER]:   { ...DEFAULT_DIRECT_CONFIG.roleAssignments[ModelRole.DRAFTER] },
    [ModelRole.AUDITOR]:   { ...DEFAULT_DIRECT_CONFIG.roleAssignments[ModelRole.AUDITOR] },
    [ModelRole.REVISER]:   { ...DEFAULT_DIRECT_CONFIG.roleAssignments[ModelRole.REVISER] },
    [ModelRole.EMBEDDINGS]: { ...DEFAULT_DIRECT_CONFIG.roleAssignments[ModelRole.EMBEDDINGS] },
  };

  // Per-role modelId overrides
  const modelOverrides: Partial<Record<ModelRole, string | undefined>> = {
    [ModelRole.INGESTION]:  process.env.MODEL_INGESTION,
    [ModelRole.DRAFTER]:    process.env.MODEL_DRAFTER,
    [ModelRole.AUDITOR]:    process.env.MODEL_AUDITOR,
    [ModelRole.REVISER]:    process.env.MODEL_REVISER,
    [ModelRole.EMBEDDINGS]: process.env.MODEL_EMBEDDINGS,
  };

  for (const [role, modelId] of Object.entries(modelOverrides) as [ModelRole, string | undefined][]) {
    if (modelId) {
      roleAssignments[role].modelId = modelId;
    }
  }

  // Per-role maxTokens overrides
  const tokenOverrides: Partial<Record<ModelRole, string | undefined>> = {
    [ModelRole.INGESTION]: process.env.TOKENS_INGESTION,
    [ModelRole.DRAFTER]:   process.env.TOKENS_DRAFTER,
    [ModelRole.AUDITOR]:   process.env.TOKENS_AUDITOR,
    [ModelRole.REVISER]:   process.env.TOKENS_REVISER,
  };

  for (const [role, raw] of Object.entries(tokenOverrides) as [ModelRole, string | undefined][]) {
    if (raw) {
      const parsed = parseInt(raw, 10);
      if (!isNaN(parsed)) {
        roleAssignments[role].maxTokens = parsed;
      }
    }
  }

  const config: ProviderConfig = {
    mode,
    roleAssignments,

    // Direct credentials
    openaiApiKey:    process.env.OPENAI_API_KEY,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,

    // Azure Foundry settings
    azureEndpoint:         process.env.AZURE_ENDPOINT,
    azureApiKey:           process.env.AZURE_API_KEY,
    azureApiVersion:       process.env.AZURE_API_VERSION ?? '2024-12-01-preview',
    azureDeploymentPrefix: process.env.AZURE_DEPLOYMENT_PREFIX,
  };

  return config;
}
