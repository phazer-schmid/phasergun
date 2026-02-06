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
}
