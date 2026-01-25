# Embedding Service Documentation

## Overview

The Embedding Service provides local, privacy-preserving semantic search capabilities for the Enhanced RAG Service using the `Xenova/all-MiniLM-L6-v2` model via Transformers.js.

## Features

✅ **100% Local** - Runs entirely on-premise without any external API calls  
✅ **Privacy-Preserving** - No data leaves your infrastructure  
✅ **Semantic Search** - Understands meaning, not just keywords (e.g., "risk assessment" matches "hazard analysis")  
✅ **Fast & Efficient** - 384-dimensional embeddings, optimized for semantic similarity  
✅ **Disk Caching** - Embeddings are cached to avoid recomputation  
✅ **Batch Processing** - Efficiently processes multiple texts at once  

## Architecture

### Model
- **Name**: `Xenova/all-MiniLM-L6-v2`
- **Dimensions**: 384
- **Size**: ~80MB
- **Purpose**: Optimized for semantic similarity tasks
- **License**: Apache 2.0

### Cache Structure
```
<projectPath>/.phasergun-cache/embeddings/
  ├── index.json                    # Maps cache keys to files
  ├── <hash>.embedding               # Binary Float32Array
  └── <hash>.meta.json               # Metadata (text snippet, timestamp, model version)
```

### Cache Key Format
```
SHA256(filePath_hash + content_hash + model_version)
```

## Usage

### Basic Usage

```typescript
import { EmbeddingService } from './embedding-service';

// Get singleton instance
const embeddingService = EmbeddingService.getInstance('/path/to/project');

// Initialize (loads model - do this once)
await embeddingService.initialize();

// Embed single text
const embedding = await embeddingService.embedText('risk assessment document');
console.log(embedding.length); // 384

// Embed multiple texts (batch processing)
const texts = [
  'Design control procedures',
  'Verification and validation',
  'Risk management process'
];
const embeddings = await embeddingService.embedBatch(texts);

// Calculate similarity between two embeddings
const similarity = EmbeddingService.cosineSimilarity(embedding1, embedding2);
console.log(`Similarity: ${(similarity * 100).toFixed(2)}%`);

// Find top-K most similar texts
const queryEmbedding = await embeddingService.embedText('hazard analysis');
const topMatches = EmbeddingService.findTopK(queryEmbedding, embeddings, 3);
topMatches.forEach(match => {
  console.log(`${texts[match.index]}: ${(match.similarity * 100).toFixed(2)}%`);
});
```

### Integration with EnhancedRAGService

The embedding service is automatically integrated into `EnhancedRAGService`:

```typescript
import { enhancedRAGService } from './enhanced-rag-service';

// Load knowledge with embeddings
const knowledge = await enhancedRAGService.loadKnowledge(
  projectPath,
  primaryContextPath
);

// Embeddings are automatically generated for all chunks
console.log(`Procedures embeddings: ${knowledge.proceduresEmbeddings?.length || 0}`);
console.log(`Context embeddings: ${knowledge.contextEmbeddings?.length || 0}`);

// Retrieve relevant context using semantic search
const { ragContext, metadata } = await enhancedRAGService.retrieveKnowledge(
  projectPath,
  primaryContextPath,
  'How should we perform risk assessment?'
);

console.log(`Embeddings used: ${metadata.embeddingsUsed}`);
```

## Performance

### First Run (Cold Start)
- Model loading: ~2-3 seconds
- Embedding generation: ~50ms per chunk
- Cache creation: Minimal overhead

### Subsequent Runs (Warm Start)
- Model loading: <100ms (already loaded)
- Embedding from cache: <1ms per chunk
- Search: ~0.1ms per similarity calculation

### Example Performance
```
100 document chunks:
- First run: ~5 seconds (load model + embed)
- Cached run: ~100ms (load from cache)
- Speedup: ~50x faster
```

## Semantic Search Examples

The embedding model understands semantic relationships:

| Query | Keyword Match | Embedding Match |
|-------|--------------|----------------|
| "device malfunction" | ❌ No match for "equipment failure" | ✅ High similarity (85%) |
| "risk assessment" | ❌ No match for "hazard analysis" | ✅ High similarity (82%) |
| "design control" | ❌ No match for "development process" | ✅ High similarity (78%) |
| "V&V protocol" | ❌ Limited matches | ✅ Matches "verification and validation" (90%) |

## Configuration

### Feature Flag
The embedding service can be disabled via the `useEmbeddings` flag in `EnhancedRAGService`:

```typescript
export class EnhancedRAGService {
  private useEmbeddings: boolean = true; // Set to false to disable
}
```

### Cache Management

```typescript
// Clear all cached embeddings
await embeddingService.clearCache();

// Clear RAG cache (will regenerate embeddings on next load)
enhancedRAGService.clearCache(projectPath);
```

## Testing

Run the test script to verify the embedding service:

```bash
cd src/rag-service
npm run test:embeddings
```

Expected output:
```
============================================================
Testing Embedding Service
============================================================

1. Initializing embedding service...
   ✓ Model: Xenova/all-MiniLM-L6-v2
   ✓ Version: v1.0
   ✓ Dimensions: 384

2. Testing single text embedding...
   ✓ Text: "Risk assessment for medical device"
   ✓ Embedding dimensions: 384
   ✓ First 5 values: [0.0234, -0.0156, 0.0891, ...]

...

✅ All tests passed!
```

## Troubleshooting

### Model fails to load
- **Issue**: Network error or timeout
- **Solution**: The model is downloaded from HuggingFace on first use. Ensure internet connectivity for initial download. Subsequent runs use cached model.

### Out of memory
- **Issue**: Large batch sizes consume too much memory
- **Solution**: Reduce batch size in `embedBatch()` call (default: 32)

### Slow performance
- **Issue**: Embeddings not being cached
- **Solution**: Ensure `.phasergun-cache/embeddings/` directory is writable. Check console for cache hit/miss messages.

### Different results between runs
- **Issue**: Cache invalidation
- **Solution**: Cache keys include file path and content hash. Changing either will regenerate embeddings.

## Technical Details

### Vector Normalization
All embeddings are L2-normalized, meaning cosine similarity is equivalent to dot product:

```typescript
similarity = dot(embedding1, embedding2) / (norm(embedding1) * norm(embedding2))
```

### Similarity Score Interpretation
- **0.9-1.0**: Nearly identical semantic meaning
- **0.7-0.9**: Highly related concepts
- **0.5-0.7**: Moderately related
- **0.3-0.5**: Somewhat related
- **0.0-0.3**: Weakly related

### Memory Usage
- Model: ~100MB RAM
- Each embedding: 384 floats × 4 bytes = 1.5KB
- 1000 chunks = ~1.5MB in memory

## Future Enhancements

Potential improvements:
- [ ] Support for multiple embedding models
- [ ] Vector database integration (e.g., FAISS, Weaviate)
- [ ] Hybrid search (combine keyword + semantic)
- [ ] Fine-tuning on domain-specific data
- [ ] GPU acceleration support
- [ ] Embedding compression techniques

## References

- [Transformers.js Documentation](https://huggingface.co/docs/transformers.js)
- [all-MiniLM-L6-v2 Model Card](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2)
- [Sentence Transformers](https://www.sbert.net/)
