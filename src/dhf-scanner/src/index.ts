import * as fs from 'fs/promises';
import * as path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { DHFFile, DHFDocument, PhaseDHFMapping } from '@fda-compliance/shared-types';
import * as pdfParse from 'pdf-parse';
import * as mammoth from 'mammoth';

/**
 * Scanned Document Interface
 * Represents a document found in the project folder
 */
export interface ScannedDocument {
  fileName: string;
  filePath: string;
  content: string;
  phase: number;
  fileSize: number;
  modifiedDate: Date;
}

/**
 * DHF Scanner Configuration
 */
export interface DHFScannerConfig {
  anthropicApiKey: string;
  maxFileSize?: number; // in bytes, default 10MB
  supportedExtensions?: string[]; // default: ['.pdf', '.docx', '.txt', '.md']
}

/**
 * DHF Scanner Service
 * Scans project folders and classifies documents using LLM
 */
export class DHFScanner {
  private anthropic: Anthropic;
  private config: Required<DHFScannerConfig>;
  private dhfMapping: PhaseDHFMapping[] = [];

  constructor(config: DHFScannerConfig) {
    this.anthropic = new Anthropic({
      apiKey: config.anthropicApiKey,
    });
    
    this.config = {
      anthropicApiKey: config.anthropicApiKey,
      maxFileSize: config.maxFileSize || 10 * 1024 * 1024, // 10MB default
      supportedExtensions: config.supportedExtensions || ['.pdf', '.docx', '.txt', '.md', '.doc'],
    };
  }

  /**
   * Load DHF phase mapping from YAML or JSON
   */
  async loadDHFMapping(mappingData: PhaseDHFMapping[]): Promise<void> {
    this.dhfMapping = mappingData;
    console.log(`[DHFScanner] Loaded ${this.dhfMapping.length} phase mappings`);
  }

  /**
   * Scan project folder for DHF documents
   */
  async scanProjectFolder(projectPath: string): Promise<DHFFile[]> {
    console.log(`[DHFScanner] Scanning project folder: ${projectPath}`);
    
    // Step 1: Find all phase folders
    const phaseFolders = await this.findPhaseFolders(projectPath);
    console.log(`[DHFScanner] Found ${phaseFolders.length} phase folders`);
    
    // Step 2: Scan documents from all phase folders
    const allDocuments: ScannedDocument[] = [];
    for (const phaseFolder of phaseFolders) {
      const docs = await this.scanPhaseFolder(phaseFolder.path, phaseFolder.phase);
      allDocuments.push(...docs);
    }
    console.log(`[DHFScanner] Found ${allDocuments.length} total documents`);
    
    // Step 3: Classify documents using LLM
    const classifiedDocuments = await this.classifyDocuments(allDocuments);
    
    // Step 4: Group documents by DHF file
    const dhfFiles = this.groupByDHFFile(classifiedDocuments);
    
    console.log(`[DHFScanner] Classified into ${dhfFiles.length} DHF files`);
    return dhfFiles;
  }

  /**
   * Find phase folders in project directory
   */
  private async findPhaseFolders(projectPath: string): Promise<Array<{ path: string; phase: number }>> {
    const phaseFolders: Array<{ path: string; phase: number }> = [];
    
    try {
      const entries = await fs.readdir(projectPath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          // Match patterns like "Phase 1", "Phase_1", "phase1", "P1", etc.
          const match = entry.name.match(/(?:phase|p)[\s_-]*([1-4])/i);
          if (match) {
            const phaseNumber = parseInt(match[1], 10);
            phaseFolders.push({
              path: path.join(projectPath, entry.name),
              phase: phaseNumber,
            });
          }
        }
      }
    } catch (error) {
      console.error(`[DHFScanner] Error reading project folder:`, error);
    }
    
    return phaseFolders.sort((a, b) => a.phase - b.phase);
  }

  /**
   * Scan all documents in a phase folder
   */
  private async scanPhaseFolder(folderPath: string, phase: number): Promise<ScannedDocument[]> {
    const documents: ScannedDocument[] = [];
    
    try {
      const files = await this.getAllFiles(folderPath);
      
      for (const filePath of files) {
        const ext = path.extname(filePath).toLowerCase();
        
        if (this.config.supportedExtensions.includes(ext)) {
          const stats = await fs.stat(filePath);
          
          // Skip files that are too large
          if (stats.size > this.config.maxFileSize) {
            console.warn(`[DHFScanner] Skipping large file: ${filePath} (${stats.size} bytes)`);
            continue;
          }
          
          // Parse document content
          const content = await this.parseDocument(filePath);
          
          if (content) {
            documents.push({
              fileName: path.basename(filePath),
              filePath,
              content,
              phase,
              fileSize: stats.size,
              modifiedDate: stats.mtime,
            });
          }
        }
      }
    } catch (error) {
      console.error(`[DHFScanner] Error scanning phase folder ${folderPath}:`, error);
    }
    
    return documents;
  }

  /**
   * Recursively get all files in a directory
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
        } else {
          files.push(fullPath);
        }
      }
    } catch (error) {
      console.error(`[DHFScanner] Error reading directory ${dirPath}:`, error);
    }
    
    return files;
  }

  /**
   * Parse document content based on file type
   */
  private async parseDocument(filePath: string): Promise<string | null> {
    const ext = path.extname(filePath).toLowerCase();
    
    try {
      if (ext === '.txt' || ext === '.md') {
        return await fs.readFile(filePath, 'utf-8');
      } else if (ext === '.pdf') {
        const dataBuffer = await fs.readFile(filePath);
        const data = await pdfParse(dataBuffer);
        return data.text;
      } else if (ext === '.docx' || ext === '.doc') {
        const result = await mammoth.extractRawText({ path: filePath });
        return result.value;
      }
    } catch (error) {
      console.error(`[DHFScanner] Error parsing ${filePath}:`, error);
    }
    
    return null;
  }

  /**
   * Classify documents using Claude LLM
   */
  private async classifyDocuments(documents: ScannedDocument[]): Promise<Array<ScannedDocument & { dhfFileId: string; dhfFileName: string }>> {
    const classified: Array<ScannedDocument & { dhfFileId: string; dhfFileName: string }> = [];
    
    // Get DHF categories for the prompt
    const dhfCategories = this.getDHFCategories();
    
    // Process documents in batches to avoid rate limits
    const batchSize = 5;
    for (let i = 0; i < documents.length; i += batchSize) {
      const batch = documents.slice(i, i + batchSize);
      
      for (const doc of batch) {
        try {
          const classification = await this.classifySingleDocument(doc, dhfCategories);
          classified.push({
            ...doc,
            dhfFileId: classification.dhfFileId,
            dhfFileName: classification.dhfFileName,
          });
        } catch (error) {
          console.error(`[DHFScanner] Error classifying ${doc.fileName}:`, error);
          // Add to "unknown" category
          classified.push({
            ...doc,
            dhfFileId: 'unknown',
            dhfFileName: 'Uncategorized Documents',
          });
        }
      }
      
      // Small delay between batches
      if (i + batchSize < documents.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    return classified;
  }

  /**
   * Classify a single document using Claude
   */
  private async classifySingleDocument(
    doc: ScannedDocument,
    dhfCategories: string
  ): Promise<{ dhfFileId: string; dhfFileName: string }> {
    // Truncate content to first 2000 characters for classification
    const contentSnippet = doc.content.substring(0, 2000);
    
    const prompt = `You are an FDA regulatory compliance expert. Classify the following medical device document into the appropriate Design History File (DHF) category.

DOCUMENT INFO:
- Filename: ${doc.fileName}
- Phase: Phase ${doc.phase}
- Content Preview: ${contentSnippet}

AVAILABLE DHF CATEGORIES FOR PHASE ${doc.phase}:
${dhfCategories}

Analyze the document and respond with ONLY a JSON object in this format:
{
  "dhfFileId": "the_matching_dhf_file_id",
  "dhfFileName": "The matching DHF file name",
  "confidence": "high|medium|low",
  "reasoning": "brief explanation"
}

If no good match exists, use dhfFileId "unknown" and dhfFileName "Uncategorized Documents".`;

    const message = await this.anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: prompt,
      }],
    });
    
    // Parse Claude's response
    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      const classification = JSON.parse(jsonMatch[0]);
      console.log(`[DHFScanner] Classified "${doc.fileName}" -> ${classification.dhfFileName} (${classification.confidence})`);
      return {
        dhfFileId: classification.dhfFileId,
        dhfFileName: classification.dhfFileName,
      };
    }
    
    // Fallback
    return {
      dhfFileId: 'unknown',
      dhfFileName: 'Uncategorized Documents',
    };
  }

  /**
   * Get formatted DHF categories for LLM prompt
   */
  private getDHFCategories(): string {
    let categories = '';
    
    for (const phaseMapping of this.dhfMapping) {
      categories += `\nPHASE ${phaseMapping.phaseId} DHF FILES:\n`;
      for (const dhfFile of phaseMapping.dhfFiles) {
        categories += `- ID: ${dhfFile.id}\n`;
        categories += `  Name: ${dhfFile.name}\n`;
        categories += `  Reference: ${dhfFile.documentReference}\n`;
        categories += `  Description: ${dhfFile.submissionSection}\n\n`;
      }
    }
    
    return categories;
  }

  /**
   * Group classified documents by DHF file
   */
  private groupByDHFFile(
    classifiedDocs: Array<ScannedDocument & { dhfFileId: string; dhfFileName: string }>
  ): DHFFile[] {
    const dhfFileMap = new Map<string, DHFFile>();
    
    // Initialize DHF files from mapping
    for (const phaseMapping of this.dhfMapping) {
      for (const dhfFile of phaseMapping.dhfFiles) {
        dhfFileMap.set(dhfFile.id, {
          ...dhfFile,
          status: 'missing',
          documents: [],
        });
      }
    }
    
    // Add uncategorized DHF file
    dhfFileMap.set('unknown', {
      id: 'unknown',
      name: 'Uncategorized Documents',
      documentReference: 'N/A',
      submissionSection: 'Documents that could not be automatically classified',
      required: false,
      status: 'missing',
      documents: [],
    });
    
    // Group documents
    for (const doc of classifiedDocs) {
      const dhfFile = dhfFileMap.get(doc.dhfFileId);
      
      if (dhfFile) {
        const dhfDoc: DHFDocument = {
          name: doc.fileName,
          status: 'complete',
          date: doc.modifiedDate.toISOString().split('T')[0],
          reviewer: 'Auto-scanned',
        };
        
        dhfFile.documents.push(dhfDoc);
        
        // Update DHF file status
        if (dhfFile.documents.length > 0) {
          dhfFile.status = 'complete';
        }
      }
    }
    
    // Convert map to array and filter out empty DHF files
    return Array.from(dhfFileMap.values());
  }
}
