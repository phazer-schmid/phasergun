import { ParsedDocument } from '@fda-compliance/shared-types';

/**
 * File Parser Interface
 * Responsible for scanning folders and extracting text from documents
 */
export interface FileParser {
  /**
   * Scan a folder and parse all documents
   * @param folderPath - Path to the DHF folder or subfolder
   * @returns Array of parsed documents with extracted text
   */
  scanAndParseFolder(folderPath: string): Promise<ParsedDocument[]>;
}

/**
 * Mock Implementation of File Parser
 * Returns sample documents for testing without actual file system access
 */
export class MockFileParser implements FileParser {
  async scanAndParseFolder(folderPath: string): Promise<ParsedDocument[]> {
    console.log(`[MockFileParser] Scanning folder: ${folderPath}`);
    
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 500));

    // Return mock documents
    const mockDocs: ParsedDocument[] = [
      {
        id: 'doc-001',
        filePath: `${folderPath}/design_inputs.pdf`,
        fileName: 'design_inputs.pdf',
        content: 'Design Input Requirements:\n1. Device shall operate at 37°C\n2. Battery life minimum 48 hours\n3. Compliance with ISO 13485',
        mimeType: 'application/pdf',
        metadata: {
          phase: 'planning',
          documentType: 'design-input',
          pageCount: 5
        }
      },
      {
        id: 'doc-002',
        filePath: `${folderPath}/risk_analysis.docx`,
        fileName: 'risk_analysis.docx',
        content: 'Risk Analysis Report:\nIdentified risks:\n- Power failure during operation (High)\n- Material biocompatibility (Medium)\n- Software malfunction (High)',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        metadata: {
          phase: 'design',
          documentType: 'risk-analysis',
          standard: 'ISO 14971'
        }
      }
    ];

    console.log(`[MockFileParser] Found ${mockDocs.length} documents`);
    return mockDocs;
  }
}
