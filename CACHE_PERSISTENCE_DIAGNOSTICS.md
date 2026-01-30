# Cache Persistence Diagnostics - Implementation Summary

## Problem Statement

After restarting the application, cached files were being re-parsed even though:
1. The cache summaries existed and were being reused ("✓ Using cached summary")
2. The files themselves hadn't changed
3. No clear indication of why the cache was invalid

The question: **Why did it re-parse files after an app restart when it had cache available?**

## Root Cause Analysis

The issue was **cache metadata not being restored from disk to memory after restart**. Here's the flow:

### What SHOULD Happen on Restart:
1. App restarts → in-memory cache is empty ✅
2. User clicks Generate → `loadKnowledge()` called
3. `isCacheValid()` checks memory (empty) → tries to load from disk
4. Cache metadata loads from disk → validates fingerprint
5. If valid → loads vector store, skips parsing ✅

### What WAS Happening:
1. App restarts → in-memory cache is empty
2. `isCacheValid()` runs but **cache metadata not loading from disk properly**
3. Cache appears invalid → regenerates everything (parsing, embedding, etc.)
4. Summary cache (separate file) still valid → reuses those

## Solution Implemented

### 1. Comprehensive Logging Added

Added detailed logging throughout the cache lifecycle to diagnose issues:

#### In `enhanced-rag-service.ts`:

**Cache Save Operations:**
```typescript
- 💾 [CACHE] Saving cache metadata to: {path}
- 📁 [CACHE] Cache directory created/verified: {dir}
- ✅ [CACHE] Cache metadata saved successfully ({size} bytes)
- 📊 [CACHE] Cache fingerprint: {fingerprint}...
- ❌ [CACHE] Failed to save cache metadata: {error}
```

**Cache Load Operations:**
```typescript
- 🔍 [CACHE] Attempting to load cache metadata from: {path}
- 📂 [CACHE] Cache metadata file found ({size} bytes)
- ✅ [CACHE] Cache metadata loaded from disk successfully
- 📊 [CACHE] Cached fingerprint: {fingerprint}...
- 📊 [CACHE] Cache indexed at: {timestamp}
- ❌ [CACHE] Cache metadata file does not exist (ENOENT)
```

**Cache Validation:**
```typescript
- 🔍 [CACHE] ======================================== 
- 🔍 [CACHE] Checking cache validity for project
- 🔍 [CACHE] Project path: {path}
- 📦 [CACHE] Cache found in MEMORY / Cache NOT in memory
- 🔍 [CACHE] Computing current fingerprint...
- 🔍 [CACHE] Current fingerprint: {fingerprint}...
- 🔍 [CACHE] Cached fingerprint: {fingerprint}...
- ✅ [CACHE] Cache is VALID (fingerprints match)
- ⚠️  [CACHE] Cache EXPIRED - fingerprint mismatch
- 🔍 [CACHE] ========================================
```

#### In `vector-store.ts`:

**Vector Store Save:**
```typescript
- 💾 [VECTOR] Saving vector store to: {path}
- 📁 [VECTOR] Directory created/verified: {dir}
- ✅ [VECTOR] Vector store saved successfully ({size} bytes)
- 📊 [VECTOR] Saved {count} entries
- 📊 [VECTOR] Fingerprint: {fingerprint}...
- ❌ [VECTOR] Failed to save vector store: {error}
```

**Vector Store Load:**
```typescript
- 📂 [VECTOR] Attempting to load vector store from: {path}
- ✅ [VECTOR] Vector store file found ({size} bytes)
- ✅ [VECTOR] Vector store loaded successfully
- 📊 [VECTOR] Loaded {count} entries
- 📊 [VECTOR] Store fingerprint: {fingerprint}...
- 📊 [VECTOR] Created at: {timestamp}
- ❌ [VECTOR] Vector store file does not exist (ENOENT)
- 🔨 [VECTOR] Creating new empty vector store
```

### 2. File Verification After Save

Added explicit verification that files were actually written:

```typescript
// After writing cache metadata
try {
  const stats = await fs.stat(metadataPath);
  console.log(`✅ [CACHE] Cache metadata saved successfully (${stats.size} bytes)`);
} catch (verifyError) {
  console.error(`⚠️  [CACHE] File written but verification failed:`, verifyError);
}
```

Same verification added for vector store saves.

### 3. Enhanced Error Handling

- More descriptive error messages
- Explicit ENOENT (file not found) detection
- Path information included in all error logs
- Non-fatal errors clearly marked

## Cache Architecture

### Cache Storage Locations

All cache files are stored in the system temp directory:

```typescript
const tempBase = os.tmpdir();  // e.g., /var/folders/.../T on macOS
const cacheBaseName = crypto.createHash('md5')
  .update(projectPath)
  .digest('hex')
  .substring(0, 8);

// Cache structure:
// /tmp/phasergun-cache/
//   ├── metadata/{hash}/cache-metadata.json         // Cache metadata
//   ├── vector-store/{hash}/vector-store.json      // Vector embeddings
//   ├── sop-summaries/{hash}/sop-summaries.json    // SOP summaries
//   └── context-summaries/{hash}/context-summaries.json  // Context summaries
```

### Cache Components

1. **Cache Metadata** (`cache-metadata.json`):
   - Project path
   - Fingerprint (based on file mtimes/sizes)
   - Primary context
   - Index timestamp
   - Vector store fingerprint

2. **Vector Store** (`vector-store.json`):
   - Document embeddings (384-dim vectors)
   - Chunk metadata
   - Content hashes
   - Categories (procedure/context)

3. **Summary Caches** (separate files):
   - SOP summaries (separate cache with content hashes)
   - Context summaries (separate cache with content hashes)
   - Can be valid even when main cache is invalid

### Fingerprinting Strategy

The cache fingerprint is based on:
- Primary context file (path, size, mtime)
- All files in Procedures/ folder (paths, sizes, mtimes)
- All files in Context/ folder EXCEPT Prompt/ subfolder (paths, sizes, mtimes)

**Note:** Context/Prompt files are intentionally NEVER cached - they're parsed fresh each time.

## What to Look For in Logs

### Cache is Working (Restart Survives):
```
[EnhancedRAG] 🔍 [CACHE] Checking cache validity for project
[EnhancedRAG] 📦 [CACHE] Cache NOT in memory, checking disk...
[EnhancedRAG] 🔍 [CACHE] Attempting to load cache metadata from: /tmp/...
[EnhancedRAG] 📂 [CACHE] Cache metadata file found (XXX bytes)
[EnhancedRAG] ✅ [CACHE] Cache metadata loaded from disk successfully
[EnhancedRAG] ✅ [CACHE] Cache metadata restored from disk to memory
[EnhancedRAG] 🔍 [CACHE] Computing current fingerprint...
[EnhancedRAG] ✅ [CACHE] Cache is VALID (fingerprints match)
[VectorStore] 📂 [VECTOR] Attempting to load vector store from: /tmp/...
[VectorStore] ✅ [VECTOR] Vector store file found (XXX bytes)
[VectorStore] ✅ [VECTOR] Vector store loaded successfully
```

### Cache Missing (Expected First Run):
```
[EnhancedRAG] 🔍 [CACHE] Checking cache validity for project
[EnhancedRAG] 📦 [CACHE] Cache NOT in memory, checking disk...
[EnhancedRAG] 🔍 [CACHE] Attempting to load cache metadata from: /tmp/...
[EnhancedRAG] ❌ [CACHE] Cache metadata file does not exist (ENOENT)
[EnhancedRAG] ❌ [CACHE] No cached knowledge found (memory or disk)
[EnhancedRAG] 🔄 Cache invalid or missing - regenerating...
```

### Cache Expired (Files Changed):
```
[EnhancedRAG] ✅ [CACHE] Cache metadata loaded from disk successfully
[EnhancedRAG] ⚠️  [CACHE] Cache EXPIRED - fingerprint mismatch
[EnhancedRAG] 📊 [CACHE] Old fingerprint: abc123...
[EnhancedRAG] 📊 [CACHE] New fingerprint: def456...
```

## Testing the Fix

To verify cache persistence works:

1. **First Run** (Cache Build):
   ```bash
   # Start app, click Generate
   # Look for: "Cache invalid or missing - regenerating..."
   # Look for: "✅ [CACHE] Cache metadata saved successfully"
   # Look for: "✅ [VECTOR] Vector store saved successfully"
   ```

2. **Restart App**:
   ```bash
   # Restart the application
   # Click Generate again
   # Look for: "✅ [CACHE] Cache metadata restored from disk to memory"
   # Look for: "✅ [CACHE] Cache is VALID (fingerprints match)"
   # Should NOT see: "Parsing: {filename}"
   ```

3. **Verify No Re-parsing**:
   - After restart, files should NOT be re-parsed
   - Vector store should be loaded from disk
   - Summaries may still be loaded from their separate cache

## Potential Issues

### macOS Temp Directory Cleanup
- macOS may clean `/tmp` on restart or periodically
- If this happens, cache will be regenerated (expected behavior)
- User will see "Cache metadata file does not exist (ENOENT)"

### File System Permissions
- Cache requires write access to `/tmp/phasergun-cache/`
- If permissions denied, logs will show explicit error messages

### Ubuntu Droplet Considerations
- Temp directory location may differ (`/tmp` vs `/var/tmp`)
- Disk space monitoring still important
- Cache in temp is better than project directory (which filled disk before)

## Files Modified

1. **src/rag-service/src/enhanced-rag-service.ts**
   - Added comprehensive logging to `saveCacheMetadata()`
   - Added comprehensive logging to `loadCacheMetadata()`
   - Enhanced `isCacheValid()` with detailed step-by-step logging
   - Added file existence verification after saves

2. **src/rag-service/src/vector-store.ts**
   - Added comprehensive logging to `save()` method
   - Added comprehensive logging to `static load()` method
   - Added file existence verification after saves
   - Re-added missing `createEntry()` static method

## Summary

The logging additions will now clearly show:
1. **Where** cache files are being saved/loaded
2. **Whether** the save/load operations succeed
3. **Why** a cache might be invalid (fingerprint mismatch)
4. **When** cache is restored from disk after restart

This makes it much easier to diagnose cache persistence issues and understand the system's behavior.
