# API Server

REST API server for the FDA 510(k) Compliance Analysis system. Provides HTTP endpoints for document analysis, prompt-based text generation, and DHF project management.

## Overview

The API server exposes the orchestrator and RAG services through RESTful endpoints, enabling the Vue.js UI and external clients to interact with the compliance analysis system.

## Features

- ✅ **Semantic Text Generation** - Generate compliance text using semantic RAG retrieval
- ✅ **Source Tracking** - Returns source files for footnote generation
- ✅ **Multi-LLM Support** - Works with Anthropic, Mistral, Groq, Ollama
- ✅ **DHF Scanning** - Scan and analyze DHF project folders
- ✅ **Check Validation** - Retrieve and validate compliance checks

## Installation

```bash
cd src/api-server
npm install
npm run build
```

## Running the Server

```bash
# Development mode
npm run dev

# Production mode
npm start
```

The server will start on `http://localhost:3001` (configurable via `PORT` environment variable).

## API Endpoints

### POST `/api/generate`

Generate text from a prompt using semantic RAG retrieval.

**Request:**
```typescript
{
  projectPath: string,              // Path to DHF project folder
  primaryContextPath: string,        // Path to primary context YAML
  prompt: string,                    // User's generation request
  options?: {
    topKProcedures?: number,        // Number of procedure chunks (default: 5)
    topKContext?: number            // Number of context chunks (default: 5)
  }
}
```

**Response:**
```typescript
{
  success: true,
  generatedText: string,            // Generated compliance text
  sources: string[],                // Source files used (for footnotes)
  usageStats: {
    tokensUsed: number,
    cost?: number
  }
}
```

**Example:**
```bash
curl -X POST http://localhost:3001/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "projectPath": "/path/to/dhf/project",
    "primaryContextPath": "/path/to/primary-context.yaml",
    "prompt": "Generate a risk analysis section",
    "options": {
      "topKProcedures": 5,
      "topKContext": 5
    }
  }'
```

**Response Example:**
```json
{
  "success": true,
  "generatedText": "# Risk Analysis\n\nBased on ISO 14971 guidelines...",
  "sources": [
    "SOP-Design-Control.md",
    "ISO-14971-Risk-Management.md",
    "project-requirements.yaml"
  ],
  "usageStats": {
    "tokensUsed": 1250,
    "cost": 0.0125
  }
}
```

**Error Response:**
```json
{
  "error": "Missing required fields: projectPath, primaryContextPath, prompt"
}
```

### POST `/api/dhf-scanner/scan`

Scan a DHF project folder and return structured file information.

**Request:**
```typescript
{
  folderPath: string,               // Path to DHF project root
  sourceType?: 'local' | 'cloud'    // Source type (default: 'local')
}
```

**Response:**
```typescript
{
  files: DHFFile[],
  summary: {
    totalFiles: number,
    phase1Files: number,
    crossCuttingFiles: number,
    // ... phase statistics
  }
}
```

### GET `/api/checks/:fileName`

Retrieve compliance check definitions.

**Example:**
```bash
curl http://localhost:3001/api/checks/phase1-validation.yaml
```

### GET `/api/checks/list`

List all available check files.

**Response:**
```json
{
  "files": [
    "phase1-validation.yaml",
    "cross-cutting-validation.yaml",
    "estar-validation.yaml"
  ]
}
```

## Architecture

```
Vue UI Client
    ↓
API Server (Express)
    ├─→ /api/generate         → OrchestratorService.generateFromPrompt()
    ├─→ /api/dhf-scanner/scan → DHFScanner.scanFolder()
    └─→ /api/checks/*         → Check file retrieval
        ↓
Services Layer
    ├─→ Orchestrator Service
    ├─→ Enhanced RAG Service (Semantic Retrieval)
    ├─→ LLM Service (Anthropic/Mistral/etc)
    └─→ File Parser, Chunker
```

## Configuration

### Environment Variables

Create a `.env` file in `src/api-server/`:

```bash
# Server Configuration
PORT=3001
NODE_ENV=production

# LLM Provider (anthropic, mistral, groq, ollama, mock)
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
MISTRAL_API_KEY=...
GROQ_API_KEY=...

# Paths
PRIMARY_CONTEXT_PATH=/path/to/primary-context.yaml

# CORS
CORS_ORIGIN=http://localhost:5173
```

### LLM Provider Configuration

The API server supports multiple LLM providers:

- **Anthropic** - Claude models (recommended)
- **Mistral** - Mistral AI models
- **Groq** - Fast inference
- **Ollama** - Local models
- **Mock** - Testing without API calls

Configure via `LLM_PROVIDER` environment variable.

## Semantic Retrieval Integration

The `/api/generate` endpoint uses the Enhanced RAG Service for intelligent context retrieval:

### How It Works

1. **User sends prompt** → API receives request
2. **Semantic Search** → RAG service retrieves relevant chunks using vector embeddings
3. **Context Assembly** → Combines primary context + procedures + context files
4. **LLM Generation** → Sends assembled context + prompt to LLM
5. **Response with Sources** → Returns generated text + source files for footnotes

### Source Tracking for Footnotes

The API returns an array of source files that were used during generation:

```json
{
  "generatedText": "...",
  "sources": [
    "SOP-Design-Control.md",
    "21-CFR-820-Design-Controls.md",
    "project-requirements.yaml"
  ]
}
```

The UI can use this to display footnotes showing which documents informed the generated text.

## Router Structure

```
src/api-server/src/
├── index.ts              # Main server file
└── routes/
    └── generate.ts       # /api/generate endpoint
```

### Adding New Routes

Create a new router file:

```typescript
// src/api-server/src/routes/myroute.ts
import { Router } from 'express';

const router = Router();

router.post('/myendpoint', async (req, res) => {
  // Handle request
  res.json({ success: true });
});

export default router;
```

Mount in `index.ts`:

```typescript
import myRoute from './routes/myroute';
app.use('/api', myRoute);
```

## Error Handling

### Standard Error Response

```json
{
  "error": "Error message describing what went wrong"
}
```

### Common Error Codes

- **400 Bad Request** - Missing required fields
- **404 Not Found** - Resource not found
- **500 Internal Server Error** - Server-side error

### Example Error Handling

```typescript
try {
  const result = await orchestrator.generateFromPrompt({...});
  res.json({ success: true, ...result });
} catch (error) {
  console.error('Generate endpoint error:', error);
  res.status(500).json({
    error: error instanceof Error ? error.message : 'Unknown error'
  });
}
```

## Testing

### Manual Testing with curl

```bash
# Test generate endpoint
curl -X POST http://localhost:3001/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "projectPath": "/path/to/project",
    "primaryContextPath": "/path/to/primary-context.yaml",
    "prompt": "Generate test content"
  }'

# Test DHF scanner
curl -X POST http://localhost:3001/api/dhf-scanner/scan \
  -H "Content-Type: application/json" \
  -d '{
    "folderPath": "/path/to/dhf/project"
  }'

# List checks
curl http://localhost:3001/api/checks/list
```

### Testing with Postman

Import these endpoints into Postman:

1. **Generate Text**
   - Method: POST
   - URL: `http://localhost:3001/api/generate`
   - Headers: `Content-Type: application/json`
   - Body: See request format above

2. **Scan DHF Folder**
   - Method: POST
   - URL: `http://localhost:3001/api/dhf-scanner/scan`
   - Headers: `Content-Type: application/json`
   - Body: `{ "folderPath": "/path/to/project" }`

## Security Considerations

### CORS Configuration

Configure CORS to restrict access:

```typescript
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true
}));
```

### API Key Protection

Store LLM API keys in environment variables, never in code:

```bash
ANTHROPIC_API_KEY=sk-ant-...  # ✓ Good
```

```typescript
const apiKey = 'sk-ant-...'  // ✗ Bad
```

### Input Validation

Always validate user input:

```typescript
if (!projectPath || !primaryContextPath || !prompt) {
  return res.status(400).json({
    error: 'Missing required fields: projectPath, primaryContextPath, prompt'
  });
}
```

## Development

### Hot Reload

Use `ts-node-dev` for development with automatic restart:

```bash
npm install --save-dev ts-node-dev
```

```json
{
  "scripts": {
    "dev": "ts-node-dev --respawn src/index.ts"
  }
}
```

### Debug Mode

Enable verbose logging:

```bash
DEBUG=* npm run dev
```

## Deployment

### Production Build

```bash
npm run build
npm start
```

### Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY dist ./dist
EXPOSE 3001
CMD ["node", "dist/index.js"]
```

### PM2 Process Manager

```bash
pm2 start ecosystem.config.js
```

## See Also

- [Orchestrator README](../orchestrator/README.md) - Service layer documentation
- [RAG Service README](../rag-service/README.md) - Semantic retrieval details
- [Vue UI README](../../vue-ui/README.md) - Frontend client documentation
