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

## SOP Summarization

### Motivation

Long Standard Operating Procedures (SOPs) can consume significant token budget when included in context. To optimize context efficiency while maintaining comprehensive coverage, the Enhanced RAG Service now automatically generates **executive summaries** for all procedure documents.

### Benefits

✅ **Reduced Token Usage**: Summaries provide high-level overview without full SOP text  
✅ **Improved Context Quality**: LLM receives both overview (summaries) and details (semantic chunks)  
✅ **Better Understanding**: Summaries help LLM grasp document relationships and scope  
✅ **Cost Efficiency**: Fewer tokens = lower API costs  
✅ **Cache Friendly**: Summaries regenerated only when SOP content changes  

### Implementation

The service uses a **tiered context structure**:

```
TIER 1: Primary Context (PhaserGun role, regulatory framework)
         ↓
TIER 1.5: SOP Executive Summaries (NEW - 200-300 word overviews)
         ↓
TIER 2: Retrieved Procedure Chunks (detailed sections based on semantic search)
         ↓
TIER 3: Retrieved Context Chunks (project-specific information)
```

### How It Works

1. **Generation**: Uses Groq/Llama 3.1 to create 200-300 word summaries focusing on:
   - Purpose and scope
   - Key requirements and steps
   - Relevant definitions and references

2. **Caching**: Summaries stored in `.phasergun-cache/sop-summaries.json`
   - Content hash validation ensures summaries update when SOPs change
   - Cached summaries reused across sessions

3. **Integration**: Summaries automatically included in context assembly
   - Configurable via `includeSummaries` option (default: true)
   - Customizable word count via `summaryWordCount` option (default: 250)

### Usage Example

```typescript
import { EnhancedRAGService } from './enhanced-rag-service';

const ragService = new EnhancedRAGService();

// Retrieve context with SOP summaries (default behavior)
const result = await ragService.retrieveRelevantContext(
  projectPath,
  primaryContextPath,
  'Analyze design verification documentation',
  {
    includeSummaries: true,      // Include executive summaries
    summaryWordCount: 300,       // Customize summary length
    procedureChunks: 5,          // Number of detailed chunks to retrieve
    contextChunks: 5
  }
);

console.log(`Summaries generated: ${result.metadata.summariesGenerated}`);
console.log(`Total tokens: ${result.metadata.totalTokensEstimate}`);
```

### Cache Structure

```json
{
  "SOP-Design-Control.pdf": {
    "hash": "a3f5b2c1...",
    "summary": "This SOP establishes design control procedures...",
    "generatedAt": "2026-01-24T21:00:00.000Z"
  },
  "SOP-Risk-Management.pdf": {
    "hash": "d8e9f1a2...",
    "summary": "This procedure defines the risk management process...",
    "generatedAt": "2026-01-24T21:00:01.000Z"
  }
}
```

### Configuration

**Environment Variables:**
- `GROQ_API_KEY`: Required for summary generation

**Options:**
```typescript
{
  includeSummaries?: boolean;     // Enable/disable summaries (default: true)
  summaryWordCount?: number;      // Target word count (default: 250)
  llmService?: GroqLLMService;    // Optional: provide your own LLM service
}
```

### Graceful Degradation

If summary generation fails:
1. **Fallback**: Uses first 500 words of document
2. **Logging**: Warns about failure, continues without summaries
3. **No Blocking**: Never prevents context assembly

### Future Considerations

1. **Multi-Document Summarization**
   - Cross-reference related SOPs in summaries
   - Identify dependencies and overlaps between procedures

2. **Summary Quality Improvements**
   - Fine-tuned prompts for different document types
   - Domain-specific summary templates (design, testing, QA)
   - Summary evaluation metrics (relevance, completeness)

3. **Hierarchical Summarization**
   - Multi-level summaries (1-sentence, 1-paragraph, full executive)
   - Progressive disclosure based on query relevance

4. **User Customization**
   - Custom summary templates per organization
   - Configurable focus areas (compliance, process, roles)
   - Summary style preferences (technical, executive, audit)

5. **Summary Versioning**
   - Track summary changes over time
   - Link summaries to specific SOP versions
   - Change impact analysis

6. **Intelligent Summary Selection**
   - Only include summaries for relevant SOPs (based on semantic search)
   - Dynamic summary length based on available token budget
   - Priority-based summary inclusion

7. **Enhanced Caching**
   - Shared summary cache across projects (for common SOPs)
   - Summary pre-generation during idle time
   - Cache warm-up strategies

8. **Quality Metrics**
   - Track summary accuracy and relevance
   - A/B testing different summarization approaches
   - User feedback on summary helpfulness

## Future Roadmap

1. **Vector Embeddings**: Semantic search with OpenAI/Cohere embeddings ✅ (Implemented)
2. **Vector Database**: Integration with Pinecone, Weaviate, or Chroma
3. **Document Metadata**: Enhanced filtering by document type, date, phase
4. **Query Expansion**: Automatic query enhancement and synonym expansion
5. **Caching**: Cache frequently requested contexts ✅ (Implemented)
6. **Analytics**: Track context relevance and usage patterns
7. **SOP Summarization**: Executive summaries for long procedures ✅ (Implemented)

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
