/**
 * Interface for user input containing the source folder path to analyze
 */
export interface SourceFolderInput {
  folderPath: string;
  sourceType?: 'local' | 'google-drive' | 'dropbox' | 'onedrive' | 's3';
  credentials?: {
    apiKey?: string;
    accessToken?: string;
    refreshToken?: string;
  };
}
