/**
 * Interface for the application's output status
 * Communicates processing state and results back to the UI
 */
export interface AppStatusOutput {
  status: 'processing' | 'complete' | 'error';
  message: string;
  detailedReport?: string;
  timestamp?: string;
}
