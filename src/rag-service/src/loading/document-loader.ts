import { ParsedDocument } from '@phasergun/shared-types';
import { ComprehensiveFileParser } from '@phasergun/file-parser';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';

export interface CategorizedContextFile {
  doc: ParsedDocument;
  contextCategory: 'primary-context-root' | 'initiation' | 'ongoing' | 'predicates' | 'regulatory-strategy' | 'general';
}

export class DocumentLoader {
  private fileParser: ComprehensiveFileParser;

  constructor() {
    this.fileParser = new ComprehensiveFileParser();
  }

  async loadPrimaryContext(yamlPath: string): Promise<any> {
    console.log('[DocumentLoader] Loading primary context from:', yamlPath);
    const fileContents = await fs.readFile(yamlPath, 'utf8');
    const primaryContext = yaml.load(fileContents) as any;
    console.log('[DocumentLoader] Primary context loaded successfully');
    return primaryContext;
  }

  async loadProceduresFolder(folderPath: string): Promise<ParsedDocument[]> {
    console.log('[DocumentLoader] Loading Procedures folder:', folderPath);
    
    try {
      await fs.access(folderPath);
      const documents = await this.fileParser.scanAndParseFolder(folderPath);
      console.log(`[DocumentLoader] Loaded ${documents.length} files from Procedures folder`);
      return documents;
    } catch (error) {
      console.warn('[DocumentLoader] Procedures folder not found or empty:', folderPath);
      return [];
    }
  }

  async loadContextFolder(folderPath: string): Promise<ParsedDocument[]> {
    console.log('[DocumentLoader] Loading Context folder:', folderPath);
    
    try {
      await fs.access(folderPath);
      const documents = await this.fileParser.scanAndParseFolder(folderPath);
      console.log(`[DocumentLoader] Loaded ${documents.length} files from Context folder`);
      return documents;
    } catch (error) {
      console.warn('[DocumentLoader] Context folder not found or empty:', folderPath);
      return [];
    }
  }

  async loadContextFolderStructured(contextBasePath: string): Promise<CategorizedContextFile[]> {
    console.log('[DocumentLoader] Loading structured Context folder:', contextBasePath);
    
    const categorizedFiles: CategorizedContextFile[] = [];
    
    try {
      await fs.access(contextBasePath);
      
      const categoryMapping: Record<string, 'initiation' | 'ongoing' | 'predicates' | 'regulatory-strategy'> = {
        'Initiation': 'initiation',
        'Ongoing': 'ongoing',
        'Predicates': 'predicates',
        'Regulatory Strategy': 'regulatory-strategy'
      };
      
      for (const [folderName, category] of Object.entries(categoryMapping)) {
        const folderPath = path.join(contextBasePath, folderName);
        
        try {
          await fs.access(folderPath);
          const docs = await this.fileParser.scanAndParseFolder(folderPath);
          
          for (const doc of docs) {
            categorizedFiles.push({ doc, contextCategory: category });
          }
          
          console.log(`[DocumentLoader] ✓ Loaded ${docs.length} files from ${folderName}/ (category: ${category})`);
        } catch {
          console.log(`[DocumentLoader] ⏭️  Skipping ${folderName}/ (not found)`);
        }
      }
      
      // Load General subfolder
      const generalPath = path.join(contextBasePath, 'General');
      try {
        await fs.access(generalPath);
        const generalDocs = await this.fileParser.scanAndParseFolder(generalPath);
        generalDocs.forEach(doc => {
          categorizedFiles.push({ doc, contextCategory: 'general' });
        });
        console.log(`[DocumentLoader] ✓ Loaded ${generalDocs.length} files from General/ (category: general)`);
      } catch {
        console.log('[DocumentLoader] ⏭️  Skipping General/ (not found)');
      }
      
      // Load root-level files (e.g., Primary Context.docx)
      // We need to scan the base folder and filter for files at root only
      const allDocs = await this.fileParser.scanAndParseFolder(contextBasePath);
      const rootDocs = allDocs.filter(doc => {
        const relPath = path.relative(contextBasePath, doc.filePath);
        // Check if file is at root (no directory separators in relative path)
        return !relPath.includes(path.sep);
      });
      
      if (rootDocs.length > 0) {
        rootDocs.forEach(doc => {
          categorizedFiles.push({ doc, contextCategory: 'primary-context-root' });
        });
        console.log(`[DocumentLoader] ✓ Loaded ${rootDocs.length} root-level files (category: primary-context-root)`);
      }
      
      console.log(`[DocumentLoader] ✓ Total context files loaded: ${categorizedFiles.length}`);
      
    } catch (error) {
      console.warn('[DocumentLoader] Context folder not found or empty:', contextBasePath);
    }
    
    return categorizedFiles;
  }

  async loadFile(filePath: string): Promise<ParsedDocument> {
    console.log('[DocumentLoader] Loading file:', filePath);
    // Parse the containing directory and find the specific file
    const dirPath = path.dirname(filePath);
    const fileName = path.basename(filePath);
    const docs = await this.fileParser.scanAndParseFolder(dirPath);
    const doc = docs.find(d => d.fileName === fileName);
    
    if (!doc) {
      throw new Error(`File not found or could not be parsed: ${filePath}`);
    }
    
    return doc;
  }
}
