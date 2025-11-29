/**
 * Interface for the application's output status
 * Communicates processing state and results back to the UI
 */
export interface AppStatusOutput {
  status: 'processing' | 'complete' | 'error';
  message: string;
  detailedReport?: string;
  timestamp?: string;
  
  // Analysis-specific outputs
  analysisLevel?: 'project' | 'phase' | 'file';
  phaseId?: number;
  completionPercentage?: number;
  rtaStatus?: {
    total: number;
    passed: number;
    failed: number;
    missing: number;
    needsReview: number;
  };
  gaps?: Array<{
    type: 'missing_data' | 'version_conflict' | 'data_conflict' | 'traceability_gap' | 'low_confidence' | 'standards_error';
    severity: 'critical' | 'major' | 'moderate' | 'minor';
    description: string;
    location?: string;
    remediation?: string;
  }>;
  risks?: Array<{
    category: string;
    severity: 'high' | 'medium' | 'low';
    description: string;
    mitigation?: string;
  }>;
  qualityScore?: {
    overall: number; // 0-100
    completeness: number;
    traceability: number;
    compliance: number;
  };
}
