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
}
