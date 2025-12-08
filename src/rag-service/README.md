# RAG Service Module

The RAG (Retrieval-Augmented Generation) Service is responsible for managing the knowledge base and retrieving relevant context for LLM prompts.

## Overview

This module implements a complete RAG pipeline:
1. **Knowledge Base Initialization** - Loads regulatory guidelines and reference documents
2. **Document Indexing** - Indexes chunked documents for efficient retrieval
3. **Context Retrieval** - Retrieves relevant context based on semantic similarity

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                 RAG Service                          │
├─────────────────────────────────────────────────────┤
│                                                      │
│  ┌──────────────────────────────────────────────┐  │
│  │   Knowledge Base                              │  │
│  │  - Regulatory Guidelines (FDA, ISO)           │  │
│  │  - Reference Documents                        │  │
│  │  - Indexed Document Chunks                    │  │
│  └──────────────────────────────────────────────┘  │
│                                                      │
│  ┌──────────────────────────────────────────────┐  │
│  │   Retrieval Engine                            │  │
│  │  - Keyword Matching                           │  │
│  │  - Relevance Scoring                          │  │
│  │  - Top-K Selection                            │  │
│  └──────────────────────────────────────────────┘  │
│                                                      │
└─────────────────────────────────────────────────────┘
```

## Interface

```typescript
export interface RAGService {
  // Initialize knowledge base with reference documents
  initializeKnowledgeBase(): Promise<void>;
  
  // Index document chunks
  indexDocuments(chunks: ChunkedDocumentPart[]): Promise<void>;
  
  // Retrieve relevant context
  retrieveContext(query: string, topK?: number): Promise<KnowledgeContext>;
  
  // Clear indexed documents
  clearDocuments(): Promise<void>;
}
```

## Implementations

### 1. InMemoryRAGService

Production-ready implementation using in-memory storage with keyword-based retrieval.

**Features:**
- Pre-loaded regulatory guidelines (FDA 510(k), ISO 13485, ISO 14971)
- Document chunk indexing
- Keyword-based relevance scoring
- Configurable top-K retrieval
- Combines regulatory guidelines with indexed documents

**Usage:**
```typescript
import { InMemoryRAGService } from './rag-service/src';

const ragService = new InMemoryRAGService();

// Initialize with regulatory guidelines
await ragService.initializeKnowledgeBase();

// Index document chunks
await ragService.indexDocuments(chunks);

// Retrieve relevant context
const context = await ragService.retrieveContext(
  'Analyze design verification documentation',
  5  // top 5 results
);
```

**Relevance Scoring:**
- Simple keyword matching (normalized 0-1 score)
- Can be extended with:
  - TF-IDF scoring
  - BM25 algorithm
  - Vector embeddings (semantic search)

### 2. MockRAGService

Testing implementation that returns static context.

**Usage:**
```typescript
import { MockRAGService } from './rag-service/src';

const ragService = new MockRAGService();
await ragService.initializeKnowledgeBase();

// Returns predefined regulatory context
const context = await ragService.retrieveContext('any query');
```

## Data Flow

```
┌────────────────┐
│  File Parser   │ Parse documents
└────────┬───────┘
         │
         ▼
┌────────────────┐
│    Chunker     │ Create chunks
└────────┬───────┘
         │
         ▼
┌────────────────┐
│  RAG Service   │ Index chunks + Load guidelines
└────────┬───────┘
         │
         ▼
┌────────────────┐
│  Query Built   │ "Analyze DHF documents for 510(k)..."
└────────┬───────┘
         │
         ▼
┌────────────────┐
│  RAG Service   │ Retrieve top-K relevant contexts
└────────┬───────┘
         │
         ▼
┌────────────────┐
│  LLM Service   │ Generate analysis with context
└────────────────┘
```

## Regulatory Guidelines

The service includes pre-loaded regulatory context:

### FDA Guidelines
- **510(k) Guidance**: Substantial equivalence requirements
- **Design Control Guidance**: Design planning, inputs, outputs, reviews
- **Verification & Validation**: Testing requirements and protocols

### ISO Standards
- **ISO 13485:2016**: QMS for medical devices, DHF requirements
- **ISO 14971**: Risk management throughout product lifecycle

### Best Practices
- **DHF Best Practices**: Traceability matrix, documentation requirements
- **Design Review Standards**: Review milestones and criteria
- **GMP Testing Guidelines**: Protocol requirements and acceptance criteria

## Performance Considerations

### Current Implementation (Keyword-Based)
- **Pros**: Simple, fast, no external dependencies
- **Cons**: Limited semantic understanding
- **Suitable for**: Small to medium datasets (<10,000 chunks)

### Future Enhancements

**Vector Embeddings** (Recommended for production):
```typescript
// Use OpenAI, Cohere, or local embeddings
import { OpenAIEmbeddings } from '@langchain/openai';

const embeddings = new OpenAIEmbeddings();
const vectors = await embeddings.embedDocuments(chunks);
// Store in vector database (Pinecone, Weaviate, Chroma)
```

**Hybrid Search**:
- Combine keyword matching with semantic search
- Re-rank results using cross-encoders
- Weight by recency and document importance

## Testing

```typescript
import { InMemoryRAGService } from './rag-service/src';

describe('RAGService', () => {
  it('should initialize knowledge base', async () => {
    const rag = new InMemoryRAGService();
    await rag.initializeKnowledgeBase();
    // Initialized successfully
  });

  it('should index and retrieve documents', async () => {
    const rag = new InMemoryRAGService();
    await rag.initializeKnowledgeBase();
    await rag.indexDocuments(mockChunks);
    
    const context = await rag.retrieveContext('design verification');
    expect(context.contextSnippets.length).toBeGreaterThan(0);
  });
});
```

## Configuration

No configuration required for basic usage. Regulatory guidelines are pre-loaded.

For advanced usage:
```typescript
class CustomRAGService extends InMemoryRAGService {
  async initializeKnowledgeBase(): Promise<void> {
    await super.initializeKnowledgeBase();
    
    // Add custom reference documents
    this.referenceDocuments.push({
      content: 'Custom regulatory guidance...',
      source: 'Internal SOP',
      category: 'internal'
    });
  }
}
```

## Future Roadmap

1. **Vector Embeddings**: Semantic search with OpenAI/Cohere embeddings
2. **Vector Database**: Integration with Pinecone, Weaviate, or Chroma
3. **Document Metadata**: Enhanced filtering by document type, date, phase
4. **Query Expansion**: Automatic query enhancement and synonym expansion
5. **Caching**: Cache frequently requested contexts
6. **Analytics**: Track context relevance and usage patterns

## Dependencies

```json
{
  "dependencies": {
    "@fda-compliance/shared-types": "workspace:*"
  }
}
```

## API Reference

### initializeKnowledgeBase()
Loads regulatory guidelines and prepares the service for use.

**Returns:** `Promise<void>`

**Throws:** Never

---

### indexDocuments(chunks)
Indexes document chunks into the knowledge base for retrieval.

**Parameters:**
- `chunks: ChunkedDocumentPart[]` - Array of document chunks to index

**Returns:** `Promise<void>`

**Throws:** Error if not initialized

---

### retrieveContext(query, topK?)
Retrieves relevant context based on the query.

**Parameters:**
- `query: string` - Search query or question
- `topK?: number` - Number of top results (default: 5)

**Returns:** `Promise<KnowledgeContext>` - Relevant context snippets and sources

**Throws:** Error if not initialized

---

### clearDocuments()
Removes all indexed documents from the knowledge base. Regulatory guidelines remain.

**Returns:** `Promise<void>`

**Throws:** Never

## License

Part of the FDA Compliance Analysis System
