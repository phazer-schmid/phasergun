export interface DateHistoryEntry {
  changedAt: string;
  changedBy?: string;
  previousDates: {
    phase1?: string;
    phase2?: string;
    phase3?: string;
    phase4?: string;
  };
  newDates: {
    phase1?: string;
    phase2?: string;
    phase3?: string;
    phase4?: string;
  };
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  folderPath: string;
  sourceType: 'local';
  createdAt: string;
  updatedAt: string;
  lastAnalysis?: {
    timestamp: string;
    status: 'complete' | 'error' | 'processing';
    report?: string;
  };
  targetDates?: {
    phase1?: string;
    phase2?: string;
    phase3?: string;
    phase4?: string;
  };
  dateHistory?: DateHistoryEntry[];
  dhfFiles?: {
    [dhfId: string]: {
      status: 'complete' | 'in_progress' | 'missing';
      documents: Array<{
        name: string;
        status: string;
        date?: string;
        reviewer?: string;
      }>;
    };
  };
}
