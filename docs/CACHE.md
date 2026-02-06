# PhaserGun Cache System

## Overview

The PhaserGun cache system persists indexed knowledge (vector embeddings, summaries, and metadata) across requests and process restarts. This dramatically improves performance by avoiding expensive document re-parsing and re-embedding operations.

### Key Benefits
- **Fast Retrieval**: Load cached vectors in ~100-200ms vs. minutes for full rebuild
- **Persistent Across Restarts**: Cache survives server restarts and deployments
- **Fingerprint Validation**: Automatic cache invalidation when source files change
- **Concurrency-Safe**: Global mutex + file locks prevent race conditions
- **Deterministic**: Alphabetical sorting ensures identical cache rebuilds

---

## Toggle: CACHE_ENABLED

Control caching via the `CACHE_ENABLED` environment variable in `src/api-server/.env`:

```bash
# Enable caching (default)
CACHE_ENABLED=true

# Disable caching (forces fresh processing every request)
CACHE_ENABLED=false
# OR
CACHE_ENABLED=0
```

### When Disabled
- All documents are processed fresh on every request
- No disk reads or writes for cache artifacts
- Slower but always up-to-date
- Useful for development/debugging or when content changes frequently

---

## Cache Location

Cache files are stored in the system temp directory to avoid permission issues with mounted volumes and project directories.

### Base Path
```
$TMPDIR/phasergun-cache/
```

On macOS/Linux: `/tmp/phasergun-cache/`  
On Windows: `%TEMP%\phasergun-cache\`

### Project Isolation

Each project gets its own cache directory identified by an MD5 hash of the project path (truncated to 8 characters):

```
$TMPDIR/phasergun-cache/{project_hash}/
```

Example:
```
/tmp/phasergun-cache/a3f8c2d9/
```

### File Structure

```
$TMPDIR/phasergun-cache/
├── vector-store/
│   └── {project_hash}/
│       └── vector-store.json         # Vector embeddings + metadata
├── sop-summaries/
│   └── {project_hash}/
│       └── sop-summaries.json        # Procedure file summaries
├── context-summaries/
│   └── {project_hash}/
│       └── context-summaries.json    # Context file summaries
├── metadata/
│   └── {project_hash}/
│       └── cache-metadata.json       # Cache validation data
└── locks/
    └── {project_hash}/
        └── cache-build.lock          # Cross-process lock file
```

---

## Fingerprinting

The cache system uses SHA-256 fingerprinting to detect when source files have changed.

### Algorithm

```
SHA-256(
  primary-context.yaml fingerprint |
  Procedures folder fingerprint |
  Context folder fingerprint
)
```

### Individual File Fingerprints

For each file:
```
"file_path:file_size:modification_time"
```

### Folder Fingerprints

For each folder (Procedures, Context):
1. Get all files recursively (sorted alphabetically)
2. Compute individual file fingerprints
3. Concatenate with pipe delimiter: `file1|file2|file3`
4. SHA-256 hash the concatenated string

### Example

```javascript
// Primary context
"path/to/primary-context.yaml:5432:1708032000000"

// Procedures (3 files, sorted)
"path/to/SOP-001.pdf:12345:1708032000000|
 path/to/SOP-002.docx:8765:1708033000000|
 path/to/SOP-003.pdf:23456:1708034000000"

// Context (excluding Prompt subfolder)
"path/to/Context/Initiation/doc1.docx:9876:1708035000000|
 path/to/Context/Ongoing/doc2.pdf:5432:1708036000000"

// Combined fingerprint
SHA-256(primary_fp + "|" + procedures_fp + "|" + context_fp)
```

---

## Validation Flow

When a request arrives, the cache system follows this validation flow:

```
┌─────────────────────────────────────────────────────────────┐
│ Step 1: Check In-Memory Cache                               │
│  • Fastest path (~0ms)                                      │
│  • Map<projectPath, KnowledgeCache>                         │
│  • If found → proceed to Step 3                            │
└─────────────────────────┬───────────────────────────────────┘
                          │ Not in memory
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ Step 2: Load from Disk                                      │
│  • Read cache-metadata.json from disk                       │
│  • Restore to in-memory Map                                 │
│  • If file not found → proceed to Step 5 (rebuild)         │
└─────────────────────────┬───────────────────────────────────┘
                          │ Loaded from disk
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ Step 3: Compute Current Fingerprint                         │
│  • Scan all source files (Procedures, Context)              │
│  • Compute file sizes and modification times                │
│  • Generate SHA-256 fingerprint of current state            │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ Step 4: Compare Fingerprints                                │
│  • cached_fingerprint === current_fingerprint ?             │
└─────────────┬───────────────────────────┬───────────────────┘
              │ Match                     │ Mismatch
              ▼                           ▼
┌──────────────────────────┐    ┌─────────────────────────────┐
│ CACHE VALID              │    │ CACHE INVALID               │
│ • Load vector-store.json │    │ • Clear old cache files     │
│ • Serve cached results   │    │ • Proceed to rebuild        │
│ • ~100-200ms load time   │    │ • Continue to Step 5        │
└──────────────────────────┘    └────────────┬────────────────┘
                                              │
                                              ▼
                                ┌─────────────────────────────┐
                                │ Step 5: Rebuild Cache       │
                                │ • Parse all documents       │
                                │ • Chunk content             │
                                │ • Generate embeddings       │
                                │ • Build vector store        │
                                │ • Generate summaries        │
                                │ • Save to disk              │
                                │ • Update in-memory cache    │
                                └─────────────────────────────┘
```

---

## Rebuild Triggers

The cache is automatically rebuilt when ANY of these conditions are met:

### 1. File Changes
- **Any file added** to Procedures or Context folders
- **Any file removed** from Procedures or Context folders
- **Any file modified** in Procedures or Context folders (detected via mtime or size change)

### 2. Configuration Changes
- **primary-context.yaml modified** (detected via size or mtime)

### 3. Cache Corruption
- **cache-metadata.json missing** or corrupt (unparseable JSON)
- **vector-store.json missing** or corrupt
- **Fingerprint mismatch** between cached and current state

### 4. Manual Disable
- **CACHE_ENABLED=false** in environment (forces fresh build every request, never saves)

### What Does NOT Trigger Rebuild
- Changes to files in `Context/Prompt/` (intentionally excluded, parsed on-demand)
- Changes to files outside the project path
- Server restarts (as long as files haven't changed)

---

## Excluded from Cache

### Context/Prompt Folder

The `Context/Prompt/` subfolder is **intentionally excluded** from the cache:

**Why?**
- Prompt files are selected per-request by the user
- Caching them would serve stale or irrelevant content
- They are meant to be dynamic and request-specific

**Implementation:**
- The `Context/Prompt/` folder is skipped during fingerprint computation
- Prompt files are never chunked or embedded
- They are read directly each time via the `/api/generate` endpoint

**Example:**
```
[ProjectPath]/Context/
├── Initiation/          ✅ Cached
├── Ongoing/             ✅ Cached
├── Predicates/          ✅ Cached
├── Regulatory Strategy/ ✅ Cached
├── General/             ✅ Cached
└── Prompt/              ❌ NOT cached (parsed on-demand)
```

---

## Concurrency Protection

PhaserGun uses a two-layer concurrency protection strategy to prevent race conditions during cache builds:

### Layer 1: In-Process Mutex (Global async-mutex)

```typescript
// Shared across ALL EnhancedRAGService instances in the same Node process
const globalBuildMutex = new Mutex();

// Acquire mutex before cache operations
const release = await globalBuildMutex.acquire();
try {
  // Only ONE request at a time can execute this code
  await buildCache();
} finally {
  release();
}
```

**Behavior:**
- Only one request can build the cache at a time within the same Node.js process
- Other requests block until the first completes
- Once cache is built, waiting requests use the fresh cache (no redundant rebuilds)

### Layer 2: Cross-Process Lock (proper-lockfile)

```typescript
// File-based lock at $TMPDIR/phasergun-cache/locks/{project_hash}/cache-build.lock
const lock = await lockfile.lock(lockPath, {
  stale: 60000,        // 60 seconds
  retries: 10,
  minTimeout: 500,
  maxTimeout: 3000
});
```

**Behavior:**
- Prevents multiple Node.js processes from building cache simultaneously
- Second process waits for lock, then double-checks cache validity
- If cache was built by first process, second process uses it
- Stale lock timeout prevents deadlocks if process crashes

### Combined Protection Flow

```
Request 1 (Process A)  Request 2 (Process A)  Request 3 (Process B)
       │                      │                      │
       ├─ Acquire MUTEX ────►│ (blocked)            │
       │                      │                      │
       ├─ Acquire FILE LOCK ──────────────────────►│ (blocked)
       │                      │                      │
       ├─ Build Cache         │                      │
       │                      │                      │
       ├─ Release FILE LOCK   │                      │
       ├─ Release MUTEX ─────►│ Acquire MUTEX       │
       │                      │                      │
       │                      ├─ Check cache ────────┼─ Check cache
       │                      │   (valid!)           │   (valid!)
       │                      │                      │
       │                      ├─ Use cache           ├─ Use cache
       ▼                      ▼                      ▼
```

---

## Determinism: Alphabetical File Sorting

To ensure cache rebuilds produce identical results across different runs, PhaserGun enforces deterministic ordering:

### Why Determinism Matters

File system enumeration order is non-deterministic:
- Different OS implementations may return files in different orders
- The order affects vector store insertion order
- Different insertion orders can produce slightly different search results

### Implementation

```typescript
// Sort files alphabetically before processing
const sortedProcedures = [...proceduresFiles].sort((a, b) => 
  a.fileName.localeCompare(b.fileName)
);

const sortedContext = [...contextFiles].sort((a, b) => 
  a.doc.fileName.localeCompare(b.doc.fileName)
);

// Process in sorted order (NOT in parallel)
for (const doc of sortedProcedures) {
  const vectors = await chunkAndEmbedDocument(doc);
  procedureVectors.push(...vectors);
}
```

### What Gets Sorted

1. **Files within folders**: All files sorted by fileName before processing
2. **Chunks within files**: Processed sequentially in document order
3. **Vector insertion**: Deterministic order (procedures first, then context)
4. **Summary generation**: Files processed in alphabetical order

### Result

- Identical cache fingerprints across rebuilds
- Consistent vector store content and ordering
- Predictable search results
- Reproducible cache validation

---

## Cache File Details

### 1. vector-store.json

Contains all vector embeddings and their metadata.

```json
{
  "projectPath": "/path/to/project",
  "entries": [
    {
      "id": "a3f8c2d9e1b4c5a7",
      "embedding": [0.123, -0.456, 0.789, ...],  // 384 dimensions
      "metadata": {
        "fileName": "SOP-001-Design-Control.pdf",
        "filePath": "/path/to/project/Procedures/SOP-001.pdf",
        "category": "procedure",
        "chunkIndex": 0,
        "content": "1. Purpose\n\nThis procedure establishes...",
        "contentHash": "sha256:abc123...",
        "contextCategory": null
      }
    },
    // ... more entries
  ],
  "fingerprint": "sha256:def456...",
  "createdAt": "2026-02-05T22:00:00.000Z",
  "updatedAt": "2026-02-05T22:00:00.000Z",
  "modelVersion": "v1.0",
  "totalEntries": 342
}
```

### 2. sop-summaries.json

Extractive summaries of procedure files (first 250 words).

```json
{
  "SOP-001-Design-Control.pdf": {
    "hash": "sha256:abc123...",
    "summary": "1. Purpose\n\nThis procedure establishes the requirements for design control activities... [first 250 words]",
    "generatedAt": "2026-02-05T22:00:00.000Z"
  },
  "SOP-002-Risk-Management.pdf": {
    "hash": "sha256:def456...",
    "summary": "Risk Management Procedure\n\n1.0 Scope\n\nThis procedure describes... [first 250 words]",
    "generatedAt": "2026-02-05T22:00:00.000Z"
  }
}
```

### 3. context-summaries.json

Extractive summaries of context files (first 250 words).

```json
{
  "Primary Context.docx": {
    "hash": "sha256:ghi789...",
    "summary": "Project Overview\n\nDevice Name: Advanced Monitor System... [first 250 words]",
    "generatedAt": "2026-02-05T22:00:00.000Z"
  },
  "Predicate-Analysis.docx": {
    "hash": "sha256:jkl012...",
    "summary": "Predicate Device Comparison\n\nThis document compares... [first 250 words]",
    "generatedAt": "2026-02-05T22:00:00.000Z"
  }
}
```

### 4. cache-metadata.json

Cache validation metadata.

```json
{
  "projectPath": "/path/to/project",
  "fingerprint": "sha256:mno345...",
  "primaryContext": {
    "product": {
      "name": "PhaserGun",
      "type": "Regulatory Documentation Engine"
    },
    "knowledge_sources": { /* ... */ }
  },
  "indexedAt": "2026-02-05T22:00:00.000Z",
  "vectorStoreFingerprint": "sha256:pqr678..."
}
```

---

## Manual Cache Reset

### Reset All Projects

```bash
# macOS/Linux
rm -rf $TMPDIR/phasergun-cache

# OR specify full path
rm -rf /tmp/phasergun-cache
```

```powershell
# Windows
Remove-Item -Recurse -Force $env:TEMP\phasergun-cache
```

### Reset Single Project

```bash
# Find project hash first
PROJECT_PATH="/path/to/project"
PROJECT_HASH=$(echo -n "$PROJECT_PATH" | md5sum | cut -c1-8)

# Remove that project's cache
rm -rf $TMPDIR/phasergun-cache/*/$PROJECT_HASH
```

### Effect of Manual Reset

- Next request for that project will detect missing cache
- Automatic full rebuild will be triggered
- All documents re-parsed, re-chunked, re-embedded
- New cache saved to disk

---

## Performance Characteristics

### Cache Hit (Valid)
- **Time**: ~100-200ms to load vector-store.json from disk
- **Operations**: 
  - Read cache-metadata.json
  - Compute current fingerprint
  - Compare fingerprints
  - Load vector-store.json
  - Restore to memory

### Cache Miss (Invalid)
- **Time**: 1-5 minutes depending on document count
- **Operations**:
  - Parse all documents (PDF, DOCX, etc.)
  - Chunk documents (section-aware + paragraph-based)
  - Generate embeddings for all chunks (384-dim vectors)
  - Build vector store
  - Generate extractive summaries
  - Save to disk (4 files)
  - Update in-memory cache

### Typical Project
- **50 procedure files**: ~2-3 minutes first build, ~150ms subsequent loads
- **100 context files**: ~3-5 minutes first build, ~200ms subsequent loads
- **Cache size on disk**: ~5-20 MB depending on document count

---

## Troubleshooting

### Cache Not Being Used (Always Rebuilding)

**Symptom**: Every request triggers a full cache rebuild.

**Possible Causes:**
1. `CACHE_ENABLED=false` in environment
2. Files in project folders are being modified (check mtimes)
3. Mounted volumes with unstable mtimes
4. Cache directory not writable

**Solutions:**
```bash
# Check environment
echo $CACHE_ENABLED  # Should be true or unset

# Check cache directory permissions
ls -la $TMPDIR/phasergun-cache

# Check file modification times
find /path/to/project -type f -newer /tmp/phasergun-cache/metadata/*/cache-metadata.json
```

### Cache Stale (Old Content Being Served)

**Symptom**: Generated content doesn't reflect recent file changes.

**Possible Causes:**
1. File modification time not updated (rare)
2. Cache corruption

**Solutions:**
```bash
# Force cache rebuild
rm -rf $TMPDIR/phasergun-cache

# Verify files have recent mtimes
ls -lt /path/to/project/Procedures
```

### Permission Errors

**Symptom**: Logs show "Failed to save cache" warnings.

**Cause**: $TMPDIR not writable (rare on macOS/Linux).

**Solution:**
```bash
# Check temp directory
echo $TMPDIR
ls -la $TMPDIR

# Verify write access
touch $TMPDIR/test && rm $TMPDIR/test
```

### Lock Timeout Errors

**Symptom**: "Failed to acquire lock" errors after 60 seconds.

**Cause**: Previous process crashed while holding lock.

**Solution:**
```bash
# Remove stale lock files
rm -rf $TMPDIR/phasergun-cache/locks
```

---

## Best Practices

1. **Enable Caching in Production**: Set `CACHE_ENABLED=true` for best performance
2. **Monitor Cache Size**: Check `$TMPDIR/phasergun-cache` size periodically
3. **Clear Cache After Major Changes**: Rebuild cache when changing chunking/embedding logic
4. **Use Proper File Sync**: Ensure rclone or sync tools preserve modification times
5. **Check Logs**: Monitor cache hit/miss rates in server logs
6. **Backup Important Caches**: Consider backing up cache for critical projects (optional)

---

## Related Documentation

- **Architecture Overview**: [ARCHITECTURE.md](./ARCHITECTURE.md)
- **RAG Service Internals**: [RAG_SERVICE.md](./RAG_SERVICE.md)
- **API Reference**: [API.md](./API.md)
- **Deployment Guide**: [DEPLOYMENT.md](./DEPLOYMENT.md)
