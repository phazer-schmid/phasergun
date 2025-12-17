/**
 * Analysis Context Interface
 * Defines the context in which analysis is being performed
 */
export interface AnalysisContext {
  viewType: 'project' | 'phase' | 'file';
  phaseId?: number; // 1-5 (Concept, Feasibility, Development, Qualification, Launch)
  filePath?: string; // Path to specific file being analyzed
  documentType?: string; // Type of document (e.g., "Risk Management Workbook", "DVT Report")
  revision?: string; // Document revision level (e.g., "Alpha Rev", "Rev 02", "X1")
}

/**
 * Extended Source Folder Input with Analysis Context
 */
export interface SourceFolderInputWithContext {
  folderPath: string;
  sourceType?: 'local';
  analysisContext?: AnalysisContext;
}
