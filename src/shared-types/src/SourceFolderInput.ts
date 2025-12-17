/**
 * Interface for user input containing the source folder path to analyze
 */
export interface SourceFolderInput {
  folderPath: string;
  sourceType?: 'local';
}
