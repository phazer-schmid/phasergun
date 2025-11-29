export interface DHFFile {
  id: string;
  name: string;
  documentReference: string;
  submissionSection: string;
  required: boolean;
  status: 'complete' | 'in_progress' | 'missing';
  documents: DHFDocument[];
}

export interface DHFDocument {
  name: string;
  status: 'complete' | 'in_progress' | 'missing';
  date?: string;
  reviewer?: string;
  progress?: number;
  issues?: DocumentIssue[];
}

export interface DocumentIssue {
  type: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
}

export interface PhaseDHFMapping {
  phaseId: number;
  phaseName: string;
  dhfFiles: DHFFile[];
}
