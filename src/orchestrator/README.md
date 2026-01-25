# Orchestrator Service

The Orchestrator Service coordinates the complete FDA 510(k) compliance analysis workflow, integrating file parsing, document chunking, semantic retrieval, and LLM-based text generation.

## Overview

The orchestrator provides a high-level interface that manages the interaction between all system components:
- **File Parser**: Scans and parses DHF documents
- **Chunker**: Breaks documents into semantic chunks
- **Enhanced RAG Service**: Provides semantic search with vector embeddings
- **LLM Service**: Generates compliance analysis text

## Architecture

```
User Input
    ↓
Orchestrator Service
    ├─→ File Parser (scan documents)
    ├─→ Chunker (create semantic chunks)
    ├─→ Enhanced RAG Service (semantic retrieval)
    │   ├─→ Load knowledge base
    │   ├─→ Create vector embeddings
    │   └─→ Retrieve relevant context
    └─→ LLM Service (generate analysis)
        ↓
    Generated Report
```

## Installation

```bash
cd src/orchestrator
npm install
npm run build
```

## API

### OrchestratorService

#### Constructor

```typescript
constructor(
  fileParser: FileParser,
  chunker: Chunker,
  enhancedRAGService: EnhancedRAGService,
  llmService: LLMService
)
```

#### Methods

##### `runAnalysis(input: SourceFolderInput): Promise<AppStatusOutput>`

Runs complete end-to-end analysis on a DHF project folder.

**Parameters:**
- `input.folderPath` - Path to the project folder to analyze
- `input.sourceType` - Optional source type (defaults to 'local')

**Returns:**
```typescript
{
  status: 'complete' | 'error',
  message: string,
  detailedReport?: string,
  timestamp: string
}
```

**Example:**
```typescript
const orchestrator = new OrchestratorService(
  fileParser,
  chunker,
  enhancedRAGService,
  llmService
);

const result = await orchestrator.runAnalysis({
  folderPath: '/path/to/dhf/project'
});

console.log(result.detailedReport);
```

##### `generateFromPrompt(input): Promise<GenerationResult>`

Generates text for a specific prompt using semantic RAG retrieval.

**Parameters:**
```typescript
{
  projectPath: string,              // Path to project folder
  primaryContextPath: string,        // Path to primary context YAML
  prompt: string,                    // User's generation request
  options?: {
    topKProcedures?: number,        // Number of procedure chunks (default: 5)
    topKContext?: number            // Number of context chunks (default: 5)
  }
}
```

**Returns:**
```typescript
{
  generatedText: string,            // Generated content with footnotes appended
  sources: string[],                // Source file names
  footnotes: SourceReference[],     // Array of footnote objects
  footnotesMap: { [key: string]: SourceReference }, // Map for caching
  usageStats: {
    tokensUsed: number,
    cost?: number
  }
}
```

**Note:** The `generatedText` includes automatically appended footnotes citing all sources used during generation. The `footnotes` array and `footnotesMap` provide structured source data for rendering or caching.

**Example:**
```typescript
const result = await orchestrator.generateFromPrompt({
  projectPath: '/path/to/project',
  primaryContextPath: '/path/to/primary-context.yaml',
  prompt: 'Generate a risk analysis section for the device',
  options: {
    topKProcedures: 5,
    topKContext: 5
  }
});

console.log('Generated:', result.generatedText);
console.log('Sources:', result.sources);  // For footnote generation
console.log('Tokens used:', result.usageStats.tokensUsed);
```

## Workflow

### Analysis Workflow (`runAnalysis`)

1. **Parse Documents** - Scan and parse all files in project folder
2. **Chunk Documents** - Break into semantic chunks for processing
3. **Load Knowledge Base** - Load procedures, context files, and primary context
4. **Semantic Retrieval** - Retrieve relevant context using vector embeddings
5. **Generate Analysis** - Use LLM to generate compliance report

### Prompt-Based Generation (`generateFromPrompt`)

1. **Semantic Search** - Find relevant procedure and context chunks
2. **Assemble Context** - Combine primary context + retrieved chunks
3. **Generate** - Send to LLM with user prompt
4. **Return with Sources** - Include source files for footnote generation

## Testing

```bash
# Run orchestrator test
npm run test

# Test with specific folder
npm run test /path/to/test/project

# Build and test
npm run build && npm run test
```

### Test Output

```
╔═══════════════════════════════════════════════════════╗
║   FDA 510(k) Compliance Analysis - Orchestrator Test  ║
╚═══════════════════════════════════════════════════════╝

Test Input: /path/to/test-project

[Step 1/5] Calling File Parser Module...
✓ Parsed 2 documents

[Step 2/5] Calling Chunker Module...
✓ Created 2 chunks

[Step 3/5] Loading Knowledge Base...
✓ Knowledge base ready

[Step 4/5] Retrieving Knowledge Context with Semantic Search...
✓ Retrieved semantic context

[Step 5/5] Calling LLM Service Module...
✓ Generated response (1250 tokens used)

Status: COMPLETE
✓ Orchestration test PASSED - Analysis completed successfully
```

## Integration with Enhanced RAG

The orchestrator uses the Enhanced RAG Service for semantic retrieval:

- **Vector Embeddings**: Uses Xenova/all-MiniLM-L6-v2 for semantic search
- **Caching**: Automatically caches embeddings in `.phasergun-cache/`
- **Source Tracking**: Returns source files for UI footnote generation
- **Configurable Retrieval**: Control number of chunks retrieved

## Configuration

### Primary Context Path

The orchestrator automatically resolves the primary context file:

```typescript
// Default path (can be overridden with env var)
PRIMARY_CONTEXT_PATH=./src/rag-service/knowledge-base/context/primary-context.yaml
```

### LLM Provider

Configure via environment variables:

```bash
LLM_PROVIDER=anthropic  # or mistral, groq, ollama
ANTHROPIC_API_KEY=sk-...
```

## Error Handling

The orchestrator gracefully handles errors and returns structured error responses:

```typescript
{
  status: 'error',
  message: 'ENOENT: no such file or directory...',
  timestamp: '2026-01-25T02:35:00.306Z'
}
```

Common errors:
- **Missing project folder**: Ensure projectPath exists
- **Cache directory errors**: Check folder permissions
- **LLM API errors**: Verify API keys and provider configuration

## Development

### Mock Services

For testing without external dependencies:

```typescript
import { MockFileParser } from '@fda-compliance/file-parser';
import { MockChunker } from '@fda-compliance/chunker';
import { MockLLMService } from '@fda-compliance/llm-service';

const orchestrator = new OrchestratorService(
  new MockFileParser(),
  new MockChunker(),
  new EnhancedRAGService(),  // Real RAG service
  new MockLLMService()        // Mock LLM
);
```

## See Also

- [RAG Service README](../rag-service/README.md) - Semantic retrieval documentation
- [API Server README](../api-server/README.md) - REST API endpoints
- [File Parser README](../file-parser/README.md) - Document parsing
