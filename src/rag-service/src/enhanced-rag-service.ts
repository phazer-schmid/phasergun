import { KnowledgeContext, ChunkedDocumentPart, ParsedDocument } from '@phasergun/shared-types';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';
import * as crypto from 'crypto';
import * as os from 'os';
import { Mutex } from 'async-mutex';
import { ComprehensiveFileParser } from '@phasergun/file-parser';
import { EmbeddingService } from './embedding-service';
import { VectorStore, VectorEntry, SearchResult } from './vector-store';
import { LockManager, getLockManager } from './lock-manager';

/**
 * GLOBAL mutex for cache builds - shared across ALL service instances
 * This ensures that even if multiple EnhancedRAGService instances are created
 * (e.g., one per API request), they all coordinate through the same mutex.
 */
const globalBuildMutex = new Mutex();

/**
 * GLOBAL mutex for summary generation - prevents duplicate LLM calls
 * Separate from cache build mutex to allow parallel operations when possible
 */
const globalSummaryMutex = new Mutex();

/**
 * Document chunk with metadata
 */
interface DocumentChunk {
  content: string;
  fileName: string;
  filePath: string;
  chunkIndex: number;
  totalChunks: number;
  keywords: string[];
}

/**
 * Knowledge cache entry
 */
interface KnowledgeCache {
  projectPath: string;
  fingerprint: string;
  primaryContext: any;
  indexedAt: string;
  vectorStoreFingerprint: string;
}

/**
 * Enhanced RAG Service for Content Generation
 * Retrieves context from multiple knowledge sources to inform LLM generation:
 * 1. Static: primary-context.yaml (PhaserGun role, regulatory framework)
 * 2. Dynamic: Files in /Procedures folder (SOPs, company guidelines)
 * 3. Dynamic: Files in /Context folder (project-specific information)
 */
export class EnhancedRAGService {
  private cache: Map<string, KnowledgeCache> = new Map();
  private fileParser: ComprehensiveFileParser;
  private embeddingService: EmbeddingService | null = null;
  private vectorStore: VectorStore | null = null;
  private useEmbeddings: boolean = true; // Feature flag
  private lockManager: LockManager;
  private cacheEnabled: boolean;
  
  constructor() {
    this.fileParser = new ComprehensiveFileParser();
    this.lockManager = getLockManager();
    
    // Read CACHE_ENABLED from environment (defaults to true for backwards compatibility)
    const cacheEnvValue = process.env.CACHE_ENABLED?.toLowerCase();
    this.cacheEnabled = cacheEnvValue !== 'false' && cacheEnvValue !== '0';
    
    if (!this.cacheEnabled) {
      console.log('[EnhancedRAG] ⚠️  CACHING DISABLED - All documents will be processed fresh on every request');
    }
  }

  /**
   * Get vector store path for a project
   * Uses system temp directory to avoid permission issues
   */
  private getVectorStorePath(projectPath: string): string {
    const tempBase = os.tmpdir();
    const cacheBaseName = crypto.createHash('md5').update(projectPath).digest('hex').substring(0, 8);
    return path.join(tempBase, 'phasergun-cache', 'vector-store', cacheBaseName, 'vector-store.json');
  }

  /**
   * Get SOP summaries cache path for a project
   * Uses system temp directory to avoid permission issues
   */
  private getSOPSummariesCachePath(projectPath: string): string {
    const tempBase = os.tmpdir();
    const cacheBaseName = crypto.createHash('md5').update(projectPath).digest('hex').substring(0, 8);
    return path.join(tempBase, 'phasergun-cache', 'sop-summaries', cacheBaseName, 'sop-summaries.json');
  }

  /**
   * Get Context summaries cache path for a project
   * Uses system temp directory to avoid permission issues
   */
  private getContextSummariesCachePath(projectPath: string): string {
    const tempBase = os.tmpdir();
    const cacheBaseName = crypto.createHash('md5').update(projectPath).digest('hex').substring(0, 8);
    return path.join(tempBase, 'phasergun-cache', 'context-summaries', cacheBaseName, 'context-summaries.json');
  }

  /**
   * Get cache metadata path for a project
   * Uses system temp directory to avoid permission issues
   */
  private getCacheMetadataPath(projectPath: string): string {
    const tempBase = os.tmpdir();
    const cacheBaseName = crypto.createHash('md5').update(projectPath).digest('hex').substring(0, 8);
    return path.join(tempBase, 'phasergun-cache', 'metadata', cacheBaseName, 'cache-metadata.json');
  }

  /**
   * Get or initialize embedding service
   */
  private async getEmbeddingService(projectPath: string): Promise<EmbeddingService> {
    if (!this.embeddingService) {
      this.embeddingService = EmbeddingService.getInstance(projectPath);
      await this.embeddingService.initialize();
    }
    return this.embeddingService;
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
   * Chunk SOPs with section-aware splitting
   * Detects headers (##, ###, numbered sections) and keeps sections together
   */
  private chunkSectionAware(content: string, fileName: string, filePath: string): string[] {
    const chunks: string[] = [];
    const MIN_CHUNK_SIZE = 2000; // ~500 tokens
    const MAX_CHUNK_SIZE = 4000; // ~1000 tokens
    
    // Detect section headers: ##, ###, numbered (1., 1.1, etc.)
    // NOTE: /m flag only — do NOT use /g here.  RegExp.prototype.test() with /g
    // advances lastIndex after each match; calling .test() on successive lines
    // from a /g regex silently skips any header whose length < the previous lastIndex.
    const sectionRegex = /^(#{1,6}\s+.*|\d+\.(\d+\.)*\s+.*)$/m;
    const lines = content.split('\n');
    
    let currentChunk = '';
    let currentSection = '';
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const isHeader = sectionRegex.test(line.trim());
      
      if (isHeader && currentChunk.length > MIN_CHUNK_SIZE) {
        // Save current chunk and start new one
        if (currentChunk.trim()) {
          chunks.push(currentChunk.trim());
        }
        currentChunk = line + '\n';
      } else if (currentChunk.length + line.length > MAX_CHUNK_SIZE && currentChunk.length > MIN_CHUNK_SIZE) {
        // Chunk is getting too large, split here
        if (currentChunk.trim()) {
          chunks.push(currentChunk.trim());
        }
        currentChunk = line + '\n';
      } else {
        currentChunk += line + '\n';
      }
    }
    
    // Add final chunk
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }
    
    // If no sections detected, fall back to paragraph chunking
    if (chunks.length === 0 || (chunks.length === 1 && chunks[0].length > MAX_CHUNK_SIZE)) {
      return this.chunkWithOverlap(content, fileName, filePath);
    }
    
    return chunks;
  }

  /**
   * Chunk context files with paragraph-based splitting and overlap
   * Chunk size: 500-1000 tokens (~2000-4000 chars)
   * Overlap: 100 tokens (~400 chars)
   */
  private chunkWithOverlap(content: string, fileName: string, filePath: string): string[] {
    const chunks: string[] = [];
    const TARGET_CHUNK_SIZE = 3000; // ~750 tokens
    const MAX_CHUNK_SIZE = 4000; // ~1000 tokens
    const OVERLAP_SIZE = 400; // ~100 tokens
    
    // Split by paragraphs
    const paragraphs = content.split(/\n\n+/).filter(p => p.trim());
    
    let currentChunk = '';
    let previousOverlap = '';
    
    for (const paragraph of paragraphs) {
      const trimmed = paragraph.trim();
      if (!trimmed) continue;
      
      // Start new chunk with overlap from previous
      if (currentChunk.length === 0 && previousOverlap) {
        currentChunk = previousOverlap + '\n\n';
      }
      
      // Check if adding this paragraph would exceed max size
      if (currentChunk.length > 0 && (currentChunk.length + trimmed.length) > MAX_CHUNK_SIZE) {
        // Save current chunk
        chunks.push(currentChunk.trim());
        
        // Extract overlap (last OVERLAP_SIZE characters)
        previousOverlap = currentChunk.substring(Math.max(0, currentChunk.length - OVERLAP_SIZE)).trim();
        
        // Start new chunk with overlap
        currentChunk = previousOverlap + '\n\n' + trimmed;
      } else {
        // Add paragraph to current chunk
        if (currentChunk.length > 0) {
          currentChunk += '\n\n' + trimmed;
        } else {
          currentChunk = trimmed;
        }
      }
    }
    
    // Add final chunk
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }
    
    return chunks.length > 0 ? chunks : [content];
  }

  /**
   * Deterministic extractive summary — first N words of the document.
   * Replaces the previous LLM-generated summaries.  No API call, no
   * non-determinism.  The detailed chunks retrieved by vector search
   * already carry the actual content; the summary is supplementary
   * context that just needs to convey purpose/scope (almost always at
   * the top of a regulatory document).
   */
  private extractiveSummary(doc: ParsedDocument, summaryWordCount: number = 250): string {
    const words = doc.content.split(/\s+/).filter(w => w.length > 0);
    if (words.length <= summaryWordCount) {
      return doc.content.trim();
    }
    return words.slice(0, summaryWordCount).join(' ') + ' ...';
  }

/**
 * Chunk and embed a parsed document
 * Returns VectorEntry objects ready for storage
 */
private async chunkAndEmbedDocument(
  doc: ParsedDocument,
  category: 'procedure' | 'context',
  projectPath: string,
  contextCategory?: 'primary-context-root' | 'initiation' | 'ongoing' | 'predicates' | 'regulatory-strategy' | 'general'
): Promise<VectorEntry[]> {
  // 1. Intelligent chunking based on category
  const contentChunks = category === 'procedure'
    ? this.chunkSectionAware(doc.content, doc.fileName, doc.filePath)
    : this.chunkWithOverlap(doc.content, doc.fileName, doc.filePath);
  
  console.log(`[EnhancedRAG] Chunked ${doc.fileName}: ${contentChunks.length} chunks`);
  
  if (contentChunks.length === 0) {
    return [];
  }
  
  // 2. Generate embeddings for all chunks (batch processing)
  const embeddingService = await this.getEmbeddingService(projectPath);
  const embeddings = await embeddingService.embedBatch(
    contentChunks,
    Array(contentChunks.length).fill(doc.filePath)
  );
  
  // 3. Create VectorEntry objects
  const vectorEntries: VectorEntry[] = contentChunks.map((content, chunkIndex) => {
    return VectorStore.createEntry(
      content,
      embeddings[chunkIndex],
      {
        fileName: doc.fileName,
        filePath: doc.filePath,
        category,
        chunkIndex,
        contextCategory
      }
    );
  });
  
  return vectorEntries;
}

/**
 * Process all documents and build vector store
 * DETERMINISM: Files are sorted alphabetically before processing to ensure
 * consistent vector entry ordering across cache rebuilds
 */
private async buildVectorStore(
  proceduresFiles: ParsedDocument[],
  contextFiles: { doc: ParsedDocument; contextCategory: 'primary-context-root' | 'initiation' | 'ongoing' | 'predicates' | 'regulatory-strategy' | 'general' }[],
  projectPath: string
): Promise<void> {
  console.log('[EnhancedRAG] Building vector store with deterministic ordering...');
  
  // Get embedding service model info
  const embeddingService = await this.getEmbeddingService(projectPath);
  const modelInfo = embeddingService.getModelInfo();
  
  // Create new vector store
  this.vectorStore = new VectorStore(projectPath, modelInfo.version);
  
  // =========================================================================
  // DETERMINISM: Sort files alphabetically before processing
  // This ensures vectors are always added in the same order
  // =========================================================================
  
  // Sort procedures by fileName
  const sortedProcedures = [...proceduresFiles].sort((a, b) => 
    a.fileName.localeCompare(b.fileName)
  );
  
  // Sort context files by fileName
  const sortedContext = [...contextFiles].sort((a, b) => 
    a.doc.fileName.localeCompare(b.doc.fileName)
  );
  
  console.log('[EnhancedRAG] Processing files in sorted order for determinism...');
  
  // Process procedures sequentially (not in parallel) to maintain order
  const procedureVectors: VectorEntry[] = [];
  for (const doc of sortedProcedures) {
    const vectors = await this.chunkAndEmbedDocument(doc, 'procedure', projectPath);
    procedureVectors.push(...vectors);
  }
  
  // Process context files sequentially (not in parallel) to maintain order
  const contextVectors: VectorEntry[] = [];
  for (const { doc, contextCategory } of sortedContext) {
    const vectors = await this.chunkAndEmbedDocument(doc, 'context', projectPath, contextCategory);
    contextVectors.push(...vectors);
  }
  
  // Add to vector store in deterministic order: procedures first, then context
  const allVectors = [...procedureVectors, ...contextVectors];
  allVectors.forEach(entry => this.vectorStore!.addEntry(entry));
  
  // Save to disk only if caching is enabled
  if (this.cacheEnabled) {
    await this.vectorStore.save(this.getVectorStorePath(projectPath));
  } else {
    console.log('[EnhancedRAG] ⚠️  Skipping vector store save (caching disabled)');
  }
  
  console.log(`[EnhancedRAG] ✓ Vector store built: ${allVectors.length} chunks indexed (deterministic order)`);
}

  /**
   * Chunk a document into semantic segments (OLD - DEPRECATED)
   */
  private chunkDocument(doc: ParsedDocument): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    const content = doc.content;
    
    // Split by double newlines (paragraphs) or by sections
    const segments = content.split(/\n\n+/);
    
    // Combine small segments and split large ones to target ~500-1000 chars per chunk
    const targetChunkSize = 800;
    const maxChunkSize = 1500;
    
    let currentChunk = '';
    let chunkIndex = 0;
    
    for (const segment of segments) {
      const trimmed = segment.trim();
      if (!trimmed) continue;
      
      // If current chunk + segment is still reasonable size, combine them
      if (currentChunk.length > 0 && (currentChunk.length + trimmed.length) < maxChunkSize) {
        currentChunk += '\n\n' + trimmed;
      } else {
        // Save current chunk if it exists
        if (currentChunk.length > 0) {
          chunks.push({
            content: currentChunk,
            fileName: doc.fileName,
            filePath: doc.filePath,
            chunkIndex: chunkIndex++,
            totalChunks: 0, // Will update after
            keywords: this.extractKeywords(currentChunk)
          });
        }
        
        // Start new chunk
        // If segment itself is too large, split it
        if (trimmed.length > maxChunkSize) {
          const subChunks = this.splitLargeText(trimmed, targetChunkSize);
          for (const subChunk of subChunks) {
            chunks.push({
              content: subChunk,
              fileName: doc.fileName,
              filePath: doc.filePath,
              chunkIndex: chunkIndex++,
              totalChunks: 0,
              keywords: this.extractKeywords(subChunk)
            });
          }
          currentChunk = '';
        } else {
          currentChunk = trimmed;
        }
      }
    }
    
    // Don't forget the last chunk
    if (currentChunk.length > 0) {
      chunks.push({
        content: currentChunk,
        fileName: doc.fileName,
        filePath: doc.filePath,
        chunkIndex: chunkIndex++,
        totalChunks: 0,
        keywords: this.extractKeywords(currentChunk)
      });
    }
    
    // Update totalChunks for all chunks
    chunks.forEach(chunk => chunk.totalChunks = chunks.length);
    
    return chunks;
  }

  /**
   * Split large text into smaller chunks
   */
  private splitLargeText(text: string, targetSize: number): string[] {
    const chunks: string[] = [];
    const sentences = text.split(/\.(?:\s|$)/);
    
    let currentChunk = '';
    
    for (const sentence of sentences) {
      if (!sentence.trim()) continue;
      
      if (currentChunk.length + sentence.length < targetSize * 1.5) {
        currentChunk += sentence + '. ';
      } else {
        if (currentChunk) chunks.push(currentChunk.trim());
        currentChunk = sentence + '. ';
      }
    }
    
    if (currentChunk) chunks.push(currentChunk.trim());
    
    return chunks;
  }

  /**
   * Extract keywords from text for relevance matching
   */
  private extractKeywords(text: string): string[] {
    // Convert to lowercase and remove special characters
    const cleaned = text.toLowerCase().replace(/[^\w\s]/g, ' ');
    
    // Common stop words to filter out
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'been', 'be',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should',
      'could', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those'
    ]);
    
    // Extract words, filter stop words, count frequency
    const words = cleaned.split(/\s+/).filter(w => w.length > 3 && !stopWords.has(w));
    
    // Get unique important keywords (simple frequency-based)
    const frequency: Map<string, number> = new Map();
    words.forEach(word => frequency.set(word, (frequency.get(word) || 0) + 1));
    
    // Return top keywords sorted by frequency
    return Array.from(frequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([word]) => word);
  }

  /**
   * Load and chunk all files from Procedures folder
   */
  async loadProceduresFolder(folderPath: string): Promise<DocumentChunk[]> {
    console.log('[EnhancedRAG] Loading Procedures folder:', folderPath);
    
    try {
      await fs.access(folderPath);
      const documents = await this.fileParser.scanAndParseFolder(folderPath);
      console.log(`[EnhancedRAG] Loaded ${documents.length} files from Procedures folder`);
      
      // Chunk all documents
      const allChunks: DocumentChunk[] = [];
      for (const doc of documents) {
        const chunks = this.chunkDocument(doc);
        allChunks.push(...chunks);
      }
      
      console.log(`[EnhancedRAG] Created ${allChunks.length} chunks from Procedures`);
      return allChunks;
    } catch (error) {
      console.warn('[EnhancedRAG] Procedures folder not found or empty:', folderPath);
      return [];
    }
  }

/**
 * Load and chunk all files from Context folder (DEPRECATED - use loadContextFolderStructured)
 */
async loadContextFolder(folderPath: string): Promise<DocumentChunk[]> {
  console.log('[EnhancedRAG] Loading Context folder:', folderPath);
  
  try {
    await fs.access(folderPath);
    const documents = await this.fileParser.scanAndParseFolder(folderPath);
    console.log(`[EnhancedRAG] Loaded ${documents.length} files from Context folder`);
    
    // Chunk all documents
    const allChunks: DocumentChunk[] = [];
    for (const doc of documents) {
      const chunks = this.chunkDocument(doc);
      allChunks.push(...chunks);
    }
    
    console.log(`[EnhancedRAG] Created ${allChunks.length} chunks from Context`);
    return allChunks;
  } catch (error) {
    console.warn('[EnhancedRAG] Context folder not found or empty:', folderPath);
    return [];
  }
}

  /**
   * Hash content for cache validation
   */
  private hashContent(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }



  /**
   * Generate and cache summaries for all procedures
   */
  private async generateSOPSummaries(
    proceduresFiles: ParsedDocument[],
    projectPath: string,
    summaryWordCount: number = 250
  ): Promise<Map<string, string>> {
    const summaryCache = new Map<string, string>();
    
    if (proceduresFiles.length === 0) {
      return summaryCache;
    }
    
    console.log('[EnhancedRAG] Generating SOP summaries...');
    
    // Load existing cache if available
    const cachePath = this.getSOPSummariesCachePath(projectPath);
    let cached: any = {};
    
    try {
      const cacheData = await fs.readFile(cachePath, 'utf-8');
      cached = JSON.parse(cacheData);
      
      // Check if cached summaries are still valid
      for (const doc of proceduresFiles) {
        const hash = this.hashContent(doc.content);
        if (cached[doc.fileName] && cached[doc.fileName].hash === hash) {
          summaryCache.set(doc.fileName, cached[doc.fileName].summary);
          console.log(`[EnhancedRAG] ✓ Using cached summary for ${doc.fileName}`);
        }
      }
    } catch {
      // No cache exists, will generate fresh
      console.log('[EnhancedRAG] No existing summary cache found');
    }
    
    // Generate missing summaries
    for (const doc of proceduresFiles) {
      if (!summaryCache.has(doc.fileName)) {
        console.log(`[EnhancedRAG] Summarizing ${doc.fileName}...`);
        const summary = this.extractiveSummary(doc, summaryWordCount);
        summaryCache.set(doc.fileName, summary);
      }
    }
    
    // Save cache - preserve original timestamps for cached entries
    const cacheData: any = {};
    for (const doc of proceduresFiles) {
      const summary = summaryCache.get(doc.fileName);
      if (summary) {
        const hash = this.hashContent(doc.content);
        // Preserve original timestamp if entry was cached, otherwise use current time
        const existingEntry = cached[doc.fileName];
        const generatedAt = (existingEntry && existingEntry.hash === hash) 
          ? existingEntry.generatedAt 
          : new Date().toISOString();
        
        cacheData[doc.fileName] = {
          hash: hash,
          summary: summary,
          generatedAt: generatedAt
        };
      }
    }
    
    try {
      await fs.mkdir(path.dirname(cachePath), { recursive: true });
      await fs.writeFile(cachePath, JSON.stringify(cacheData, null, 2));
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.warn('[EnhancedRAG] Failed to save SOP summaries cache (non-fatal):', errorMsg);
      // Continue anyway - cache is optional
    }
    
    console.log('[EnhancedRAG] ✓ SOP summaries complete');
    return summaryCache;
  }

  /**
   * Generate and cache summaries for all context files
   */
  private async generateContextSummaries(
    contextFiles: { doc: ParsedDocument; contextCategory: 'primary-context-root' | 'initiation' | 'ongoing' | 'predicates' | 'regulatory-strategy' | 'general' }[],
    projectPath: string,
    summaryWordCount: number = 250
  ): Promise<Map<string, string>> {
    const summaryCache = new Map<string, string>();
    
    if (contextFiles.length === 0) {
      return summaryCache;
    }
    
    console.log('[EnhancedRAG] Generating Context file summaries...');
    
    // Load existing cache if available
    const cachePath = this.getContextSummariesCachePath(projectPath);
    let cached: any = {};
    
    try {
      const cacheData = await fs.readFile(cachePath, 'utf-8');
      cached = JSON.parse(cacheData);
      
      // Check if cached summaries are still valid
      for (const { doc } of contextFiles) {
        const hash = this.hashContent(doc.content);
        if (cached[doc.fileName] && cached[doc.fileName].hash === hash) {
          summaryCache.set(doc.fileName, cached[doc.fileName].summary);
          console.log(`[EnhancedRAG] ✓ Using cached summary for ${doc.fileName}`);
        }
      }
    } catch {
      // No cache exists, will generate fresh
      console.log('[EnhancedRAG] No existing context summary cache found');
    }
    
    // Generate missing summaries
    for (const { doc, contextCategory } of contextFiles) {
      if (!summaryCache.has(doc.fileName)) {
        console.log(`[EnhancedRAG] Summarizing ${doc.fileName}...`);
        const summary = this.extractiveSummary(doc, summaryWordCount);
        summaryCache.set(doc.fileName, summary);
      }
    }
    
    // Save cache - preserve original timestamps for cached entries
    const cacheData: any = {};
    for (const { doc } of contextFiles) {
      const summary = summaryCache.get(doc.fileName);
      if (summary) {
        const hash = this.hashContent(doc.content);
        // Preserve original timestamp if entry was cached, otherwise use current time
        const existingEntry = cached[doc.fileName];
        const generatedAt = (existingEntry && existingEntry.hash === hash) 
          ? existingEntry.generatedAt 
          : new Date().toISOString();
        
        cacheData[doc.fileName] = {
          hash: hash,
          summary: summary,
          generatedAt: generatedAt
        };
      }
    }
    
    try {
      await fs.mkdir(path.dirname(cachePath), { recursive: true });
      await fs.writeFile(cachePath, JSON.stringify(cacheData, null, 2));
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.warn('[EnhancedRAG] Failed to save Context summaries cache (non-fatal):', errorMsg);
      // Continue anyway - cache is optional
    }
    
    console.log('[EnhancedRAG] ✓ Context file summaries complete');
    return summaryCache;
  }

  /**
   * Recursively get all files from a directory
   * @param dirPath - Directory to scan
   * @param excludeDirs - Directory names to skip (e.g., ['Prompt', 'node_modules'])
   */
  private async getAllFiles(dirPath: string, excludeDirs: string[] = []): Promise<string[]> {
    const files: string[] = [];
    
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isDirectory()) {
          // Skip excluded directories (like Prompt folder)
          if (excludeDirs.includes(entry.name)) {
            console.log(`[EnhancedRAG] ⏭️  Skipping excluded directory: ${entry.name} (not cached)`);
            continue;
          }
          const subFiles = await this.getAllFiles(fullPath, excludeDirs);
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
   * Compute fingerprint for a folder (all file paths, sizes, and mtimes)
   * @param folderPath - Folder to fingerprint
   * @param excludeDirs - Directory names to exclude from fingerprint (e.g., 'Prompt')
   */
  private async computeFolderFingerprint(folderPath: string, excludeDirs: string[] = []): Promise<string> {
    try {
      await fs.access(folderPath);
      
      const files = await this.getAllFiles(folderPath, excludeDirs);
      
      if (files.length === 0) {
        console.log(`[EnhancedRAG] No files found in ${folderPath} for fingerprinting`);
      } else {
        console.log(`[EnhancedRAG] Computing fingerprint for ${files.length} files in ${path.basename(folderPath)}/`);
      }
      
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
      console.log(`[EnhancedRAG] Folder ${path.basename(folderPath)}/ not found, using empty fingerprint`);
      return crypto.createHash('sha256').update('empty').digest('hex');
    }
  }

  /**
   * Compute combined fingerprint for cache validation
   * Excludes Context/Prompt folder - those files are parsed fresh each time
   */
  private async computeCacheFingerprint(
    projectPath: string,
    primaryContextPath: string
  ): Promise<string> {
    const proceduresPath = path.join(projectPath, 'Procedures');
    const contextPath = path.join(projectPath, 'Context');
    
    console.log(`[EnhancedRAG] 🔍 Computing cache fingerprint...`);
    
    // Get fingerprints for all three sources
    // Note: Context folder excludes "Prompt" subfolder - those are never cached
    const [primaryStats, proceduresFingerprint, contextFingerprint] = await Promise.all([
      fs.stat(primaryContextPath).catch(() => ({ mtimeMs: 0, size: 0 })),
      this.computeFolderFingerprint(proceduresPath),
      this.computeFolderFingerprint(contextPath, ['Prompt']) // EXCLUDE Prompt folder
    ]);
    
    const primaryFingerprint = `${primaryContextPath}:${primaryStats.size}:${primaryStats.mtimeMs}`;
    const combined = `${primaryFingerprint}|${proceduresFingerprint}|${contextFingerprint}`;
    
    return crypto.createHash('sha256').update(combined).digest('hex');
  }

/**
 * Load and organize files from Context folder with subfolder structure
 * Returns documents tagged with their context category
 * 
 * IMPORTANT: This method excludes the Context/Prompt folder completely.
 * Prompt files are NEVER cached and should be parsed on-demand each time.
 */
async loadContextFolderStructured(
  folderPath: string
): Promise<{ doc: ParsedDocument; contextCategory: 'primary-context-root' | 'initiation' | 'ongoing' | 'predicates' | 'regulatory-strategy' | 'general' }[]> {
  console.log('[EnhancedRAG] 📂 Loading Context folder with subfolder structure:', folderPath);
  console.log('[EnhancedRAG] NOTE: Context/Prompt folder is excluded (never cached, parsed on-demand)');
  
  const contextFiles: { doc: ParsedDocument; contextCategory: 'primary-context-root' | 'initiation' | 'ongoing' | 'predicates' | 'regulatory-strategy' | 'general' }[] = [];
  
  try {
    await fs.access(folderPath);
  } catch {
    console.warn('[EnhancedRAG] ⚠️  Context folder not found:', folderPath);
    return [];
  }
  
  // 1. Check for root-level files (e.g., "Primary Context.docx")
  // Only scan root level, not recursive
  console.log('[EnhancedRAG] Scanning root level of Context/ for Primary Context.docx...');
  try {
    const rootEntries = await fs.readdir(folderPath, { withFileTypes: true });
    const rootFiles = rootEntries.filter(e => e.isFile()).map(e => e.name);
    
    if (rootFiles.length > 0) {
      console.log(`[EnhancedRAG] Found ${rootFiles.length} file(s) at root: ${rootFiles.join(', ')}`);
      
      // Parse only root-level files that match Primary Context
      for (const fileName of rootFiles) {
        if (fileName === 'Primary Context.docx' || fileName.toLowerCase().includes('primary')) {
          const filePath = path.join(folderPath, fileName);
          try {
            // Use scanAndParseFolder on the containing directory and filter
            const allDocs = await this.fileParser.scanAndParseFolder(folderPath);
            const doc = allDocs.find(d => d.fileName === fileName);
            if (doc) {
              contextFiles.push({ doc, contextCategory: 'primary-context-root' });
              console.log(`[EnhancedRAG] ✓ Loaded and will cache: ${fileName} (${doc.content.length} chars)`);
            }
          } catch (err) {
            console.warn(`[EnhancedRAG] Failed to parse ${fileName}:`, err);
          }
        }
      }
    } else {
      console.log('[EnhancedRAG] No files found at root level of Context/');
    }
  } catch (err) {
    console.warn('[EnhancedRAG] Error scanning root level:', err);
  }
  
  // 2. Load Initiation subfolder
  const initiationPath = path.join(folderPath, 'Initiation');
  console.log('[EnhancedRAG] Scanning Context/Initiation/...');
  try {
    await fs.access(initiationPath);
    const initiationDocs = await this.fileParser.scanAndParseFolder(initiationPath);
    initiationDocs.forEach(doc => {
      contextFiles.push({ doc, contextCategory: 'initiation' });
      console.log(`[EnhancedRAG] ✓ Loaded and will cache: Initiation/${doc.fileName} (${doc.content.length} chars)`);
    });
    console.log(`[EnhancedRAG] ✓ Total from Initiation/: ${initiationDocs.length} files`);
  } catch {
    console.log('[EnhancedRAG] Context/Initiation/ not found or empty');
  }
  
  // 3. Load Ongoing subfolder
  const ongoingPath = path.join(folderPath, 'Ongoing');
  console.log('[EnhancedRAG] Scanning Context/Ongoing/...');
  try {
    await fs.access(ongoingPath);
    const ongoingDocs = await this.fileParser.scanAndParseFolder(ongoingPath);
    ongoingDocs.forEach(doc => {
      contextFiles.push({ doc, contextCategory: 'ongoing' });
      console.log(`[EnhancedRAG] ✓ Loaded and will cache: Ongoing/${doc.fileName} (${doc.content.length} chars)`);
    });
    console.log(`[EnhancedRAG] ✓ Total from Ongoing/: ${ongoingDocs.length} files`);
  } catch {
    console.log('[EnhancedRAG] Context/Ongoing/ not found or empty');
  }
  
  // 4. Load Predicates subfolder
  const predicatesPath = path.join(folderPath, 'Predicates');
  console.log('[EnhancedRAG] Scanning Context/Predicates/...');
  try {
    await fs.access(predicatesPath);
    const predicatesDocs = await this.fileParser.scanAndParseFolder(predicatesPath);
    predicatesDocs.forEach(doc => {
      contextFiles.push({ doc, contextCategory: 'predicates' });
      console.log(`[EnhancedRAG] ✓ Loaded and will cache: Predicates/${doc.fileName} (${doc.content.length} chars)`);
    });
    console.log(`[EnhancedRAG] ✓ Total from Predicates/: ${predicatesDocs.length} files`);
  } catch {
    console.log('[EnhancedRAG] Context/Predicates/ not found or empty');
  }
  
  // 5. Load Regulatory Strategy subfolder (on_demand priority)
  const regulatoryStrategyPath = path.join(folderPath, 'Regulatory Strategy');
  console.log('[EnhancedRAG] Scanning Context/Regulatory Strategy/...');
  try {
    await fs.access(regulatoryStrategyPath);
    const regulatoryStrategyDocs = await this.fileParser.scanAndParseFolder(regulatoryStrategyPath);
    regulatoryStrategyDocs.forEach(doc => {
      contextFiles.push({ doc, contextCategory: 'regulatory-strategy' });
      console.log(`[EnhancedRAG] ✓ Loaded and will cache: Regulatory Strategy/${doc.fileName} (${doc.content.length} chars)`);
    });
    console.log(`[EnhancedRAG] ✓ Total from Regulatory Strategy/: ${regulatoryStrategyDocs.length} files`);
  } catch {
    console.log('[EnhancedRAG] Context/Regulatory Strategy/ not found or empty');
  }
  
  // 6. Load General subfolder (on_demand priority)
  const generalPath = path.join(folderPath, 'General');
  console.log('[EnhancedRAG] Scanning Context/General/...');
  try {
    await fs.access(generalPath);
    const generalDocs = await this.fileParser.scanAndParseFolder(generalPath);
    generalDocs.forEach(doc => {
      contextFiles.push({ doc, contextCategory: 'general' });
      console.log(`[EnhancedRAG] ✓ Loaded and will cache: General/${doc.fileName} (${doc.content.length} chars)`);
    });
    console.log(`[EnhancedRAG] ✓ Total from General/: ${generalDocs.length} files`);
  } catch {
    console.log('[EnhancedRAG] Context/General/ not found or empty');
  }
  
  // NOTE: Context/Prompt is intentionally NOT scanned here - those files are parsed on-demand
  
  console.log(`[EnhancedRAG] 📊 TOTAL context files to cache: ${contextFiles.length}`);
  if (contextFiles.length > 0) {
    console.log('[EnhancedRAG] Files breakdown:');
    const byCategory = contextFiles.reduce((acc, cf) => {
      acc[cf.contextCategory] = (acc[cf.contextCategory] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    Object.entries(byCategory).forEach(([cat, count]) => {
      console.log(`[EnhancedRAG]   - ${cat}: ${count} file(s)`);
    });
  }
  
  return contextFiles;
}

  /**
   * Detect what changed in the cache
   */
  private async detectCacheChanges(
    projectPath: string,
    primaryContextPath: string,
    cachedFingerprint: string
  ): Promise<{
    changed: boolean;
    primaryContextChanged: boolean;
    proceduresChanged: boolean;
    contextChanged: boolean;
    details: string[];
  }> {
    const proceduresPath = path.join(projectPath, 'Procedures');
    const contextPath = path.join(projectPath, 'Context');
    
    // Get current fingerprints
    const currentFingerprint = await this.computeCacheFingerprint(projectPath, primaryContextPath);
    
    // Compare
    const changed = cachedFingerprint !== currentFingerprint;
    const details: string[] = [];
    
    if (!changed) {
      return { changed: false, primaryContextChanged: false, proceduresChanged: false, contextChanged: false, details: [] };
    }
    
    // Detect what changed by comparing individual components
    try {
      // Check if files exist and count them
      const proceduresFiles = await this.getAllFiles(proceduresPath).catch(() => []);
      const contextFiles = await this.getAllFiles(contextPath, ['Prompt']).catch(() => []);
      
      details.push(`Current state: ${proceduresFiles.length} procedure files, ${contextFiles.length} context files`);
    } catch {
      details.push('Unable to determine specific changes');
    }
    
    return {
      changed: true,
      primaryContextChanged: false, // We can't determine this without storing old fingerprints
      proceduresChanged: false,
      contextChanged: false,
      details
    };
  }

  /**
   * Save cache metadata to disk
   */
  private async saveCacheMetadata(cache: KnowledgeCache): Promise<void> {
    // Skip saving if caching is disabled
    if (!this.cacheEnabled) {
      console.log('[EnhancedRAG] ⚠️  Skipping cache metadata save (caching disabled)');
      return;
    }
    
    const metadataPath = this.getCacheMetadataPath(cache.projectPath);
    
    console.log(`[EnhancedRAG] 💾 [CACHE] Saving cache metadata to: ${metadataPath}`);
    
    try {
      const dir = path.dirname(metadataPath);
      await fs.mkdir(dir, { recursive: true });
      console.log(`[EnhancedRAG] 📁 [CACHE] Cache directory created/verified: ${dir}`);
      
      const jsonData = JSON.stringify(cache, null, 2);
      await fs.writeFile(metadataPath, jsonData, 'utf8');
      
      // Verify the file was actually written
      try {
        const stats = await fs.stat(metadataPath);
        console.log(`[EnhancedRAG] ✅ [CACHE] Cache metadata saved successfully (${stats.size} bytes)`);
        console.log(`[EnhancedRAG] 📊 [CACHE] Cache fingerprint: ${cache.fingerprint.substring(0, 16)}...`);
      } catch (verifyError) {
        console.error(`[EnhancedRAG] ⚠️  [CACHE] File written but verification failed:`, verifyError);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[EnhancedRAG] ❌ [CACHE] Failed to save cache metadata:`, errorMsg);
      console.error(`[EnhancedRAG] ❌ [CACHE] Target path was: ${metadataPath}`);
      // Continue anyway - cache metadata is optional but helpful
    }
  }

  /**
   * Load cache metadata from disk
   */
  private async loadCacheMetadata(projectPath: string): Promise<KnowledgeCache | null> {
    const metadataPath = this.getCacheMetadataPath(projectPath);
    
    console.log(`[EnhancedRAG] 🔍 [CACHE] Attempting to load cache metadata from: ${metadataPath}`);
    
    try {
      // First check if file exists
      try {
        const stats = await fs.stat(metadataPath);
        console.log(`[EnhancedRAG] 📂 [CACHE] Cache metadata file found (${stats.size} bytes)`);
      } catch (statError) {
        if ((statError as NodeJS.ErrnoException).code === 'ENOENT') {
          console.log('[EnhancedRAG] ❌ [CACHE] Cache metadata file does not exist (ENOENT)');
          return null;
        }
        throw statError;
      }
      
      const fileContents = await fs.readFile(metadataPath, 'utf8');
      const cache: KnowledgeCache = JSON.parse(fileContents);
      
      console.log('[EnhancedRAG] ✅ [CACHE] Cache metadata loaded from disk successfully');
      console.log(`[EnhancedRAG] 📊 [CACHE] Cached fingerprint: ${cache.fingerprint.substring(0, 16)}...`);
      console.log(`[EnhancedRAG] 📊 [CACHE] Cache indexed at: ${cache.indexedAt}`);
      
      return cache;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        console.log('[EnhancedRAG] ❌ [CACHE] Cache metadata file does not exist (ENOENT)');
      } else {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error('[EnhancedRAG] ❌ [CACHE] Failed to load cache metadata:', errorMsg);
      }
      return null;
    }
  }

  /**
   * Clear old cache files for a project
   */
  private async clearOldCache(projectPath: string): Promise<void> {
    console.log('[EnhancedRAG] 🗑️  Clearing old cache files...');
    
    try {
      const vectorStorePath = this.getVectorStorePath(projectPath);
      const sopSummariesPath = this.getSOPSummariesCachePath(projectPath);
      const contextSummariesPath = this.getContextSummariesCachePath(projectPath);
      const metadataPath = this.getCacheMetadataPath(projectPath);
      
      // Try to delete vector store
      try {
        await fs.unlink(vectorStorePath);
        console.log('[EnhancedRAG] ✓ Deleted old vector store');
      } catch (error) {
        // File might not exist, which is fine
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          console.log('[EnhancedRAG] ⚠️  Could not delete old vector store (continuing anyway)');
        }
      }
      
      // Try to delete SOP summaries
      try {
        await fs.unlink(sopSummariesPath);
        console.log('[EnhancedRAG] ✓ Deleted old SOP summaries cache');
      } catch (error) {
        // File might not exist, which is fine
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          console.log('[EnhancedRAG] ⚠️  Could not delete old SOP summaries (continuing anyway)');
        }
      }
      
      // Try to delete Context summaries
      try {
        await fs.unlink(contextSummariesPath);
        console.log('[EnhancedRAG] ✓ Deleted old Context summaries cache');
      } catch (error) {
        // File might not exist, which is fine
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          console.log('[EnhancedRAG] ⚠️  Could not delete old Context summaries (continuing anyway)');
        }
      }
      
      // Try to delete cache metadata
      try {
        await fs.unlink(metadataPath);
        console.log('[EnhancedRAG] ✓ Deleted old cache metadata');
      } catch (error) {
        // File might not exist, which is fine
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          console.log('[EnhancedRAG] ⚠️  Could not delete old cache metadata (continuing anyway)');
        }
      }
    } catch (error) {
      console.warn('[EnhancedRAG] ⚠️  Error during cache cleanup (non-fatal):', error);
    }
  }

  /**
   * Check if cache is valid for a project
   */
  async isCacheValid(projectPath: string, primaryContextPath: string): Promise<boolean> {
    // If caching is disabled, always return false to force rebuild
    if (!this.cacheEnabled) {
      return false;
    }
    
    console.log('[EnhancedRAG] 🔍 [CACHE] ========================================');
    console.log('[EnhancedRAG] 🔍 [CACHE] Checking cache validity for project');
    console.log(`[EnhancedRAG] 🔍 [CACHE] Project path: ${projectPath}`);
    console.log('[EnhancedRAG] 🔍 [CACHE] ========================================');
    
    // Try to get from memory first
    let cached = this.cache.get(projectPath);
    
    if (cached) {
      console.log('[EnhancedRAG] 📦 [CACHE] Cache found in MEMORY');
    } else {
      console.log('[EnhancedRAG] 📦 [CACHE] Cache NOT in memory, checking disk...');
    }
    
    // If not in memory, try loading from disk
    if (!cached) {
      const diskCache = await this.loadCacheMetadata(projectPath);
      if (diskCache !== null) {
        // Store in memory for subsequent checks
        cached = diskCache;
        this.cache.set(projectPath, diskCache);
        console.log('[EnhancedRAG] ✅ [CACHE] Cache metadata restored from disk to memory');
      } else {
        console.log('[EnhancedRAG] ❌ [CACHE] No cached knowledge found (memory or disk)');
        console.log('[EnhancedRAG] 🔍 [CACHE] ========================================');
        return false;
      }
    }
    
    console.log('[EnhancedRAG] 🔍 [CACHE] Computing current fingerprint...');
    const currentFingerprint = await this.computeCacheFingerprint(projectPath, primaryContextPath);
    console.log(`[EnhancedRAG] 🔍 [CACHE] Current fingerprint: ${currentFingerprint.substring(0, 16)}...`);
    console.log(`[EnhancedRAG] 🔍 [CACHE] Cached fingerprint: ${cached.fingerprint.substring(0, 16)}...`);
    
    const isValid = cached.fingerprint === currentFingerprint;
    
    if (isValid) {
      console.log('[EnhancedRAG] ✅ [CACHE] Cache is VALID (fingerprints match)');
      console.log(`[EnhancedRAG] 📊 [CACHE] Cache was built at: ${cached.indexedAt}`);
      console.log('[EnhancedRAG] 🔍 [CACHE] ========================================');
    } else {
      console.log('[EnhancedRAG] ⚠️  [CACHE] Cache EXPIRED - fingerprint mismatch');
      console.log(`[EnhancedRAG] 📊 [CACHE] Old fingerprint: ${cached.fingerprint.substring(0, 16)}...`);
      console.log(`[EnhancedRAG] 📊 [CACHE] New fingerprint: ${currentFingerprint.substring(0, 16)}...`);
      
      // Detect what changed
      const changes = await this.detectCacheChanges(projectPath, primaryContextPath, cached.fingerprint);
      if (changes.details.length > 0) {
        changes.details.forEach((detail: string) => console.log(`[EnhancedRAG] 📋 [CACHE] ${detail}`));
      }
      console.log('[EnhancedRAG] 🔍 [CACHE] ========================================');
    }
    
    return isValid;
  }

  /**
   * Ensure cache is built with mutex protection (CONCURRENCY-SAFE)
   * Use this method instead of loadKnowledge() to prevent race conditions
   * when multiple requests arrive simultaneously
   * 
   * Uses async-mutex to provide TRUE mutual exclusion - only one request
   * can execute the cache build logic at a time within this process.
   */
  async ensureCacheBuilt(
    projectPath: string,
    primaryContextPath: string
  ): Promise<KnowledgeCache> {
    console.log('[EnhancedRAG] 🔐 Ensuring cache is built (with GLOBAL mutex protection)...');
    
    // Acquire GLOBAL mutex - this BLOCKS until we get exclusive access
    // Using globalBuildMutex ensures ALL instances (even if multiple created) coordinate
    const release = await globalBuildMutex.acquire();
    console.log('[EnhancedRAG] 🔒 GLOBAL Mutex acquired - we have exclusive access');
    
    try {
      // Check cache validity (only ONE request at a time does this)
      const cacheValid = await this.isCacheValid(projectPath, primaryContextPath);
      if (cacheValid) {
        console.log('[EnhancedRAG] ✓ Cache valid, returning immediately (no rebuild needed)');
        // Load vector store if not already loaded
        if (!this.vectorStore) {
          const vectorStorePath = this.getVectorStorePath(projectPath);
          this.vectorStore = await VectorStore.load(vectorStorePath, projectPath);
        }
        return this.cache.get(projectPath)!;
      }
      
      // Cache invalid, proceed with rebuild (only ONE request does this)
      console.log('[EnhancedRAG] 🏗️  Cache invalid, proceeding with rebuild...');
      const result = await this.doEnsureCacheBuilt(projectPath, primaryContextPath);
      return result;
      
    } finally {
      // ALWAYS release mutex so next request can proceed
      release();
      console.log('[EnhancedRAG] 🔓 GLOBAL Mutex released - next request can proceed');
    }
  }

  /**
   * Actually build cache with file lock protection (internal)
   */
  private async doEnsureCacheBuilt(
    projectPath: string,
    primaryContextPath: string
  ): Promise<KnowledgeCache> {
    // Acquire lock for cache rebuild (this will wait if another PROCESS has the lock)
    console.log('[EnhancedRAG] 🔒 Acquiring lock for cache rebuild...');
    const lock = await this.lockManager.acquireLock(projectPath);
    
    try {
      // Double-check cache validity after acquiring lock
      // (another process may have built it while we were waiting for the lock)
      const stillInvalid = !(await this.isCacheValid(projectPath, primaryContextPath));
      
      if (!stillInvalid) {
        console.log('[EnhancedRAG] ✓ Cache was built by another process while waiting for lock, using it');
        // Load vector store if not already loaded
        if (!this.vectorStore) {
          const vectorStorePath = this.getVectorStorePath(projectPath);
          this.vectorStore = await VectorStore.load(vectorStorePath, projectPath);
        }
        return this.cache.get(projectPath)!;
      }
      
      // Cache is still invalid, rebuild it
      console.log('[EnhancedRAG] 🔄 We have the lock, rebuilding cache...');
      const result = await this.loadKnowledge(projectPath, primaryContextPath);
      return result;
      
    } finally {
      // Always release lock
      try {
        await lock.release();
      } catch (error) {
        // Ignore "already released" errors - this can happen if lock was released elsewhere
        if (error instanceof Error && !error.message.includes('already released')) {
          console.error('[EnhancedRAG] Error releasing lock:', error);
        }
      }
    }
  }

  /**
   * Load all knowledge sources with caching
   * NOTE: Use ensureCacheBuilt() instead for concurrency safety
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
      // Load vector store from disk
      const vectorStorePath = this.getVectorStorePath(projectPath);
      this.vectorStore = await VectorStore.load(vectorStorePath, projectPath);
      
      const cached = this.cache.get(projectPath)!;
      console.log('[EnhancedRAG] 📊 Cached Knowledge Statistics:');
      console.log(`[EnhancedRAG]    - Last built: ${cached.indexedAt}`);
      console.log(`[EnhancedRAG]    - Cache location: ${path.dirname(vectorStorePath)}`);
      console.log('[EnhancedRAG] ========================================\n');
      
      return cached;
    }
    
    console.log('[EnhancedRAG] 🔄 Cache invalid or missing - regenerating...\n');
    
    // Clear old cache files before rebuilding
    await this.clearOldCache(projectPath);
    
    // Load primary context
    const primaryContext = await this.loadPrimaryContext(primaryContextPath);
    
    // Load and parse documents
    const proceduresPath = path.join(projectPath, 'Procedures');
    const contextPath = path.join(projectPath, 'Context');
    
    let proceduresFiles: ParsedDocument[] = [];
    let contextFiles: { doc: ParsedDocument; contextCategory: 'primary-context-root' | 'initiation' | 'ongoing' | 'predicates' | 'regulatory-strategy' | 'general' }[] = [];
    
    try {
      await fs.access(proceduresPath);
      proceduresFiles = await this.fileParser.scanAndParseFolder(proceduresPath);
      console.log(`[EnhancedRAG] Loaded ${proceduresFiles.length} files from Procedures folder`);
    } catch (error) {
      console.warn('[EnhancedRAG] Procedures folder not found or empty');
    }
    
    try {
      await fs.access(contextPath);
      contextFiles = await this.loadContextFolderStructured(contextPath);
      console.log(`[EnhancedRAG] Loaded ${contextFiles.length} files from Context folder (with subfolder structure)`);
    } catch (error) {
      console.warn('[EnhancedRAG] Context folder not found or empty');
    }
    
    // Build vector store if there are documents to process
    if (proceduresFiles.length > 0 || contextFiles.length > 0) {
      console.log('[EnhancedRAG] 🔄 Regenerating vector store...');
      console.log(`[EnhancedRAG]    - Processing ${proceduresFiles.length} procedure files`);
      console.log(`[EnhancedRAG]    - Processing ${contextFiles.length} context files`);
      
      const buildStart = Date.now();
      await this.buildVectorStore(proceduresFiles, contextFiles, projectPath);
      const buildDuration = ((Date.now() - buildStart) / 1000).toFixed(1);
      
      console.log(`[EnhancedRAG] ✅ Vector store regenerated in ${buildDuration}s`);
    } else {
      console.log('[EnhancedRAG] ⚠️  No documents to index, creating empty vector store');
      const embeddingService = await this.getEmbeddingService(projectPath);
      const modelInfo = embeddingService.getModelInfo();
      this.vectorStore = new VectorStore(projectPath, modelInfo.version);
      // Save empty vector store
      await this.vectorStore.save(this.getVectorStorePath(projectPath));
    }
    
    // Compute fingerprint including vector store
    const fingerprint = await this.computeCacheFingerprint(projectPath, primaryContextPath);
    const vectorStoreFingerprint = this.vectorStore?.getFingerprint() || 'empty';
    
    // Create cache entry
    const knowledgeCache: KnowledgeCache = {
      projectPath,
      fingerprint,
      primaryContext,
      indexedAt: new Date().toISOString(),
      vectorStoreFingerprint
    };
    
    // Store in memory cache
    this.cache.set(projectPath, knowledgeCache);
    
    // Save cache metadata to disk for persistence across restarts
    await this.saveCacheMetadata(knowledgeCache);
    
    const stats = this.vectorStore!.getStats();
    const vectorStorePath = this.getVectorStorePath(projectPath);
    
    console.log('[EnhancedRAG] ========================================');
    console.log('[EnhancedRAG] ✅ Knowledge Base Regeneration Complete');
    console.log('[EnhancedRAG] ========================================');
    console.log(`[EnhancedRAG] 📊 Statistics:`);
    console.log(`[EnhancedRAG]    - Primary Context: ✓`);
    console.log(`[EnhancedRAG]    - Procedures: ${stats.procedureEntries} chunks`);
    console.log(`[EnhancedRAG]    - Context: ${stats.contextEntries} chunks`);
    console.log(`[EnhancedRAG]    - Total Vectors: ${stats.totalEntries}`);
    console.log(`[EnhancedRAG] 💾 Cache Details:`);
    console.log(`[EnhancedRAG]    - Built at: ${knowledgeCache.indexedAt}`);
    console.log(`[EnhancedRAG]    - Location: ${path.dirname(vectorStorePath)}`);
    console.log(`[EnhancedRAG]    - Cache Fingerprint: ${fingerprint.substring(0, 16)}...`);
    console.log(`[EnhancedRAG]    - VectorStore Fingerprint: ${vectorStoreFingerprint.substring(0, 16)}...`);
    console.log('[EnhancedRAG] ========================================\n');
    
    return knowledgeCache;
  }

  /**
   * Calculate relevance score between query and chunk
   */
  private calculateRelevance(queryKeywords: string[], chunk: DocumentChunk): number {
    const chunkKeywords = new Set(chunk.keywords);
    let matches = 0;
    
    // Count how many query keywords appear in chunk keywords
    for (const keyword of queryKeywords) {
      if (chunkKeywords.has(keyword)) {
        matches++;
      }
    }
    
    // Normalize by query length
    return queryKeywords.length > 0 ? matches / queryKeywords.length : 0;
  }

  /**
   * Retrieve top-K most relevant chunks using embeddings
   */
  private async retrieveRelevantChunksWithEmbeddings(
    chunks: DocumentChunk[],
    chunkEmbeddings: Float32Array[],
    queryText: string,
    projectPath: string,
    topK: number = 5
  ): Promise<DocumentChunk[]> {
    try {
      const embeddingService = await this.getEmbeddingService(projectPath);
      
      // Generate embedding for query
      const queryEmbedding = await embeddingService.embedText(queryText);
      
      // Find top-K most similar chunks
      const topMatches = EmbeddingService.findTopK(queryEmbedding, chunkEmbeddings, topK);
      
      // Return the chunks in order of similarity
      return topMatches.map(match => chunks[match.index]);
    } catch (error) {
      console.warn('[EnhancedRAG] Embedding-based retrieval failed, falling back to keywords:', error);
      // Fallback to keyword-based retrieval
      const queryKeywords = this.extractKeywords(queryText);
      return this.retrieveRelevantChunks(chunks, queryKeywords, topK);
    }
  }

  /**
   * Retrieve top-K most relevant chunks based on query (keyword-based fallback)
   */
  private retrieveRelevantChunks(
    chunks: DocumentChunk[],
    queryKeywords: string[],
    topK: number = 5
  ): DocumentChunk[] {
    // Score all chunks
    const scoredChunks = chunks.map(chunk => ({
      chunk,
      score: this.calculateRelevance(queryKeywords, chunk)
    }));
    
    // Sort by score and take top K
    return scoredChunks
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map(sc => sc.chunk);
  }

  /**
   * Parse explicit context references from prompt to determine which on-demand folders are requested
   * Returns set of context categories that were explicitly referenced
   */
  private parseExplicitContextReferences(prompt: string): Set<'regulatory-strategy' | 'general'> {
    const referenced = new Set<'regulatory-strategy' | 'general'>();
    
    // Pattern: [Context|{folder}|{filename}]
    const contextPattern = /\[Context\|([^|\]]+)\|[^\]]+\]/gi;
    let match;
    
    while ((match = contextPattern.exec(prompt)) !== null) {
      const folder = match[1].trim().toLowerCase();
      
      if (folder === 'regulatory strategy' || folder === 'regulatory-strategy') {
        referenced.add('regulatory-strategy');
      } else if (folder === 'general') {
        referenced.add('general');
      }
    }
    
    return referenced;
  }

  /**
   * Retrieve relevant context for a prompt using semantic search
   * Enforces retrieval_priority rules from primary-context.yaml:
   * - regulatory_strategy and general are ONLY included if explicitly referenced
   */
  async retrieveRelevantContext(
    projectPath: string,
    primaryContextPath: string,
    prompt: string,
    options: {
      topK?: number;              // Default: 10
      procedureChunks?: number;   // How many procedure chunks (default: 5)
      contextChunks?: number;     // How many context file chunks (default: 5)
      includeFullPrimary?: boolean; // Always include full primary context (default: true)
      maxTokens?: number;         // Maximum tokens for context (default: 150000)
      includeSummaries?: boolean; // Include SOP summaries (default: true)
      summaryWordCount?: number;  // Summary word count (default: 250)
    } = {}
  ): Promise<{
    ragContext: string;
    metadata: {
      primaryContextIncluded: boolean;
      procedureChunksRetrieved: number;
      contextChunksRetrieved: number;
      summariesGenerated: number;
      contextSummariesGenerated: number;
      totalTokensEstimate: number;
      sources: string[];
    };
    procedureChunks: SearchResult[];
    contextChunks: SearchResult[];
  }> {
    // 1. Parse prompt for explicit on-demand references (regulatory-strategy, general)
    const explicitlyReferencedCategories = this.parseExplicitContextReferences(prompt);
    const excludeGeneral = !explicitlyReferencedCategories.has('general');
    const excludeRegStrategy = !explicitlyReferencedCategories.has('regulatory-strategy');
    
    console.log('[EnhancedRAG] 🔒 RETRIEVAL POLICY ENFORCEMENT:');
    if (excludeGeneral) {
      console.log('[EnhancedRAG]    ⛔ Context/General/ EXCLUDED (not explicitly referenced in prompt)');
    } else {
      console.log('[EnhancedRAG]    ✅ Context/General/ INCLUDED (explicitly referenced in prompt)');
    }
    if (excludeRegStrategy) {
      console.log('[EnhancedRAG]    ⛔ Context/Regulatory Strategy/ EXCLUDED (not explicitly referenced in prompt)');
    } else {
      console.log('[EnhancedRAG]    ✅ Context/Regulatory Strategy/ INCLUDED (explicitly referenced in prompt)');
    }
    
    // 2. Load knowledge with lock protection (prevents concurrent rebuild collisions)
    const knowledge = await this.ensureCacheBuilt(projectPath, primaryContextPath);
    
    // 3. Generate SOP summaries if requested (with GLOBAL mutex protection)
    // 3. Generate SOP summaries if requested (with GLOBAL mutex protection)
    let sopSummaries = new Map<string, string>();
    if (options.includeSummaries ?? true) {
      // Acquire GLOBAL summary mutex to prevent duplicate summary generation
      const releaseSummary = await globalSummaryMutex.acquire();
      console.log('[EnhancedRAG] 🔒 Summary mutex acquired - generating SOP summaries...');
      
      try {
        // Get procedure files
        const proceduresPath = path.join(projectPath, 'Procedures');
        let proceduresFiles: ParsedDocument[] = [];
        try {
          await fs.access(proceduresPath);
          proceduresFiles = await this.fileParser.scanAndParseFolder(proceduresPath);
        } catch {
          // No procedures folder
        }
        
        if (proceduresFiles.length > 0) {
          sopSummaries = await this.generateSOPSummaries(
            proceduresFiles,
            projectPath,
            options.summaryWordCount || 250
          );
        }
      } catch (error) {
        console.warn('[EnhancedRAG] Failed to generate SOP summaries, continuing without them:', error);
      } finally {
        releaseSummary();
        console.log('[EnhancedRAG] 🔓 Summary mutex released');
      }
    }

    // 4. Generate Context file summaries if requested (uses same mutex)
    // BUT: Filter out on-demand categories that weren't explicitly referenced
    let contextSummaries = new Map<string, string>();
    if (options.includeSummaries ?? true) {
      // Acquire GLOBAL summary mutex to prevent duplicate summary generation
      const releaseSummary = await globalSummaryMutex.acquire();
      console.log('[EnhancedRAG] 🔒 Summary mutex acquired - generating context summaries...');
      
      try {
        // Get context files
        const contextPath = path.join(projectPath, 'Context');
        let contextFilesWithCategory: { doc: ParsedDocument; contextCategory: 'primary-context-root' | 'initiation' | 'ongoing' | 'predicates' | 'regulatory-strategy' | 'general' }[] = [];
        try {
          await fs.access(contextPath);
          contextFilesWithCategory = await this.loadContextFolderStructured(contextPath);
        } catch {
          // No context folder
        }
        
        if (contextFilesWithCategory.length > 0) {
          // Filter out on-demand categories that weren't explicitly referenced
          const filteredContextFiles = contextFilesWithCategory.filter(cf => {
            if (cf.contextCategory === 'general' && excludeGeneral) {
              console.log(`[EnhancedRAG] ⏭️  Excluding summary for ${cf.doc.fileName} (General folder, not referenced)`);
              return false;
            }
            if (cf.contextCategory === 'regulatory-strategy' && excludeRegStrategy) {
              console.log(`[EnhancedRAG] ⏭️  Excluding summary for ${cf.doc.fileName} (Regulatory Strategy folder, not referenced)`);
              return false;
            }
            return true;
          });
          
          contextSummaries = await this.generateContextSummaries(
            filteredContextFiles,
            projectPath,
            options.summaryWordCount || 250
          );
        }
      } catch (error) {
        console.warn('[EnhancedRAG] Failed to generate Context summaries, continuing without them:', error);
      } finally {
        releaseSummary();
        console.log('[EnhancedRAG] 🔓 Summary mutex released');
      }
    }
    
    // 5. Embed the prompt
    const embeddingService = await this.getEmbeddingService(projectPath);
    const promptEmbedding = await embeddingService.embedText(prompt);
    const promptEmbeddingArray = VectorStore.float32ArrayToNumbers(promptEmbedding);
    
    // 6. Search procedures
    // CRITICAL: Use explicit undefined check so 0 is respected (0 || 5 would give 5!)
    const procedureChunksToRetrieve = options.procedureChunks !== undefined ? options.procedureChunks : 5;
    console.log(`[EnhancedRAG] 🔍 Searching for top ${procedureChunksToRetrieve} procedure chunks...`);
    
    const procedureResults = procedureChunksToRetrieve > 0
      ? this.vectorStore!.search(promptEmbeddingArray, procedureChunksToRetrieve, 'procedure')
      : [];
    
    if (procedureResults.length > 0) {
      console.log(`[EnhancedRAG] 📄 Procedure files included in context:`);
      const uniqueProcedures = new Set(procedureResults.map(r => r.entry.metadata.fileName));
      uniqueProcedures.forEach(fileName => {
        const chunks = procedureResults.filter(r => r.entry.metadata.fileName === fileName).length;
        console.log(`[EnhancedRAG]    ✓ ${fileName} (${chunks} chunk${chunks > 1 ? 's' : ''})`);
      });
    } else if (procedureChunksToRetrieve === 0) {
      console.log(`[EnhancedRAG] ℹ️  No procedure chunks requested (procedureChunks=0)`);
    }
    
    // 7. Search context files with on-demand filtering
    // CRITICAL: Use explicit undefined check so 0 is respected
    const contextChunksToRetrieve = options.contextChunks !== undefined ? options.contextChunks : 5;
    console.log(`[EnhancedRAG] 🔍 Searching for top ${contextChunksToRetrieve} context chunks...`);
    
    let contextResults = contextChunksToRetrieve > 0
      ? this.vectorStore!.search(promptEmbeddingArray, contextChunksToRetrieve, 'context')
      : [];
    
    // ENFORCE RETRIEVAL POLICY: Filter out on-demand categories
    const originalContextCount = contextResults.length;
    contextResults = contextResults.filter(result => {
      const category = result.entry.metadata.contextCategory;
      
      if (category === 'general' && excludeGeneral) {
        console.log(`[EnhancedRAG] ⏭️  Filtered out: ${result.entry.metadata.fileName} (General folder, not referenced)`);
        return false;
      }
      
      if (category === 'regulatory-strategy' && excludeRegStrategy) {
        console.log(`[EnhancedRAG] ⏭️  Filtered out: ${result.entry.metadata.fileName} (Regulatory Strategy folder, not referenced)`);
        return false;
      }
      
      return true;
    });
    
    if (originalContextCount !== contextResults.length) {
      console.log(`[EnhancedRAG] 🔒 FILTERING APPLIED: ${originalContextCount - contextResults.length} context chunks excluded due to retrieval_priority="on_demand"`);
    }
    
    if (contextResults.length > 0) {
      console.log(`[EnhancedRAG] 📄 Context files included in prompt:`);
      const uniqueContextFiles = new Set(contextResults.map(r => r.entry.metadata.fileName));
      uniqueContextFiles.forEach(fileName => {
        const chunks = contextResults.filter(r => r.entry.metadata.fileName === fileName).length;
        const category = contextResults.find(r => r.entry.metadata.fileName === fileName)?.entry.metadata.contextCategory || 'unknown';
        console.log(`[EnhancedRAG]    ✓ ${category}/${fileName} (${chunks} chunk${chunks > 1 ? 's' : ''})`);
      });
    } else if (contextChunksToRetrieve === 0) {
      console.log(`[EnhancedRAG] ℹ️  No context chunks requested (contextChunks=0)`);
    }
    
    // 8. Assemble tiered context
    let ragContext = this.assembleContext(
      knowledge.primaryContext,
      procedureResults,
      contextResults,
      sopSummaries,
      contextSummaries,
      options
    );
    
    // 9. Enforce token limits if needed
    const maxTokens = options.maxTokens || 150000;
    ragContext = await this.enforceTokenLimit(ragContext, maxTokens);
    
    // 10. Build metadata
    const sources = new Set<string>();
    procedureResults.forEach(r => sources.add(r.entry.metadata.fileName));
    contextResults.forEach(r => sources.add(r.entry.metadata.fileName));
    
    const metadata = {
      primaryContextIncluded: options.includeFullPrimary ?? true,
      procedureChunksRetrieved: procedureResults.length,
      contextChunksRetrieved: contextResults.length,
      summariesGenerated: sopSummaries.size,
      contextSummariesGenerated: contextSummaries.size,
      totalTokensEstimate: this.estimateTokens(ragContext),
      sources: Array.from(sources)
    };
    
    return { 
      ragContext, 
      metadata,
      procedureChunks: procedureResults,
      contextChunks: contextResults
    };
  }

  /**
   * Assemble context in tiered structure with clear behavioral instructions
   * 
   * NEW THREE-TIER ARCHITECTURE:
   * TIER 1: Role & Behavioral Instructions (WHO you are, HOW to behave)
   * TIER 2: Reference Materials (WHAT you know - for informing your writing)
   * TIER 3: User Task (reserved for orchestrator to append)
   * 
   * DETERMINISM: All chunks and summaries are sorted alphabetically to ensure
   * consistent output across cache rebuilds
   */
  private assembleContext(
    primaryContext: any,
    procedureChunks: SearchResult[],
    contextChunks: SearchResult[],
    sopSummaries: Map<string, string>,
    contextSummaries: Map<string, string>,
    options: any
  ): string {
    const sections: string[] = [];
    
    // =========================================================================
    // DETERMINISM: Sort all chunks and summaries for consistent ordering
    // =========================================================================
    
    // Sort procedure chunks by fileName, then chunkIndex
    const sortedProcedureChunks = [...procedureChunks].sort((a, b) => {
      const fileCmp = a.entry.metadata.fileName.localeCompare(b.entry.metadata.fileName);
      if (fileCmp !== 0) return fileCmp;
      return a.entry.metadata.chunkIndex - b.entry.metadata.chunkIndex;
    });
    
    // Sort context chunks by fileName, then chunkIndex
    const sortedContextChunks = [...contextChunks].sort((a, b) => {
      const fileCmp = a.entry.metadata.fileName.localeCompare(b.entry.metadata.fileName);
      if (fileCmp !== 0) return fileCmp;
      return a.entry.metadata.chunkIndex - b.entry.metadata.chunkIndex;
    });
    
    // Sort summaries alphabetically by file name
    const sortedSopSummaries = new Map(
      [...sopSummaries.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    );
    const sortedContextSummaries = new Map(
      [...contextSummaries.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    );
    
    // =========================================================================
    // TIER 1: ROLE & BEHAVIORAL INSTRUCTIONS
    // =========================================================================
    sections.push('=== YOUR ROLE AND CRITICAL INSTRUCTIONS ===\n\n');
    
    // Extract key behavioral information from primary context
    const role = primaryContext?.product?.name || 'PhaserGun AI';
    const purpose = primaryContext?.product?.purpose || 'Generate regulatory documents';
    
    sections.push(`You are ${role}, an AI regulatory documentation expert.\n\n`);
    sections.push(`PRIMARY FUNCTION: ${purpose}\n\n`);
    
    sections.push('CRITICAL BEHAVIORAL RULES:\n');
    sections.push('1. Write DIRECTLY in response to the user\'s task (provided at the end)\n');
    sections.push('2. Do NOT analyze or summarize the reference materials below\n');
    sections.push('3. Do NOT provide meta-commentary like "Based on the provided documents..."\n');
    sections.push('4. Do NOT start with "Here is..." or "The following is..."\n');
    sections.push('5. Follow the EXACT format, tone, length, and style specified in the user\'s request\n');
    sections.push('6. Use reference materials to inform your writing, but write as if you are the author\n');
    sections.push('7. If the user specifies word count or paragraph limits, strictly adhere to them\n');
    sections.push('8. Use precise, professional language appropriate for regulatory documentation\n\n');
    
    sections.push('SCOPE ENFORCEMENT (ABSOLUTE REQUIREMENTS):\n');
    sections.push('1. Write ONLY what is explicitly requested - if asked for "Purpose section" write ONLY Purpose\n');
    sections.push('2. Do NOT expand scope by adding related sections, background, or full document structure\n');
    sections.push('3. Do NOT generate additional sections beyond what is requested\n');
    sections.push('4. STOP IMMEDIATELY after completing the requested section\n');
    sections.push('5. Treat length constraints (e.g., "2 paragraphs") as HARD LIMITS, not suggestions\n');
    sections.push('6. If request says "section X only" → generate ONLY section X, then STOP\n\n');
    
    sections.push('VIOLATION EXAMPLES (What NOT to do):\n');
    sections.push('❌ Task: "Write Purpose section" → You generate entire document with multiple sections\n');
    sections.push('❌ Task: "Two paragraphs maximum" → You write 15 sections\n');
    sections.push('❌ Task: "Purpose only" → You add Background, Scope, Introduction, etc.\n');
    sections.push('✅ CORRECT: Task: "Write Purpose section, 2 paragraphs" → You write exactly 2 paragraphs for Purpose, then STOP\n\n');
    
    // Include regulatory framework
    if (primaryContext?.regulatory_framework?.standards) {
      sections.push('REGULATORY STANDARDS YOU FOLLOW:\n');
      primaryContext.regulatory_framework.standards.forEach((std: any) => {
        sections.push(`- ${std.name}: ${std.description}\n`);
      });
      sections.push('\n');
    }
    
    // Include design controls foundation if present
    if (primaryContext?.design_controls) {
      sections.push('DESIGN CONTROLS FRAMEWORK:\n');
      const dc = primaryContext.design_controls;
      sections.push(`- User Needs: ${dc.user_needs}\n`);
      sections.push(`- Design Inputs: ${dc.design_inputs}\n`);
      sections.push(`- Design Outputs: ${dc.design_outputs}\n`);
      sections.push(`- Verification: ${dc.verification}\n`);
      sections.push(`- Validation: ${dc.validation}\n\n`);
    }
    
    sections.push('---\n\n');
    
    // =========================================================================
    // TIER 2: REFERENCE MATERIALS (for informing your writing)
    // =========================================================================
    sections.push('=== REFERENCE MATERIALS ===\n');
    sections.push('Below are materials provided for your reference. Use them to inform your writing,\n');
    sections.push('but remember: your task is to WRITE what the user requests, not to analyze these materials.\n\n');
    
    // SOP Executive Summaries (sorted alphabetically)
    if (sortedSopSummaries.size > 0) {
      sections.push('--- Company Procedures (SOPs) ---\n');
      sortedSopSummaries.forEach((summary, fileName) => {
        sections.push(`\n[${fileName}]\n`);
        sections.push(summary);
        sections.push('\n');
      });
      sections.push('\n');
    }
    
    // Context File Executive Summaries (sorted alphabetically)
    if (sortedContextSummaries.size > 0) {
      sections.push('--- Project Context Summaries ---\n');
      sortedContextSummaries.forEach((summary, fileName) => {
        sections.push(`\n[${fileName}]\n`);
        sections.push(summary);
        sections.push('\n');
      });
      sections.push('\n');
    }
    
    // Retrieved Procedure Chunks (sorted by fileName, then chunk index)
    if (sortedProcedureChunks.length > 0) {
      sections.push('--- Detailed Procedure Sections (Retrieved for Relevance) ---\n');
      sortedProcedureChunks.forEach((result, idx) => {
        const similarity = (result.similarity * 100).toFixed(1);
        sections.push(`\n[${result.entry.metadata.fileName} - Section ${result.entry.metadata.chunkIndex + 1}]\n`);
        sections.push(result.entry.metadata.content);
        sections.push('\n');
      });
      sections.push('\n');
    }
    
    // Retrieved Context Chunks (sorted by fileName, then chunk index)
    if (sortedContextChunks.length > 0) {
      sections.push('--- Detailed Project Context (Retrieved for Relevance) ---\n');
      sortedContextChunks.forEach((result, idx) => {
        const similarity = (result.similarity * 100).toFixed(1);
        const contextCategory = result.entry.metadata.contextCategory;
        let categoryLabel = '';
        
        if (contextCategory === 'primary-context-root') {
          categoryLabel = 'Primary Context File';
        } else if (contextCategory === 'initiation') {
          categoryLabel = 'Initiation';
        } else if (contextCategory === 'ongoing') {
          categoryLabel = 'Ongoing';
        } else if (contextCategory === 'predicates') {
          categoryLabel = 'Predicate Device';
        } else if (contextCategory === 'regulatory-strategy') {
          categoryLabel = 'Regulatory Strategy';
        } else if (contextCategory === 'general') {
          categoryLabel = 'General Reference';
        }
        
        sections.push(`\n[${categoryLabel}: ${result.entry.metadata.fileName}]\n`);
        sections.push(result.entry.metadata.content);
        sections.push('\n');
      });
    }
    
    sections.push('---\n\n');
    
    // Note: TIER 3 (User Task) will be appended by the orchestrator
    
    return sections.join('');
  }

  /**
   * Estimate token count (rough approximation)
   */
  private estimateTokens(text: string): number {
    // Rough estimate: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }

  /**
   * Ensure context fits within token limits
   */
  private async enforceTokenLimit(
    ragContext: string,
    maxTokens: number = 150000  // Leave room for prompt + response
  ): Promise<string> {
    const estimatedTokens = this.estimateTokens(ragContext);
    
    if (estimatedTokens <= maxTokens) {
      return ragContext;
    }
    
    console.warn(`[EnhancedRAG] Context exceeds limit (${estimatedTokens} > ${maxTokens}), truncating...`);
    
    // Truncate from the bottom (keep primary context + top results)
    // This is a simple implementation; can be enhanced later
    const targetChars = maxTokens * 4;
    return ragContext.substring(0, targetChars) + '\n\n[...truncated...]';
  }

  /**
   * Build RAG context for LLM prompt with relevance filtering
   * Uses VectorStore for semantic search
   * 
   * NOTE: This method is used by the older buildRAGContext flow.
   * For new prompt-based generation, use retrieveRelevantContext() instead.
   */
  async buildRAGContext(knowledge: KnowledgeCache, promptText?: string, projectPath?: string): Promise<string> {
    const sections: string[] = [];
    const MAX_CHUNKS_PER_SOURCE = 8; // Limit chunks to avoid token overflow
    
    // TIER 1: Role & Instructions
    sections.push('=== YOUR ROLE AND CRITICAL INSTRUCTIONS ===\n\n');
    sections.push('You are PhaserGun AI, an AI regulatory documentation expert.\n\n');
    sections.push('CRITICAL: Write directly as requested. Do NOT analyze or summarize reference materials.\n');
    sections.push('Follow the exact format, tone, and length specified in user requests.\n\n');
    sections.push('---\n\n');
    
    // TIER 2: Reference Materials Header
    sections.push('=== REFERENCE MATERIALS ===\n');
    
    // If no vector store or no prompt, skip retrieval
    if (!this.vectorStore) {
      console.warn('[EnhancedRAG] No vector store available for retrieval');
      return sections.join('');
    }
    
    // Section 2 & 3: Use vector store to retrieve relevant chunks
    if (promptText && this.useEmbeddings) {
      try {
        const embeddingService = await this.getEmbeddingService(projectPath || knowledge.projectPath);
        const queryEmbedding = await embeddingService.embedText(promptText);
        const queryEmbeddingArray = VectorStore.float32ArrayToNumbers(queryEmbedding);
        
        // Search for procedures
        const procedureResults = this.vectorStore.search(queryEmbeddingArray, MAX_CHUNKS_PER_SOURCE, 'procedure');
        if (procedureResults.length > 0) {
          sections.push('=== COMPANY PROCEDURES AND SOPS (Relevant Sections) ===\n');
          procedureResults.forEach((result, idx) => {
            sections.push(`\n--- ${result.entry.metadata.fileName} (Chunk ${result.entry.metadata.chunkIndex + 1}, Similarity: ${(result.similarity * 100).toFixed(1)}%) ---\n`);
            sections.push(result.entry.metadata.content);
            sections.push('\n');
          });
        }
        
        // Search for context
        const contextResults = this.vectorStore.search(queryEmbeddingArray, MAX_CHUNKS_PER_SOURCE, 'context');
        if (contextResults.length > 0) {
          sections.push('=== PROJECT-SPECIFIC CONTEXT (Relevant Sections) ===\n');
          contextResults.forEach((result, idx) => {
            sections.push(`\n--- ${result.entry.metadata.fileName} (Chunk ${result.entry.metadata.chunkIndex + 1}, Similarity: ${(result.similarity * 100).toFixed(1)}%) ---\n`);
            sections.push(result.entry.metadata.content);
            sections.push('\n');
          });
        }
      } catch (error) {
        console.warn('[EnhancedRAG] Vector search failed, returning primary context only:', error);
      }
    } else {
      // No query provided, return top chunks from each category
      const procedureEntries = this.vectorStore.getEntriesByCategory('procedure').slice(0, MAX_CHUNKS_PER_SOURCE);
      const contextEntries = this.vectorStore.getEntriesByCategory('context').slice(0, MAX_CHUNKS_PER_SOURCE);
      
      if (procedureEntries.length > 0) {
        sections.push('=== COMPANY PROCEDURES AND SOPS (Sample Sections) ===\n');
        procedureEntries.forEach((entry, idx) => {
          sections.push(`\n--- ${entry.metadata.fileName} (Chunk ${entry.metadata.chunkIndex + 1}) ---\n`);
          sections.push(entry.metadata.content);
          sections.push('\n');
        });
      }
      
      if (contextEntries.length > 0) {
        sections.push('=== PROJECT-SPECIFIC CONTEXT (Sample Sections) ===\n');
        contextEntries.forEach((entry, idx) => {
          sections.push(`\n--- ${entry.metadata.fileName} (Chunk ${entry.metadata.chunkIndex + 1}) ---\n`);
          sections.push(entry.metadata.content);
          sections.push('\n');
        });
      }
    }
    
    return sections.join('');
  }

  /**
   * Retrieve knowledge context for a given prompt query with relevance filtering
   */
  async retrieveKnowledge(
    projectPath: string,
    primaryContextPath: string,
    promptText?: string
  ): Promise<{ ragContext: string; metadata: any }> {
    const knowledge = await this.loadKnowledge(projectPath, primaryContextPath);
    const ragContext = await this.buildRAGContext(knowledge, promptText, projectPath);
    
    const stats = this.vectorStore?.getStats() || { procedureEntries: 0, contextEntries: 0, totalEntries: 0 };
    
    const metadata = {
      primaryContextLoaded: !!knowledge.primaryContext,
      proceduresChunksTotal: stats.procedureEntries,
      contextChunksTotal: stats.contextEntries,
      totalChunks: stats.totalEntries,
      embeddingsUsed: true,
      cachedAt: knowledge.indexedAt,
      fingerprint: knowledge.fingerprint.substring(0, 16),
      vectorStoreFingerprint: knowledge.vectorStoreFingerprint.substring(0, 16),
      relevanceFiltering: !!promptText
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
