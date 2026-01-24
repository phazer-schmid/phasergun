import { KnowledgeContext, ChunkedDocumentPart, ParsedDocument } from '@fda-compliance/shared-types';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';
import * as crypto from 'crypto';
import { ComprehensiveFileParser } from '@fda-compliance/file-parser';

/**
 * Knowledge cache entry
 */
interface KnowledgeCache {
  projectPath: string;
  fingerprint: string;
  primaryContext: any;
  proceduresFiles: ParsedDocument[];
  contextFiles: ParsedDocument[];
  indexedAt: string;
}

/**
 * Enhanced RAG Service for DHF Document Generation
 * Combines three knowledge sources:
 * 1. Static: primary-context.yaml (PhaserGun role, regulatory framework)
 * 2. Dynamic: Files in /Procedures folder (SOPs, company guidelines)
 * 3. Dynamic: Files in /Context folder (project-specific information)
 */
export class EnhancedRAGService {
  private cache: Map<string, KnowledgeCache> = new Map();
  private fileParser: ComprehensiveFileParser;
  
  constructor() {
    this.fileParser = new ComprehensiveFileParser();
  }

  /**
   * Load primary context from YAML file
   */
  async loadPrimaryContext(yamlPath: string): Promise<any> {
    console.log('[EnhancedRAG] Loading primary context from:', yamlPath);
    
    const fileContents = await fs.readFile(yamlPath, 'utf8');
    const primaryContext = yaml.load(fileContents) as any;
    
    console.log('[EnhancedRAG] Primary context loaded successfully');
    return primaryContext;
  }

  /**
   * Load and parse all files from Procedures folder
   */
  async loadProceduresFolder(folderPath: string): Promise<ParsedDocument[]> {
    console.log('[EnhancedRAG] Loading Procedures folder:', folderPath);
    
    try {
      await fs.access(folderPath);
      const documents = await this.fileParser.scanAndParseFolder(folderPath);
      console.log(`[EnhancedRAG] Loaded ${documents.length} files from Procedures folder`);
      return documents;
    } catch (error) {
      console.warn('[EnhancedRAG] Procedures folder not found or empty:', folderPath);
      return [];
    }
  }

  /**
   * Load and parse all files from Context folder
   */
  async loadContextFolder(folderPath: string): Promise<ParsedDocument[]> {
    console.log('[EnhancedRAG] Loading Context folder:', folderPath);
    
    try {
      await fs.access(folderPath);
      const documents = await this.fileParser.scanAndParseFolder(folderPath);
      console.log(`[EnhancedRAG] Loaded ${documents.length} files from Context folder`);
      return documents;
    } catch (error) {
      console.warn('[EnhancedRAG] Context folder not found or empty:', folderPath);
      return [];
    }
  }

  /**
   * Compute fingerprint for a folder (all file paths, sizes, and mtimes)
   */
  private async computeFolderFingerprint(folderPath: string): Promise<string> {
    try {
      await fs.access(folderPath);
      
      const files = await this.getAllFiles(folderPath);
      const fileInfos = await Promise.all(
        files.map(async (filePath) => {
          const stats = await fs.stat(filePath);
          return `${filePath}:${stats.size}:${stats.mtimeMs}`;
        })
      );
      
      const combined = fileInfos.sort().join('|');
      return crypto.createHash('sha256').update(combined).digest('hex');
    } catch (error) {
      // Folder doesn't exist, return empty fingerprint
      return crypto.createHash('sha256').update('empty').digest('hex');
    }
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
          files.push(fullPath);
        }
      }
    } catch (error) {
      console.error(`Error reading directory ${dirPath}:`, error);
    }
    
    return files;
  }

  /**
   * Compute combined fingerprint for cache validation
   */
  private async computeCacheFingerprint(
    projectPath: string,
    primaryContextPath: string
  ): Promise<string> {
    const proceduresPath = path.join(projectPath, 'Procedures');
    const contextPath = path.join(projectPath, 'Context');
    
    // Get fingerprints for all three sources
    const [primaryStats, proceduresFingerprint, contextFingerprint] = await Promise.all([
      fs.stat(primaryContextPath).catch(() => ({ mtimeMs: 0, size: 0 })),
      this.computeFolderFingerprint(proceduresPath),
      this.computeFolderFingerprint(contextPath)
    ]);
    
    const primaryFingerprint = `${primaryContextPath}:${primaryStats.size}:${primaryStats.mtimeMs}`;
    const combined = `${primaryFingerprint}|${proceduresFingerprint}|${contextFingerprint}`;
    
    return crypto.createHash('sha256').update(combined).digest('hex');
  }

  /**
   * Check if cache is valid for a project
   */
  async isCacheValid(projectPath: string, primaryContextPath: string): Promise<boolean> {
    const cached = this.cache.get(projectPath);
    if (!cached) {
      return false;
    }
    
    const currentFingerprint = await this.computeCacheFingerprint(projectPath, primaryContextPath);
    return cached.fingerprint === currentFingerprint;
  }

  /**
   * Load all knowledge sources with caching
   */
  async loadKnowledge(
    projectPath: string,
    primaryContextPath: string
  ): Promise<KnowledgeCache> {
    console.log('\n[EnhancedRAG] ========================================');
    console.log('[EnhancedRAG] Loading Knowledge Base');
    console.log('[EnhancedRAG] ========================================\n');
    
    // Check if cache is valid
    const cacheValid = await this.isCacheValid(projectPath, primaryContextPath);
    
    if (cacheValid) {
      console.log('[EnhancedRAG] ✓ Cache is valid, using cached knowledge\n');
      return this.cache.get(projectPath)!;
    }
    
    console.log('[EnhancedRAG] Cache invalid or missing, loading fresh knowledge...\n');
    
    // Load all three sources
    const [primaryContext, proceduresFiles, contextFiles] = await Promise.all([
      this.loadPrimaryContext(primaryContextPath),
      this.loadProceduresFolder(path.join(projectPath, 'Procedures')),
      this.loadContextFolder(path.join(projectPath, 'Context'))
    ]);
    
    // Compute fingerprint
    const fingerprint = await this.computeCacheFingerprint(projectPath, primaryContextPath);
    
    // Create cache entry
    const knowledgeCache: KnowledgeCache = {
      projectPath,
      fingerprint,
      primaryContext,
      proceduresFiles,
      contextFiles,
      indexedAt: new Date().toISOString()
    };
    
    // Store in cache
    this.cache.set(projectPath, knowledgeCache);
    
    console.log('[EnhancedRAG] ========================================');
    console.log('[EnhancedRAG] Knowledge Base Loaded Successfully');
    console.log(`[EnhancedRAG] Primary Context: ✓`);
    console.log(`[EnhancedRAG] Procedures: ${proceduresFiles.length} files`);
    console.log(`[EnhancedRAG] Context: ${contextFiles.length} files`);
    console.log(`[EnhancedRAG] Cache Fingerprint: ${fingerprint.substring(0, 16)}...`);
    console.log('[EnhancedRAG] ========================================\n');
    
    return knowledgeCache;
  }

  /**
   * Build RAG context for LLM prompt
   */
  buildRAGContext(knowledge: KnowledgeCache): string {
    const sections: string[] = [];
    
    // Section 1: Primary Context (PhaserGun role and framework)
    sections.push('=== PRIMARY CONTEXT: PHASERGUN AI REGULATORY ENGINEER ===\n');
    sections.push(yaml.dump(knowledge.primaryContext));
    sections.push('\n');
    
    // Section 2: Procedures (Company SOPs and Guidelines)
    if (knowledge.proceduresFiles.length > 0) {
      sections.push('=== COMPANY PROCEDURES AND SOPS ===\n');
      knowledge.proceduresFiles.forEach((doc, idx) => {
        sections.push(`\n--- Procedure ${idx + 1}: ${doc.fileName} ---\n`);
        sections.push(doc.content);
        sections.push('\n');
      });
    }
    
    // Section 3: Context (Project-Specific Information)
    if (knowledge.contextFiles.length > 0) {
      sections.push('=== PROJECT-SPECIFIC CONTEXT ===\n');
      knowledge.contextFiles.forEach((doc, idx) => {
        sections.push(`\n--- Context Document ${idx + 1}: ${doc.fileName} ---\n`);
        sections.push(doc.content);
        sections.push('\n');
      });
    }
    
    return sections.join('');
  }

  /**
   * Retrieve knowledge context for a given prompt query
   * This can be enhanced with semantic search later
   */
  async retrieveKnowledge(
    projectPath: string,
    primaryContextPath: string,
    query?: string
  ): Promise<{ ragContext: string; metadata: any }> {
    const knowledge = await this.loadKnowledge(projectPath, primaryContextPath);
    const ragContext = this.buildRAGContext(knowledge);
    
    const metadata = {
      primaryContextLoaded: !!knowledge.primaryContext,
      proceduresCount: knowledge.proceduresFiles.length,
      contextFilesCount: knowledge.contextFiles.length,
      cachedAt: knowledge.indexedAt,
      fingerprint: knowledge.fingerprint.substring(0, 16)
    };
    
    return { ragContext, metadata };
  }

  /**
   * Clear cache for a specific project
   */
  clearCache(projectPath?: string): void {
    if (projectPath) {
      this.cache.delete(projectPath);
      console.log(`[EnhancedRAG] Cache cleared for project: ${projectPath}`);
    } else {
      this.cache.clear();
      console.log('[EnhancedRAG] All caches cleared');
    }
  }
}

// Export singleton instance
export const enhancedRAGService = new EnhancedRAGService();
