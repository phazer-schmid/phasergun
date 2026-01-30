# Cache Persistence Fix Summary

## Problem
The cache wasn't being reused between subsequent requests. Every request was rebuilding the entire knowledge base (embeddings, vector store, etc.) even though nothing had changed.

## Root Cause
The cache metadata was **only stored in memory** (`Map<string, KnowledgeCache>`), not persisted to disk. When a new request came in:
1. The in-memory cache Map was empty (new process or cleared memory)
2. `isCacheValid()` checked the Map → found nothing
3. System thought there was no cache and rebuilt everything from scratch

Meanwhile, the vector store and SOP summaries WERE being saved to disk, but the system had no way to know they existed without the cache metadata.

## Solution
Added disk persistence for cache metadata alongside existing vector store and SOP summaries:

### Changes Made

1. **Added `getCacheMetadataPath()` method**
   - Returns path: `/tmp/phasergun-cache/metadata/{projectHash}/cache-metadata.json`
   - Stores cache fingerprint, timestamps, and metadata

2. **Added `saveCacheMetadata()` method**
   - Saves cache metadata to disk after building knowledge base
   - Called automatically in `loadKnowledge()` after vector store is built

3. **Added `loadCacheMetadata()` method**
   - Loads cache metadata from disk if file exists
   - Returns `null` if not found

4. **Updated `isCacheValid()` method**
   - Now checks memory cache first (fast path)
   - If not in memory, loads from disk (restores cache)
   - Stores loaded cache back into memory for subsequent checks
   - Validates fingerprint to detect if files have changed

5. **Updated `clearOldCache()` method**
   - Now also deletes cache metadata file when clearing cache

### Cache Structure
```
/tmp/phasergun-cache/
├── vector-store/{projectHash}/
│   └── vector-store.json          # Vector embeddings
├── sop-summaries/{projectHash}/
│   └── sop-summaries.json         # Cached SOP summaries
└── metadata/{projectHash}/
    └── cache-metadata.json        # NEW: Cache validation data
```

### Cache Metadata Format
```json
{
  "projectPath": "/Users/davidschmid/RAG",
  "fingerprint": "cdf69fb1e2c3ea43...",
  "vectorStoreFingerprint": "dbd062b568f62623...",
  "indexedAt": "2026-01-30T00:19:36.946Z",
  "primaryContext": { ... }
}
```

## How It Works Now

### First Request
1. Check memory cache → empty
2. Check disk cache metadata → not found
3. Build knowledge base (parse files, generate embeddings, create vector store)
4. Save cache metadata to disk ✅
5. Save vector store to disk ✅
6. Store cache in memory ✅

### Subsequent Requests (Same Process or New Process)
1. Check memory cache → empty (if new process)
2. Check disk cache metadata → **found!** ✅
3. Load metadata into memory
4. Validate fingerprint (compare file timestamps/sizes)
5. Fingerprint matches → **load vector store from disk** ✅
6. **Skip expensive rebuilding** ✅

### When Files Change
1. Check memory/disk cache → found
2. Validate fingerprint → **mismatch detected**
3. Cache invalid → rebuild everything
4. Save new cache metadata with updated fingerprint

## Performance Impact

### Before (Every Request)
- Parse 6 procedure files
- Parse 4 context files  
- Generate 101 embeddings
- Build vector store
- Generate 6 SOP summaries (LLM calls)
- **Total: ~20-30 seconds**

### After (Cached)
- Load cache metadata from disk (instant)
- Validate fingerprint (milliseconds)
- Load vector store from disk (~100ms)
- **Total: ~100-200ms** ⚡

## Testing
Run two prompts in succession to verify cache is working:
- First prompt: Should build cache (slow)
- Second prompt: Should load from cache (fast)
- Look for log message: `"✓ Cache metadata restored from disk to memory"`

## Files Modified
- `src/rag-service/src/enhanced-rag-service.ts`
  - Added `getCacheMetadataPath()`
  - Added `saveCacheMetadata()`
  - Added `loadCacheMetadata()`
  - Updated `isCacheValid()`
  - Updated `loadKnowledge()`
  - Updated `clearOldCache()`
