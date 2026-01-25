# RAG Pipeline End-to-End Test

Comprehensive validation of the entire RAG (Retrieval-Augmented Generation) pipeline with real data.

## Overview

This test validates the complete RAG pipeline workflow:

1. **Embedding Generation** - Documents are parsed, chunked, and embedded using semantic models
2. **Vector Search** - Embeddings are indexed in a vector store for fast similarity search
3. **Semantic Retrieval** - Relevant context is retrieved based on query similarity
4. **Full Generation Flow** - LLM generates responses using retrieved context

## Test Components

### Test Script
- **Location**: `src/rag-service/test/test-rag-pipeline.ts`
- **Purpose**: End-to-end validation of RAG pipeline
- **Tests**: 5 comprehensive test cases

### Test Data Setup
- **Script**: `src/rag-service/setup-test-data.sh`
- **Purpose**: Creates sample project structure with realistic documents
- **Output**: Test project at `/tmp/test-phasergun/`

## Quick Start

### 1. Setup Test Data

```bash
cd src/rag-service
./setup-test-data.sh
```

This creates:
```
/tmp/test-phasergun/
├── Procedures/
│   ├── SOP0004_Design_Control.txt
│   └── SOP0007_Risk_Management.txt
└── Context/
    ├── predicate_comparison.txt
    └── clinical_evaluation_summary.txt
```

### 2. Set Environment Variables

```bash
# Required: Your Groq API key
export GROQ_API_KEY=your_api_key_here

# Optional: Custom test project path (defaults to /tmp/test-phasergun)
export TEST_PROJECT_PATH=/tmp/test-phasergun

# Optional: Custom primary context path
export PRIMARY_CONTEXT_PATH=/path/to/primary-context.yaml
```

Or create a `.env` file in `src/rag-service/`:
```env
GROQ_API_KEY=your_api_key_here
TEST_PROJECT_PATH=/tmp/test-phasergun
```

### 3. Run Tests

```bash
cd src/rag-service
npm run test:rag
```

## Test Cases

### Test 1: Loading and Embedding Documents
- **Purpose**: Validate document parsing and embedding generation
- **Validates**:
  - Primary context loads correctly
  - Procedure and context files are parsed
  - Embeddings are generated via vector store
  - Cache fingerprints are created
- **Success Criteria**: Documents loaded and vector store created

### Test 2: Semantic Search
- **Purpose**: Test vector similarity search
- **Query**: "What are the design control requirements?"
- **Validates**:
  - Query embedding generation
  - Similarity scoring (0.0 to 1.0)
  - Top-K retrieval accuracy
  - Metadata tracking (sources, chunks, tokens)
  - Performance (<5s target)
- **Success Criteria**: Relevant chunks retrieved with similarity scores

### Test 3: Full Generation Flow
- **Purpose**: Test LLM response generation with RAG context
- **Validates**:
  - Context assembly (primary + retrieved chunks)
  - LLM API integration
  - Token usage tracking
  - Cost calculation
  - Response quality
- **Success Criteria**: Coherent response generated using retrieved context

### Test 4: Cache Functionality
- **Purpose**: Validate caching system
- **Validates**:
  - Cache fingerprint matching
  - Faster load times on subsequent runs
  - Vector store persistence
  - Consistency across cache hits
- **Success Criteria**: Second load uses cache and is faster

### Test 5: Advanced Retrieval Options
- **Purpose**: Test customizable retrieval parameters
- **Validates**:
  - Custom chunk counts (procedureChunks, contextChunks)
  - Token budget enforcement (maxTokens)
  - Truncation when over limit
  - Option passthrough
- **Success Criteria**: Advanced options work as configured

## Expected Output

### Successful Test Run

```
================================================================================
🧪 COMPREHENSIVE RAG PIPELINE TEST
================================================================================

📋 Configuration:
   Project Path: /tmp/test-phasergun
   Primary Context: .../primary-context.yaml
   LLM Model: llama-3.1-8b-instant

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 TEST 1: Loading and Embedding Documents
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Documents loaded and embedded successfully
   Duration: 2347ms
   Primary Context: ✓
   Indexed At: 2026-01-24T22:00:00.000Z
   ...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 TEST 2: Testing Semantic Search
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Query: "What are the design control requirements?"

✅ Semantic search completed
   Duration: 1234ms ✓ (<5s target)

📊 Retrieved Context:
   • Primary Context Included: Yes
   • Procedure Chunks: 3
   • Context Chunks: 2
   • Estimated Tokens: 8,543
   • Sources: SOP0004_Design_Control.txt, predicate_comparison.txt

🎯 Top Procedure Matches:
   1. SOP0004_Design_Control.txt
      Chunk: 5
      Similarity: 87.3%
      Preview: 5. DESIGN INPUTS
5.1 Design inputs represent the requirements...

...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ ALL TESTS PASSED!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 Test Summary:
   ✓ Embedding Generation: Working
   ✓ Vector Search: Working
   ✓ Semantic Retrieval: Working
   ✓ Full Generation Flow: Working
   ✓ Cache Functionality: Working

⚡ Performance Metrics:
   • Initial Load: 2347ms
   • Semantic Search: 1234ms (Target: <5s ✓)
   • LLM Generation: 2156ms
   • Cache Load: 112ms

💰 Cost Analysis:
   • Single Query Cost: $0.0012
   • Tokens Used: 9,234

🎉 RAG Pipeline is fully operational and ready for production use!
```

## Performance Targets

| Metric | Target | Acceptable |
|--------|--------|------------|
| Initial Load | <10s | <15s |
| Semantic Search | <5s | <10s |
| Cache Load | <1s | <2s |
| Total Test Time | <30s | <60s |

## Troubleshooting

### Error: GROQ_API_KEY not set
```bash
export GROQ_API_KEY=your_api_key_here
```

### Error: Test project not found
```bash
# Run setup script first
./setup-test-data.sh

# Or manually set path
export TEST_PROJECT_PATH=/path/to/your/test/project
```

### Error: Primary context not found
```bash
# Use default (recommended)
# Located at: src/rag-service/knowledge-base/context/primary-context.yaml

# Or set custom path
export PRIMARY_CONTEXT_PATH=/path/to/primary-context.yaml
```

### Error: Model download fails
- Check internet connection
- Model will be cached after first download
- Default model: `Xenova/all-MiniLM-L6-v2` (~100MB)

### Rate Limiting (Groq API)
- Free tier: 30 requests/minute
- Test makes 2 LLM calls
- Automatic retry with exponential backoff
- Wait 60 seconds between test runs if hitting limits

## Test Data Details

### Sample SOPs
1. **SOP0004_Design_Control.txt** (5.2KB)
   - Design control process per 21 CFR 820.30
   - 13 sections covering full design lifecycle
   - Includes inputs, outputs, verification, validation

2. **SOP0007_Risk_Management.txt** (2.1KB)
   - Risk management per ISO 14971:2019
   - Risk analysis, evaluation, control
   - Post-market surveillance

### Sample Context Files
1. **predicate_comparison.txt** (3.4KB)
   - 510(k) substantial equivalence analysis
   - Comparison table format
   - Performance testing summary

2. **clinical_evaluation_summary.txt** (1.8KB)
   - Clinical data analysis
   - Literature review findings
   - Safety profile summary

## Success Criteria

✅ **All tests must pass:**
- [ ] Embeddings generated correctly
- [ ] Semantic search returns relevant results with scores
- [ ] Generated text includes proper context
- [ ] Cache works on second run (same fingerprint)
- [ ] Performance acceptable (<5s for retrieval)
- [ ] Metadata accurately populated
- [ ] Token budgets enforced
- [ ] Source tracking operational

## Integration with CI/CD

### GitHub Actions Example
```yaml
- name: Setup Test Data
  run: |
    cd src/rag-service
    ./setup-test-data.sh

- name: Run RAG Pipeline Tests
  env:
    GROQ_API_KEY: ${{ secrets.GROQ_API_KEY }}
    TEST_PROJECT_PATH: /tmp/test-phasergun
  run: |
    cd src/rag-service
    npm run test:rag
```

## Related Documentation

- [RAG Service README](../README.md)
- [Embedding Service](../EMBEDDING_SERVICE.md)
- [Vector Store](../VECTOR_STORE.md)
- [Chunking and Embedding](../CHUNKING_AND_EMBEDDING.md)
- [RAG Enhancement Summary](../RAG_ENHANCEMENT_SUMMARY.md)

## Support

For issues or questions:
1. Check troubleshooting section above
2. Review related documentation
3. Check test output for specific error messages
4. Verify environment variables are set correctly
