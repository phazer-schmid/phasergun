/**
 * Output from a content generation request.
 * Maps to primary-context.yaml → generation_workflow.output.sections
 */
export interface GenerationOutput {
  status: 'processing' | 'complete' | 'error';
  message: string;
  timestamp: string;

  /** The generated content with inline citation markers */
  generatedContent?: string;

  /** Conflicts found during generation */
  discrepancies?: Discrepancy[];

  /** Complete source attribution */
  references?: SourceAttribution[];

  /** Content accuracy confidence assessment */
  confidence?: ConfidenceRating;

  /** Token usage statistics */
  usageStats?: UsageStats;
  
  /** Additional metadata (for sources, footnotes, etc.) */
  metadata?: any;

  /**
   * Step-by-step trace of the generation pipeline.
   * Each entry records which model ran, how long it took, and how many tokens
   * it consumed. Absent for legacy single-pass responses.
   */
  pipelineTrace?: {
    /** Which pipeline step produced this entry. */
    step: 'ingestion' | 'draft' | 'audit' | 'revision' | 'single-pass';
    /** Model identifier used for this step. */
    modelId: string;
    /** Wall-clock duration of the LLM call in milliseconds. */
    durationMs: number;
    /** Total tokens consumed (input + output) for this step. */
    tokensUsed: number;
    /** Characters sent to this model (the assembled prompt for this step). */
    promptChars: number;
    /** Characters received from this model. */
    responseChars: number;
  }[];

  /**
   * Raw findings text returned by the AUDITOR step.
   * Preserved so the UI can display audit details separately from the
   * final revised content. Absent when the audit step was skipped.
   */
  auditFindings?: string;
}

export interface Discrepancy {
  type: 'procedure_vs_compliance' | 'source_contradiction' | 'missing_information';
  description: string;
  /** e.g., "SOP-001 Section 4.2 vs FDA 21 CFR 820.30(c)" */
  location?: string;
}

export interface SourceAttribution {
  id: string;
  /** Source document name */
  fileName: string;
  /** Category from primary-context.yaml knowledge_sources */
  category: 'procedure' | 'context' | 'master_record' | 'compliance' | 'regulatory_strategy' | 'general';
  /** Specific section or field used */
  section?: string;
  /** How this reference informed the content */
  usage?: string;
}

export interface ConfidenceRating {
  level: 'High' | 'Medium' | 'Low';
  rationale: string;
  criteria: {
    sourceAgreement: 'High' | 'Medium' | 'Low';
    completeness: 'High' | 'Medium' | 'Low';
    complianceAlignment: 'High' | 'Medium' | 'Low';
    procedureAdherence: 'High' | 'Medium' | 'Low';
  };
}

export interface UsageStats {
  tokensUsed: number;
  cost: number;
  /**
   * Per-role token and cost breakdown when more than one model was used
   * (e.g., INGESTION → DRAFTER → AUDITOR → REVISER pipeline).
   * Absent for single-pass generation.
   */
  modelBreakdown?: {
    /** ModelRole enum value, e.g. "ingestion", "drafter", "auditor", "reviser". */
    role: string;
    /** Model identifier as used by the provider, e.g. "gpt-4.1" or "o3-mini". */
    modelId: string;
    tokensUsed: number;
    cost: number;
  }[];
}
