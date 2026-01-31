## How to Manually Clear the Cache

Yes! You can simply delete the cache folder. The cache is stored in your system's temp directory to avoid permission issues.

### Cache Location

**On macOS/Linux:**
```bash
$TMPDIR/phasergun-cache/
```

**On Windows:**
```
%TEMP%\phasergun-cache\
```

### What's Inside the Cache

The cache folder contains two subfolders:
```
/tmp/phasergun-cache/
├── vector-store/
│   └── {8-char-hash}/
│       └── vector-store.json
└── sop-summaries/
    └── {8-char-hash}/
        └── sop-summaries.json
```

The `{8-char-hash}` is generated from your project path (e.g., `abc12345`), so each project gets its own cache folder.

### Manual Deletion Commands

**Option 1: Delete ALL caches (for all projects)**
```bash
rm -rf /tmp/phasergun-cache
```

**Option 2: Delete cache for a specific project**
If you know the hash for your project:
```bash
rm -rf /tmp/phasergun-cache/vector-store/{hash}
rm -rf /tmp/phasergun-cache/sop-summaries/{hash}
```

**Option 3: Find your project's cache hash**
```bash
# List all cached projects
ls -la /tmp/phasergun-cache/vector-store/
```

### What Happens After Deletion?

When you delete the cache and run the app again:
1. The system detects no cache exists
2. Logs show: `🔍 No cached knowledge found for project`
3. Automatically regenerates the cache from your RAG folders
4. You'll see the full rebuild logging we just implemented

### Pro Tip

The cache automatically rebuilds when you change files in:
- `/Procedures` folder
- `/Context` folder (and subfolders: Initiation, Ongoing, Predicates)

So you typically **don't need to manually delete** - the system handles it! But if you want to force a fresh rebuild (e.g., for testing), deleting the cache folder is the way to go.