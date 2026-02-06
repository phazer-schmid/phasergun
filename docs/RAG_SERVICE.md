# PhaserGun RAG Service Documentation

## Overview

The RAG (Retrieval-Augmented Generation) service is the intelligence layer of PhaserGun. It combines semantic search, local embeddings, and structured knowledge retrieval to provide relevant context for LLM generation.

### Key Features
- **Three-Layer Knowledge Model**: Static rules + Dynamic procedures + Dynamic context
- **Semantic Search**: Vector-based similarity using 384-dimensional embeddings
- **Local Embeddings**: No external API calls, fully private
- **Extractive Summaries**: Deterministic first-N-words summaries
- **Source Attribution**: Automatic footnote tracking and generation
- **Cache-Optimized**: Persistent vectors for sub-second retrieval

---

## Three-Layer Knowledge Model

PhaserGun organizes knowledge into three distinct layers, each serving a specific purpose:

### Layer 1: Primary Context (Static Rules)

**File**: `src/rag-service/knowledge-base/context/primary-context.yaml`

**Purpose**: Defines PhaserGun's role, behavioral rules, regulatory framework, and operational constraints.

**Content**:
- Product definition and purpose
- Knowledge source specifications
- Reference notation syntax
- Generation workflow steps
- Operational rules
- Cache system configuration

**Characteristics**:
- **Static**: Rarely changes
- **Mandatory**: Always included in LLM context
- **Regulatory**: Contains FDA/ISO compliance requirements
- **Behavioral**: Defines how PhaserGun should generate content

**Example Structure**:
```yaml
product:
  name: "PhaserGun (PG)"
  type: "Regulatory Documentation Engine"
  purpose: "Generate regulatory documents for 510(k) submissions using industry standards, company operating procedures and project context"

knowledge_sources:
  master_record:
    location: "[RAGFolder]/Context/Project-Master-Record.docx"
    retrieval_priority: "primary"
  
  compliance:
    standards:
      - id: "fda_820_30"
        name: "FDA 21 CFR Part 820.30"
      - id: "iso_13485"
        name: "ISO 13485"
```

### Layer 2: Procedures (Dynamic SOPs)

**Location**: `[ProjectPath]/Procedures/`

**Purpose**: Company-specific operating procedures that govern how work is performed.

**Content Types**:
- Standard Operating Procedures (SOPs)
- Quality Plans (QPs)
- Quality Assurance Plans (QAPs)
- Design Control procedures
- Risk Management procedures
- Document Control procedures

**Characteristics**:
- **Dynamic**: Can change per company/project
- **Semantic Search**: Retrieved based on prompt similarity
- **Section-Aware Chunking**: Preserves document structure
- **High Priority**: Used to ensure procedural compliance

**Processing**:
1. **Parse**: Extract text from PDF, DOCX, DOC, etc.
2. **Chunk**: Split into sections (2000-4000 chars per chunk)
3. **Embed**: Generate 384-dim vectors for each chunk
4. **Index**: Store in vector store with metadata
5. **Summarize**: Extract first 250 words for overview

### Layer 3: Context (Dynamic Project Files)

**Location**: `[ProjectPath]/Context/` with subfolders:

| Subfolder | Purpose | Retrieval Priority |
|-----------|---------|-------------------|
| **Primary Context** | Root-level `Project-Master-Record.docx` | Primary |
| **Initiation** | Initial project documents | High |
| **Ongoing** | Ongoing project materials | High |
| **Predicates** | Predicate device analysis | High |
| **Regulatory Strategy** | Regulatory strategy documents | On-demand |
| **General** | Additional reference materials | On-demand |
| **Prompt** | User-selected prompts | **Never cached** |

**Characteristics**:
- **Dynamic**: Project-specific, changes frequently
- **Structured**: Organized by subfolder for targeted retrieval
- **Paragraph-Based Chunking**: Chunks with overlap for context
- **On-Demand Retrieval**: Some folders only retrieved when explicitly referenced

---

## Document Processing Pipeline

### Step 1: Parse Documents

**Supported Formats**:
- **Documents**: PDF, DOCX, DOC, PPTX, PPT
- **Text**: TXT, MD, CSV
- **Images**: PNG, JPG, GIF, BMP, TIFF (with OCR)

**Parser Libraries**:
- `mammoth`: DOCX parsing with structure preservation
- `pdf-parse`: PDF text extraction
- `officeparser`: Legacy Office formats (DOC, PPT)
- `tesseract.js`: OCR for images
- `sharp`: Image preprocessing

**Output**: `ParsedDocument` objects with:
```typescript
{
  id: string;              // Unique document ID
  filePath: string;        // Full file path
  fileName: string;        // File name only
  content: string;         // Extracted text
  mimeType: string;        // MIME type
  metadata: {              // File-specific metadata
    pageCount?: number;
    wordCount?: number;
    // ... format-specific fields
  };
}
```

### Step 2: Chunk Documents

**Two Chunking Strategies**:

#### A. Section-Aware Chunking (Procedures)

**Purpose**: Preserve document structure and section boundaries.

**Algorithm**:
1. Detect headers: `##`, `###`, numbered sections (`1.`, `1.1`, etc.)
2. Keep sections together when possible
3. Target chunk size: 2000-4000 characters (~500-1000 tokens)
4. Split large sections if needed
5. Maintain context with header prefixes

**Example**:
```
Input:
  ## 1. Purpose
  
  This procedure establishes design controls...
  
  ## 2. Scope
  
  This procedure applies to all medical devices...

Output:
  Chunk 0: "## 1. Purpose\n\nThis procedure establishes..."
  Chunk 1: "## 2. Scope\n\nThis procedure applies..."
```

**Benefits**:
- Semantic coherence (chunks align with topics)
- Better citation quality (references specific sections)
- Improved search relevance (headers provide context)

#### B. Paragraph-Based Chunking with Overlap (Context)

**Purpose**: Maintain narrative flow across chunk boundaries.

**Algorithm**:
1. Split by paragraph boundaries (`\n\n`)
2. Target chunk size: 3000 characters (~750 tokens)
3. Overlap size: 400 characters (~100 tokens)
4. Combine small paragraphs, split large ones
5. Ensure chunks don't exceed 4000 characters

**Example**:
```
Input:
  Para 1: "The device is a Class II medical device..."
  Para 2: "It consists of three main components..."
  Para 3: "The intended use is for monitoring..."

Output:
  Chunk 0: "Para 1 + Para 2 + [overlap from Para 3]"
  Chunk 1: "[overlap from Para 2] + Para 3 + Para 4"
```

**Benefits**:
- Smooth transitions (overlap prevents information loss)
- Context preservation (references carry over)
- Better for narrative documents (project descriptions, analyses)

### Step 3: Generate Embeddings

**Model**: `Xenova/all-MiniLM-L6-v2`

**Characteristics**:
- **Dimensions**: 384
- **Local**: Runs in Node.js via Transformers.js
- **Private**: No external API calls
- **Fast**: ~10-50ms per embedding after model load
- **Deterministic**: Single-threaded ONNX runtime for reproducibility

**Process**:
```typescript
// Initialize embedding service
const embeddingService = EmbeddingService.getInstance(projectPath);
await embeddingService.initialize();

// Generate embeddings for chunks
const embeddings = await embeddingService.embedBatch(
  chunks.map(c => c.content),
  chunks.map(c => c.filePath),
  batchSize: 32  // Process 32 chunks at a time
);
```

**Output**: 384-dimensional Float32Array for each chunk

**Caching**: Embeddings are cached by content hash to avoid recomputation

**Performance**:
- **Model load**: ~2-5 seconds (one-time cost)
- **Per embedding**: ~10-50ms
- **Batch of 100**: ~3-8 seconds
- **With cache**: ~0-1ms (cache hit)

### Step 4: Store in Vector Store

**Storage Structure**:
```typescript
{
  id: string;                    // Unique entry ID (SHA-256)
  embedding: number[];           // 384-dim vector
  metadata: {
    fileName: string;            // Source file
    filePath: string;            // Full path
    category: 'procedure' | 'context';
    chunkIndex: number;          // Position in document
    content: string;             // Original text
    contentHash: string;         // SHA-256 of content
    contextCategory?: string;    // Subfolder (for context files)
  };
}
```

**Index Organization**:
- In-memory Map for fast ID lookup
- Separate arrays for procedures and context
- Deterministic insertion order (alphabetical by file, then chunk index)

**Persistence**:
- Saved to `$TMPDIR/phasergun-cache/vector-store/{project_hash}/vector-store.json`
- Loaded on cache hit (~100-200ms)
- Includes fingerprint for validation

### Step 5: Generate Summaries

**Type**: Extractive (deterministic, no LLM calls)

**Algorithm**:
```python
def extractive_summary(document, word_count=250):
    words = document.content.split()
    if len(words) <= word_count:
        return document.content.trim()
    return " ".join(words[:word_count]) + " ..."
```

**Summary Types**:

1. **SOP Summaries** (`sop-summaries.json`):
   - First 250 words of each procedure file
   - Cached with content hash validation
   - Used for high-level overview in LLM context

2. **Context Summaries** (`context-summaries.json`):
   - First 250 words of each context file
   - Same caching strategy as SOPs
   - Provides project overview without full text

**Benefits**:
- **Deterministic**: Always produces same output for same input
- **Fast**: No LLM API calls or processing time
- **Sufficient**: First 250 words typically contain purpose/scope
- **Cacheable**: Content-hash keyed for validation

**Storage Format**:
```json
{
  "SOP-001-Design-Control.pdf": {
    "hash": "sha256:abc123...",
    "summary": "1. Purpose\n\nThis procedure establishes...",
    "generatedAt": "2026-02-05T22:00:00.000Z"
  }
}
```

---

## Semantic Retrieval

### Vector Search Process

**1. Embed Query**:
```typescript
// Convert prompt to 384-dim vector
const queryEmbedding = await embeddingService.embedText(promptText);
const queryVector = VectorStore.float32ArrayToNumbers(queryEmbedding);
```

**2. Compute Similarity**:
```typescript
// Cosine similarity for each candidate
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  let dotProduct = 0, normA = 0, normB = 0;
  
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
```

**3. Sort and Filter**:
```typescript
// Get top-K results per category
const procedureResults = vectorStore.search(
  queryVector,
  topK: 5,
  category: 'procedure'
);

const contextResults = vectorStore.search(
  queryVector,
  topK: 3,
  category: 'context'
);
```

**4. Return Results**:
```typescript
interface SearchResult {
  entry: VectorEntry;      // Full entry with content
  similarity: number;      // 0.0 to 1.0
}
```

### Similarity Scoring

**Range**: 0.0 (orthogonal) to 1.0 (identical)

**Typical Thresholds**:
- **>0.8**: Highly relevant (almost direct match)
- **0.6-0.8**: Relevant (on-topic)
- **0.4-0.6**: Somewhat relevant (related concepts)
- **<0.4**: Low relevance (different topic)

**Example Scores**:
```
Query: "design input requirements"
Results:
  0.87 - SOP-001 Design Control, Section 3: Design Inputs
  0.73 - Project Context: Device Requirements Specification
  0.65 - SOP-003 Verification, Section 2: Input Verification
  0.42 - SOP-007 Document Control (low relevance)
```

---

## FootnoteTracker

**Purpose**: Track which sources were used and generate citation footnotes.

### How It Works

**1. Add Sources During Retrieval**:
```typescript
const tracker = new FootnoteTracker();

// Add procedure chunks
procedureResults.forEach(result => {
  tracker.addSource({
    fileName: result.entry.metadata.fileName,
    category: 'procedure',
    chunkIndex: result.entry.metadata.chunkIndex
  });
});

// Add context chunks
contextResults.forEach(result => {
  tracker.addSource({
    fileName: result.entry.metadata.fileName,
    category: 'context',
    chunkIndex: result.entry.metadata.chunkIndex
  });
});

// Add regulatory standards mentioned in prompt
tracker.addStandardReference('ISO 13485:2016', 'Quality Management Systems');
```

**2. Generate Footnotes**:
```typescript
const footnotes = tracker.generateFootnotes();
```

**Output**:
```
---
## Sources

[1] Procedure: SOP-001-Design-Control.pdf (Section 1)
[2] Context: Primary Context.docx (Section 2)
[3] Regulatory Standard: ISO 13485:2016 - Quality Management Systems
```

**3. Append to Generated Text**:
```typescript
const finalText = llmGeneratedText + footnotes;
```

### Source Reference Structure

```typescript
interface SourceReference {
  id: string;                     // Citation number ("1", "2", etc.)
  fileName: string;               // Source file name
  category: 'procedure' | 'context' | 'standard';
  chunkIndex?: number;            // Chunk position (if applicable)
  citationText?: string;          // Custom citation (for standards)
}
```

---

## GenerationEngine

**Purpose**: Parse `Project-Master-Record.docx` into structured sections and fields for reference notation support.

### Parsing Strategy

**1. Load Document**:
```typescript
const engine = await GenerationEngine.create(projectContextPath);
```

**2. Extract Sections**:
- Detect headings (title case, ending with `:`)
- Extract field-value pairs within sections
- Build hierarchical structure

**3. Provide Access Methods**:
```typescript
// Get specific field
const deviceName = engine.getFieldValue('Product Information', 'DEVICE_NAME');

// Get entire section
const projectOverview = engine.getSectionContent('Project Overview');

// Get all sections
const allSections = engine.getAllSections();
```

### Example Document Structure

**Input (`Project-Master-Record.docx`)**:
```
Project Overview:

Device Name: Advanced Cardiac Monitor
Device Class: Class II
Intended Use: Continuous cardiac rhythm monitoring

Regulatory Information:

Predicate Device: Model XYZ-2000
Regulatory Pathway: 510(k)
Submission Date: 2026-03-15
```

**Parsed Structure**:
```typescript
{
  sections: [
    {
      heading: "Project Overview",
      content: "Device Name: Advanced Cardiac Monitor...",
      fields: {
        "Device Name": "Advanced Cardiac Monitor",
        "Device Class": "Class II",
        "Intended Use": "Continuous cardiac rhythm monitoring"
      }
    },
    {
      heading: "Regulatory Information",
      content: "Predicate Device: Model XYZ-2000...",
      fields: {
        "Predicate Device": "Model XYZ-2000",
        "Regulatory Pathway": "510(k)",
        "Submission Date": "2026-03-15"
      }
    }
  ]
}
```

---

## Reference Notation Resolution

### How Bracket Patterns Work

**1. Parse Reference Notation**:
```typescript
// In Orchestrator
const references = this.parseReferenceNotation(prompt);

// Returns:
{
  procedures: ["Design Control Procedure"],
  masterRecordFields: ["DEVICE_NAME"],
  contextDocs: [
    { folder: "Regulatory Strategy", filename: "predicate.docx" }
  ]
}
```

**2. Guide Retrieval**:
```typescript
// Adjust retrieval based on parsed references
const options = {
  procedureChunks: references.procedures.length > 0 ? 5 : 0,
  contextChunks: references.masterRecordFields.length > 0 ? 3 : 0
};

const { ragContext } = await ragService.retrieveRelevantContext(
  projectPath,
  primaryContextPath,
  prompt,
  options
);
```

**3. Resolve Master Record References**:
```typescript
// Replace [Master Record|DEVICE_NAME] with actual value
const engine = await GenerationEngine.create(masterRecordPath);
const deviceName = engine.getFieldValue('Product', 'DEVICE_NAME');
// → "Advanced Cardiac Monitor"
```

---

## Context Assembly

The RAG service assembles context in a structured three-tier format optimized for LLM understanding:

### Tier 1: Role & Behavioral Instructions

```
=== YOUR ROLE AND CRITICAL INSTRUCTIONS ===

You are PhaserGun AI, an AI regulatory documentation expert.

PRIMARY FUNCTION: Generate regulatory documents for 510(k) submissions

CRITICAL BEHAVIORAL RULES:
1. Write DIRECTLY in response to the user's task
2. Do NOT analyze or summarize reference materials
3. Follow EXACT format, tone, length specified
...

SCOPE ENFORCEMENT (ABSOLUTE REQUIREMENTS):
1. Write ONLY what is requested
2. Do NOT expand scope
3. STOP IMMEDIATELY after completing requested section
...
```

### Tier 2: Reference Materials

**A. SOP Summaries** (if procedures requested):
```
--- Company Procedures (SOPs) ---

[SOP-001-Design-Control.pdf]
1. Purpose

This procedure establishes requirements for design control activities...
[first 250 words]

[SOP-002-Risk-Management.pdf]
Risk Management Procedure

1.0 Scope

This procedure describes the process for identifying...
[first 250 words]
```

**B. Context Summaries** (if context requested):
```
--- Project Context Summaries ---

[Primary Context.docx]
Project Overview

Device Name: Advanced Cardiac Monitor...
[first 250 words]

[Predicate-Device-Analysis.docx]
Predicate Device Comparison

This document compares our device to the predicate...
[first 250 words]
```

**C. Detailed Procedure Sections** (top-K by similarity):
```
--- Detailed Procedure Sections (Retrieved for Relevance) ---

[SOP-001-Design-Control.pdf - Section 1]
## 1. Purpose and Scope

This procedure establishes the requirements...
[full section text]

[SOP-001-Design-Control.pdf - Section 3]
## 3. Design Input Requirements

Design inputs shall be documented...
[full section text]
```

**D. Detailed Context Sections** (top-K by similarity):
```
--- Detailed Project Context (Retrieved for Relevance) ---

[Primary Context File: Primary Context.docx]
The device is indicated for use in hospital settings...
[chunk content]

[Predicate Device: Predicate-Analysis.docx]
Comparison of substantial equivalence...
[chunk content]
```

### Tier 3: User Task

(Appended by orchestrator, not RAG service)

```
=== YOUR SPECIFIC TASK ===

[User's prompt goes here]

MANDATORY ENFORCEMENT RULES
[Scope constraints go here]
```

---

## Determinism Guarantees

### Why Determinism Matters

**Problem**: Non-deterministic operations can cause:
- Different cache fingerprints for identical source files
- Inconsistent search results
- Flaky cache validation

**Solution**: Enforce deterministic ordering at all stages:

### 1. File Processing Order

```typescript
// ALWAYS sort files alphabetically before processing
const sortedProcedures = [...proceduresFiles].sort((a, b) => 
  a.fileName.localeCompare(b.fileName)
);

// Process in sorted order (NOT in parallel)
for (const doc of sortedProcedures) {
  const vectors = await chunkAndEmbedDocument(doc);
  allVectors.push(...vectors);
}
```

### 2. Embedding Generation

```typescript
// Force single-threaded ONNX runtime
env.backends.onnx.sessions = {
  intraOpNumThreads: 1,  // Single thread
  interOpNumThreads: 1   // No parallelism
};
```

**Why**: Multi-threaded float accumulation is non-associative, producing slightly different embeddings (~1e-6 variance) across runs.

### 3. Vector Store Insertion

```typescript
// Insert in deterministic order:
// 1. Procedures (alphabetical by file, then chunk index)
// 2. Context (alphabetical by file, then chunk index)
const allVectors = [...procedureVectors, ...contextVectors];
allVectors.forEach(entry => vectorStore.addEntry(entry));
```

### 4. Search Result Sorting

```typescript
// Break ties in similarity scores using entry ID
results.sort((a, b) => {
  const simDiff = b.similarity - a.similarity;
  
  // If similarities are equal (within floating-point precision)
  if (Math.abs(simDiff) < 1e-10) {
    return a.entry.id.localeCompare(b.entry.id);  // Deterministic tiebreaker
  }
  
  return simDiff;
});
```

---

## Performance Characteristics

### Cache Hit (Typical)
- **Vector Store Load**: ~100-200ms
- **Summary Load**: ~10-20ms
- **Total Cold Start**: ~150-250ms

### Cache Miss (Rebuild Required)
- **Document Parsing**: ~5-30s (depends on file count and formats)
- **Embedding Generation**: ~30-120s (depends on chunk count)
- **Vector Store Save**: ~100-500ms
- **Summary Generation**: ~50-200ms
- **Total Rebuild**: ~1-3 minutes for typical project

### Search Performance
- **Query Embedding**: ~10-50ms
- **Similarity Computation**: ~5-20ms (depends on vector count)
- **Top-K Sorting**: ~1-5ms
- **Total Search**: ~20-100ms

---

## Related Documentation

- **System Architecture**: [ARCHITECTURE.md](./ARCHITECTURE.md)
- **Cache System**: [CACHE.md](./CACHE.md)
- **API Reference**: [API.md](./API.md)
- **Deployment Guide**: [DEPLOYMENT.md](./DEPLOYMENT.md)
