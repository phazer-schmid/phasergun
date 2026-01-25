/**
 * Local Embedding Service using Transformers.js
 * Uses 'Xenova/all-MiniLM-L6-v2' model (384 dimensions)
 * - Runs locally without API calls (privacy-preserving)
 * - Produces embeddings for semantic search
 * - Caches embeddings to disk for performance
 */

import { pipeline } from '@xenova/transformers';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

/**
 * Embedding cache entry metadata
 */
interface EmbeddingMetadata {
  text: string;
  modelVersion: string;
  dimensions: number;
  timestamp: string;
  cacheKey: string;
}

/**
 * Embedding cache entry
 */
interface CachedEmbedding {
  embedding: Float32Array;
  metadata: EmbeddingMetadata;
}

/**
 * Local Embedding Service
 * Singleton pattern for efficient model reuse
 */
export class EmbeddingService {
  private static instance: EmbeddingService;
  private model: any = null;
  private modelName = 'Xenova/all-MiniLM-L6-v2';
  private modelVersion = 'v1.0';
  private dimensions = 384;
  private cacheDir: string;
  private cacheIndex: Map<string, string> = new Map(); // cacheKey -> filename
  
  private constructor(projectPath?: string) {
    // Default cache location: project/.phasergun-cache/embeddings/
    this.cacheDir = projectPath 
      ? path.join(projectPath, '.phasergun-cache', 'embeddings')
      : path.join(process.cwd(), '.phasergun-cache', 'embeddings');
  }

  /**
   * Get singleton instance
   */
  static getInstance(projectPath?: string): EmbeddingService {
    if (!EmbeddingService.instance) {
      EmbeddingService.instance = new EmbeddingService(projectPath);
    }
    return EmbeddingService.instance;
  }

  /**
   * Initialize the embedding model
   */
  async initialize(): Promise<void> {
    if (this.model) {
      console.log('[EmbeddingService] Model already loaded');
      return;
    }

    console.log(`[EmbeddingService] Loading model: ${this.modelName}...`);
    const startTime = Date.now();

    try {
      // Load the feature extraction pipeline
      this.model = await pipeline('feature-extraction', this.modelName);
      
      const loadTime = Date.now() - startTime;
      console.log(`[EmbeddingService] ✓ Model loaded successfully (${loadTime}ms)`);
      
      // Ensure cache directory exists
      await this.ensureCacheDir();
      
      // Load cache index
      await this.loadCacheIndex();
      
    } catch (error) {
      console.error('[EmbeddingService] Failed to load model:', error);
      throw new Error(`Failed to initialize embedding model: ${error}`);
    }
  }

  /**
   * Ensure cache directory exists
   */
  private async ensureCacheDir(): Promise<void> {
    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
      console.log(`[EmbeddingService] Cache directory: ${this.cacheDir}`);
    } catch (error) {
      console.error('[EmbeddingService] Failed to create cache directory:', error);
    }
  }

  /**
   * Load cache index from disk
   */
  private async loadCacheIndex(): Promise<void> {
    try {
      const indexPath = path.join(this.cacheDir, 'index.json');
      const indexData = await fs.readFile(indexPath, 'utf8');
      const index = JSON.parse(indexData);
      
      this.cacheIndex = new Map(Object.entries(index));
      console.log(`[EmbeddingService] Loaded cache index: ${this.cacheIndex.size} entries`);
    } catch (error) {
      // Index doesn't exist yet, that's fine
      console.log('[EmbeddingService] No existing cache index found, starting fresh');
      this.cacheIndex = new Map();
    }
  }

  /**
   * Save cache index to disk
   */
  private async saveCacheIndex(): Promise<void> {
    try {
      const indexPath = path.join(this.cacheDir, 'index.json');
      const indexData = Object.fromEntries(this.cacheIndex);
      await fs.writeFile(indexPath, JSON.stringify(indexData, null, 2));
    } catch (error) {
      console.error('[EmbeddingService] Failed to save cache index:', error);
    }
  }

  /**
   * Generate cache key for text
   */
  private generateCacheKey(text: string, filePath?: string): string {
    const contentHash = crypto.createHash('sha256').update(text).digest('hex');
    const pathHash = filePath ? crypto.createHash('sha256').update(filePath).digest('hex').substring(0, 8) : 'nopath';
    return `${pathHash}_${contentHash}_${this.modelVersion}`;
  }

  /**
   * Load embedding from cache
   */
  private async loadFromCache(cacheKey: string): Promise<CachedEmbedding | null> {
    try {
      const filename = this.cacheIndex.get(cacheKey);
      if (!filename) {
        return null;
      }

      const embeddingPath = path.join(this.cacheDir, `${filename}.embedding`);
      const metadataPath = path.join(this.cacheDir, `${filename}.meta.json`);

      // Load metadata
      const metadataData = await fs.readFile(metadataPath, 'utf8');
      const metadata: EmbeddingMetadata = JSON.parse(metadataData);

      // Load embedding (binary Float32Array)
      const embeddingBuffer = await fs.readFile(embeddingPath);
      const embedding = new Float32Array(embeddingBuffer.buffer, embeddingBuffer.byteOffset, embeddingBuffer.byteLength / 4);

      return { embedding, metadata };
    } catch (error) {
      // Cache miss or corrupt, return null
      return null;
    }
  }

  /**
   * Save embedding to cache
   */
  private async saveToCache(cacheKey: string, embedding: Float32Array, text: string, filePath?: string): Promise<void> {
    try {
      const filename = cacheKey.substring(0, 16); // Use first 16 chars as filename
      const embeddingPath = path.join(this.cacheDir, `${filename}.embedding`);
      const metadataPath = path.join(this.cacheDir, `${filename}.meta.json`);

      // Save metadata
      const metadata: EmbeddingMetadata = {
        text: text.substring(0, 200), // Store snippet for debugging
        modelVersion: this.modelVersion,
        dimensions: this.dimensions,
        timestamp: new Date().toISOString(),
        cacheKey
      };
      await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

      // Save embedding as binary
      const buffer = Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength);
      await fs.writeFile(embeddingPath, buffer);

      // Update index
      this.cacheIndex.set(cacheKey, filename);
      await this.saveCacheIndex();

    } catch (error) {
      console.error('[EmbeddingService] Failed to save to cache:', error);
    }
  }

  /**
   * Generate embedding for a single text
   */
  async embedText(text: string, filePath?: string, useCache: boolean = true): Promise<Float32Array> {
    if (!this.model) {
      await this.initialize();
    }

    // Try cache first
    if (useCache) {
      const cacheKey = this.generateCacheKey(text, filePath);
      const cached = await this.loadFromCache(cacheKey);
      
      if (cached) {
        return cached.embedding;
      }
    }

    // Generate new embedding
    const output = await this.model!(text, { pooling: 'mean', normalize: true });
    
    // Convert to Float32Array
    const embedding = new Float32Array(output.data);

    // Cache it
    if (useCache) {
      const cacheKey = this.generateCacheKey(text, filePath);
      await this.saveToCache(cacheKey, embedding, text, filePath);
    }

    return embedding;
  }

  /**
   * Generate embeddings for multiple texts (batch processing)
   */
  async embedBatch(
    texts: string[], 
    filePaths?: string[], 
    batchSize: number = 32,
    useCache: boolean = true
  ): Promise<Float32Array[]> {
    if (!this.model) {
      await this.initialize();
    }

    console.log(`[EmbeddingService] Embedding ${texts.length} texts (batch size: ${batchSize})...`);
    const startTime = Date.now();
    const embeddings: Float32Array[] = [];
    let cacheHits = 0;

    // Process in batches
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const batchPaths = filePaths?.slice(i, i + batchSize);
      
      // Try to load from cache first
      const batchEmbeddings: (Float32Array | null)[] = [];
      const needsGeneration: number[] = [];
      
      if (useCache) {
        for (let j = 0; j < batch.length; j++) {
          const cacheKey = this.generateCacheKey(batch[j], batchPaths?.[j]);
          const cached = await this.loadFromCache(cacheKey);
          
          if (cached) {
            batchEmbeddings.push(cached.embedding);
            cacheHits++;
          } else {
            batchEmbeddings.push(null);
            needsGeneration.push(j);
          }
        }
      } else {
        needsGeneration.push(...Array.from({ length: batch.length }, (_, i) => i));
      }

      // Generate embeddings for cache misses
      if (needsGeneration.length > 0) {
        const textsToEmbed = needsGeneration.map(idx => batch[idx]);
        
        for (let j = 0; j < textsToEmbed.length; j++) {
          const text = textsToEmbed[j];
          const idx = needsGeneration[j];
          const filePath = batchPaths?.[idx];
          
          const output = await this.model!(text, { pooling: 'mean', normalize: true });
          const embedding = new Float32Array(output.data);
          
          batchEmbeddings[idx] = embedding;
          
          // Cache it
          if (useCache) {
            const cacheKey = this.generateCacheKey(text, filePath);
            await this.saveToCache(cacheKey, embedding, text, filePath);
          }
        }
      }

      // Add to results
      embeddings.push(...batchEmbeddings as Float32Array[]);
    }

    const totalTime = Date.now() - startTime;
    const avgTime = totalTime / texts.length;
    console.log(`[EmbeddingService] ✓ Embedded ${texts.length} texts in ${totalTime}ms (${avgTime.toFixed(1)}ms/text, ${cacheHits} cache hits)`);

    return embeddings;
  }

  /**
   * Compute cosine similarity between two embeddings
   */
  static cosineSimilarity(a: Float32Array, b: Float32Array): number {
    if (a.length !== b.length) {
      throw new Error('Embeddings must have the same dimensions');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (normA * normB);
  }

  /**
   * Find top-K most similar embeddings to query
   */
  static findTopK(
    queryEmbedding: Float32Array,
    candidateEmbeddings: Float32Array[],
    k: number
  ): { index: number; similarity: number }[] {
    const similarities = candidateEmbeddings.map((embedding, index) => ({
      index,
      similarity: EmbeddingService.cosineSimilarity(queryEmbedding, embedding)
    }));

    return similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, k);
  }

  /**
   * Get model information
   */
  getModelInfo(): { name: string; version: string; dimensions: number } {
    return {
      name: this.modelName,
      version: this.modelVersion,
      dimensions: this.dimensions
    };
  }

  /**
   * Clear all cached embeddings
   */
  async clearCache(): Promise<void> {
    try {
      console.log('[EmbeddingService] Clearing cache...');
      
      // Delete all files in cache directory
      const files = await fs.readdir(this.cacheDir);
      for (const file of files) {
        await fs.unlink(path.join(this.cacheDir, file));
      }
      
      this.cacheIndex.clear();
      await this.saveCacheIndex();
      
      console.log('[EmbeddingService] Cache cleared');
    } catch (error) {
      console.error('[EmbeddingService] Failed to clear cache:', error);
    }
  }
}

// Export singleton accessor
export const getEmbeddingService = (projectPath?: string) => EmbeddingService.getInstance(projectPath);
