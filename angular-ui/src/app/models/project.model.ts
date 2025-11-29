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
  sourceType: 'local' | 'google-drive';
  credentials?: {
    apiKey?: string;
    accessToken?: string;
    refreshToken?: string;
  };
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
}
