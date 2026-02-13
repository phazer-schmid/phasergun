/**
 * Compliance validation types for PhaserGun compliance gate.
 */

export interface ComplianceStandard {
  id: string;
  name: string;
  scope: string;
}

export interface ComplianceViolation {
  /** The standard that was violated (e.g., "ISO 14971") */
  standard: string;
  /** Which specific requirement or clause area within the standard */
  rule: string;
  /** The source material or content section that contains the violation */
  source: string;
  /** Clear explanation of what is non-compliant and why */
  detail: string;
  /** 'input' = retrieved material is non-compliant, 'output' = generated text is non-compliant */
  gate: 'input' | 'output' | 'capability';
}

export interface ModelCapabilityResult {
  /** Overall: does the model have sufficient knowledge of ALL listed standards? */
  sufficient: boolean;
  /** Per-standard assessment */
  assessments: Array<{
    standardId: string;
    standardName: string;
    knowledgeLevel: 'high' | 'medium' | 'low' | 'none';
    explanation: string;
  }>;
  /** Standards where knowledge is insufficient (low or none) */
  insufficientStandards: string[];
}

export interface ComplianceValidationResult {
  /** Overall pass/fail */
  compliant: boolean;
  /** List of specific violations (empty if compliant) */
  violations: ComplianceViolation[];
  /** Timestamp of validation */
  validatedAt: string;
  /** Which gate ran this validation */
  gate: 'input' | 'output' | 'capability';
  /** Model capability result (only present for capability gate) */
  modelCapability?: ModelCapabilityResult;
}
