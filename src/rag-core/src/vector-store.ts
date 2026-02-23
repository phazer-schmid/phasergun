/**
 * Simple Vector Store for Document Embeddings
 * File-based storage for embeddings and metadata
 * Supports cosine similarity search
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import * as os from 'os';

/**
 * Vector entry with embedding and metadata
 */
export interface VectorEntry {
  id: string;                    // Unique identifier
  embedding: number[];           // 384-dim vector (stored as number[] for JSON serialization)
  metadata: {
    fileName: string;            // Source file name
    filePath: string;            // Full file path
    category: 'procedure' | 'context';  // Document category
    chunkIndex: number;          // Chunk position in document
    content: string;             // Original text content
    contentHash: string;         // SHA256 of content
    contextCategory?: 'primary-context-root' | 'initiation' | 'ongoing' | 'predicates' | 'regulatory-strategy' | 'general';  // Context subfolder category
  };
}

/**
 * Search result with similarity score
 */
export interface SearchResult {
  entry: VectorEntry;
  similarity: number;
}

/**
 * Vector Store data structure
 */
interface VectorStoreData {
  projectPath: string;
  entries: VectorEntry[];
  fingerprint: string;
  createdAt: string;
  updatedAt: string;
  modelVersion: string;
  totalEntries: number;
}

/**
 * Simple Vector Store for Document Embeddings
 * Provides file-based persistence and similarity search
 */
export class VectorStore {
  private projectPath: string;
  private entries: VectorEntry[] = [];
  private fingerprint: string = '';
  private createdAt: string = new Date().toISOString();
  private updatedAt: string = new Date().toISOString();
  private modelVersion: string = 'v1.0';
  private entryMap: Map<string, VectorEntry> = new Map(); // Fast lookup by ID

  constructor(projectPath: string, modelVersion: string = 'v1.0') {
    this.projectPath = projectPath;
    this.modelVersion = modelVersion;
    this.updateFingerprint();
  }

  /**
   * Compute SHA256 hash of content
   */
  private static computeContentHash(content: string): string {
    return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
  }

  /**
   * Update the store fingerprint based on current entries
   */
  private updateFingerprint(): void {
    // Compute fingerprint from all entry IDs and content hashes
    const entryHashes = this.entries
      .map(e => `${e.id}:${e.metadata.contentHash}`)
      .sort()
      .join('|');
    
    const fingerprintInput = `${this.projectPath}|${this.modelVersion}|${entryHashes}`;
    this.fingerprint = crypto.createHash('sha256').update(fingerprintInput).digest('hex');
    this.updatedAt = new Date().toISOString();
  }

  /**
   * Generate unique ID for a vector entry
   */
  private static generateEntryId(
    filePath: string,
    chunkIndex: number,
    contentHash: string
  ): string {
    const idInput = `${filePath}:${chunkIndex}:${contentHash}`;
    return crypto.createHash('sha256').update(idInput).digest('hex').substring(0, 16);
  }

  /**
   * Convert Float32Array to number[] for JSON serialization
   */
  static float32ArrayToNumbers(arr: Float32Array): number[] {
    return Array.from(arr);
  }

  /**
   * Convert number[] back to Float32Array for calculations
   */
  static numbersToFloat32Array(arr: number[]): Float32Array {
    return new Float32Array(arr);
  }

  /**
   * Add or update a vector entry
   * If an entry with the same ID exists, it will be updated
   */
  addEntry(entry: VectorEntry): void {
    // Generate ID if not provided
    if (!entry.id) {
      entry.id = VectorStore.generateEntryId(
        entry.metadata.filePath,
        entry.metadata.chunkIndex,
        entry.metadata.contentHash
      );
    }

    // Check if entry already exists
    const existingIndex = this.entries.findIndex(e => e.id === entry.id);
    
    if (existingIndex >= 0) {
      // Update existing entry
      this.entries[existingIndex] = entry;
      this.entryMap.set(entry.id, entry);
    } else {
      // Add new entry
      this.entries.push(entry);
      this.entryMap.set(entry.id, entry);
    }

    this.updateFingerprint();
  }

  /**
   * Add multiple entries at once (batch operation)
   */
  addEntries(entries: VectorEntry[]): void {
    entries.forEach(entry => this.addEntry(entry));
  }

  /**
   * Compute cosine similarity between two embeddings
   */
  private static cosineSimilarity(a: number[], b: number[]): number {
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
   * Search for similar vectors using cosine similarity
   * @param queryEmbedding - The query vector to search for
   * @param topK - Number of top results to return
   * @param category - Optional category filter ('procedure' | 'context')
   * @returns Array of search results sorted by similarity (highest first)
   */
  search(
    queryEmbedding: number[],
    topK: number = 5,
    category?: 'procedure' | 'context'
  ): SearchResult[] {
    // Filter by category if specified
    let candidates = this.entries;
    if (category) {
      candidates = candidates.filter(e => e.metadata.category === category);
    }

    // Compute similarity for each candidate
    const results: SearchResult[] = candidates.map(entry => ({
      entry,
      similarity: VectorStore.cosineSimilarity(queryEmbedding, entry.embedding)
    }));

    // Sort by similarity (descending), then by ID (ascending) for determinism
    // CRITICAL: When similarities are equal, we need a stable secondary sort key
    // to ensure consistent ordering across cache rebuilds
    return results
      .sort((a, b) => {
        const simDiff = b.similarity - a.similarity;
        
        // If similarities are essentially equal (within floating-point precision)
        // break ties using entry ID for deterministic ordering
        if (Math.abs(simDiff) < 1e-10) {
          return a.entry.id.localeCompare(b.entry.id);
        }
        
        return simDiff;
      })
      .slice(0, topK);
  }

  /**
   * Search using Float32Array (convenience method)
   */
  searchWithFloat32Array(
    queryEmbedding: Float32Array,
    topK: number = 5,
    category?: 'procedure' | 'context'
  ): SearchResult[] {
    return this.search(VectorStore.float32ArrayToNumbers(queryEmbedding), topK, category);
  }

  /**
   * Get entry by ID
   */
  getEntryById(id: string): VectorEntry | undefined {
    return this.entryMap.get(id);
  }

  /**
   * Get all entries for a specific file
   */
  getEntriesByFile(filePath: string): VectorEntry[] {
    return this.entries.filter(e => e.metadata.filePath === filePath);
  }

  /**
   * Get all entries for a category
   */
  getEntriesByCategory(category: 'procedure' | 'context'): VectorEntry[] {
    return this.entries.filter(e => e.metadata.category === category);
  }

  /**
   * Remove an entry by ID
   */
  removeEntry(id: string): boolean {
    const index = this.entries.findIndex(e => e.id === id);
    if (index >= 0) {
      this.entries.splice(index, 1);
      this.entryMap.delete(id);
      this.updateFingerprint();
      return true;
    }
    return false;
  }

  /**
   * Remove all entries for a specific file
   */
  removeEntriesByFile(filePath: string): number {
    const initialCount = this.entries.length;
    this.entries = this.entries.filter(e => {
      if (e.metadata.filePath === filePath) {
        this.entryMap.delete(e.id);
        return false;
      }
      return true;
    });
    
    if (this.entries.length !== initialCount) {
      this.updateFingerprint();
    }
    
    return initialCount - this.entries.length;
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.entries = [];
    this.entryMap.clear();
    this.updateFingerprint();
  }

  /**
   * Get store statistics
   */
  getStats(): {
    totalEntries: number;
    procedureEntries: number;
    contextEntries: number;
    fingerprint: string;
    projectPath: string;
    createdAt: string;
    updatedAt: string;
  } {
    return {
      totalEntries: this.entries.length,
      procedureEntries: this.entries.filter(e => e.metadata.category === 'procedure').length,
      contextEntries: this.entries.filter(e => e.metadata.category === 'context').length,
      fingerprint: this.fingerprint,
      projectPath: this.projectPath,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }

  /**
   * Save vector store to disk
   * Saves to system temp directory to avoid permission issues
   */
  async save(storePath?: string): Promise<void> {
    const savePath = storePath || this.getDefaultStorePath();
    
    console.log(`[VectorStore] 💾 [VECTOR] Saving vector store to: ${savePath}`);
    
    try {
      // Ensure directory exists
      const dir = path.dirname(savePath);
      await fs.mkdir(dir, { recursive: true });
      console.log(`[VectorStore] 📁 [VECTOR] Directory created/verified: ${dir}`);

      // Prepare data for serialization
      const data: VectorStoreData = {
        projectPath: this.projectPath,
        entries: this.entries,
        fingerprint: this.fingerprint,
        createdAt: this.createdAt,
        updatedAt: this.updatedAt,
        modelVersion: this.modelVersion,
        totalEntries: this.entries.length
      };

      // Write to disk
      const jsonData = JSON.stringify(data, null, 2);
      await fs.writeFile(savePath, jsonData, 'utf8');
      
      // Verify the file was written
      try {
        const stats = await fs.stat(savePath);
        console.log(`[VectorStore] ✅ [VECTOR] Vector store saved successfully (${stats.size} bytes)`);
        console.log(`[VectorStore] 📊 [VECTOR] Saved ${this.entries.length} entries`);
        console.log(`[VectorStore] 📊 [VECTOR] Fingerprint: ${this.fingerprint.substring(0, 16)}...`);
      } catch (verifyError) {
        console.error(`[VectorStore] ⚠️  [VECTOR] File written but verification failed:`, verifyError);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[VectorStore] ❌ [VECTOR] Failed to save vector store:`, errorMsg);
      console.error(`[VectorStore] ❌ [VECTOR] Target path was: ${savePath}`);
      // Don't throw - allow the system to continue even if save fails
    }
  }

  /**
   * Load vector store from disk
   * Loads from system temp directory
   */
  static async load(storePath: string, projectPath?: string): Promise<VectorStore> {
    console.log(`[VectorStore] 📂 [VECTOR] Attempting to load vector store from: ${storePath}`);
    
    try {
      // First check if file exists
      try {
        const stats = await fs.stat(storePath);
        console.log(`[VectorStore] ✅ [VECTOR] Vector store file found (${stats.size} bytes)`);
      } catch (statError) {
        if ((statError as NodeJS.ErrnoException).code === 'ENOENT') {
          console.log('[VectorStore] ❌ [VECTOR] Vector store file does not exist (ENOENT)');
          console.log(`[VectorStore] 🔨 [VECTOR] Creating new empty vector store`);
          const usePath = projectPath || path.dirname(path.dirname(storePath));
          return new VectorStore(usePath);
        }
        throw statError;
      }
      
      // Read from disk
      const fileContents = await fs.readFile(storePath, 'utf8');
      const data: VectorStoreData = JSON.parse(fileContents);

      // Create new store instance
      const usePath = projectPath || data.projectPath;
      const store = new VectorStore(usePath, data.modelVersion);
      
      // Restore data
      store.entries = data.entries;
      store.fingerprint = data.fingerprint;
      store.createdAt = data.createdAt;
      store.updatedAt = data.updatedAt;

      // Rebuild entry map
      store.entryMap.clear();
      data.entries.forEach(entry => {
        store.entryMap.set(entry.id, entry);
      });

      console.log(`[VectorStore] ✅ [VECTOR] Vector store loaded successfully`);
      console.log(`[VectorStore] 📊 [VECTOR] Loaded ${data.totalEntries} entries`);
      console.log(`[VectorStore] 📊 [VECTOR] Store fingerprint: ${data.fingerprint.substring(0, 16)}...`);
      console.log(`[VectorStore] 📊 [VECTOR] Created at: ${data.createdAt}`);
      
      return store;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // File doesn't exist, return empty store
        console.log(`[VectorStore] ❌ [VECTOR] Vector store file not found (ENOENT)`);
        console.log(`[VectorStore] 🔨 [VECTOR] Creating new empty vector store`);
        const usePath = projectPath || path.dirname(path.dirname(storePath));
        return new VectorStore(usePath);
      }
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[VectorStore] ❌ [VECTOR] Failed to load vector store:`, errorMsg);
      throw error;
    }
  }

  /**
   * Load or create vector store (convenience method)
   */
  static async loadOrCreate(projectPath: string, modelVersion?: string): Promise<VectorStore> {
    const storePath = VectorStore.getDefaultStorePathStatic(projectPath);
    
    try {
      return await VectorStore.load(storePath, projectPath);
    } catch (error) {
      console.log(`[VectorStore] Creating new vector store for ${projectPath}`);
      return new VectorStore(projectPath, modelVersion);
    }
  }

  /**
   * Get default store path for a project
   */
  private getDefaultStorePath(): string {
    return VectorStore.getDefaultStorePathStatic(this.projectPath);
  }

  /**
   * Get default store path (static method)
   * Uses system temp directory to avoid permission issues with mounted volumes
   */
  private static getDefaultStorePathStatic(projectPath: string): string {
    // Use system temp directory for cache instead of project directory
    const tempBase = os.tmpdir();
    const cacheBaseName = crypto.createHash('md5').update(projectPath).digest('hex').substring(0, 8);
    return path.join(tempBase, 'phasergun-cache', 'vector-store', cacheBaseName, 'vector-store.json');
  }

  /**
   * Check if a vector store exists on disk
   */
  static async exists(projectPath: string): Promise<boolean> {
    const storePath = VectorStore.getDefaultStorePathStatic(projectPath);
    try {
      await fs.access(storePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create entry from document chunk and embedding
   */
  static createEntry(
    content: string,
    embedding: Float32Array | number[],
    metadata: {
      fileName: string;
      filePath: string;
      category: 'procedure' | 'context';
      chunkIndex: number;
      contextCategory?: 'primary-context-root' | 'initiation' | 'ongoing' | 'predicates' | 'regulatory-strategy' | 'general';
    }
  ): VectorEntry {
    const contentHash = VectorStore.computeContentHash(content);
    const embeddingArray = embedding instanceof Float32Array 
      ? VectorStore.float32ArrayToNumbers(embedding)
      : embedding;

    const id = VectorStore.generateEntryId(
      metadata.filePath,
      metadata.chunkIndex,
      contentHash
    );

    return {
      id,
      embedding: embeddingArray,
      metadata: {
        ...metadata,
        content,
        contentHash
      }
    };
  }

  /**
   * Get the current fingerprint
   */
  getFingerprint(): string {
    return this.fingerprint;
  }

  /**
   * Get the project path
   */
  getProjectPath(): string {
    return this.projectPath;
  }

  /**
   * Get all entries
   */
  getAllEntries(): VectorEntry[] {
    return [...this.entries];
  }

  /**
   * Get entry count
   */
  getEntryCount(): number {
    return this.entries.length;
  }
}

/**
 * Export helper function to create a vector store
 */
export async function createVectorStore(
  projectPath: string,
  modelVersion?: string
): Promise<VectorStore> {
  return VectorStore.loadOrCreate(projectPath, modelVersion);
}
