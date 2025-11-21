# Architecture Visual Diagram

## High-Level System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER INTERFACE LAYER                         │
│                           (Vue 3 + Tailwind)                         │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                      AppContainer.vue                         │  │
│  │  • Application state management                               │  │
│  │  • Service initialization                                     │  │
│  │  • Error boundary                                            │  │
│  │                                                               │  │
│  │  ┌─────────────────┐              ┌─────────────────┐       │  │
│  │  │  InputForm.vue  │              │OutputDisplay.vue│       │  │
│  │  │                 │              │                 │       │  │
│  │  │  • Folder path  │              │  • Status       │       │  │
│  │  │  • Submit btn   │              │  • Message      │       │  │
│  │  │  • Validation   │              │  • Report       │       │  │
│  │  └────────┬────────┘              └────────▲────────┘       │  │
│  └───────────┼──────────────────────────────────┼──────────────┘  │
└──────────────┼──────────────────────────────────┼─────────────────┘
               │                                   │
               │ SourceFolderInput                 │ AppStatusOutput
               ▼                                   │
┌─────────────────────────────────────────────────┴────────────────────┐
│                     ORCHESTRATION LAYER                               │
│                       (OrchestratorService)                           │
│                                                                       │
│  runAnalysis(input: SourceFolderInput): Promise<AppStatusOutput>    │
│                                                                       │
│  Coordinates execution flow:                                         │
│  1. Parse documents                                                  │
│  2. Chunk content                                                    │
│  3. Initialize RAG                                                   │
│  4. Retrieve context                                                 │
│  5. Generate LLM response                                            │
│  6. Return formatted output                                          │
│                                                                       │
└──┬────────┬────────┬────────┬─────────────────────────────────────┘
   │        │        │        │
   │        │        │        └──────────────────┐
   │        │        │                           │
   │        │        └─────────────┐             │
   │        │                      │             │
   │        └────────┐             │             │
   │                 │             │             │
   │                 │             │             │
   ▼                 ▼             ▼             ▼
┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│  FILE    │  │ CHUNKING │  │   RAG    │  │   LLM    │
│  PARSER  │  │  MODULE  │  │ SERVICE  │  │ SERVICE  │
│          │  │          │  │          │  │          │
│ (Mocked) │  │ (Mocked) │  │ (Mocked) │  │ (Mocked) │
└──────────┘  └──────────┘  └──────────┘  └──────────┘
```

## Detailed Data Flow Diagram

```
START: User enters folder path
  │
  ▼
┌─────────────────────────────────────┐
│ InputForm.vue                       │
│ • Captures: /path/to/folder         │
│ • Validates: non-empty string       │
│ • Emits: @submit event              │
└────────────────┬────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────┐
│ AppContainer.vue                    │
│ • Receives folder path              │
│ • Sets status: 'processing'         │
│ • Calls: orchestrator.runAnalysis() │
└────────────────┬────────────────────┘
                 │
                 ▼
       ╔═════════════════════════╗
       ║  OrchestratorService    ║
       ║  runAnalysis()          ║
       ╚═════════════════════════╝
                 │
    ┌────────────┴────────────┐
    │                         │
    ▼                         │
┌─────────────────────────┐  │
│ Step 1: File Parser     │  │
│                         │  │
│ Input:                  │  │
│   folderPath: string    │  │
│                         │  │
│ Output:                 │  │
│   ParsedDocument[]      │  │
│   ├─ id                 │  │
│   ├─ filePath           │  │
│   ├─ fileName           │  │
│   ├─ content            │  │
│   └─ mimeType           │  │
└────────────┬────────────┘  │
             │               │
             ▼               │
┌─────────────────────────┐  │
│ Step 2: Chunker         │  │
│                         │  │
│ Input:                  │  │
│   ParsedDocument[]      │  │
│                         │  │
│ Output:                 │  │
│   ChunkedDocumentPart[] │  │
│   ├─ docId              │  │
│   ├─ partId             │  │
│   ├─ chunk (text)       │  │
│   └─ metadata           │  │
└────────────┬────────────┘  │
             │               │
             ▼               │
┌─────────────────────────┐  │
│ Step 3: RAG Init        │  │
│                         │  │
│ Initializes:            │  │
│   • Vector database     │  │
│   • Thinking documents  │  │
│   • Regulatory docs     │  │
└────────────┬────────────┘  │
             │               │
             ▼               │
┌─────────────────────────┐  │
│ Step 4: Context         │  │
│         Retrieval       │  │
│                         │  │
│ Input:                  │  │
│   query: string         │  │
│                         │  │
│ Output:                 │  │
│   KnowledgeContext      │  │
│   ├─ contextSnippets[]  │  │
│   └─ sourceMetadata[]   │  │
└────────────┬────────────┘  │
             │               │
             ▼               │
┌─────────────────────────┐  │
│ Step 5: LLM Service     │  │
│                         │  │
│ Input:                  │  │
│   prompt: string        │  │
│   context: Knowledge    │  │
│                         │  │
│ Output:                 │  │
│   LLMResponse           │  │
│   ├─ generatedText      │  │
│   └─ usageStats         │  │
│       ├─ tokensUsed     │  │
│       └─ cost           │  │
└────────────┬────────────┘  │
             │               │
             ▼               │
       ╔═════════════════════╩═══╗
       ║  Orchestrator           ║
       ║  Formats Output         ║
       ╚═════════════════════════╝
                 │
                 ▼
┌─────────────────────────────────────┐
│ AppStatusOutput                     │
│ • status: 'complete'                │
│ • message: "Analysis completed..."  │
│ • detailedReport: "The app has..."  │
│ • timestamp: "2025-11-21..."        │
└────────────────┬────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────┐
│ OutputDisplay.vue                   │
│ • Shows status icon                 │
│ • Displays message                  │
│ • Shows detailed report             │
│ • Formats timestamp                 │
└─────────────────────────────────────┘
                 │
                 ▼
            USER SEES RESULTS
```

## Module Interaction Sequence

```
User Action: Click "Analyze Folder"
     │
     ├─> InputForm validates input
     │      └─> emits 'submit' event
     │
     ├─> AppContainer receives event
     │      ├─> Sets isProcessing = true
     │      ├─> Shows processing status
     │      └─> Calls orchestrator.runAnalysis()
     │
     └─> OrchestratorService coordinates:
            │
            ├─> [Call 1] FileParser.scanAndParseFolder()
            │      ├─ Simulates folder scan (300ms)
            │      └─ Returns 2 mock documents
            │
            ├─> [Call 2] Chunker.chunkDocuments()
            │      ├─ Creates 3 chunks per doc
            │      └─ Returns 6 chunks total
            │
            ├─> [Call 3] RAGService.initializeKnowledgeBase()
            │      ├─ Simulates DB init (200ms)
            │      └─ Sets initialized flag
            │
            ├─> [Call 4] RAGService.retrieveContext()
            │      ├─ Simulates query (400ms)
            │      └─ Returns 3 regulatory snippets
            │
            ├─> [Call 5] LLMService.generateText()
            │      ├─ Simulates API call (600ms)
            │      └─ Returns success message
            │
            └─> Formats AppStatusOutput
                   ├─ status: 'complete'
                   ├─ message: success
                   ├─ detailedReport: traversal confirmation
                   └─ timestamp: current time
                   │
                   └─> Returns to AppContainer
                          │
                          ├─> Sets isProcessing = false
                          └─> Updates analysisOutput
                                 │
                                 └─> OutputDisplay renders result
```

## Interface Dependencies

```
┌───────────────────────────────────────────────────────────┐
│                   TypeScript Interfaces                    │
└───────────────────────────────────────────────────────────┘

SourceFolderInput           (Used by: UI → Orchestrator)
    └─ folderPath: string

AppStatusOutput             (Used by: Orchestrator → UI)
    ├─ status: 'processing' | 'complete' | 'error'
    ├─ message: string
    ├─ detailedReport?: string
    └─ timestamp?: string

ParsedDocument              (Used by: FileParser → Orchestrator → Chunker)
    ├─ id: string
    ├─ filePath: string
    ├─ fileName: string
    ├─ content: string
    ├─ mimeType: string
    └─ metadata?: Record<string, any>

ChunkedDocumentPart        (Used by: Chunker → Orchestrator → LLMService)
    ├─ docId: string
    ├─ partId: number
    ├─ chunk: string
    └─ metadata?: Record<string, any>

KnowledgeContext           (Used by: RAGService → Orchestrator → LLMService)
    ├─ contextSnippets: string[]
    └─ sourceMetadata: Array<{
        sourceName: string,
        path: string
      }>

LLMResponse                (Used by: LLMService → Orchestrator)
    ├─ generatedText: string
    └─ usageStats: {
        tokensUsed: number,
        cost: number
      }
```

## Component Hierarchy

```
App.vue
  │
  └─ AppContainer.vue
        │
        ├─ InputForm.vue
        │    ├─ Props: isProcessing
        │    └─ Events: @submit
        │
        └─ OutputDisplay.vue
             └─ Props: output (AppStatusOutput | null)
```

## Service Instantiation

```
AppContainer.vue
  │
  ├─ Creates: OrchestratorService
  │    │
  │    ├─ Dependency: MockFileParser
  │    │    └─ Implements: FileParser interface
  │    │
  │    ├─ Dependency: MockChunker
  │    │    └─ Implements: Chunker interface
  │    │
  │    ├─ Dependency: MockRAGService
  │    │    └─ Implements: RAGService interface
  │    │
  │    └─ Dependency: MockLLMService
  │         └─ Implements: LLMService interface
  │
  └─ All services injected via constructor
       (Enables easy swapping with real implementations)
```

## Future Real Implementation

```
Replace Mocks One-by-One:

Phase 1:
  MockFileParser → RealFileParser
    └─ Adds: fs module, pdf-parse, mammoth

Phase 2:
  MockChunker → RealChunker
    └─ Adds: langchain text splitters

Phase 3:
  MockRAGService → RealRAGService
    └─ Adds: ChromaDB/Pinecone, embeddings

Phase 4:
  MockLLMService → RealLLMService
    └─ Adds: Anthropic SDK, Ollama client

All other code remains unchanged!
```

## Error Flow

```
Error Occurs in Any Module
  │
  ▼
Throws Error
  │
  ▼
Caught by Orchestrator try-catch
  │
  ▼
Returns AppStatusOutput
  ├─ status: 'error'
  ├─ message: error.message
  └─ timestamp: current time
  │
  ▼
OutputDisplay shows error state
  └─ Red error icon + message
```

---

This architecture ensures clean separation, easy testing, and straightforward evolution from POC to production.
