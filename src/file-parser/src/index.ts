import { ParsedDocument } from '@fda-compliance/shared-types';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import mammoth from 'mammoth';
import pdfParse from 'pdf-parse';
import { createWorker } from 'tesseract.js';
import sharp from 'sharp';
import officeParser from 'officeparser';

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
 * Comprehensive File Parser Implementation
 * Supports PDF, DOCX, PPTX, images (with OCR), and various other formats
 */
export class ComprehensiveFileParser implements FileParser {
  private supportedExtensions = [
    '.pdf', '.docx', '.doc', '.pptx', '.ppt',
    '.txt', '.md', '.csv',
    '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff', '.webp'
  ];

  async scanAndParseFolder(folderPath: string): Promise<ParsedDocument[]> {
    console.log(`[ComprehensiveFileParser] Scanning folder: ${folderPath}`);
    
    const documents: ParsedDocument[] = [];
    
    try {
      const files = await this.getAllFiles(folderPath);
      console.log(`[ComprehensiveFileParser] Found ${files.length} files to process`);
      
      for (const filePath of files) {
        try {
          const doc = await this.parseFile(filePath);
          if (doc) {
            documents.push(doc);
          }
        } catch (error) {
          console.error(`[ComprehensiveFileParser] Error parsing ${filePath}:`, error);
        }
      }
    } catch (error) {
      console.error(`[ComprehensiveFileParser] Error scanning folder:`, error);
      throw error;
    }

    console.log(`[ComprehensiveFileParser] Successfully parsed ${documents.length} documents`);
    return documents;
  }

  /**
   * Recursively get all files from a directory
   */
  private async getAllFiles(dirPath: string): Promise<string[]> {
    const files: string[] = [];
    
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isDirectory()) {
          const subFiles = await this.getAllFiles(fullPath);
          files.push(...subFiles);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (this.supportedExtensions.includes(ext)) {
            files.push(fullPath);
          }
        }
      }
    } catch (error) {
      console.error(`Error reading directory ${dirPath}:`, error);
    }
    
    return files;
  }

  /**
   * Parse a single file based on its type
   */
  private async parseFile(filePath: string): Promise<ParsedDocument | null> {
    const fileName = path.basename(filePath);
    const ext = path.extname(fileName).toLowerCase();
    const id = this.generateFileId(filePath);
    
    console.log(`[ComprehensiveFileParser] Parsing: ${fileName}`);

    let content = '';
    let metadata: any = {};
    let mimeType = this.getMimeType(ext);

    try {
      switch (ext) {
        case '.pdf':
          const pdfResult = await this.parsePDF(filePath);
          content = pdfResult.content;
          metadata = pdfResult.metadata;
          break;
          
        case '.docx':
          const docxResult = await this.parseDOCX(filePath);
          content = docxResult.content;
          metadata = docxResult.metadata;
          break;
          
        case '.doc':
        case '.pptx':
        case '.ppt':
          const officeResult = await this.parseOfficeFile(filePath);
          content = officeResult.content;
          metadata = officeResult.metadata;
          break;
          
        case '.txt':
        case '.md':
        case '.csv':
          content = await this.parseTextFile(filePath);
          break;
          
        case '.png':
        case '.jpg':
        case '.jpeg':
        case '.gif':
        case '.bmp':
        case '.tiff':
        case '.webp':
          const imageResult = await this.parseImage(filePath);
          content = imageResult.content;
          metadata = imageResult.metadata;
          break;
          
        default:
          console.warn(`[ComprehensiveFileParser] Unsupported file type: ${ext}`);
          return null;
      }

      return {
        id,
        filePath,
        fileName,
        content,
        mimeType,
        metadata: {
          ...metadata,
          fileSize: (await fs.stat(filePath)).size,
          parsedAt: new Date().toISOString(),
          extension: ext
        }
      };
    } catch (error) {
      console.error(`[ComprehensiveFileParser] Error parsing ${fileName}:`, error);
      throw error;
    }
  }

  /**
   * Parse PDF files - extract text and metadata
   */
  private async parsePDF(filePath: string): Promise<{ content: string; metadata: any }> {
    const dataBuffer = await fs.readFile(filePath);
    const data = await pdfParse(dataBuffer);
    
    return {
      content: data.text,
      metadata: {
        pageCount: data.numpages,
        pdfInfo: data.info,
        pdfMetadata: data.metadata
      }
    };
  }

  /**
   * Parse DOCX files - extract text with formatting preserved
   */
  private async parseDOCX(filePath: string): Promise<{ content: string; metadata: any }> {
    const buffer = await fs.readFile(filePath);
    const result = await mammoth.extractRawText({ buffer });
    
    // Also extract with HTML to get some structure
    const htmlResult = await mammoth.convertToHtml({ buffer });
    
    return {
      content: result.value,
      metadata: {
        messages: result.messages,
        hasImages: htmlResult.value.includes('<img'),
        hasTables: htmlResult.value.includes('<table'),
        wordCount: result.value.split(/\s+/).length
      }
    };
  }

  /**
   * Parse Office files (DOC, PPT, PPTX) using officeparser
   */
  private async parseOfficeFile(filePath: string): Promise<{ content: string; metadata: any }> {
    const content = await officeParser.parseOfficeAsync(filePath);
    
    return {
      content: content || '',
      metadata: {
        wordCount: content ? content.split(/\s+/).length : 0
      }
    };
  }

  /**
   * Parse plain text files
   */
  private async parseTextFile(filePath: string): Promise<string> {
    const content = await fs.readFile(filePath, 'utf-8');
    return content;
  }

  /**
   * Parse images - extract text using OCR and get image metadata
   */
  private async parseImage(filePath: string): Promise<{ content: string; metadata: any }> {
    // Get image metadata
    const imageMetadata = await sharp(filePath).metadata();
    
    // Perform OCR to extract text from image
    let ocrText = '';
    try {
      const worker = await createWorker('eng');
      const { data } = await worker.recognize(filePath);
      ocrText = data.text;
      await worker.terminate();
    } catch (error) {
      console.warn(`[ComprehensiveFileParser] OCR failed for ${filePath}:`, error);
      ocrText = '[OCR extraction failed - image may not contain text]';
    }
    
    return {
      content: ocrText,
      metadata: {
        width: imageMetadata.width,
        height: imageMetadata.height,
        format: imageMetadata.format,
        space: imageMetadata.space,
        channels: imageMetadata.channels,
        depth: imageMetadata.depth,
        density: imageMetadata.density,
        hasAlpha: imageMetadata.hasAlpha,
        orientation: imageMetadata.orientation,
        isOCRExtracted: true,
        ocrConfidence: 'See individual word confidence in full OCR data'
      }
    };
  }

  /**
   * Generate a unique ID for a file based on its path
   */
  private generateFileId(filePath: string): string {
    return crypto.createHash('md5').update(filePath).digest('hex').substring(0, 16);
  }

  /**
   * Get MIME type based on file extension
   */
  private getMimeType(ext: string): string {
    const mimeTypes: { [key: string]: string } = {
      '.pdf': 'application/pdf',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.doc': 'application/msword',
      '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      '.ppt': 'application/vnd.ms-powerpoint',
      '.txt': 'text/plain',
      '.md': 'text/markdown',
      '.csv': 'text/csv',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.bmp': 'image/bmp',
      '.tiff': 'image/tiff',
      '.webp': 'image/webp'
    };
    
    return mimeTypes[ext] || 'application/octet-stream';
  }
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
