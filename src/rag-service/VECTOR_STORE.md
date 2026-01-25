# Vector Store Implementation

## Overview

The Vector Store provides file-based persistence for document embeddings with fast similarity search capabilities. It's designed for the POC to store and retrieve document chunks efficiently without requiring a heavy database.

## Features

✅ **File-based Storage**: JSON persistence at `<projectPath>/.phasergun-cache/vector-store.json`  
✅ **Cosine Similarity Search**: Fast semantic retrieval using vector similarity  
✅ **Category Filtering**: Filter searches by 'procedure' or 'context' documents  
✅ **Content Hashing**: SHA256 hashing for change detection and cache invalidation  
✅ **Incremental Updates**: Add/remove entries as files change  
✅ **Rich Metadata**: Track file path, chunk index, content, and category  
✅ **Fingerprinting**: Store-level fingerprint for cache validation  

## Architecture

```
VectorStore
├── Storage: JSON file with embeddings and metadata
├── Search: Cosine similarity with category filtering
├── Caching: Fingerprint-based validation
└── Integration: Works with EmbeddingService
```

## Data Structures

### VectorEntry
```typescript
interface VectorEntry {
  id: string;                    // Unique identifier (auto-generated)
  embedding: number[];           // 384-dim vector (from Float32Array)
  metadata: {
    fileName: string;            // e.g., "design-controls.md"
    filePath: string;            // Full path to source file
    category: 'procedure' | 'context';  // Document type
    chunkIndex: number;          // Position in document (0-based)
    content: string;             // Original text chunk
    contentHash: string;         // SHA256 hash for change detection
  };
}
```

### SearchResult
```typescript
interface SearchResult {
  entry: VectorEntry;            // The matching entry
  similarity: number;            // Cosine similarity score (0-1)
}
```

## Core Methods

### Creating a Vector Store

```typescript
import { VectorStore, createVectorStore } from './vector-store';

// Create new or load existing
const store = await createVectorStore('/path/to/project', 'v1.0');

// Or explicitly create new
const newStore = new VectorStore('/path/to/project', 'v1.0');

// Or load from specific path
const loaded = await VectorStore.load('/path/to/vector-store.json');
```

### Adding Entries

```typescript
import { EmbeddingService } from './embedding-service';

// Generate embedding
const embeddingService = EmbeddingService.getInstance(projectPath);
await embeddingService.initialize();
const embedding = await embeddingService.embedText(content);

// Create and add entry
const entry = VectorStore.createEntry(
  content,
  embedding,
  {
    fileName: 'design-controls.md',
    filePath: '/full/path/to/design-controls.md',
    category: 'procedure',
    chunkIndex: 0
  }
);

store.addEntry(entry);

// Batch add
store.addEntries([entry1, entry2, entry3]);
```

### Similarity Search

```typescript
// Basic search
const queryEmbedding = await embeddingService.embedText('How do we manage risks?');
const results = store.searchWithFloat32Array(queryEmbedding, 5);

results.forEach((result, i) => {
  console.log(`${i + 1}. [${result.similarity.toFixed(3)}] ${result.entry.metadata.fileName}`);
  console.log(`   "${result.entry.metadata.content.substring(0, 100)}..."`);
});

// Search with category filter
const procedureResults = store.searchWithFloat32Array(
  queryEmbedding, 
  5, 
  'procedure'  // Only search procedure documents
);

const contextResults = store.searchWithFloat32Array(
  queryEmbedding, 
  5, 
  'context'    // Only search context documents
);
```

### Persistence

```typescript
// Save to default location: <projectPath>/.phasergun-cache/vector-store.json
await store.save();

// Save to custom location
await store.save('/custom/path/vector-store.json');

// Load from disk
const loaded = await VectorStore.load('/path/to/vector-store.json');

// Check if store exists
const exists = await VectorStore.exists(projectPath);
```

### Incremental Updates

```typescript
// Remove entries for a changed file
const removedCount = store.removeEntriesByFile('/path/to/old-file.md');

// Add new entries for updated file
const newChunks = chunkDocument(updatedContent);
for (const chunk of newChunks) {
  const embedding = await embeddingService.embedText(chunk.content);
  const entry = VectorStore.createEntry(chunk.content, embedding, {
    fileName: chunk.fileName,
    filePath: chunk.filePath,
    category: chunk.category,
    chunkIndex: chunk.index
  });
  store.addEntry(entry);
}

// Save updated store
await store.save();
```

### Querying and Management

```typescript
// Get statistics
const stats = store.getStats();
console.log(`Total: ${stats.totalEntries}`);
console.log(`Procedures: ${stats.procedureEntries}`);
console.log(`Context: ${stats.contextEntries}`);
console.log(`Fingerprint: ${stats.fingerprint}`);

// Get entries by category
const procedures = store.getEntriesByCategory('procedure');
const contexts = store.getEntriesByCategory('context');

// Get entries by file
const fileEntries = store.getEntriesByFile('/path/to/file.md');

// Get entry by ID
const entry = store.getEntryById('abc123def456');

// Clear all entries
store.clear();
```

## Integration with Enhanced RAG Service

The Vector Store can be optionally integrated with `EnhancedRAGService` for persistent storage:

```typescript
// In enhanced-rag-service.ts
import { VectorStore } from './vector-store';

class EnhancedRAGService {
  private vectorStore: VectorStore | null = null;
  
  async loadKnowledge(projectPath: string, primaryContextPath: string) {
    // Try to load existing vector store
    const storeExists = await VectorStore.exists(projectPath);
    
    if (storeExists) {
      this.vectorStore = await VectorStore.loadOrCreate(projectPath);
      
      // Check if cache is still valid using fingerprints
      const currentFingerprint = await this.computeCacheFingerprint(...);
      const storeFingerprint = this.vectorStore.getFingerprint();
      
      if (currentFingerprint === storeFingerprint) {
        // Use cached embeddings
        return this.loadFromVectorStore();
      }
    }
    
    // Generate fresh embeddings
    const chunks = await this.loadAndChunkDocuments(...);
    this.vectorStore = new VectorStore(projectPath);
    
    // Add to vector store
    for (const chunk of chunks) {
      const embedding = await embeddingService.embedText(chunk.content);
      const entry = VectorStore.createEntry(chunk.content, embedding, {
        fileName: chunk.fileName,
        filePath: chunk.filePath,
        category: chunk.category,
        chunkIndex: chunk.chunkIndex
      });
      this.vectorStore.addEntry(entry);
    }
    
    // Save to disk
    await this.vectorStore.save();
  }
  
  async retrieveRelevantChunks(query: string, topK: number, category?: string) {
    const queryEmbedding = await embeddingService.embedText(query);
    return this.vectorStore!.searchWithFloat32Array(queryEmbedding, topK, category);
  }
}
```

## Storage Format

The vector store is saved as JSON:

```json
{
  "projectPath": "/path/to/project",
  "entries": [
    {
      "id": "a1b2c3d4e5f6g7h8",
      "embedding": [0.123, -0.456, 0.789, ...],  // 384 dimensions
      "metadata": {
        "fileName": "design-controls.md",
        "filePath": "/path/to/project/Procedures/design-controls.md",
        "category": "procedure",
        "chunkIndex": 0,
        "content": "The design control process ensures...",
        "contentHash": "sha256_hash_here"
      }
    }
  ],
  "fingerprint": "overall_store_fingerprint",
  "createdAt": "2026-01-24T20:00:00.000Z",
  "updatedAt": "2026-01-24T20:15:00.000Z",
  "modelVersion": "v1.0",
  "totalEntries": 42
}
```

## Performance Considerations

### Memory
- Embeddings stored as `number[]` arrays (384 dimensions)
- Full in-memory loading on startup
- Typical usage: ~1 MB per 100 document chunks

### Search Performance
- Linear scan with cosine similarity
- Fast for POC scale (< 1000 entries)
- O(n) complexity where n = number of entries
- Category filtering reduces search space

### Disk I/O
- JSON serialization (human-readable, debuggable)
- Lazy loading supported
- Incremental saves on updates

## Cache Invalidation

The store uses fingerprinting for cache validation:

1. **Content Hash**: Each entry has SHA256 hash of content
2. **Entry ID**: Generated from filePath + chunkIndex + contentHash
3. **Store Fingerprint**: Combined hash of all entry IDs and content hashes

When files change:
- New content hash detected
- Affected entries removed/updated
- Store fingerprint automatically updated

## Type Conversions

```typescript
// Float32Array (EmbeddingService) ↔ number[] (VectorStore)

// To JSON-serializable array
const numbers = VectorStore.float32ArrayToNumbers(float32Array);

// Back to Float32Array for calculations
const float32 = VectorStore.numbersToFloat32Array(numbers);
```

## Testing

Run the comprehensive test suite:

```bash
cd src/rag-service
npx ts-node test-vector-store.ts
```

Tests cover:
- ✅ Vector store creation
- ✅ Embedding generation and indexing
- ✅ Semantic search
- ✅ Category filtering
- ✅ Persistence (save/load)
- ✅ Incremental updates
- ✅ File removal
- ✅ Fingerprint validation

## Future Enhancements

For production use, consider:

1. **Binary Storage**: Protocol Buffers or MessagePack for efficiency
2. **Indexed Search**: HNSW or IVF for sub-linear search
3. **Compression**: Quantization for reduced storage
4. **Sharding**: Split large stores across multiple files
5. **Vector Database**: Migrate to Qdrant, Milvus, or Weaviate

## Comparison: In-Memory vs Vector Store

| Feature | In-Memory (Current) | Vector Store |
|---------|---------------------|--------------|
| Persistence | ❌ Lost on restart | ✅ Disk-backed |
| Startup Time | Slow (regenerate) | Fast (load JSON) |
| Cache Validation | Fingerprint-based | Fingerprint-based |
| Search Performance | Fast (in-memory) | Fast (in-memory) |
| Storage Format | RAM only | JSON file |
| Incremental Updates | Full rebuild | Add/remove entries |

## API Reference

### Class: VectorStore

#### Constructor
- `new VectorStore(projectPath: string, modelVersion?: string)`

#### Methods
- `addEntry(entry: VectorEntry): void`
- `addEntries(entries: VectorEntry[]): void`
- `search(queryEmbedding: number[], topK: number, category?: string): SearchResult[]`
- `searchWithFloat32Array(queryEmbedding: Float32Array, topK: number, category?: string): SearchResult[]`
- `getEntryById(id: string): VectorEntry | undefined`
- `getEntriesByFile(filePath: string): VectorEntry[]`
- `getEntriesByCategory(category: string): VectorEntry[]`
- `removeEntry(id: string): boolean`
- `removeEntriesByFile(filePath: string): number`
- `clear(): void`
- `getStats(): object`
- `save(storePath?: string): Promise<void>`
- `getFingerprint(): string`
- `getProjectPath(): string`
- `getAllEntries(): VectorEntry[]`
- `getEntryCount(): number`

#### Static Methods
- `VectorStore.load(storePath: string, projectPath?: string): Promise<VectorStore>`
- `VectorStore.loadOrCreate(projectPath: string, modelVersion?: string): Promise<VectorStore>`
- `VectorStore.exists(projectPath: string): Promise<boolean>`
- `VectorStore.createEntry(content, embedding, metadata): VectorEntry`
- `VectorStore.float32ArrayToNumbers(arr: Float32Array): number[]`
- `VectorStore.numbersToFloat32Array(arr: number[]): Float32Array`

### Helper Function
- `createVectorStore(projectPath: string, modelVersion?: string): Promise<VectorStore>`

## License

Part of the PhaserGun POC project.
