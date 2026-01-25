import { KnowledgeContext, ChunkedDocumentPart, ParsedDocument } from '@fda-compliance/shared-types';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';
import * as crypto from 'crypto';
import { ComprehensiveFileParser } from '@fda-compliance/file-parser';
import { EmbeddingService } from './embedding-service';

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
  proceduresChunks: DocumentChunk[];
  contextChunks: DocumentChunk[];
  proceduresEmbeddings?: Float32Array[];
  contextEmbeddings?: Float32Array[];
  embeddingModelVersion?: string;
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
  private embeddingService: EmbeddingService | null = null;
  private useEmbeddings: boolean = true; // Feature flag
  
  constructor() {
    this.fileParser = new ComprehensiveFileParser();
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
   * Chunk a document into semantic segments
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
    const [primaryContext, proceduresChunks, contextChunks] = await Promise.all([
      this.loadPrimaryContext(primaryContextPath),
      this.loadProceduresFolder(path.join(projectPath, 'Procedures')),
      this.loadContextFolder(path.join(projectPath, 'Context'))
    ]);
    
    // Generate embeddings for chunks if enabled
    let proceduresEmbeddings: Float32Array[] | undefined;
    let contextEmbeddings: Float32Array[] | undefined;
    let embeddingModelVersion: string | undefined;
    
    if (this.useEmbeddings && (proceduresChunks.length > 0 || contextChunks.length > 0)) {
      try {
        const embeddingService = await this.getEmbeddingService(projectPath);
        const modelInfo = embeddingService.getModelInfo();
        embeddingModelVersion = modelInfo.version;
        
        // Generate embeddings for procedures chunks
        if (proceduresChunks.length > 0) {
          const texts = proceduresChunks.map(c => c.content);
          const paths = proceduresChunks.map(c => c.filePath);
          proceduresEmbeddings = await embeddingService.embedBatch(texts, paths);
        }
        
        // Generate embeddings for context chunks
        if (contextChunks.length > 0) {
          const texts = contextChunks.map(c => c.content);
          const paths = contextChunks.map(c => c.filePath);
          contextEmbeddings = await embeddingService.embedBatch(texts, paths);
        }
        
        console.log(`[EnhancedRAG] ✓ Embeddings generated (${modelInfo.name}, ${modelInfo.dimensions}D)`);
      } catch (error) {
        console.warn('[EnhancedRAG] Failed to generate embeddings, falling back to keyword matching:', error);
      }
    }
    
    // Compute fingerprint
    const fingerprint = await this.computeCacheFingerprint(projectPath, primaryContextPath);
    
    // Create cache entry
    const knowledgeCache: KnowledgeCache = {
      projectPath,
      fingerprint,
      primaryContext,
      proceduresChunks,
      contextChunks,
      proceduresEmbeddings,
      contextEmbeddings,
      embeddingModelVersion,
      indexedAt: new Date().toISOString()
    };
    
    // Store in cache
    this.cache.set(projectPath, knowledgeCache);
    
    console.log('[EnhancedRAG] ========================================');
    console.log('[EnhancedRAG] Knowledge Base Loaded Successfully');
    console.log(`[EnhancedRAG] Primary Context: ✓`);
    console.log(`[EnhancedRAG] Procedures: ${proceduresChunks.length} chunks`);
    console.log(`[EnhancedRAG] Context: ${contextChunks.length} chunks`);
    console.log(`[EnhancedRAG] Embeddings: ${proceduresEmbeddings || contextEmbeddings ? '✓' : '✗'}`);
    console.log(`[EnhancedRAG] Cache Fingerprint: ${fingerprint.substring(0, 16)}...`);
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
   * Build RAG context for LLM prompt with relevance filtering
   * Uses embeddings for semantic search when available
   */
  async buildRAGContext(knowledge: KnowledgeCache, promptText?: string): Promise<string> {
    const sections: string[] = [];
    const MAX_CHUNKS_PER_SOURCE = 8; // Limit chunks to avoid token overflow
    
    // Extract keywords from prompt for relevance matching
    const promptKeywords = promptText ? this.extractKeywords(promptText) : [];
    
    // Section 1: Primary Context (always include - it's the role definition)
    sections.push('=== PRIMARY CONTEXT: PHASERGUN AI REGULATORY ENGINEER ===\n');
    sections.push(yaml.dump(knowledge.primaryContext));
    sections.push('\n');
    
    // Section 2: Procedures (Company SOPs and Guidelines) - Top relevant chunks
    if (knowledge.proceduresChunks.length > 0) {
      let relevantChunks: DocumentChunk[];
      
      // Use embeddings if available and we have a query
      if (promptText && knowledge.proceduresEmbeddings && this.useEmbeddings) {
        relevantChunks = await this.retrieveRelevantChunksWithEmbeddings(
          knowledge.proceduresChunks,
          knowledge.proceduresEmbeddings,
          promptText,
          knowledge.projectPath,
          MAX_CHUNKS_PER_SOURCE
        );
      } else if (promptKeywords.length > 0) {
        relevantChunks = this.retrieveRelevantChunks(knowledge.proceduresChunks, promptKeywords, MAX_CHUNKS_PER_SOURCE);
      } else {
        relevantChunks = knowledge.proceduresChunks.slice(0, MAX_CHUNKS_PER_SOURCE);
      }
      
      if (relevantChunks.length > 0) {
        sections.push('=== COMPANY PROCEDURES AND SOPS (Relevant Sections) ===\n');
        relevantChunks.forEach((chunk, idx) => {
          sections.push(`\n--- ${chunk.fileName} (Chunk ${chunk.chunkIndex + 1}/${chunk.totalChunks}) ---\n`);
          sections.push(chunk.content);
          sections.push('\n');
        });
      }
    }
    
    // Section 3: Context (Project-Specific Information) - Top relevant chunks
    if (knowledge.contextChunks.length > 0) {
      let relevantChunks: DocumentChunk[];
      
      // Use embeddings if available and we have a query
      if (promptText && knowledge.contextEmbeddings && this.useEmbeddings) {
        relevantChunks = await this.retrieveRelevantChunksWithEmbeddings(
          knowledge.contextChunks,
          knowledge.contextEmbeddings,
          promptText,
          knowledge.projectPath,
          MAX_CHUNKS_PER_SOURCE
        );
      } else if (promptKeywords.length > 0) {
        relevantChunks = this.retrieveRelevantChunks(knowledge.contextChunks, promptKeywords, MAX_CHUNKS_PER_SOURCE);
      } else {
        relevantChunks = knowledge.contextChunks.slice(0, MAX_CHUNKS_PER_SOURCE);
      }
      
      if (relevantChunks.length > 0) {
        sections.push('=== PROJECT-SPECIFIC CONTEXT (Relevant Sections) ===\n');
        relevantChunks.forEach((chunk, idx) => {
          sections.push(`\n--- ${chunk.fileName} (Chunk ${chunk.chunkIndex + 1}/${chunk.totalChunks}) ---\n`);
          sections.push(chunk.content);
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
    const ragContext = await this.buildRAGContext(knowledge, promptText);
    
    const metadata = {
      primaryContextLoaded: !!knowledge.primaryContext,
      proceduresChunksTotal: knowledge.proceduresChunks.length,
      contextChunksTotal: knowledge.contextChunks.length,
      embeddingsUsed: !!(knowledge.proceduresEmbeddings || knowledge.contextEmbeddings),
      cachedAt: knowledge.indexedAt,
      fingerprint: knowledge.fingerprint.substring(0, 16),
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
