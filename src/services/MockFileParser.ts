import type { ParsedDocument } from '@fda-compliance/shared-types';
import type { FileParser } from '../file-parser/src';

/**
 * Mock implementation of FileParser
 * Simulates scanning a folder and extracting document content
 */
export class MockFileParser implements FileParser {
  async scanAndParseFolder(folderPath: string): Promise<ParsedDocument[]> {
    // Simulate async operation
    await this.delay(300);

    console.log(`[MockFileParser] Scanning folder: ${folderPath}`);

    // Return mock parsed documents
    return [
      {
        id: 'doc-001',
        filePath: `${folderPath}/requirements.pdf`,
        fileName: 'requirements.pdf',
        content: 'Mock content from requirements document',
        mimeType: 'application/pdf',
        metadata: {
          pages: 10,
          author: 'Engineering Team'
        }
      },
      {
        id: 'doc-002',
        filePath: `${folderPath}/design-spec.docx`,
        fileName: 'design-spec.docx',
        content: 'Mock content from design specification',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        metadata: {
          pages: 25,
          lastModified: new Date().toISOString()
        }
      }
    ];
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
