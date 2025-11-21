# Architecture Documentation

## Overview

This application implements a decoupled, modular architecture for FDA 510(k) compliance analysis. The design emphasizes separation of concerns, testability, and flexibility for future enhancements.

## Design Principles

### 1. Interface-Driven Development
Every module exposes a TypeScript interface that serves as a contract. This allows:
- Easy mocking for testing
- Swapping implementations without affecting dependent code
- Clear API boundaries between modules

### 2. Single Responsibility
Each module has one clearly defined purpose:
- **UI Module**: User interaction only
- **Orchestrator**: Workflow coordination only
- **File Parser**: File system operations only
- **Chunker**: Text processing only
- **RAG Service**: Knowledge retrieval only
- **LLM Service**: AI model interaction only

### 3. Dependency Injection
The Orchestrator receives all its dependencies through constructor injection, making it:
- Testable with mocks
- Flexible for different implementations
- Independent of concrete classes

## Module Architecture

### Data Flow

```
User Input (UI)
    ↓
SourceFolderInput
    ↓
Orchestrator.runAnalysis()
    ↓
    ├─→ FileParser.scanAndParseFolder()
    │       ↓
    │   ParsedDocument[]
    │       ↓
    ├─→ Chunker.chunkDocuments()
    │       ↓
    │   ChunkedDocumentPart[]
    │       ↓
    ├─→ RAGService.retrieveContext()
    │       ↓
    │   KnowledgeContext
    │       ↓
    └─→ LLMService.generateText()
            ↓
        LLMResponse
            ↓
    AppStatusOutput
        ↓
OutputDisplay (UI)
```

### Module Descriptions

#### 1. UI Module

**Location**: `src/components/`

**Components**:
- `AppContainer.vue` - Main container, manages application state
- `InputForm.vue` - Handles folder path input and submission
- `OutputDisplay.vue` - Displays analysis results

**Responsibilities**:
- Capture user input
- Display processing status
- Show results
- Does NOT contain business logic

**Key Characteristic**: Only communicates with Orchestrator

#### 2. Orchestration Module

**Location**: `src/services/Orchestrator.ts`

**Interface**: `Orchestrator`

**Responsibilities**:
- Coordinates workflow execution
- Manages service lifecycle
- Error handling and recovery
- Does NOT implement business logic

**Key Methods**:
- `runAnalysis(input: SourceFolderInput): Promise<AppStatusOutput>`

#### 3. File Parser Module

**Location**: `src/services/MockFileParser.ts`

**Interface**: `FileParser`

**Responsibilities**:
- Scan directory recursively
- Read file contents
- Extract text from various formats (PDF, DOCX, TXT, images)
- Return structured document objects

**Key Methods**:
- `scanAndParseFolder(folderPath: string): Promise<ParsedDocument[]>`

**Current Status**: Mocked - returns sample documents

#### 4. Chunking Module

**Location**: `src/services/MockChunker.ts`

**Interface**: `Chunker`

**Responsibilities**:
- Break documents into smaller chunks
- Apply overlapping windows
- Preserve metadata
- Optimize chunk size for vector embedding

**Key Methods**:
- `chunkDocuments(docs: ParsedDocument[]): ChunkedDocumentPart[]`

**Current Status**: Mocked - creates 3 chunks per document

#### 5. RAG Service Module

**Location**: `src/services/MockRAGService.ts`

**Interface**: `RAGService`

**Responsibilities**:
- Initialize vector database
- Load static knowledge (thinking documents, regulatory docs)
- Retrieve relevant context for queries
- Manage embeddings

**Key Methods**:
- `initializeKnowledgeBase(): Promise<void>`
- `retrieveContext(query: string): Promise<KnowledgeContext>`

**Current Status**: Mocked - returns static regulatory snippets

#### 6. LLM Service Module

**Location**: `src/services/MockLLMService.ts`

**Interface**: `LLMService`

**Responsibilities**:
- Communicate with LLM APIs (Claude, Gemini, Ollama)
- Format prompts
- Parse responses
- Track usage/costs

**Key Methods**:
- `generateText(prompt: string, context?: KnowledgeContext): Promise<LLMResponse>`
- `assessDocument(doc: ChunkedDocumentPart[], guidelines: string): Promise<LLMResponse>`

**Current Status**: Mocked - returns success message

## Interface Contracts

### SourceFolderInput
```typescript
interface SourceFolderInput {
  folderPath: string;
}
```

### AppStatusOutput
```typescript
interface AppStatusOutput {
  status: 'processing' | 'complete' | 'error';
  message: string;
  detailedReport?: string;
  timestamp?: string;
}
```

### ParsedDocument
```typescript
interface ParsedDocument {
  id: string;
  filePath: string;
  fileName: string;
  content: string;
  mimeType: string;
  metadata?: Record<string, any>;
}
```

### ChunkedDocumentPart
```typescript
interface ChunkedDocumentPart {
  docId: string;
  partId: number;
  chunk: string;
  metadata?: Record<string, any>;
}
```

### KnowledgeContext
```typescript
interface KnowledgeContext {
  contextSnippets: string[];
  sourceMetadata: {
    sourceName: string;
    path: string;
  }[];
}
```

### LLMResponse
```typescript
interface LLMResponse {
  generatedText: string;
  usageStats: {
    tokensUsed: number;
    cost: number;
  };
}
```

## Testing Strategy

### Current POC Status
All non-UI modules are mocked, allowing full end-to-end workflow testing without external dependencies.

### Future Testing Approach

1. **Unit Tests**: Test each module independently with mocks for dependencies
2. **Integration Tests**: Test module interactions with real implementations
3. **E2E Tests**: Test complete workflow with real services

### Mock Advantages
- Fast development iteration
- No external service dependencies
- Predictable behavior for UI development
- Easy to simulate error conditions

## Technology Stack

- **Frontend Framework**: Vue 3 (Composition API)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Build Tool**: Vite
- **Type Checking**: vue-tsc

## Future Enhancements

### Module Replacement Roadmap

1. **Phase 1 - File Parser**
   - Implement real PDF parsing (pdf-parse, pdftotext)
   - Add DOCX support (mammoth, docx)
   - Add image OCR (tesseract.js)

2. **Phase 2 - Chunker**
   - Implement semantic chunking
   - Add configurable chunk sizes
   - Optimize for different document types

3. **Phase 3 - RAG Service**
   - Integrate vector database (ChromaDB, Pinecone)
   - Load thinking documents
   - Implement hybrid search

4. **Phase 4 - LLM Service**
   - Connect to Claude API
   - Add Ollama integration
   - Implement prompt templates

### Additional Features

- Authentication & user management
- Multi-project support
- Dashboard with phase visualization
- Document upload via UI
- Real-time analysis progress
- Export reports to PDF/DOCX
- Audit trail for compliance

## Architecture Benefits

1. **Modularity**: Each component can be developed/tested independently
2. **Flexibility**: Easy to swap implementations (e.g., switch vector DB or LLM provider)
3. **Testability**: Mocks enable comprehensive testing without external dependencies
4. **Scalability**: Clear boundaries make it easy to add new features
5. **Maintainability**: Single responsibility makes code easier to understand and modify

## Reference Architecture

This design is based on the comprehensive FDA 510(k) compliance system architecture documented in the "AI-driven RAG architecture" conversation, adapted for a proof-of-concept implementation with mocked services.
