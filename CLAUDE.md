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
   - Calls `parseProcedureReferences()`, `parseKnowledgeSourceScopes()`, `parseBootstrapReferences()`, `parseDocFieldReferences()` from `reference-parser.ts`
   - Embeds the prompt query and performs cosine similarity search
   - Applies retrieval policy: `Context/General/`, `Context/Regulatory Strategy/`, `Procedures/QPs/`, `Procedures/QaPs/` are **excluded unless explicitly referenced** in the prompt
   - Assembles tiered context: role instructions (from `prompt-builder.ts`) → SOP summaries → relevant chunks
4. **Orchestrator** builds full LLM prompt via `buildLLMPrompt()` (from `prompt-builder.ts`) and calls `LLMService.generateText()`
5. Returns `GenerationOutput` with `generatedContent`, `references`, `confidence`, and `metadata`

### Project Folder Convention

Every "project" the user creates has this expected structure on disk:
```
[ProjectPath]/
  Procedures/
    SOPs/              # Standard Operating Procedures — subcategory: sops — always indexed
    QPs/               # Quality Policies — subcategory: quality_policies — ON-DEMAND ONLY
    QaPs/              # Project Quality Plans — subcategory: project_quality_plans — ON-DEMAND ONLY
    *.docx/pdf/txt     # Files at root → tagged sops (backward compat, always indexed)
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

**Note on cache upgrade:** If you add `SOPs/`, `QPs/`, or `QaPs/` subfolders to an existing project, clear the vector cache (`CACHE_ENABLED=false` for one request, or delete `$TMPDIR/phasergun-cache/`) so that subcategory metadata is re-embedded.

### Cache System

Vector embeddings are cached to `$TMPDIR/phasergun-cache/` keyed by a SHA-256 fingerprint of all file paths, sizes, and mtimes. Cache is invalidated automatically when source files change. The `CACHE_ENABLED=false` env var disables caching (forces fresh processing on every request).

### Reference Notation in Prompts

Prompts use bracket syntax to request specific sources:
- `[Procedure|sops|design_control]` — new format: retrieves SOPs from a specific subcategory/category
- `[Procedure|quality_policies|iso_13485]` — explicit reference to quality policy (on-demand)
- `[Procedure|Design Control Procedure]` — **legacy format** (still supported, logs deprecation; maps to `sops` subcategory)
- `[Master Record|DEVICE_NAME]` — extracts a specific field from the master record
- `[Context|Regulatory Strategy|predicate.docx]` — retrieves a specific on-demand context document
- `[Master Checklist]` — includes the full Project-Master-Checklist.docx
- `@sops`, `@global_standards` — knowledge source scope tags (parsed, enforcement not yet implemented)
- `[Bootstrap|name]` — Google Drive bootstrap chain (NOT YET IMPLEMENTED — logs warning, generation continues)
- `[Doc|document|field]` — field extraction from bootstrap docs (NOT YET IMPLEMENTED — logs warning)

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
- **On-demand filtering**: `Context/General/`, `Context/Regulatory Strategy/`, `Procedures/QPs/`, and `Procedures/QaPs/` are only retrieved when explicitly referenced in prompts. Enforced in `enhanced-rag-service.ts:retrieveRelevantContext()`.
- **Prompt instructions single source of truth**: All LLM-injected behavioral instructions live in `src/rag-service/src/prompt-builder.ts`. Do not add behavioral directives elsewhere.
- **After build**: All packages compile to `dist/`. The API server runs `dist/index.js` in production and `ts-node src/index.ts` in dev. When adding a new package, you must run `npm run build-packages` before the API server can import it.

## primary-context.yaml → Code Location Mapping

| yaml directive / section | Implementation location |
|---|---|
| `product.name`, `product.purpose` | Read in `prompt-builder.ts:buildSystemSection()` |
| `operational_rules.source_tracking` | `prompt-builder.ts:RULE_WRITE_AS_AUTHOR`, `RULE_USE_PROCEDURAL_LANGUAGE` |
| `reference_notation.*` | Parsed in `reference-parser.ts:parseProcedureReferences()`, `parseExplicitContextReferences()`, `parseMasterChecklistReference()`, `parseKnowledgeSourceScopes()` |
| `reference_notation.procedure` (new `[Procedure\|sub\|cat]` format) | `reference-parser.ts:parseProcedureReferences()` |
| `reference_notation.knowledge_source_refs` (`@source_id`) | `reference-parser.ts:parseKnowledgeSourceScopes()` — parsed only, enforcement NOT YET IMPLEMENTED |
| `reference_notation.document_bootstrap` (`[Bootstrap\|...]`) | `reference-parser.ts:parseBootstrapReferences()` — stub, logs warning; NOT YET IMPLEMENTED |
| `reference_notation.document_field` (`[Doc\|...\|...]`) | `reference-parser.ts:parseDocFieldReferences()` — stub, logs warning; NOT YET IMPLEMENTED |
| `generation_workflow.output.sections.references` | `prompt-builder.ts:RULE_NO_INLINE_FOOTNOTES`; footnotes appended by `footnote-tracker.ts` |
| `generation_workflow.output.sections.generated_content.format` | `prompt-builder.ts:RULE_MARKDOWN_FORMAT` |
| `generation_workflow.processing` (task wrapper) | `prompt-builder.ts:buildLLMPrompt()` |
| `operational_rules.knowledge_source_scoping` | `prompt-builder.ts:RULE_WRITE_ONLY_REQUESTED` |
| `operational_rules.retrieval_scope` (on-demand filtering) | `reference-parser.ts:filterContextResults()`, `filterProcedureResults()` — called from `enhanced-rag-service.ts:retrieveRelevantContext()` |
| `knowledge_sources.procedures.subcategories.sops` | `document-loader.ts:CategorizedProcedureFile`, `Procedures/SOPs/` folder → `procedureSubcategory: 'sops'` |
| `knowledge_sources.procedures.subcategories.quality_policies` | `document-loader.ts`, `Procedures/QPs/` → `procedureSubcategory: 'quality_policies'`; on-demand: excluded unless `[Procedure\|quality_policies\|...]` in prompt |
| `knowledge_sources.procedures.subcategories.project_quality_plans` | `document-loader.ts`, `Procedures/QaPs/` → `procedureSubcategory: 'project_quality_plans'`; on-demand: excluded unless `[Procedure\|project_quality_plans\|...]` in prompt |
| `knowledge_sources.context.regulatory_strategy` (on-demand) | `enhanced-rag-service.ts:retrieveRelevantContext()` + `summary-orchestrator.ts:generateContextSummaries()` |
| `knowledge_sources.context.general` (on-demand) | Same as regulatory_strategy |
| `operational_rules.source_tracking` (citation format) | `footnote-tracker.ts:generateFootnotes()` — includes `subcategory_id/category_id` for procedure sources |
| `vector_store.metadata.procedureSubcategory` | `vector-store.ts:VectorEntry.metadata.procedureSubcategory` + `vector-builder.ts:ProcedureDoc` |
| `vector_store.metadata.procedureCategoryId` | `vector-store.ts:VectorEntry.metadata.procedureCategoryId` |

### Not Yet Implemented (document in code with warnings)

| Feature | Status | Where to implement |
|---|---|---|
| `[Bootstrap\|name]` Google Drive resolution | Warning logged, generation continues | Needs new bootstrap loader infrastructure |
| `[Doc\|document\|field]` field extraction | Warning logged, generation continues | Depends on Bootstrap being implemented first |
| `@{source_id}` per-scope retrieval enforcement | Scopes parsed and logged, but retrieval is not filtered per-scope | Requires redesign of vector search to support per-scope queries |
