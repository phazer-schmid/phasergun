# Intelligent DHF Chunker

A sophisticated, metadata-aware document chunker designed specifically for FDA Design History File (DHF) analysis and Retrieval-Augmented Generation (RAG) systems.

## Overview

This chunker goes beyond simple fixed-size splitting by **intelligently adapting its strategy** based on document metadata, including:
- Document type (risk analysis, requirements, test protocols, etc.)
- Quality indicators (OCR confidence, conversion quality)
- Structure (sections, page breaks)
- Content characteristics (has tables, images, etc.)

## Key Features

### 🎯 **Intelligent Strategy Selection**
Automatically chooses the best chunking strategy based on document metadata:
- **Risk Analysis**: Chunks by risk entries (FMEA rows)
- **Requirements**: Chunks by requirement statements
- **Test Documents**: Chunks by test cases
- **OCR Documents**: Adaptive sizing based on confidence
- **Structured Documents**: Section-based chunking
- **Large PDFs**: Search-optimized smaller chunks

### 📊 **Rich Metadata Preservation**
Each chunk includes comprehensive metadata:
```typescript
{
  // Source tracking
  sourceDocument: "design_spec.pdf",
  sourceType: "application/pdf",
  documentType: "design-output",
  
  // Position tracking (for citations!)
  pageNumber: 5,
  section: "2.1 Safety Requirements",
  
  // Structured data (for filtering!)
  requirementIds: ["REQ-001", "REQ-002"],
  riskIds: ["RISK-HAZ-005"],
  standards: ["ISO 13485"],
  
  // Quality indicators (for ranking!)
  qualityScore: 0.95,
  ocrConfidence: 0.87,
  
  // Chunking info
  chunkStrategy: "Requirements Document",
  tokenCount: 512
}
```

### 🔢 **Token-Based Chunking**
Uses actual token counts (not character estimates) for accurate sizing compatible with LLM context windows.

### 🔄 **Configurable Overlap**
Maintains context between chunks with intelligent overlap (varies by strategy).

### 📍 **Traceability**
Full audit trail from source document → chunk → vector DB → LLM response.

## Installation

```bash
cd chunker
npm install
```

## Usage

### Basic Usage

```typescript
import { IntelligentChunker } from '@fda-compliance/chunker';
import { ParsedDocument } from '@fda-compliance/shared-types';

// Your parsed documents (from file parser)
const documents: ParsedDocument[] = [...];

// Create chunker
const chunker = new IntelligentChunker();

// Chunk documents (strategy auto-selected per document!)
const chunks = chunker.chunkDocuments(documents);

// Use chunks in RAG system
chunks.forEach(chunk => {
  console.log(`Chunk from ${chunk.metadata.fileName}`);
  console.log(`  Strategy: ${chunk.metadata.chunkStrategy}`);
  console.log(`  Type: ${chunk.metadata.documentType}`);
  console.log(`  Page: ${chunk.metadata.pageNumber}`);
  console.log(`  Quality: ${chunk.metadata.qualityScore}`);
});
```

### Integration with File Parser

```typescript
import { DHFAwareParser } from '@fda-compliance/file-parser';
import { IntelligentChunker } from '@fda-compliance/chunker';

// Step 1: Parse documents (with enhanced metadata)
const parser = new DHFAwareParser();
const documents = await parser.scanAndParseFolder('./dhf');

// Step 2: Chunk intelligently
const chunker = new IntelligentChunker();
const chunks = chunker.chunkDocuments(documents);

// Step 3: Store in vector DB
await vectorDB.insert(chunks);
```

## Chunking Strategies

The chunker automatically selects from these strategies:

### 1. **OCR Low Confidence** (2000 tokens, 400 overlap)
**When**: OCR confidence < 70%
**Why**: Larger chunks provide more context to overcome OCR errors
**Example**: Scanned historical documents

### 2. **OCR Standard** (1500 tokens, 300 overlap)
**When**: OCR confidence ≥ 70%
**Why**: Moderate chunks with good overlap for OCR text
**Example**: Modern scanned documents

### 3. **Risk Analysis** (1000 tokens, 100 overlap)
**When**: Document type = "risk-analysis"
**Why**: Chunks align with FMEA rows/risk entries
**Example**: FMEA reports, hazard analyses
**Preserves**: Risk IDs (RISK-HAZ-001, etc.)

### 4. **Requirements** (1200 tokens, 150 overlap)
**When**: Document type = "design-input" or "design-output"
**Why**: Chunks align with requirement statements
**Example**: Requirements specifications
**Preserves**: Requirement IDs (REQ-001, etc.)

### 5. **Test Document** (1000 tokens, 100 overlap)
**When**: Document type = "test-protocol" or "test-report"
**Why**: Chunks align with test cases
**Example**: Test protocols, validation reports
**Preserves**: Test case IDs (TC-001, etc.)

### 6. **Section-Based** (2000 tokens, 200 overlap)
**When**: Document has ≥3 sections
**Why**: Respects document structure (headings)
**Example**: Well-structured specifications

### 7. **Search-Optimized** (600 tokens, 100 overlap)
**When**: PDF with >50 pages
**Why**: Smaller chunks for precise retrieval
**Example**: Large technical manuals

### 8. **Semantic Default** (1000 tokens, 100 overlap)
**When**: None of the above conditions met
**Why**: General-purpose semantic chunking
**Example**: Generic documents

## Strategy Selection Logic

```typescript
// Pseudo-code showing decision tree
if (doc.metadata.isOCRExtracted) {
  if (doc.metadata.ocrConfidence < 0.7) {
    return OCR_LOW_CONFIDENCE;  // Large chunks, high overlap
  }
  return OCR_STANDARD;
}

if (doc.metadata.documentType === 'risk-analysis') {
  return RISK_ANALYSIS;  // Chunk by risk entries
}

if (doc.metadata.documentType in ['design-input', 'design-output']) {
  return REQUIREMENTS;  // Chunk by requirements
}

if (doc.metadata.documentType in ['test-protocol', 'test-report']) {
  return TEST_DOCUMENT;  // Chunk by test cases
}

if (doc.metadata.sections && doc.metadata.sections.length > 3) {
  return SECTION_BASED;  // Chunk by sections
}

if (doc.mimeType === 'pdf' && doc.metadata.pageCount > 50) {
  return SEARCH_OPTIMIZED;  // Small chunks for large docs
}

return SEMANTIC_DEFAULT;  // Generic chunking
```

## Metadata Flow

### Input (from File Parser)
```typescript
interface ParsedDocument {
  id: string;
  filePath: string;
  fileName: string;
  content: string;
  mimeType: string;
  metadata: {
    // Document classification
    documentType?: string;
    phase?: string;
    category?: string;
    
    // Structure
    sections?: Section[];
    pageBreaks?: PageBreak[];
    
    // Quality
    isOCRExtracted?: boolean;
    ocrQuality?: { averageConfidence: number };
    conversionQuality?: { score: number };
    
    // Structured data
    requirementIds?: string[];
    riskIds?: string[];
    testCaseIds?: string[];
    standards?: string[];
  }
}
```

### Output (to Vector DB / RAG)
```typescript
interface EnhancedChunk {
  docId: string;
  partId: number;
  chunk: string;  // The actual text
  metadata: {
    // All input metadata PLUS:
    
    // Position
    pageNumber?: number;
    section?: string;
    chunkIndex: number;
    totalParts: number;
    
    // Chunking info
    chunkStrategy: string;
    tokenCount: number;
    charCount: number;
    
    // Filtered IDs (only IDs in THIS chunk)
    requirementIds?: string[];
    riskIds?: string[];
  }
}
```

## Advanced Usage

### Custom Strategy Selection

```typescript
// You can extend IntelligentChunker for custom logic
class CustomChunker extends IntelligentChunker {
  protected selectStrategy(doc: ParsedDocument): ChunkingStrategy {
    // Your custom logic
    if (doc.fileName.includes('critical')) {
      return {
        name: 'Critical Document',
        maxTokens: 500,  // Smaller, more precise chunks
        overlapTokens: 150,
        splitters: ['\n\n', '\n', '. '],
        preserveStructure: true
      };
    }
    
    // Fall back to intelligent selection
    return super.selectStrategy(doc);
  }
}
```

### Filtering Chunks by Metadata

```typescript
const chunks = chunker.chunkDocuments(documents);

// Filter for high-quality chunks only
const highQuality = chunks.filter(c => 
  !c.metadata.isOCRExtracted && 
  (c.metadata.qualityScore || 1) > 0.8
);

// Filter for specific document type
const riskChunks = chunks.filter(c => 
  c.metadata.documentType === 'risk-analysis'
);

// Filter for chunks with specific requirements
const safetyReqs = chunks.filter(c =>
  c.metadata.requirementIds?.some(id => id.startsWith('REQ-SAFE-'))
);

// Filter by phase
const designPhase = chunks.filter(c =>
  c.metadata.phase === 'design'
);
```

### Using Metadata in RAG Queries

```typescript
// Query with metadata filters
const query = "What are the safety requirements?";

// Retrieve chunks with metadata filtering
const relevantChunks = await vectorDB.search(query, {
  topK: 10,
  filter: {
    documentType: 'design-input',
    category: 'requirements',
    qualityScore: { $gte: 0.8 },
    isOCRExtracted: false
  }
});

// Build context for LLM with citation info
const context = relevantChunks.map(chunk => `
[Source: ${chunk.metadata.fileName}, Page ${chunk.metadata.pageNumber}, Section: ${chunk.metadata.section}]
${chunk.chunk}
`).join('\n\n');

// Send to LLM with rich context
const response = await llm.generate({
  prompt: `Context:\n${context}\n\nQuestion: ${query}`,
  ...
});
```

## Testing

Run the comprehensive test suite:

```bash
npm run build
npm test
```

This will test:
- Risk analysis document chunking
- Requirements document chunking
- OCR document chunking (low confidence)
- Large structured PDF chunking
- Batch processing
- Metadata enrichment

## Performance Characteristics

| Strategy | Avg Chunk Size | Overlap | Best For |
|----------|---------------|---------|----------|
| OCR Low Conf | 2000 tokens | 400 | Poor quality scans |
| OCR Standard | 1500 tokens | 300 | Good quality scans |
| Risk Analysis | 1000 tokens | 100 | FMEA documents |
| Requirements | 1200 tokens | 150 | Specs, requirements |
| Test Docs | 1000 tokens | 100 | Test protocols |
| Section-Based | 2000 tokens | 200 | Structured docs |
| Search-Optimized | 600 tokens | 100 | Large PDFs |
| Semantic Default | 1000 tokens | 100 | Generic docs |

## Best Practices

### 1. **Use Enhanced Parser First**
Always use `DHFAwareParser` instead of basic parser to get rich metadata:
```typescript
// ✅ GOOD
const parser = new DHFAwareParser();
const docs = await parser.scanAndParseFolder('./dhf');
const chunks = chunker.chunkDocuments(docs);

// ❌ SUBOPTIMAL
const parser = new ComprehensiveFileParser();  // Missing DHF metadata
const docs = await parser.scanAndParseFolder('./dhf');
const chunks = chunker.chunkDocuments(docs);  // Generic chunking
```

### 2. **Leverage Metadata for Filtering**
Don't just search semantically - use metadata filters:
```typescript
// Filter by quality before semantic search
const qualityChunks = chunks.filter(c => c.metadata.qualityScore > 0.8);
await vectorDB.insert(qualityChunks);

// Or store all, filter at query time
const results = await vectorDB.search(query, {
  filter: { qualityScore: { $gt: 0.8 } }
});
```

### 3. **Use Chunk Metadata for Citations**
Enable full traceability in LLM responses:
```typescript
const chunk = retrievedChunks[0];
const citation = `According to ${chunk.metadata.fileName} ` +
                `(page ${chunk.metadata.pageNumber}, ` +
                `section "${chunk.metadata.section}"), ` +
                `requirement ${chunk.metadata.requirementIds[0]} states...`;
```

### 4. **Monitor Strategy Distribution**
Track which strategies are being used:
```typescript
const strategyCount = {};
chunks.forEach(c => {
  strategyCount[c.metadata.chunkStrategy] = 
    (strategyCount[c.metadata.chunkStrategy] || 0) + 1;
});
console.log('Strategy distribution:', strategyCount);
```

### 5. **Adjust for Your Use Case**
If you need different behavior, extend the chunker:
```typescript
class MyCustomChunker extends IntelligentChunker {
  // Override strategy selection or chunking logic
}
```

## Comparison: Before vs After

### Before (MockChunker)
```typescript
// Fixed 200-character chunks
// No strategy selection
// Minimal metadata
{
  docId: "doc-001",
  partId: 1,
  chunk: "...",
  metadata: {
    fileName: "design_spec.pdf",
    totalParts: 50,
    chunkIndex: 0
  }
}
```

### After (IntelligentChunker)
```typescript
// Adaptive token-based chunks
// Intelligent strategy per document
// Rich metadata for filtering & citation
{
  docId: "doc-001",
  partId: 1,
  chunk: "...",
  metadata: {
    // Basic
    fileName: "design_spec.pdf",
    totalParts: 25,
    chunkIndex: 0,
    
    // Classification
    documentType: "design-output",
    phase: "design",
    category: "specifications",
    
    // Position (for citations!)
    pageNumber: 5,
    section: "2.1 Safety Requirements",
    
    // Structured data (for filtering!)
    requirementIds: ["REQ-001"],
    standards: ["ISO 13485"],
    
    // Quality (for ranking!)
    qualityScore: 0.95,
    
    // Chunking
    chunkStrategy: "Requirements Document",
    tokenCount: 512
  }
}
```

## Troubleshooting

### Chunks Too Large
- Check if OCR confidence is low (triggers larger chunks)
- Document type may trigger larger strategy
- Adjust strategy maxTokens if needed

### Chunks Too Small
- Large documents trigger search-optimized strategy
- Override with custom strategy if needed

### Missing Metadata
- Ensure using `DHFAwareParser` not basic parser
- Check that parser is extracting document type correctly

### Poor Chunk Boundaries
- Verify document has clear structure (sections, paragraphs)
- For unstructured text, semantic default will do its best
- Consider preprocessing to add structure

## Future Enhancements

Potential additions:
- [ ] Parallel processing for large batches
- [ ] Chunk quality scoring
- [ ] Automatic strategy tuning based on retrieval performance
- [ ] Multi-language support
- [ ] Custom splitter patterns per document type
- [ ] Chunk merging for very small sections
- [ ] Hierarchical chunking (parent/child relationships)

## License

See project license file.

## Contributing

To add new chunking strategies:
1. Add strategy to `strategies` Map in constructor
2. Add selection logic in `selectStrategy()`
3. Test with sample documents
4. Update documentation

## Support

For issues or questions, refer to the main project documentation or create an issue in the project repository.
