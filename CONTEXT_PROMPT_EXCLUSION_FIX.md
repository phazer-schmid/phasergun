# Context/Prompt Folder Exclusion Fix

## Summary
Fixed the caching system to properly handle the `Context/Prompt` folder - files in this folder are now **never cached** and are excluded from cache fingerprinting. This ensures that changes to Prompt files don't trigger unnecessary cache regeneration, while still allowing on-demand parsing when needed.

## Changes Made

### 1. **Enhanced Logging for File Parsing**
Added comprehensive logging to show which files are being parsed and cached:
- Logs each file as it's loaded with file size
- Shows breakdown by category (primary-context-root, initiation, ongoing, predicates)
- Displays total file counts for each subfolder
- Makes it clear when Context/Prompt is being skipped

### 2. **Modified `getAllFiles()` Method**
- Added `excludeDirs` parameter to skip specified directories
- Logs when a directory is being skipped
- Recursively applies exclusion to all subdirectories

### 3. **Updated `computeFolderFingerprint()` Method**
- Now accepts `excludeDirs` parameter
- Passes exclusion list to `getAllFiles()`
- Logs the number of files being fingerprinted
- Logs when folders are not found

### 4. **Modified `computeCacheFingerprint()` Method**
- **Key Change**: Excludes `['Prompt']` from Context folder fingerprinting
- Added comment explaining that Context/Prompt files are never cached
- This ensures Prompt file changes don't invalidate the cache

### 5. **Enhanced `loadContextFolderStructured()` Method**
- Added prominent documentation explaining Prompt folder exclusion
- Improved logging to show exactly what's happening during folder scan
- Shows file counts and character counts for each loaded file
- Provides a summary breakdown by category
- **NOTE**: Context/Prompt is intentionally NOT scanned in this method

### 6. **Added Missing Methods**
- `detectCacheChanges()`: Provides details about what changed in the cache
- `saveCacheMetadata()`: Saves cache metadata to disk for persistence
- Fixed type annotations for better TypeScript compliance

## Behavior

### What Gets Cached ✅
- **Procedures/** folder (recursively)
- **Context/Initiation/** folder (recursively)
- **Context/Ongoing/** folder (recursively)  
- **Context/Predicates/** folder (recursively)
- **Context/** root-level files (e.g., "Primary Context.docx")

### What Does NOT Get Cached ❌
- **Context/Prompt/** folder and all its contents (recursively)

### Cache Invalidation Triggers
The cache is regenerated when:
- Files added/removed/modified in Procedures/
- Files added/removed/modified in Context/ (excluding Prompt/)
- Files added/removed/modified in Context/Initiation/
- Files added/removed/modified in Context/Ongoing/
- Files added/removed/modified in Context/Predicates/
- Primary context YAML file changes

### Cache Does NOT Invalidate When
- Files added/removed/modified in Context/Prompt/
- Prompt files are never part of the fingerprint calculation

## Testing

To test the fix:

1. **Clear existing cache**:
   ```bash
   cd "$(node -e "console.log(require('os').tmpdir())")/phasergun-cache"
   rm -rf phasergun-cache
   ```

2. **Run the application** and observe logging:
   - Should see "⏭️  Skipping excluded directory: Prompt (not cached)"
   - Should see detailed file loading logs for Context subfolders
   - Should see fingerprint calculation excluding Prompt folder

3. **Add/modify a file in Context/Prompt/**:
   - Cache should remain valid
   - No regeneration should occur

4. **Add/modify a file in Context/Initiation/**:
   - Cache should invalidate
   - Full regeneration should occur

## Implementation Details

### Key Code Changes

**In `computeCacheFingerprint()`**:
```typescript
this.computeFolderFingerprint(contextPath, ['Prompt']) // EXCLUDE Prompt folder
```

**In `getAllFiles()`**:
```typescript
if (excludeDirs.includes(entry.name)) {
  console.log(`[EnhancedRAG] ⏭️  Skipping excluded directory: ${entry.name} (not cached)`);
  continue;
}
```

**In `loadContextFolderStructured()`**:
```typescript
// NOTE: Context/Prompt is intentionally NOT scanned here - those files are parsed on-demand
```

## Benefits

1. **Performance**: Prompt files don't trigger expensive cache regeneration
2. **Clarity**: Enhanced logging makes it obvious what's happening
3. **Flexibility**: Prompt files can still be parsed on-demand when needed
4. **Correctness**: Cache fingerprinting accurately reflects what's actually cached
5. **Maintainability**: Clear documentation and logging for future developers

## Files Modified

- `src/rag-service/src/enhanced-rag-service.ts`

## Date
January 29, 2026
