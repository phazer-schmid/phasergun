/**
 * Fingerprint utilities for deterministic caching
 * Computes stable hashes for documents and analysis recipes
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Compute SHA256 hash of a string
 */
export function sha256(input: string): string {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

/**
 * Compute document fingerprint based on file path and modification time
 */
export interface DocumentFingerprint {
  filePath: string;
  modifiedTime: string;
  fileSize: number;
  hash: string;
}

export async function computeDocumentFingerprint(filePath: string): Promise<DocumentFingerprint> {
  const stats = await fs.promises.stat(filePath);
  
  const fingerprint = {
    filePath: path.normalize(filePath),
    modifiedTime: stats.mtime.toISOString(),
    fileSize: stats.size,
    hash: ''
  };
  
  // Create stable hash from normalized path, mtime, and size
  const hashInput = `${fingerprint.filePath}|${fingerprint.modifiedTime}|${fingerprint.fileSize}`;
  fingerprint.hash = sha256(hashInput);
  
  return fingerprint;
}

/**
 * Compute recipe fingerprint for analysis configuration
 */
export interface RecipeFingerprint {
  promptVersion: string;
  modelName: string;
  modelSettings: string;
  validationCriteriaHash?: string;
  ragVersion: string;
  recipeVersion: string;
  hash: string;
}

export interface RecipeConfig {
  promptVersion?: string;
  modelName: string;
  temperature: number;
  maxTokens: number;
  validationCriteriaPath?: string;
  ragVersion?: string;
  globalRecipeVersion?: string;
}

export async function computeRecipeFingerprint(config: RecipeConfig): Promise<RecipeFingerprint> {
  // Use provided version or compute hash of prompt generation logic
  const promptVersion = config.promptVersion || 'v1.0.0';
  
  // Model settings as stable string
  const modelSettings = `temp=${config.temperature},max=${config.maxTokens}`;
  
  // Hash validation criteria file if provided
  let validationCriteriaHash: string | undefined;
  if (config.validationCriteriaPath) {
    try {
      const criteriaContent = await fs.promises.readFile(config.validationCriteriaPath, 'utf8');
      validationCriteriaHash = sha256(criteriaContent);
    } catch (error) {
      // File doesn't exist or not readable - use undefined
      validationCriteriaHash = undefined;
    }
  }
  
  // RAG version
  const ragVersion = config.ragVersion || 'v1.0.0';
  
  // Global recipe version (can be manually bumped to invalidate all cache)
  const recipeVersion = config.globalRecipeVersion || process.env.RECIPE_VERSION || '1.0.0';
  
  const fingerprint: RecipeFingerprint = {
    promptVersion,
    modelName: config.modelName,
    modelSettings,
    validationCriteriaHash,
    ragVersion,
    recipeVersion,
    hash: ''
  };
  
  // Compute combined hash
  const hashInput = [
    fingerprint.promptVersion,
    fingerprint.modelName,
    fingerprint.modelSettings,
    fingerprint.validationCriteriaHash || 'no-validation',
    fingerprint.ragVersion,
    fingerprint.recipeVersion
  ].join('|');
  
  fingerprint.hash = sha256(hashInput);
  
  return fingerprint;
}

/**
 * Compute combined cache key from document and recipe fingerprints
 */
export function computeCacheKey(docFingerprint: DocumentFingerprint, recipeFingerprint: RecipeFingerprint): string {
  const combined = `${docFingerprint.hash}|${recipeFingerprint.hash}`;
  return sha256(combined);
}

/**
 * Compute category fingerprint based on all files in category
 */
export interface CategoryFingerprint {
  categoryPath: string;
  fileCount: number;
  filesHash: string;
  hash: string;
}

export async function computeCategoryFingerprint(
  categoryPath: string,
  files: string[]
): Promise<CategoryFingerprint> {
  // Sort files for stable ordering
  const sortedFiles = [...files].sort();
  
  // Compute fingerprint for each file
  const fileFingerprints = await Promise.all(
    sortedFiles.map(f => computeDocumentFingerprint(f))
  );
  
  // Combine all file hashes
  const filesHashInput = fileFingerprints.map(f => f.hash).join('|');
  const filesHash = sha256(filesHashInput);
  
  const fingerprint: CategoryFingerprint = {
    categoryPath: path.normalize(categoryPath),
    fileCount: files.length,
    filesHash,
    hash: ''
  };
  
  // Final hash
  const hashInput = `${fingerprint.categoryPath}|${fingerprint.fileCount}|${fingerprint.filesHash}`;
  fingerprint.hash = sha256(hashInput);
  
  return fingerprint;
}
