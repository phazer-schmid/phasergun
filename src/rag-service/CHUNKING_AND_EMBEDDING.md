# Document Chunking and Embedding Implementation

**Date:** January 24, 2026  
**Version:** 1.0.0  
**Status:** ✅ Complete

---

## Executive Summary

This document describes the implementation of intelligent document chunking and semantic embedding for the Enhanced RAG (Retrieval-Augmented Generation) Service. The system now chunks documents intelligently based on their type, generates embeddings using local ML models, and stores them in a persistent vector store for efficient semantic search.

---

## Table of Contents

1. [What Was Implemented](#what-was-implemented)
2. [Why This Was Needed](#why-this-was-needed)
3. [Architecture Overview](#architecture-overview)
4. [Implementation Details](#implementation-details)
5. [Testing](#testing)
6. [Future Considerations](#future-considerations)
7. [Migration Notes](#migration-notes)

---

## What Was Implemented

### Core Features

#### 1. **Intelligent Document Chunking**

Two specialized chunking strategies were implemented:

**Section-Aware Chunking (for SOPs/Procedures):**
- Detects document structure using headers (##, ###) and numbered sections (1., 1.1, etc.)
- Preserves semantic sections by keeping them together
- Respects token limits: 500-1000 tokens (~2000-4000 characters)
- Falls back to paragraph chunking if no clear structure is detected

**Paragraph-Based Chunking with Overlap (for Context Files):**
- Splits on paragraph boundaries for natural semantic units
- Implements 100-token overlap (~400 characters) between consecutive chunks
- Preserves context continuity across chunk boundaries
- Maintains sentence integrity (no mid-sentence splits)

#### 2. **Vector Store Integration**

Replaced in-memory embedding storage with persistent VectorStore:
- Embeddings saved to disk at `<projectPath>/.phasergun-cache/vector-store.json`
- Automatic loading from cache when documents haven't changed
- Fingerprint-based cache invalidation
- Efficient batch embedding generation

#### 3. **Semantic Search**

Enhanced retrieval using vector similarity:
- Cosine similarity search for query-based retrieval
- Returns similarity scores with results (0-100%)
- Supports category-specific search (procedures vs. context)
- Graceful degradation when no query is provided

#### 4. **Metadata Tracking**

Each chunk includes comprehensive metadata:
- `fileName`: Source document name
- `filePath`: Full path to source document
- `category`: 'procedure' or 'context'
- `chunkIndex`: Position in document
- `content`: Full chunk text
- `contentHash`: SHA256 hash for change detection

---

## Why This Was Needed

### Problems Solved

1. **No Semantic Chunking**
   - **Before:** Documents were split arbitrarily by character count
   - **After:** Intelligent chunking preserves meaning and structure

2. **Poor Retrieval Quality**
   - **Before:** Keyword-based matching missed semantic relevance
   - **After:** Vector similarity finds semantically related content

3. **No Persistence**
   - **Before:** Embeddings regenerated on every load (slow, wasteful)
   - **After:** Embeddings cached to disk, only regenerated when documents change

4. **Loss of Context**
   - **Before:** Chunks were independent, losing continuity
   - **After:** 100-token overlap preserves context between chunks

5. **Inefficient for SOPs**
   - **Before:** Section headers split from their content
   - **After:** Sections kept together as semantic units

---

## Architecture Overview

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Document Loading                                         │
│    - Scan Procedures/ and Context/ folders                  │
│    - Parse documents using ComprehensiveFileParser          │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Intelligent Chunking                                     │
│    - SOPs: Section-aware chunking                           │
│    - Context: Paragraph chunking with overlap               │
│    - Token estimation: ~4 chars = 1 token                   │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Embedding Generation                                     │
│    - Batch process chunks for efficiency                    │
│    - Use Xenova/all-MiniLM-L6-v2 (384 dimensions)          │
│    - Cache embeddings with content hash                     │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Vector Store Creation                                    │
│    - Create VectorEntry for each chunk                      │
│    - Add to VectorStore with metadata                       │
│    - Save to disk (.phasergun-cache/vector-store.json)     │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. Semantic Retrieval                                       │
│    - Generate query embedding                               │
│    - Cosine similarity search                               │
│    - Return top-K results with scores                       │
└─────────────────────────────────────────────────────────────┘
```

### Key Components

```typescript
EnhancedRAGService
├── chunkSectionAware()       // SOP chunking logic
├── chunkWithOverlap()        // Context file chunking
├── chunkAndEmbedDocument()   // Chunk + embed pipeline
├── buildVectorStore()        // Orchestrates the build process
└── buildRAGContext()         // Semantic retrieval

VectorStore
├── createEntry()             // Create vector entries
├── search()                  // Cosine similarity search
├── save()                    // Persist to disk
└── load()                    // Load from disk

EmbeddingService
├── embedBatch()              // Batch embedding generation
├── embedText()               // Single text embedding
└── Cache management          // Disk-based caching
```

---

## Implementation Details

### Chunking Algorithm

#### Section-Aware (SOPs)

```typescript
MIN_CHUNK_SIZE = 2000 chars (~500 tokens)
MAX_CHUNK_SIZE = 4000 chars (~1000 tokens)

Algorithm:
1. Detect headers using regex: /^(#{1,6}\s+.*|\d+\.(\d+\.)*\s+.*)$/
2. For each line:
   - If header AND current chunk > MIN_CHUNK_SIZE:
     * Save current chunk
     * Start new chunk with header
   - Else if chunk > MAX_CHUNK_SIZE AND > MIN_CHUNK_SIZE:
     * Save current chunk
     * Start new chunk
   - Else:
     * Add line to current chunk
3. Save final chunk
4. If no structure detected, fall back to paragraph chunking
```

#### Paragraph with Overlap (Context)

```typescript
TARGET_CHUNK_SIZE = 3000 chars (~750 tokens)
MAX_CHUNK_SIZE = 4000 chars (~1000 tokens)
OVERLAP_SIZE = 400 chars (~100 tokens)

Algorithm:
1. Split document into paragraphs (by \n\n)
2. For each paragraph:
   - If new chunk, start with overlap from previous
   - If adding paragraph exceeds MAX_CHUNK_SIZE:
     * Save current chunk
     * Extract last OVERLAP_SIZE chars as overlap
     * Start new chunk with overlap + paragraph
   - Else:
     * Add paragraph to current chunk
3. Save final chunk
```

### Cache Invalidation

Three-layer fingerprinting ensures efficient cache management:

1. **Document Fingerprint**: Hash of all file paths, sizes, and modification times
2. **VectorStore Fingerprint**: Hash of all chunk content and metadata
3. **Combined Fingerprint**: Hash combining both above

**Cache is invalidated when:**
- Any document is added, removed, or modified
- Primary context file changes
- Embedding model version changes

### Token Estimation

Since we don't have a full tokenizer, we use approximations:

```
1 token ≈ 4 characters (rule of thumb for English text)

Examples:
- 500 tokens ≈ 2000 characters
- 1000 tokens ≈ 4000 characters  
- 100 tokens ≈ 400 characters
```

This is accurate enough for chunking purposes. Actual tokens may vary ±20%.

---

## Testing

### Test Suite: `test-chunking-rag.ts`

Comprehensive test covering:

1. **Knowledge Loading** - Tests document parsing, chunking, and vector store building
2. **Retrieval Without Query** - Verifies basic retrieval works
3. **Semantic Search** - Tests query-based similarity search
4. **Cache Validation** - Ensures fingerprint-based caching works
5. **Cache Reload** - Tests loading from persisted vector store
6. **Multiple Queries** - Tests various semantic queries

### Running Tests

```bash
cd src/rag-service

# Test the new chunking implementation
npm run test:chunking

# Test vector store operations
npm run test:vector-store

# Test embedding service
npm run test:embeddings
```

### Test Data Requirements

For full functionality testing, add documents to:
- `src/rag-service/test-project/Procedures/` - SOP documents
- `src/rag-service/test-project/Context/` - Context documents

The test gracefully handles empty folders.

---

## Future Considerations

### Short-Term Improvements

1. **Better Token Counting**
   - Integrate a proper tokenizer (e.g., tiktoken)
   - More accurate chunk sizing
   - Token-aware splitting

2. **Advanced Chunking Strategies**
   - Table-aware chunking for tabular data
   - Code-aware chunking for technical documents
   - Multi-modal chunking (text + images)

3. **Chunk Quality Metrics**
   - Measure semantic coherence of chunks
   - Track retrieval performance metrics
   - A/B test different chunking strategies

4. **Incremental Updates**
   - Update only changed documents
   - Avoid full rebuild when single file changes
   - Differential vector store updates

### Long-Term Enhancements

1. **Hybrid Search**
   - Combine vector similarity with keyword matching
   - BM25 + cosine similarity fusion
   - Learn optimal weighting

2. **Re-ranking**
   - Second-stage re-ranking of results
   - Cross-encoder models for better relevance
   - User feedback incorporation

3. **Query Expansion**
   - Expand user queries with synonyms
   - Multi-query retrieval
   - Query reformulation

4. **Chunk Optimization**
   - Learn optimal chunk sizes per document type
   - Dynamic overlap based on content
   - Hierarchical chunking (parent-child chunks)

5. **Performance Optimization**
   - Approximate nearest neighbor search (FAISS, Annoy)
   - GPU acceleration for embeddings
   - Quantization for smaller vector sizes

### Scalability Considerations

1. **Large Document Collections**
   - Current implementation loads all chunks in memory
   - Consider streaming/pagination for 1000+ documents
   - Database-backed vector store (PostgreSQL pgvector)

2. **Multiple Projects**
   - Currently singleton service
   - Consider multi-tenancy support
   - Project-specific vector stores

3. **Embedding Model Updates**
   - Version migration strategy needed
   - Backward compatibility considerations
   - Gradual rollout approach

---

## Migration Notes

### Breaking Changes

1. **KnowledgeCache Interface**
   - Removed: `proceduresChunks`, `contextChunks`, `proceduresEmbeddings`, `contextEmbeddings`
   - Added: `vectorStoreFingerprint`
   - Impact: Old caches will be invalidated and rebuilt

2. **Retrieval Methods**
   - `buildRAGContext()` signature changed (added optional `projectPath` param)
   - `retrieveKnowledge()` metadata structure changed
   - Impact: Code using these methods may need updates

### Backward Compatibility

Old chunking methods are marked as DEPRECATED but still present:
- `chunkDocument()` - Old paragraph-based chunking
- `loadProceduresFolder()` / `loadContextFolder()` - Old loading methods

These can be safely removed in a future version once all integrations are updated.

### Data Migration

No automatic migration is provided. On first load:
1. Old in-memory cache is ignored
2. Documents are re-chunked with new strategies
3. New vector store is built and persisted
4. Subsequent loads use the cached vector store

---

## Performance Metrics

### Expected Performance (typical use case)

| Operation | Time (empty cache) | Time (cached) |
|-----------|-------------------|---------------|
| Load 10 SOPs (50 pages total) | ~5-10 seconds | ~1 second |
| Generate embeddings | ~3-7 seconds | ~0 seconds |
| Build vector store | ~1 second | ~0.5 seconds |
| Semantic search (top-8) | ~0.1-0.3 seconds | ~0.1-0.3 seconds |

### Storage Requirements

| Item | Size |
|------|------|
| Embedding (384-dim float32) | ~1.5 KB |
| Metadata per chunk | ~0.5 KB |
| Total per chunk | ~2 KB |
| 1000 chunks | ~2 MB |
| 10,000 chunks | ~20 MB |

---

## Conclusion

This implementation provides a solid foundation for semantic document retrieval in the Enhanced RAG Service. The intelligent chunking strategies preserve document structure and meaning, while the vector store enables efficient, persistent semantic search. Future enhancements can build on this foundation to further improve retrieval quality and performance.

---

## References

- [VectorStore Documentation](./VECTOR_STORE.md)
- [Embedding Service Documentation](./EMBEDDING_SERVICE.md)
- [Transformers.js Documentation](https://huggingface.co/docs/transformers.js)
- [all-MiniLM-L6-v2 Model Card](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2)

---

**Last Updated:** January 24, 2026  
**Maintained By:** Enhanced RAG Service Team
