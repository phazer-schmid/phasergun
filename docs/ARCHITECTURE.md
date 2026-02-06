# PhaserGun System Architecture

## Overview

**PhaserGun** is an AI-Driven DHF (Design History File) Documentation Engine designed specifically for FDA 510(k) submissions. It combines Retrieval-Augmented Generation (RAG) with multi-provider LLM support to generate compliant medical device documentation from company procedures, project context, and regulatory knowledge.

### Key Capabilities
- **Intelligent Context Retrieval**: Semantic search across SOPs and project documentation
- **Multi-Source Knowledge**: Integrates procedures, regulatory standards, and project-specific context
- **Citation Tracking**: Automatic source attribution with footnote generation
- **Cache-Optimized**: Persistent vector embeddings for fast retrieval
- **Provider-Agnostic**: Supports Anthropic, Mistral, Groq, Ollama, or mock LLMs

---

## Monorepo Structure

PhaserGun uses an npm workspaces monorepo with packages under `src/` and `vue-ui/`:

### Backend Packages (`src/`)

#### **1. `src/api-server/`**
**Purpose**: Express REST API server providing generation, file listing, and health check endpoints.

- **Routes**:
  - `POST /api/generate` - Generate DHF content from prompts with RAG context
  - `POST /api/list-files` - List files/directories for UI (Procedures, Context, Prompts)
  - `GET /api/health` - Health check with LLM and RAG status
- **Responsibilities**: HTTP server, request validation, orchestrator coordination, LLM provider selection
- **Environment**: Reads `.env` for LLM keys, PORT, CACHE_ENABLED, PRIMARY_CONTEXT_PATH

#### **2. `src/orchestrator/`**
**Purpose**: Coordinates the complete generation workflow per primary-context.yaml specifications.

- **Core Logic**:
  1. Parse reference notation from prompts (`[Procedure|...]`, `[Master Record|...]`, `[Context|...|...]`)
  2. Retrieve relevant context via RAG service (semantic search on procedures and context files)
  3. Track sources with FootnoteTracker for citation generation
  4. Build LLM prompt with RAG context + enforcement rules
  5. Generate content via LLM service
  6. Append footnotes and build response with confidence rating
- **Workflow Steps**: Reference parsing → RAG retrieval → Source tracking → Prompt assembly → LLM generation → Footnote appending → Confidence calculation

#### **3. `src/rag-service/`**
**Purpose**: Enhanced Retrieval-Augmented Generation with vector store, embeddings, caching, and semantic search.

- **Components**:
  - **EnhancedRAGService**: Main service coordinating cache, vector store, and retrieval
  - **VectorStore**: In-memory vector database with JSON persistence and cosine similarity search
  - **EmbeddingService**: Local embeddings via Xenova/all-MiniLM-L6-v2 (384-dim, no API calls)
  - **GenerationEngine**: Parses Project-Master-Record.docx into structured sections/fields
  - **FootnoteTracker**: Tracks source citations and generates footnote sections
  - **LockManager**: File-based locks for cross-process cache coordination
- **Knowledge Sources**:
  - **Primary Context**: `primary-context.yaml` (static rules and regulatory framework)
  - **Procedures**: Files in `[ProjectPath]/Procedures/` (SOPs, quality plans)
  - **Context**: Files in `[ProjectPath]/Context/` subfolders (Initiation, Ongoing, Predicates, Regulatory Strategy, General)
  - **Prompt Folder**: `[ProjectPath]/Context/Prompt/` (never cached, parsed on-demand)

#### **4. `src/llm-service/`**
**Purpose**: Multi-provider LLM interface for text generation.

- **Supported Providers**:
  - **Anthropic**: Claude models (Sonnet 4, 3.5 Sonnet, Haiku)
  - **Mistral**: Mistral AI models (Small, Medium, Large)
  - **Groq**: LPU inference (Llama 3.1, Mixtral)
  - **Ollama**: Local inference (Llama, other open models)
  - **Mock**: Test mode with simulated responses
- **Provider Selection**: Controlled by `LLM_MODE` environment variable
- **Interface**: Unified `LLMService` interface with `generateText(prompt, context?)` method

#### **5. `src/file-parser/`**
**Purpose**: Comprehensive document parser supporting multiple formats.

- **Supported Formats**:
  - **Documents**: PDF, DOCX, DOC, PPTX, PPT
  - **Text**: TXT, MD, CSV
  - **Images**: PNG, JPG, GIF, BMP, TIFF, WEBP (with OCR via Tesseract.js)
- **Features**: Metadata extraction, recursive folder scanning, text extraction with formatting preservation
- **Libraries**: mammoth (DOCX), pdf-parse (PDF), officeparser (Office files), tesseract.js (OCR), sharp (image processing)

#### **6. `src/file-source/`**
**Purpose**: File system operations and utilities.

- Provides file access abstractions and utilities for workspace packages

#### **7. `src/chunker/`**
**Purpose**: Document chunking utilities (mostly integrated into RAG service now).

- Section-aware chunking for procedures (preserves document structure)
- Paragraph-based chunking with overlap for context files

#### **8. `src/shared-types/`**
**Purpose**: TypeScript type definitions shared across all packages.

- **Key Types**:
  - `ParsedDocument` - Extracted document with content and metadata
  - `GenerationInput` - Request structure for generation endpoint
  - `GenerationOutput` - Response structure with generated content, references, confidence
  - `KnowledgeContext` - RAG context with retrieved chunks and metadata
  - `LLMResponse` - LLM output with usage statistics

---

### Frontend Package

#### **`vue-ui/`**
**Purpose**: Vue 3 frontend for project management and document generation.

- **Features**:
  - Project list/create/edit with local folder paths
  - Prompt file selection and preview
  - Generation interface with real-time progress
  - Response viewer with generated content and source citations
  - File browser for Context/Procedures/Prompts folders
- **Tech Stack**: Vue 3, TypeScript, Vite, Tailwind CSS, Vue Router
- **API Integration**: Calls `/api/generate`, `/api/list-files`, `/api/health`

---

## Generation Workflow (End-to-End)

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER INTERACTION                             │
│  User selects project → chooses prompt file → clicks Generate       │
└───────────────────────────────────┬─────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        API SERVER (/api/generate)                    │
│  • Validates request (projectPath, promptFilePath)                   │
│  • Reads prompt file (.txt, .md, or .docx)                          │
│  • Selects LLM provider based on LLM_MODE env var                   │
│  • Initializes EnhancedRAGService and LLM service                   │
└───────────────────────────────────┬─────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    ORCHESTRATOR (generateFromPrompt)                 │
│  Step 1: Parse reference notation from prompt                       │
│    • Extract [Procedure|category] patterns                          │
│    • Extract [Master Record|field] patterns                         │
│    • Extract [Context|folder|filename] patterns                     │
│                                                                      │
│  Step 2: Retrieve relevant context via RAG                          │
│    • Call enhancedRAGService.retrieveRelevantContext()              │
│    • Semantic search finds top-K procedure and context chunks       │
│                                                                      │
│  Step 3: Initialize FootnoteTracker                                 │
│    • Track all retrieved source documents                           │
│    • Assign citation numbers [1], [2], [3]...                       │
│    • Add regulatory standards mentioned in prompt                   │
│                                                                      │
│  Step 4: Build LLM prompt                                           │
│    • Assemble RAG context + user prompt + enforcement rules         │
│                                                                      │
│  Step 5: Generate via LLM                                           │
│    • Call llmService.generateText(fullPrompt)                       │
│                                                                      │
│  Step 6: Append footnotes                                           │
│    • Generate citation list from FootnoteTracker                    │
│    • Append to generated text                                       │
│                                                                      │
│  Step 7: Calculate confidence rating                                │
│    • Assess source coverage, completeness, token usage              │
│                                                                      │
│  Step 8: Return GenerationOutput                                    │
│    • status, generatedContent, references, confidence, metadata     │
└───────────────────────────────────┬─────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         RAG SERVICE (Retrieval)                      │
│  Cache Check:                                                        │
│    • Compute fingerprint (SHA-256 of file paths+sizes+mtimes)       │
│    • Check memory cache → Check disk cache                          │
│    • If valid: Load vector-store.json (~100-200ms)                  │
│    • If invalid: Rebuild cache (parse, chunk, embed, save)          │
│                                                                      │
│  Document Processing (if cache rebuild needed):                     │
│    1. Load primary-context.yaml                                     │
│    2. Scan Procedures/ folder                                       │
│    3. Scan Context/ subfolders (Initiation, Ongoing, etc.)          │
│    4. Parse documents (PDF, DOCX, etc.)                             │
│    5. Chunk documents:                                              │
│       - Procedures: Section-aware (preserves structure)             │
│       - Context: Paragraph-based with overlap                       │
│    6. Generate embeddings (Xenova/all-MiniLM-L6-v2)                 │
│    7. Store in vector store                                         │
│    8. Generate extractive summaries (first 250 words)               │
│    9. Save to disk: vector-store.json, sop-summaries.json, etc.     │
│                                                                      │
│  Semantic Search:                                                   │
│    1. Embed query text (prompt)                                     │
│    2. Compute cosine similarity with all vectors                    │
│    3. Sort by similarity, return top-K chunks                       │
│    4. Separate by category (procedure vs context)                   │
│                                                                      │
│  Context Assembly:                                                  │
│    • TIER 1: Role & Behavioral Instructions                         │
│    • TIER 2: Reference Materials (summaries + detailed chunks)      │
│    • Return to orchestrator for prompt building                     │
└───────────────────────────────────┬─────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        LLM SERVICE (Generation)                      │
│  • Send full prompt to selected provider                            │
│  • Receive generated text + usage stats                             │
│  • Return LLMResponse to orchestrator                               │
└───────────────────────────────────┬─────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      RESPONSE TO CLIENT                              │
│  {                                                                   │
│    status: 'complete',                                              │
│    generatedContent: '...[1] ...[2] ...\n\n## Sources\n[1] ...',   │
│    references: [...],                                               │
│    confidence: { level: 'High', rationale: '...', criteria: {...} },│
│    discrepancies: [],                                               │
│    usageStats: { tokensUsed: 5000, cost: 0.05 },                   │
│    metadata: { sources: [...], footnotes: [...] }                   │
│  }                                                                   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Knowledge Sources

PhaserGun retrieves context from multiple knowledge sources:

### 1. **Master Record** (Primary Reference)
- **Location**: `[ProjectPath]/Context/Project-Master-Record.docx`
- **Purpose**: Living document with key project and product information
- **Source**: Customer questionnaire at project start
- **Retrieval Priority**: Primary
- **Usage**: Referenced via `[Master Record|field_name]` notation

### 2. **Compliance** (Regulatory Standards)
- **Location**: LLM Model (built-in knowledge)
- **Standards**:
  - FDA 21 CFR Part 820.30 (Design Controls)
  - FDA 21 CFR Part 807 (510(k) Substantial Equivalence)
  - ISO 13485 (Quality Management Systems)
  - ISO 14971 (Risk Management)
- **Retrieval Priority**: Mandatory
- **Usage**: All generated content must comply with these standards

### 3. **Procedures** (Company SOPs)
- **Location**: `[ProjectPath]/Procedures/`
- **Types**: SOPs, Quality Plans, Quality Assurance Plans
- **Categories**: Quality Manual, Design Control, Risk Management, Document Control, Production Process, Quality Records
- **Retrieval Priority**: High
- **Usage**: Referenced via `[Procedure|category_name]` notation

### 4. **Regulatory Strategy** (On-Demand)
- **Location**: `[ProjectPath]/Context/Regulatory Strategy/`
- **Content**: Predicate devices, regulatory strategy documents
- **Retrieval Priority**: On-demand (only when explicitly referenced)
- **Usage**: Referenced via `[Context|Regulatory Strategy|filename]`

### 5. **General Context** (On-Demand)
- **Location**: `[ProjectPath]/Context/General/`
- **Content**: Additional reference materials
- **Retrieval Priority**: On-demand
- **Usage**: Referenced via `[Context|General|filename]`

### 6. **Project Context** (Structured)
- **Initiation**: `[ProjectPath]/Context/Initiation/` - Initial project documents
- **Ongoing**: `[ProjectPath]/Context/Ongoing/` - Ongoing project materials
- **Predicates**: `[ProjectPath]/Context/Predicates/` - Predicate device analysis

---

## Reference Notation

PhaserGun uses bracket syntax in prompts to explicitly request specific sources:

| Pattern | Format | Example | Behavior |
|---------|--------|---------|----------|
| **Procedure** | `[Procedure\|{category}]` | `[Procedure\|Design Control Procedure]` | Retrieves and cites SOP by category name |
| **Master Record** | `[Master Record\|{field}]` | `[Master Record\|DEVICE_NAME]` | Extracts specific field from master record |
| **Context** | `[Context\|{folder}\|{filename}]` | `[Context\|Regulatory Strategy\|predicate.docx]` | Retrieves specific document from context folder |

**Output**: PhaserGun cites the source file name and section used in footnotes.

---

## Data Flow Diagram

```
                    ┌──────────────────────┐
                    │    Vue UI Frontend   │
                    │   (Project Manager)  │
                    └──────────┬───────────┘
                               │ HTTP
                               ▼
                    ┌──────────────────────┐
                    │    API Server        │
                    │   (Express + Routes) │
                    └──────────┬───────────┘
                               │
                ┌──────────────┼──────────────┐
                ▼              ▼              ▼
        ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
        │ Orchestrator │ │  File Parser │ │ LLM Service  │
        │   Service    │ │   (Parse)    │ │ (Generate)   │
        └──────┬───────┘ └──────────────┘ └──────────────┘
               │
               ▼
        ┌──────────────────────────────────────────────┐
        │          RAG Service                         │
        │  ┌─────────────┐  ┌──────────────┐          │
        │  │ Vector Store│  │  Embedding   │          │
        │  │  (Search)   │  │   Service    │          │
        │  └─────────────┘  └──────────────┘          │
        │  ┌─────────────┐  ┌──────────────┐          │
        │  │ Generation  │  │  Footnote    │          │
        │  │   Engine    │  │   Tracker    │          │
        │  └─────────────┘  └──────────────┘          │
        └──────────────┬───────────────────────────────┘
                       │
                       ▼
        ┌──────────────────────────────────┐
        │  File System (Cache + Projects)  │
        │  • $TMPDIR/phasergun-cache/      │
        │  • [ProjectPath]/Procedures/     │
        │  • [ProjectPath]/Context/        │
        └──────────────────────────────────┘
```

---

## Environment Variables

Configuration is managed via `.env` files in `src/api-server/` and `vue-ui/`:

### API Server (`src/api-server/.env`)

```bash
# Server Configuration
PORT=3001

# LLM Configuration
LLM_MODE=anthropic
# Options: anthropic, mistral, groq, ollama, mock

# Anthropic API
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-4-20250514

# Mistral API (optional)
MISTRAL_API_KEY=...
MISTRAL_MODEL=mistral-small-latest

# Groq API (optional)
GROQ_API_KEY=...
GROQ_MODEL=llama-3.1-8b-instant

# Ollama (optional)
OLLAMA_MODEL=llama3.1:70b
OLLAMA_BASE_URL=http://localhost:11434

# Primary Context Path (optional)
PRIMARY_CONTEXT_PATH=./src/rag-service/knowledge-base/context/primary-context.yaml

# Cache Configuration
CACHE_ENABLED=true
# Set to false to disable caching (slower but always fresh)
```

### Vue UI (`vue-ui/.env.local`)

```bash
# No environment variables required currently
# API URL is configured in vue-ui/src/config/api.ts
```

---

## Development Setup

### Quick Start

```bash
# 1. Install all dependencies
npm install

# 2. Build all packages
npm run build-packages

# 3. Configure environment
cp src/api-server/.env.template src/api-server/.env
# Edit .env and add your LLM API keys

# 4. Start development servers
npm run start-ui  # Vue UI dev server (localhost:5173)

# In another terminal:
pm2 start ecosystem.dev.config.js  # API server (localhost:3001)
```

### Run with pm2 (Development)

```bash
# Start both API and UI in dev mode with watch
pm2 start ecosystem.dev.config.js

# View logs
pm2 logs

# Stop all
pm2 stop all
```

### Run Directly (Development)

```bash
# Terminal 1: API Server
cd src/api-server
npm run dev  # Watches for changes, auto-restarts

# Terminal 2: Vue UI
cd vue-ui
npm run dev  # Vite dev server with HMR
```

---

## Production Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for complete production deployment instructions including:
- Building static assets
- nginx configuration
- pm2 process management
- SSL setup
- rclone synchronization
- Digital Ocean droplet setup

---

## Key Design Principles

1. **Monorepo with Workspaces**: All packages in one repo for easier development and type sharing
2. **TypeScript Throughout**: Full type safety across frontend and backend
3. **Cache-First Architecture**: Persistent vector embeddings avoid expensive re-processing
4. **Provider-Agnostic**: Easy to switch between LLM providers via environment variable
5. **Local Embeddings**: No external API calls for embeddings (privacy + cost savings)
6. **Semantic Search**: Vector similarity ensures most relevant context is retrieved
7. **Source Attribution**: Automatic footnote generation for regulatory compliance
8. **Concurrency-Safe**: Mutex + file locks prevent cache corruption during parallel requests
9. **Deterministic Caching**: Alphabetical sorting ensures consistent cache rebuilds

---

## Next Steps

- **For API details**: See [API.md](./API.md)
- **For cache system**: See [CACHE.md](./CACHE.md)
- **For RAG internals**: See [RAG_SERVICE.md](./RAG_SERVICE.md)
- **For deployment**: See [DEPLOYMENT.md](./DEPLOYMENT.md)
- **For file sync**: See [RCLONE.md](./RCLONE.md)
