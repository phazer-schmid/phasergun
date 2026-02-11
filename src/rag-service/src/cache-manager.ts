import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import * as os from 'os';

export interface KnowledgeCache {
  projectPath: string;
  fingerprint: string;
  primaryContext: any;
  indexedAt: string;
  vectorStoreFingerprint: string;
  masterChecklist?: any; // ParsedDocument for Project-Master-Checklist.docx (on-demand)
}

export class CacheManager {
  private cacheEnabled: boolean;

  constructor(cacheEnabled: boolean = true) {
    this.cacheEnabled = cacheEnabled;
  }

  getVectorStorePath(projectPath: string): string {
    const tempBase = os.tmpdir();
    const cacheBaseName = crypto.createHash('md5').update(projectPath).digest('hex').substring(0, 8);
    return path.join(tempBase, 'phasergun-cache', 'vector-store', cacheBaseName, 'vector-store.json');
  }

  getSOPSummariesCachePath(projectPath: string): string {
    const tempBase = os.tmpdir();
    const cacheBaseName = crypto.createHash('md5').update(projectPath).digest('hex').substring(0, 8);
    return path.join(tempBase, 'phasergun-cache', 'sop-summaries', cacheBaseName, 'sop-summaries.json');
  }

  getContextSummariesCachePath(projectPath: string): string {
    const tempBase = os.tmpdir();
    const cacheBaseName = crypto.createHash('md5').update(projectPath).digest('hex').substring(0, 8);
    return path.join(tempBase, 'phasergun-cache', 'context-summaries', cacheBaseName, 'context-summaries.json');
  }

  getCacheMetadataPath(projectPath: string): string {
    const tempBase = os.tmpdir();
    const cacheBaseName = crypto.createHash('md5').update(projectPath).digest('hex').substring(0, 8);
    return path.join(tempBase, 'phasergun-cache', 'metadata', cacheBaseName, 'cache-metadata.json');
  }

  async getAllFiles(dirPath: string, excludeDirs: string[] = []): Promise<string[]> {
    const files: string[] = [];
    
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isDirectory()) {
          if (excludeDirs.includes(entry.name)) {
            console.log(`[CacheManager] ⏭️  Skipping excluded directory: ${entry.name}`);
            continue;
          }
          const subFiles = await this.getAllFiles(fullPath, excludeDirs);
          files.push(...subFiles);
        } else if (entry.isFile()) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      console.error(`[CacheManager] Error reading directory ${dirPath}:`, error);
    }
    
    return files;
  }

  async computeFolderFingerprint(folderPath: string, excludeDirs: string[] = []): Promise<string> {
    try {
      await fs.access(folderPath);
      
      const files = await this.getAllFiles(folderPath, excludeDirs);
      
      if (files.length === 0) {
        console.log(`[CacheManager] No files found in ${folderPath}`);
      } else {
        console.log(`[CacheManager] Computing fingerprint for ${files.length} files in ${path.basename(folderPath)}/`);
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
      console.log(`[CacheManager] Folder ${path.basename(folderPath)}/ not found, using empty fingerprint`);
      return crypto.createHash('sha256').update('empty').digest('hex');
    }
  }

  async computeCacheFingerprint(projectPath: string, primaryContextPath: string): Promise<string> {
    const proceduresPath = path.join(projectPath, 'Procedures');
    const contextPath = path.join(projectPath, 'Context');
    const masterChecklistPath = path.join(contextPath, 'Project-Master-Checklist.docx');
    
    const [primaryFingerprint, proceduresFingerprint, contextFingerprint, masterChecklistFingerprint] = await Promise.all([
      this.computeFileFingerprint(primaryContextPath),
      this.computeFolderFingerprint(proceduresPath, []),
      this.computeFolderFingerprint(contextPath, ['Prompt']),
      this.computeFileFingerprint(masterChecklistPath)
    ]);
    
    const combined = `primary:${primaryFingerprint}|procedures:${proceduresFingerprint}|context:${contextFingerprint}|masterChecklist:${masterChecklistFingerprint}`;
    const finalFingerprint = crypto.createHash('sha256').update(combined).digest('hex');
    
    console.log(`[CacheManager] 🔑 Primary:          ${primaryFingerprint.substring(0, 16)}...`);
    console.log(`[CacheManager] 🔑 Procedures:       ${proceduresFingerprint.substring(0, 16)}...`);
    console.log(`[CacheManager] 🔑 Context:          ${contextFingerprint.substring(0, 16)}...`);
    console.log(`[CacheManager] 🔑 Master Checklist: ${masterChecklistFingerprint.substring(0, 16)}...`);
    console.log(`[CacheManager] 🔑 Combined:         ${finalFingerprint.substring(0, 16)}...`);
    
    return finalFingerprint;
  }

  private async computeFileFingerprint(filePath: string): Promise<string> {
    try {
      const stats = await fs.stat(filePath);
      const fileInfo = `${filePath}:${stats.size}:${stats.mtimeMs}`;
      return crypto.createHash('sha256').update(fileInfo).digest('hex');
    } catch (error) {
      console.log(`[CacheManager] File ${path.basename(filePath)} not found, using empty fingerprint`);
      return crypto.createHash('sha256').update('empty').digest('hex');
    }
  }

  async saveCacheMetadata(cache: KnowledgeCache): Promise<void> {
    if (!this.cacheEnabled) {
      console.log('[CacheManager] ⚠️  Skipping cache metadata save (caching disabled)');
      return;
    }
    
    const metadataPath = this.getCacheMetadataPath(cache.projectPath);
    
    console.log(`[CacheManager] 💾 Saving cache metadata to: ${metadataPath}`);
    
    try {
      const dir = path.dirname(metadataPath);
      await fs.mkdir(dir, { recursive: true });
      console.log(`[CacheManager] 📁 Cache directory created: ${dir}`);
      
      const jsonData = JSON.stringify(cache, null, 2);
      await fs.writeFile(metadataPath, jsonData, 'utf8');
      
      const stats = await fs.stat(metadataPath);
      console.log(`[CacheManager] ✅ Cache metadata saved (${stats.size} bytes)`);
      console.log(`[CacheManager] 📊 Cache fingerprint: ${cache.fingerprint.substring(0, 16)}...`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[CacheManager] ❌ Failed to save cache metadata:`, errorMsg);
    }
  }

  async loadCacheMetadata(projectPath: string): Promise<KnowledgeCache | null> {
    const metadataPath = this.getCacheMetadataPath(projectPath);
    
    console.log(`[CacheManager] 🔍 Loading cache metadata from: ${metadataPath}`);
    
    try {
      const stats = await fs.stat(metadataPath);
      console.log(`[CacheManager] 📂 Cache metadata found (${stats.size} bytes)`);
      
      const fileContents = await fs.readFile(metadataPath, 'utf8');
      const cache: KnowledgeCache = JSON.parse(fileContents);
      
      console.log('[CacheManager] ✅ Cache metadata loaded');
      console.log(`[CacheManager] 📊 Cached fingerprint: ${cache.fingerprint.substring(0, 16)}...`);
      console.log(`[CacheManager] 📊 Cache indexed at: ${cache.indexedAt}`);
      
      return cache;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        console.log('[CacheManager] ❌ Cache metadata file does not exist');
      } else {
        console.error('[CacheManager] ❌ Failed to load cache metadata');
      }
      return null;
    }
  }

  async clearOldCache(projectPath: string): Promise<void> {
    console.log('[CacheManager] 🗑️  Clearing old cache files...');
    
    const filePaths = [
      this.getVectorStorePath(projectPath),
      this.getSOPSummariesCachePath(projectPath),
      this.getContextSummariesCachePath(projectPath),
      this.getCacheMetadataPath(projectPath)
    ];
    
    for (const filePath of filePaths) {
      try {
        await fs.unlink(filePath);
        console.log(`[CacheManager] ✓ Deleted ${path.basename(filePath)}`);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          console.log(`[CacheManager] ⚠️  Could not delete ${path.basename(filePath)}`);
        }
      }
    }
  }

  async isCacheValid(
    projectPath: string,
    primaryContextPath: string,
    cache: Map<string, KnowledgeCache>
  ): Promise<boolean> {
    if (!this.cacheEnabled) return false;
    
    console.log('[CacheManager] 🔍 ========================================');
    console.log('[CacheManager] 🔍 Checking cache validity');
    console.log(`[CacheManager] 🔍 Project: ${projectPath}`);
    console.log('[CacheManager] 🔍 ========================================');
    
    let cached = cache.get(projectPath);
    
    if (cached) {
      console.log('[CacheManager] 📦 Cache found in MEMORY');
    } else {
      console.log('[CacheManager] 📦 Cache NOT in memory, checking disk...');
      const diskCache = await this.loadCacheMetadata(projectPath);
      if (diskCache !== null) {
        cached = diskCache;
        cache.set(projectPath, diskCache);
        console.log('[CacheManager] ✅ Cache restored from disk to memory');
      } else {
        console.log('[CacheManager] ❌ No cached knowledge found');
        console.log('[CacheManager] 🔍 ========================================');
        return false;
      }
    }
    
    console.log('[CacheManager] 🔍 Computing current fingerprint...');
    const currentFingerprint = await this.computeCacheFingerprint(projectPath, primaryContextPath);
    console.log(`[CacheManager] 🔍 Current: ${currentFingerprint.substring(0, 16)}...`);
    console.log(`[CacheManager] 🔍 Cached:  ${cached.fingerprint.substring(0, 16)}...`);
    
    const isValid = cached.fingerprint === currentFingerprint;
    
    if (isValid) {
      console.log('[CacheManager] ✅ Cache is VALID (fingerprints match)');
      console.log(`[CacheManager] 📊 Cache built at: ${cached.indexedAt}`);
    } else {
      console.log('[CacheManager] ⚠️  Cache EXPIRED - fingerprint mismatch');
    }
    
    console.log('[CacheManager] 🔍 ========================================');
    return isValid;
  }
}
