/**
 * Analysis Cache Service using SQLite
 * Provides deterministic caching for analysis results
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { DocumentFingerprint, RecipeFingerprint, computeCacheKey } from './fingerprint';

export interface CacheEntry {
  id?: number;
  cacheKey: string;
  filePath: string;
  fileModifiedTime: string;
  isCategory: boolean;
  
  // Recipe versioning
  recipeVersion: string;
  promptHash: string;
  modelName: string;
  validationCriteriaHash?: string;
  
  // Analysis results (stored as JSON string)
  analysisResult: string;
  
  // Metadata
  createdAt: string;
  tokensUsed?: number;
  cost?: number;
}

export interface AnalysisCacheOptions {
  dbPath?: string;
  enabled?: boolean;
}

/**
 * SQLite-based cache for analysis results
 */
export class AnalysisCache {
  private db: Database.Database;
  private enabled: boolean;

  constructor(options: AnalysisCacheOptions = {}) {
    this.enabled = options.enabled !== false; // Default to enabled
    
    if (!this.enabled) {
      console.log('[Cache] Caching is disabled');
      // Create an in-memory database that won't be used
      this.db = new Database(':memory:');
      return;
    }

    // Default cache location
    const dbPath = options.dbPath || path.join(
      __dirname,
      '../cache/analysis-cache.db'
    );

    // Ensure cache directory exists
    const cacheDir = path.dirname(dbPath);
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    // Open database
    this.db = new Database(dbPath);
    
    // Initialize schema
    this.initializeSchema();
    
    console.log(`[Cache] Initialized SQLite cache at ${dbPath}`);
  }

  /**
   * Create database schema
   */
  private initializeSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS analysis_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        
        -- Cache key (unique identifier)
        cache_key TEXT UNIQUE NOT NULL,
        
        -- File/Category identification
        file_path TEXT NOT NULL,
        file_modified_time TEXT NOT NULL,
        is_category INTEGER DEFAULT 0,
        
        -- Recipe versioning
        recipe_version TEXT NOT NULL,
        prompt_hash TEXT NOT NULL,
        model_name TEXT NOT NULL,
        validation_criteria_hash TEXT,
        
        -- Analysis results (JSON)
        analysis_result TEXT NOT NULL,
        
        -- Metadata
        created_at TEXT NOT NULL,
        tokens_used INTEGER,
        cost REAL
      );
      
      CREATE INDEX IF NOT EXISTS idx_cache_key ON analysis_cache(cache_key);
      CREATE INDEX IF NOT EXISTS idx_file_path ON analysis_cache(file_path);
      CREATE INDEX IF NOT EXISTS idx_created_at ON analysis_cache(created_at);
    `);
  }

  /**
   * Get cached analysis result
   */
  get(
    docFingerprint: DocumentFingerprint,
    recipeFingerprint: RecipeFingerprint
  ): any | null {
    if (!this.enabled) {
      return null;
    }

    const cacheKey = computeCacheKey(docFingerprint, recipeFingerprint);
    
    const stmt = this.db.prepare(`
      SELECT * FROM analysis_cache WHERE cache_key = ?
    `);
    
    const row = stmt.get(cacheKey) as any;
    
    if (!row) {
      console.log(`[Cache] MISS for ${path.basename(docFingerprint.filePath)}`);
      return null;
    }
    
    console.log(`[Cache] HIT for ${path.basename(docFingerprint.filePath)} (cached at ${row.created_at})`);
    
    // Parse JSON result
    try {
      return JSON.parse(row.analysis_result);
    } catch (error) {
      console.error('[Cache] Error parsing cached result:', error);
      return null;
    }
  }

  /**
   * Store analysis result in cache
   */
  set(
    docFingerprint: DocumentFingerprint,
    recipeFingerprint: RecipeFingerprint,
    analysisResult: any,
    metadata?: {
      tokensUsed?: number;
      cost?: number;
    }
  ): void {
    if (!this.enabled) {
      return;
    }

    const cacheKey = computeCacheKey(docFingerprint, recipeFingerprint);
    
    const entry: CacheEntry = {
      cacheKey,
      filePath: docFingerprint.filePath,
      fileModifiedTime: docFingerprint.modifiedTime,
      isCategory: false,
      recipeVersion: recipeFingerprint.recipeVersion,
      promptHash: recipeFingerprint.hash,
      modelName: recipeFingerprint.modelName,
      validationCriteriaHash: recipeFingerprint.validationCriteriaHash,
      analysisResult: JSON.stringify(analysisResult),
      createdAt: new Date().toISOString(),
      tokensUsed: metadata?.tokensUsed,
      cost: metadata?.cost
    };

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO analysis_cache (
        cache_key,
        file_path,
        file_modified_time,
        is_category,
        recipe_version,
        prompt_hash,
        model_name,
        validation_criteria_hash,
        analysis_result,
        created_at,
        tokens_used,
        cost
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      entry.cacheKey,
      entry.filePath,
      entry.fileModifiedTime,
      entry.isCategory ? 1 : 0,
      entry.recipeVersion,
      entry.promptHash,
      entry.modelName,
      entry.validationCriteriaHash || null,
      entry.analysisResult,
      entry.createdAt,
      entry.tokensUsed || null,
      entry.cost || null
    );

    console.log(`[Cache] STORED result for ${path.basename(docFingerprint.filePath)}`);
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    if (!this.enabled) {
      return;
    }

    this.db.prepare('DELETE FROM analysis_cache').run();
    console.log('[Cache] All cache entries cleared');
  }

  /**
   * Clear cache entries for a specific file
   */
  clearFile(filePath: string): void {
    if (!this.enabled) {
      return;
    }

    const normalizedPath = path.normalize(filePath);
    this.db.prepare('DELETE FROM analysis_cache WHERE file_path = ?').run(normalizedPath);
    console.log(`[Cache] Cleared cache for ${path.basename(filePath)}`);
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    totalEntries: number;
    totalFiles: number;
    totalCategories: number;
    oldestEntry: string | null;
    newestEntry: string | null;
    totalTokensSaved: number;
    totalCostSaved: number;
  } {
    if (!this.enabled) {
      return {
        totalEntries: 0,
        totalFiles: 0,
        totalCategories: 0,
        oldestEntry: null,
        newestEntry: null,
        totalTokensSaved: 0,
        totalCostSaved: 0
      };
    }

    const stats = this.db.prepare(`
      SELECT 
        COUNT(*) as total_entries,
        SUM(CASE WHEN is_category = 0 THEN 1 ELSE 0 END) as total_files,
        SUM(CASE WHEN is_category = 1 THEN 1 ELSE 0 END) as total_categories,
        MIN(created_at) as oldest_entry,
        MAX(created_at) as newest_entry,
        SUM(COALESCE(tokens_used, 0)) as total_tokens,
        SUM(COALESCE(cost, 0)) as total_cost
      FROM analysis_cache
    `).get() as any;

    return {
      totalEntries: stats.total_entries || 0,
      totalFiles: stats.total_files || 0,
      totalCategories: stats.total_categories || 0,
      oldestEntry: stats.oldest_entry,
      newestEntry: stats.newest_entry,
      totalTokensSaved: stats.total_tokens || 0,
      totalCostSaved: stats.total_cost || 0
    };
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }
}

// Singleton instance
let cacheInstance: AnalysisCache | null = null;

/**
 * Get or create cache instance
 */
export function getCache(options?: AnalysisCacheOptions): AnalysisCache {
  if (!cacheInstance) {
    cacheInstance = new AnalysisCache(options);
  }
  return cacheInstance;
}
