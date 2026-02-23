# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

**PhaserGun** is a Regulatory Documentation Engine for FDA 510(k) submissions. It uses RAG (Retrieval-Augmented Generation) to generate compliant medical device documentation from company procedures, project context files, and regulatory knowledge. The system is not a general-purpose chatbot — it is purpose-built to produce traceable, citation-linked regulatory documents.

## Commands

### Setup
```bash
npm install              # Install all workspace dependencies
npm run build-packages   # Build all packages (must run after install)
```

### Running in Development
```bash
# Option A: pm2 (recommended — watches for changes)
pm2 start ecosystem.dev.config.js
pm2 logs
pm2 stop all

# Option B: manually in two terminals
cd src/api-server && npm run dev   # API server on :3001
cd vue-ui && npm run dev           # Vite UI on :5173
```

### Building Individual Packages
```bash
cd src/<package-name> && npm run build   # e.g., src/rag-core, src/llm-service
cd src/<package-name> && npm run dev     # Run via ts-node (no compile step)
```

### RAG Service Test Scripts (from `src/rag-service/`)
```bash
npm run test:embeddings
npm run test:vector-store
npm run test:chunking
npm run test:semantic-retrieval
npm run test:rag
```

## Architecture

### Monorepo Structure

All packages live under `src/` as npm workspaces scoped to `@phasergun/*`:

| Package | Scope | Purpose |
|---|---|---|
| `src/shared-types` | `@phasergun/shared-types` | TypeScript types shared across all packages |
| `src/rag-core` | `@phasergun/rag-core` | Core RAG infrastructure: embeddings (`@xenova/all-MiniLM-L6-v2`), vector store (in-memory + JSON persistence), chunking, cache management, file locking |
| `src/rag-service` | `@phasergun/rag-service` | High-level RAG orchestration: document loading, context assembly, footnote tracking. Wraps `rag-core` |
| `src/llm-service` | `@phasergun/llm-service` | Multi-provider LLM interface (Anthropic, Mistral, Groq, Ollama, Mock) |
| `src/orchestrator` | `@phasergun/orchestrator` | Coordinates full generation workflow: parse references → retrieve RAG context → build prompt → call LLM → append footnotes → return `GenerationOutput` |
| `src/api-server` | `@phasergun/api-server` | Express REST API (`:3001`) — entry point for generation requests |
| `src/file-parser` | `@phasergun/file-parser` | Document parsing for PDF, DOCX, TXT, MD, images (OCR via Tesseract.js) |
| `vue-ui` | — | Vue 3 + Vite + Tailwind CSS frontend |

### Package Dependency Chain

```
api-server → orchestrator → rag-service → rag-core → shared-types
                         → llm-service
                         → file-parser
```

`rag-core` is the lowest-level backend package. When primitives like embedding, vector store, chunking, or cache management need changes, edit `src/rag-core/src/`. The `rag-service` then uses these primitives via `@phasergun/rag-core`.

### Generation Workflow (End-to-End)

1. **API Server** (`src/api-server/src/routes/generate.ts`) receives `POST /api/generate` with `{projectPath, promptFilePath, options}`
2. **Orchestrator** (`src/orchestrator/src/index.ts`) runs `generateFromPrompt()`:
   - Parses bracket-notation references from the prompt: `[Procedure|…]`, `[Master Record|…]`, `[Context|…|…]`
   - Calls `EnhancedRAGService.retrieveRelevantContext()` with the parsed prompt
3. **RAG Service** (`src/rag-service/src/enhanced-rag-service.ts`):
   - Checks/builds vector cache (mutex + file lock protected for concurrency safety)
   - Embeds the prompt query and performs cosine similarity search
   - Applies retrieval policy: `Context/General/` and `Context/Regulatory Strategy/` are **excluded unless explicitly referenced** in the prompt
   - Assembles tiered context: role instructions → SOP summaries → relevant chunks
4. **Orchestrator** builds full LLM prompt and calls `LLMService.generateText()`
5. Returns `GenerationOutput` with `generatedContent`, `references`, `confidence`, and `metadata`

### Project Folder Convention

Every "project" the user creates has this expected structure on disk:
```
[ProjectPath]/
  Procedures/          # Company SOPs — always indexed
  Context/
    Initiation/        # Always indexed
    Ongoing/           # Always indexed
    Predicates/        # Always indexed
    Regulatory Strategy/  # On-demand only (requires [Context|Regulatory Strategy|…] in prompt)
    General/           # On-demand only (requires [Context|General|…] in prompt)
    Prompt/            # Prompt files — never cached, parsed on-demand
    Project-Master-Record.docx   # Referenced via [Master Record|field]
    Project-Master-Checklist.docx  # Referenced via [Master Checklist]
```

### Cache System

Vector embeddings are cached to `$TMPDIR/phasergun-cache/` keyed by a SHA-256 fingerprint of all file paths, sizes, and mtimes. Cache is invalidated automatically when source files change. The `CACHE_ENABLED=false` env var disables caching (forces fresh processing on every request).

### Reference Notation in Prompts

Prompts use bracket syntax to request specific sources:
- `[Procedure|Design Control Procedure]` — boosts retrieval of SOPs matching that category
- `[Master Record|DEVICE_NAME]` — extracts a specific field from the master record
- `[Context|Regulatory Strategy|predicate.docx]` — retrieves a specific on-demand document
- `[Master Checklist]` — includes the full Project-Master-Checklist.docx

### LLM Provider Selection

Controlled by `LLM_MODE` in `src/api-server/.env`. Valid values: `anthropic`, `mistral`, `groq`, `ollama`, `mock`. The `mock` provider requires no API keys and is useful for development.

## Environment Configuration

Copy `src/api-server/.env.template` to `src/api-server/.env` and set:
```bash
PORT=3001
LLM_MODE=anthropic          # or mistral, groq, ollama, mock
ANTHROPIC_API_KEY=sk-ant-…
ANTHROPIC_MODEL=claude-sonnet-4-20250514
CACHE_ENABLED=true
```

## Key Architectural Decisions

- **`rag-core` vs `rag-service`**: `rag-core` holds pure infrastructure (no project-specific logic). `rag-service` holds PhaserGun-specific document loading patterns and context assembly. When refactoring, keep project-agnostic primitives in `rag-core`.
- **Concurrency**: Cache builds use a global in-process `Mutex` (async-mutex) combined with cross-process file locks (proper-lockfile) to prevent cache corruption under concurrent requests.
- **Local embeddings**: `@xenova/transformers` runs `all-MiniLM-L6-v2` locally (384-dim). No external embedding API calls.
- **On-demand filtering**: `Context/General/` and `Context/Regulatory Strategy/` are only retrieved when explicitly referenced in prompts. This is enforced in `enhanced-rag-service.ts:retrieveRelevantContext()`.
- **After build**: All packages compile to `dist/`. The API server runs `dist/index.js` in production and `ts-node src/index.ts` in dev. When adding a new package, you must run `npm run build-packages` before the API server can import it.
