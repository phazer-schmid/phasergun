# Cache Directory Fix - Summary

## Problem
The system was experiencing cascading failures due to cache directory permission errors:
- Errors: `ENOENT: no such file or directory, open '/RAG/.phasergun-cache/embeddings/...'`
- Impact: Generation failed, UI only showed footnotes
- Root cause: Cache was being written to project directory `/RAG` which had permission issues

## Solution Implemented

### 1. Moved Cache to System Temp Directory
**Files Modified:**
- `src/rag-service/src/embedding-service.ts`
- `src/rag-service/src/vector-store.ts`
- `src/rag-service/src/enhanced-rag-service.ts`

**Changes:**
- Cache now uses `os.tmpdir()` instead of project directory
- Each project gets a unique cache subdirectory based on MD5 hash of project path
- Cache paths now look like: `/tmp/phasergun-cache/embeddings/{hash}/`

### 2. Added Graceful Error Handling
**All cache operations now:**
- Catch errors and log warnings instead of crashing
- Allow the system to continue without cache if directory creation fails
- Treat cache as optional performance optimization, not required functionality

### 3. Test Write Permissions
- `embedding-service.ts` now tests write permissions on initialization
- If test fails, cache is disabled but embeddings still work

## Cache Locations (After Fix)

### On Ubuntu Server:
- **Embeddings**: `/tmp/phasergun-cache/embeddings/{project-hash}/`
- **Vector Store**: `/tmp/phasergun-cache/vector-store/{project-hash}/vector-store.json`
- **SOP Summaries**: `/tmp/phasergun-cache/sop-summaries/{project-hash}/sop-summaries.json`

### Project Hash Calculation:
```typescript
const cacheBaseName = crypto.createHash('md5').update(projectPath).digest('hex').substring(0, 8);
```

## Benefits

1. **No Permission Issues**: System temp directory is always writable
2. **Automatic Cleanup**: OS can clean up old cache files
3. **Per-Project Isolation**: Each project path gets unique cache directory
4. **Graceful Degradation**: System works without cache if needed
5. **Cross-Platform**: Works on Ubuntu, macOS, Windows

## Testing

To verify the fix:

1. **Restart PM2**:
   ```bash
   pm2 restart all
   ```

2. **Test Generation**: 
   - Open the UI
   - Select a project
   - Generate content
   - Verify full content appears (not just footnotes)

3. **Check Cache Location**:
   ```bash
   ls -la /tmp/phasergun-cache/
   ```

4. **Monitor Logs**:
   ```bash
   pm2 logs meddev-api --lines 100
   ```
   - Should see: `[EmbeddingService] ✓ Cache directory ready: /tmp/phasergun-cache/...`
   - Should NOT see: `ENOENT` errors

## Rollback (if needed)

To revert to project-directory cache:

1. In `embedding-service.ts`, change constructor back to:
   ```typescript
   this.cacheDir = path.join(projectPath, '.phasergun-cache', 'embeddings');
   ```

2. Similar changes in `vector-store.ts` and `enhanced-rag-service.ts`

3. Rebuild: `./build-all.sh`

4. Restart PM2

## Notes

- Cache files will persist across server reboots (unless /tmp is cleared)
- Each project gets ~8MB cache per document set
- Old cache files should be manually cleaned if needed
- Consider adding cache expiration in future updates
