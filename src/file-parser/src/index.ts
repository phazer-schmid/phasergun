import { ParsedDocument } from '@phasergun/shared-types';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import mammoth from 'mammoth';
import pdfParse from 'pdf-parse';
import { createWorker } from 'tesseract.js';
import sharp from 'sharp';
import { parseOffice } from 'officeparser';

/**
 * File Parser Interface
 * Responsible for scanning folders and extracting text from documents
 */
export interface FileParser {
  /**
   * Scan a folder and parse all documents
   * @param folderPath - Path to a document folder (e.g., Procedures/ or Context/ within the RAG folder)
   * @returns Array of parsed documents with extracted text
   */
  scanAndParseFolder(folderPath: string): Promise<ParsedDocument[]>;
}

/**
 * Comprehensive File Parser Implementation
 * Supports PDF, DOCX, PPTX, images (with OCR), and various other formats
 */
export class ComprehensiveFileParser implements FileParser {
  /**
   * File extensions that are explicitly known and handled.
   * Files with NO extension are sniffed via magic bytes (see detectExtensionFromMagicBytes).
   * Files with an unrecognized extension that are not executables/archives are logged as warnings.
   */
  private supportedExtensions = [
    '.pdf', '.docx', '.doc', '.pptx', '.ppt',
    '.txt', '.md', '.csv',
    '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff', '.webp',
    '.rtf', '.odt', '.xlsx', '.xls',
  ];

  /**
   * Extensions that are silently skipped (executables, archives, binaries, system files).
   * Encountering one of these logs a safety warning but never throws.
   */
  private blockedExtensions = new Set([
    // Executables / scripts
    '.exe', '.com', '.bat', '.cmd', '.sh', '.bash', '.zsh', '.ps1', '.vbs',
    '.msi', '.app', '.dmg', '.pkg', '.deb', '.rpm',
    // Compressed / archives
    '.zip', '.tar', '.gz', '.bz2', '.xz', '.7z', '.rar', '.tgz', '.tbz2',
    // Libraries / objects
    '.dll', '.so', '.dylib', '.lib', '.a', '.o',
    // Disk images / virtual machines
    '.iso', '.vmdk', '.vhd', '.qcow2',
    // Database
    '.sqlite', '.db', '.mdb',
    // Web / source code (not document content)
    '.html', '.htm', '.js', '.ts', '.jsx', '.tsx', '.css', '.scss',
    '.json', '.xml', '.yaml', '.yml',
    // Media (not text-extractable here)
    '.mp3', '.mp4', '.wav', '.avi', '.mov', '.mkv', '.flv',
    // System
    '.sys', '.bin', '.dat', '.log', '.tmp', '.lock', '.DS_Store',
  ]);

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
   * Recursively get all files from a directory.
   * Files with no extension are included so magic byte detection can run on them.
   * Files with blocked extensions (executables, archives, etc.) are skipped with a warning.
   * Files with unrecognized extensions are included so parseFile can log a clear error.
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
          // Skip hidden files (macOS .DS_Store, dot-files, etc.)
          if (entry.name.startsWith('.')) continue;

          const ext = path.extname(entry.name).toLowerCase();

          if (ext === '') {
            // No extension — include for magic byte detection
            files.push(fullPath);
          } else if (this.blockedExtensions.has(ext)) {
            console.warn(
              `[ComprehensiveFileParser] ⚠️  SKIPPED (blocked type "${ext}"): ${fullPath}`
            );
          } else {
            // Known supported OR unknown — include and let parseFile decide
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
   * Detect file type from magic bytes for extension-less files.
   * Returns the inferred extension (e.g., '.docx', '.pdf') or '' if unknown.
   *
   * Signatures checked:
   *   50 4B 03 04  → ZIP-based Office (DOCX, XLSX, PPTX)
   *   25 50 44 46  → PDF
   *   D0 CF 11 E0  → Legacy OLE2 Office (DOC, XLS, PPT)
   *   FF D8 FF     → JPEG
   *   89 50 4E 47  → PNG
   *   47 49 46 38  → GIF
   */
  private async detectExtensionFromMagicBytes(filePath: string): Promise<string> {
    let fd: import('fs/promises').FileHandle | null = null;
    try {
      fd = await fs.open(filePath, 'r');
      const buf = Buffer.alloc(8);
      const { bytesRead } = await fd.read(buf, 0, 8, 0);
      if (bytesRead < 4) return '';

      // ZIP-based Office Open XML (DOCX, XLSX, PPTX all start with PK♥♦)
      if (buf[0] === 0x50 && buf[1] === 0x4B && buf[2] === 0x03 && buf[3] === 0x04) {
        return '.docx';
      }
      // PDF
      if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) {
        return '.pdf';
      }
      // Legacy OLE2 Office (DOC / XLS / PPT)
      if (buf[0] === 0xD0 && buf[1] === 0xCF && buf[2] === 0x11 && buf[3] === 0xE0) {
        return '.doc';
      }
      // JPEG
      if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) {
        return '.jpg';
      }
      // PNG
      if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) {
        return '.png';
      }
      // GIF
      if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) {
        return '.gif';
      }
      return '';
    } catch {
      return '';
    } finally {
      if (fd) await fd.close().catch(() => {});
    }
  }

  /**
   * Parse a single file based on its type.
   *
   * For extension-less files, magic bytes are read to determine the format.
   * For files with unrecognized extensions, a loud error is logged and the
   * file is skipped (returns null).
   */
  private async parseFile(filePath: string): Promise<ParsedDocument | null> {
    const fileName = path.basename(filePath);
    let ext = path.extname(fileName).toLowerCase();
    const id = this.generateFileId(filePath);

    // ── Extension-less files: detect via magic bytes ─────────────────────────
    if (ext === '') {
      const detected = await this.detectExtensionFromMagicBytes(filePath);
      if (detected === '') {
        console.error(
          `\n` +
          `╔════════════════════════════════════════════════════════════════╗\n` +
          `║  ❌  UNSUPPORTED FILE — CANNOT PARSE (no extension, unknown bytes)\n` +
          `║  File: ${filePath}\n` +
          `║  Action: Add the correct file extension (e.g., .docx, .pdf) and\n` +
          `║          re-run so PhaserGun can process this document.\n` +
          `╚════════════════════════════════════════════════════════════════╝`
        );
        return null;
      }
      console.log(`[ComprehensiveFileParser] 🔍 Extension-less file "${fileName}" detected as ${detected} via magic bytes`);
      ext = detected;
    }

    // ── Unknown extension: loud error, skip ──────────────────────────────────
    if (!this.supportedExtensions.includes(ext)) {
      console.error(
        `\n` +
        `╔════════════════════════════════════════════════════════════════╗\n` +
        `║  ❌  UNSUPPORTED FILE TYPE — SKIPPED\n` +
        `║  File: ${filePath}\n` +
        `║  Extension: "${ext}"\n` +
        `║  Supported: ${this.supportedExtensions.join(', ')}\n` +
        `║  If this file contains document content you need PhaserGun to\n` +
        `║  process, convert it to PDF or DOCX and re-run.\n` +
        `╚════════════════════════════════════════════════════════════════╝`
      );
      return null;
    }

    console.log(`[ComprehensiveFileParser] Parsing: ${fileName}${ext !== path.extname(fileName).toLowerCase() ? ` (detected as ${ext})` : ''}`);

    let content = '';
    let metadata: any = {};
    const mimeType = this.getMimeType(ext);

    try {
      switch (ext) {
        case '.pdf': {
          const r = await this.parsePDF(filePath);
          content = r.content; metadata = r.metadata; break;
        }
        case '.docx':
        case '.xlsx':
        case '.xls':
        case '.odt': {
          // mammoth handles DOCX; xlsx/odt fallback gracefully (warns internally)
          const r = await this.parseDOCX(filePath);
          content = r.content; metadata = r.metadata; break;
        }
        case '.doc':
        case '.pptx':
        case '.ppt':
        case '.rtf': {
          const r = await this.parseOfficeFile(filePath);
          content = r.content; metadata = r.metadata; break;
        }
        case '.txt':
        case '.md':
        case '.csv': {
          content = await this.parseTextFile(filePath); break;
        }
        case '.png':
        case '.jpg':
        case '.jpeg':
        case '.gif':
        case '.bmp':
        case '.tiff':
        case '.webp': {
          const r = await this.parseImage(filePath);
          content = r.content; metadata = r.metadata; break;
        }
        default: {
          // Should never reach here — guarded by the unsupported-extension check above
          console.error(`[ComprehensiveFileParser] ❌ BUG: reached default case for extension "${ext}" on ${filePath}`);
          return null;
        }
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
          extension: ext,
          detectedVsMagicBytes: ext !== path.extname(fileName).toLowerCase()
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
    const ast = await parseOffice(filePath);
    const text = ast.toText();

    return {
      content: text || '',
      metadata: {
        wordCount: text ? text.split(/\s+/).length : 0
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
