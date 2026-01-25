import { KnowledgeContext, ChunkedDocumentPart, ParsedDocument } from '@fda-compliance/shared-types';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';
import * as crypto from 'crypto';
import * as os from 'os';
import { ComprehensiveFileParser } from '@fda-compliance/file-parser';
import { EmbeddingService } from './embedding-service';
import { VectorStore, VectorEntry, SearchResult } from './vector-store';
import { GroqLLMService } from '@fda-compliance/llm-service';

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
 * Enhanced RAG Service for DHF Document Generation
 * Combines three knowledge sources:
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
  
  constructor() {
    this.fileParser = new ComprehensiveFileParser();
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
    const sectionRegex = /^(#{1,6}\s+.*|\d+\.(\d+\.)*\s+.*)$/gm;
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
   * Chunk and embed a parsed document
   * Returns VectorEntry objects ready for storage
   */
  private async chunkAndEmbedDocument(
    doc: ParsedDocument,
    category: 'procedure' | 'context',
    projectPath: string
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
          chunkIndex
        }
      );
    });
    
    return vectorEntries;
  }

  /**
   * Process all documents and build vector store
   */
  private async buildVectorStore(
    proceduresFiles: ParsedDocument[],
    contextFiles: ParsedDocument[],
    projectPath: string
  ): Promise<void> {
    console.log('[EnhancedRAG] Building vector store...');
    
    // Get embedding service model info
    const embeddingService = await this.getEmbeddingService(projectPath);
    const modelInfo = embeddingService.getModelInfo();
    
    // Create new vector store
    this.vectorStore = new VectorStore(projectPath, modelInfo.version);
    
    // Process procedures
    const procedureVectors = await Promise.all(
      proceduresFiles.map(doc => this.chunkAndEmbedDocument(doc, 'procedure', projectPath))
    );
    
    // Process context files
    const contextVectors = await Promise.all(
      contextFiles.map(doc => this.chunkAndEmbedDocument(doc, 'context', projectPath))
    );
    
    // Flatten and add to vector store
    const allVectors = [...procedureVectors.flat(), ...contextVectors.flat()];
    allVectors.forEach(entry => this.vectorStore!.addEntry(entry));
    
    // Save to disk
    await this.vectorStore.save(this.getVectorStorePath(projectPath));
    
    console.log(`[EnhancedRAG] ✓ Vector store built: ${allVectors.length} chunks indexed`);
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
   * Load and chunk all files from Context folder
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
   * Get or create LLM service for summarization
   */
  private getLLMService(): GroqLLMService {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error('[EnhancedRAG] GROQ_API_KEY environment variable not set. Required for SOP summarization.');
    }
    return new GroqLLMService(apiKey, 'llama-3.1-8b-instant');
  }

  /**
   * Generate executive summary for an SOP
   */
  private async summarizeSOP(
    doc: ParsedDocument,
    llmService: GroqLLMService,
    summaryWordCount: number = 250
  ): Promise<string> {
    const prompt = `You are a regulatory documentation expert. Provide a concise executive summary (${summaryWordCount} words) of the following SOP document. Focus on:
1. Purpose and scope
2. Key requirements and steps
3. Relevant definitions and references

SOP Document:
${doc.content}

Executive Summary:`;

    try {
      const response = await llmService.generateText(prompt);
      return response.generatedText;
    } catch (error) {
      console.error(`[EnhancedRAG] Failed to summarize ${doc.fileName}:`, error);
      // Fallback: return first 500 words
      return doc.content.split(/\s+/).slice(0, 500).join(' ') + '...';
    }
  }

  /**
   * Generate and cache summaries for all procedures
   */
  private async generateSOPSummaries(
    proceduresFiles: ParsedDocument[],
    llmService: GroqLLMService,
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
        const summary = await this.summarizeSOP(doc, llmService, summaryWordCount);
        summaryCache.set(doc.fileName, summary);
        
        // Rate limit: wait 1 second between API calls
        await new Promise(resolve => setTimeout(resolve, 1000));
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
      // Load vector store from disk
      const vectorStorePath = this.getVectorStorePath(projectPath);
      this.vectorStore = await VectorStore.load(vectorStorePath, projectPath);
      return this.cache.get(projectPath)!;
    }
    
    console.log('[EnhancedRAG] Cache invalid or missing, loading fresh knowledge...\n');
    
    // Load primary context
    const primaryContext = await this.loadPrimaryContext(primaryContextPath);
    
    // Load and parse documents
    const proceduresPath = path.join(projectPath, 'Procedures');
    const contextPath = path.join(projectPath, 'Context');
    
    let proceduresFiles: ParsedDocument[] = [];
    let contextFiles: ParsedDocument[] = [];
    
    try {
      await fs.access(proceduresPath);
      proceduresFiles = await this.fileParser.scanAndParseFolder(proceduresPath);
      console.log(`[EnhancedRAG] Loaded ${proceduresFiles.length} files from Procedures folder`);
    } catch (error) {
      console.warn('[EnhancedRAG] Procedures folder not found or empty');
    }
    
    try {
      await fs.access(contextPath);
      contextFiles = await this.fileParser.scanAndParseFolder(contextPath);
      console.log(`[EnhancedRAG] Loaded ${contextFiles.length} files from Context folder`);
    } catch (error) {
      console.warn('[EnhancedRAG] Context folder not found or empty');
    }
    
    // Build vector store if there are documents to process
    if (proceduresFiles.length > 0 || contextFiles.length > 0) {
      await this.buildVectorStore(proceduresFiles, contextFiles, projectPath);
    } else {
      console.log('[EnhancedRAG] No documents to index, creating empty vector store');
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
    
    // Store in cache
    this.cache.set(projectPath, knowledgeCache);
    
    const stats = this.vectorStore!.getStats();
    console.log('[EnhancedRAG] ========================================');
    console.log('[EnhancedRAG] Knowledge Base Loaded Successfully');
    console.log(`[EnhancedRAG] Primary Context: ✓`);
    console.log(`[EnhancedRAG] Procedures: ${stats.procedureEntries} chunks`);
    console.log(`[EnhancedRAG] Context: ${stats.contextEntries} chunks`);
    console.log(`[EnhancedRAG] Total Vectors: ${stats.totalEntries}`);
    console.log(`[EnhancedRAG] Cache Fingerprint: ${fingerprint.substring(0, 16)}...`);
    console.log(`[EnhancedRAG] VectorStore Fingerprint: ${vectorStoreFingerprint.substring(0, 16)}...`);
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
   * Retrieve relevant context for a prompt using semantic search
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
      llmService?: GroqLLMService; // Optional LLM service for summarization
    } = {}
  ): Promise<{
    ragContext: string;
    metadata: {
      primaryContextIncluded: boolean;
      procedureChunksRetrieved: number;
      contextChunksRetrieved: number;
      summariesGenerated: number;
      totalTokensEstimate: number;
      sources: string[];
    };
    procedureChunks: SearchResult[];
    contextChunks: SearchResult[];
  }> {
    // 1. Load knowledge (from cache if valid)
    const knowledge = await this.loadKnowledge(projectPath, primaryContextPath);
    
    // 2. Generate SOP summaries if requested
    let sopSummaries = new Map<string, string>();
    if (options.includeSummaries ?? true) {
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
          // Use provided LLM service or create one
          const llmService = options.llmService || this.getLLMService();
          sopSummaries = await this.generateSOPSummaries(
            proceduresFiles,
            llmService,
            projectPath,
            options.summaryWordCount || 250
          );
        }
      } catch (error) {
        console.warn('[EnhancedRAG] Failed to generate SOP summaries, continuing without them:', error);
      }
    }
    
    // 3. Embed the prompt
    const embeddingService = await this.getEmbeddingService(projectPath);
    const promptEmbedding = await embeddingService.embedText(prompt);
    const promptEmbeddingArray = VectorStore.float32ArrayToNumbers(promptEmbedding);
    
    // 4. Search procedures
    const procedureResults = this.vectorStore!.search(
      promptEmbeddingArray,
      options.procedureChunks || 5,
      'procedure'
    );
    
    // 5. Search context files
    const contextResults = this.vectorStore!.search(
      promptEmbeddingArray,
      options.contextChunks || 5,
      'context'
    );
    
    // 6. Assemble tiered context
    let ragContext = this.assembleContext(
      knowledge.primaryContext,
      procedureResults,
      contextResults,
      sopSummaries,
      options
    );
    
    // 7. Enforce token limits if needed
    const maxTokens = options.maxTokens || 150000;
    ragContext = await this.enforceTokenLimit(ragContext, maxTokens);
    
    // 8. Build metadata
    const sources = new Set<string>();
    procedureResults.forEach(r => sources.add(r.entry.metadata.fileName));
    contextResults.forEach(r => sources.add(r.entry.metadata.fileName));
    
    const metadata = {
      primaryContextIncluded: options.includeFullPrimary ?? true,
      procedureChunksRetrieved: procedureResults.length,
      contextChunksRetrieved: contextResults.length,
      summariesGenerated: sopSummaries.size,
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
   * Assemble context in tiered structure
   */
  private assembleContext(
    primaryContext: any,
    procedureChunks: SearchResult[],
    contextChunks: SearchResult[],
    sopSummaries: Map<string, string>,
    options: any
  ): string {
    const sections: string[] = [];
    
    // TIER 1: Primary Context (always included)
    if (options.includeFullPrimary ?? true) {
      sections.push('=== PRIMARY CONTEXT: PHASERGUN AI REGULATORY ENGINEER ===\n');
      sections.push(yaml.dump(primaryContext));
      sections.push('\n');
    }
    
    // TIER 1.5: SOP Executive Summaries (NEW - provides overview)
    if (sopSummaries.size > 0) {
      sections.push('=== COMPANY PROCEDURES OVERVIEW (Executive Summaries) ===\n');
      sopSummaries.forEach((summary, fileName) => {
        sections.push(`\n--- ${fileName} ---\n`);
        sections.push(summary);
        sections.push('\n');
      });
    }
    
    // TIER 2: Retrieved Procedure Chunks (detailed sections)
    if (procedureChunks.length > 0) {
      sections.push('=== RELEVANT PROCEDURE DETAILS (Retrieved Sections) ===\n');
      procedureChunks.forEach((result, idx) => {
        const similarity = (result.similarity * 100).toFixed(1);
        sections.push(`\n--- [${result.entry.metadata.fileName}] Section ${result.entry.metadata.chunkIndex + 1} (Similarity: ${similarity}%) ---\n`);
        sections.push(result.entry.metadata.content);
        sections.push('\n');
      });
    }
    
    // TIER 3: Retrieved Context Chunks (most relevant)
    if (contextChunks.length > 0) {
      sections.push('=== RELEVANT PROJECT CONTEXT (Retrieved) ===\n');
      contextChunks.forEach((result, idx) => {
        const similarity = (result.similarity * 100).toFixed(1);
        sections.push(`\n--- [Context ${idx + 1}] ${result.entry.metadata.fileName} (Chunk ${result.entry.metadata.chunkIndex + 1}, Similarity: ${similarity}%) ---\n`);
        sections.push(result.entry.metadata.content);
        sections.push('\n');
      });
    }
    
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
   */
  async buildRAGContext(knowledge: KnowledgeCache, promptText?: string, projectPath?: string): Promise<string> {
    const sections: string[] = [];
    const MAX_CHUNKS_PER_SOURCE = 8; // Limit chunks to avoid token overflow
    
    // Section 1: Primary Context (always include - it's the role definition)
    sections.push('=== PRIMARY CONTEXT: PHASERGUN AI REGULATORY ENGINEER ===\n');
    sections.push(yaml.dump(knowledge.primaryContext));
    sections.push('\n');
    
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
