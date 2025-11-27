/**
 * Represents a document that has been parsed from the file system
 * Contains extracted text content and metadata
 */
export interface ParsedDocument {
  id: string;
  filePath: string;
  fileName: string;
  content: string;
  mimeType: string;
  metadata?: Record<string, any>;
}

/**
 * Interface contract for the File Parser module
 */
export interface FileParser {
  scanAndParseFolder(folderPath: string): Promise<ParsedDocument[]>;
}
