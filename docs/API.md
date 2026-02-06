# PhaserGun API Documentation

## Overview

The PhaserGun API is a RESTful HTTP API built with Express.js that provides document generation, file management, and health monitoring endpoints. The API coordinates between the RAG service, LLM providers, and the Vue frontend.

**Base URL**: `http://localhost:3001` (development) or `https://yourdomain.com` (production)

**Content Type**: `application/json`

---

## Endpoints

### 1. POST /api/generate

Generate regulatory documentation from a prompt file using RAG-enhanced LLM generation.

#### Request

**Method**: `POST`  
**Path**: `/api/generate`  
**Content-Type**: `application/json`

**Body Parameters**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `projectPath` | string | Yes | Absolute path to the project folder containing Procedures/ and Context/ directories |
| `promptFilePath` | string | Yes | Absolute path to the prompt file (.txt, .md, or .docx) |
| `options` | object | No | Generation options (topKProcedures, topKContext) |

**options Object**:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `topKProcedures` | number | 3 | Number of procedure chunks to retrieve (set to 0 to exclude) |
| `topKContext` | number | 2 | Number of context chunks to retrieve (set to 0 to exclude) |

**Example Request**:

```json
{
  "projectPath": "/Users/username/projects/medical-device-x",
  "promptFilePath": "/Users/username/projects/medical-device-x/Context/Prompt/design-input-spec.txt",
  "options": {
    "topKProcedures": 5,
    "topKContext": 3
  }
}
```

#### Response

**Status Codes**:
- `200 OK` - Generation successful
- `400 Bad Request` - Invalid request (missing fields, invalid file paths)
- `500 Internal Server Error` - Generation failed (LLM error, parsing error)

**Success Response**:

```json
{
  "status": "complete",
  "message": "Content generated successfully",
  "timestamp": "2026-02-05T22:00:00.000Z",
  "generatedContent": "# Design Input Specification\n\n## 1. Purpose\n\nThis document establishes...[1]\n\n## 2. Scope\n\nThe scope includes...[2]\n\n---\n## Sources\n\n[1] Procedure: SOP-001-Design-Control.pdf (Section 1)\n[2] Context: Primary Context.docx (Section 2)",
  "references": [
    {
      "id": "1",
      "fileName": "SOP-001-Design-Control.pdf",
      "category": "procedure",
      "section": "Section 1",
      "usage": "Referenced in generated content"
    },
    {
      "id": "2",
      "fileName": "Primary Context.docx",
      "category": "context",
      "section": "Section 2",
      "usage": "Referenced in generated content"
    }
  ],
  "confidence": {
    "level": "High",
    "rationale": "Confidence level: High. Retrieved 5 of 5 requested sources. Generated 5234 tokens. All required information was available and content was generated successfully.",
    "criteria": {
      "sourceAgreement": "High",
      "completeness": "High",
      "complianceAlignment": "High",
      "procedureAdherence": "High"
    }
  },
  "discrepancies": [],
  "usageStats": {
    "tokensUsed": 5234,
    "cost": 0.052
  },
  "metadata": {
    "sources": [
      "SOP-001-Design-Control.pdf",
      "Primary Context.docx"
    ],
    "footnotes": [
      {
        "id": "1",
        "fileName": "SOP-001-Design-Control.pdf",
        "category": "procedure",
        "chunkIndex": 0
      },
      {
        "id": "2",
        "fileName": "Primary Context.docx",
        "category": "context",
        "chunkIndex": 1
      }
    ],
    "footnotesMap": {
      "procedure-SOP-001-Design-Control.pdf-0": {
        "id": "1",
        "fileName": "SOP-001-Design-Control.pdf",
        "category": "procedure",
        "chunkIndex": 0
      },
      "context-Primary Context.docx-1": {
        "id": "2",
        "fileName": "Primary Context.docx",
        "category": "context",
        "chunkIndex": 1
      }
    }
  }
}
```

**Error Response**:

```json
{
  "status": "error",
  "error": "Failed to read prompt file: /path/to/file.txt. Supported formats: .txt, .md, .docx",
  "timestamp": "2026-02-05T22:00:00.000Z"
}
```

#### Example curl Command

```bash
curl -X POST http://localhost:3001/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "projectPath": "/Users/username/projects/medical-device-x",
    "promptFilePath": "/Users/username/projects/medical-device-x/Context/Prompt/design-input-spec.txt",
    "options": {
      "topKProcedures": 5,
      "topKContext": 3
    }
  }'
```

#### Notes

- The endpoint supports both text files (.txt, .md) and Word documents (.docx) for prompts
- Generation time varies based on document count and LLM provider (typically 5-30 seconds)
- The `generatedContent` field includes inline citations ([1], [2], etc.) and a Sources section at the end
- Cache is automatically used if valid; first request may take longer while cache builds

---

### 2. POST /api/list-files

List files and directories within a specified path. Used by the UI to populate file browsers for Procedures, Context, and Prompts folders.

#### Request

**Method**: `POST`  
**Path**: `/api/list-files`  
**Content-Type**: `application/json`

**Body Parameters**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `path` | string | Yes | Absolute path to the directory to list |
| `includeDirectories` | boolean | No | Whether to include subdirectories in results (default: false) |

**Example Request**:

```json
{
  "path": "/Users/username/projects/medical-device-x/Procedures",
  "includeDirectories": false
}
```

#### Response

**Status Codes**:
- `200 OK` - Listing successful (even if directory is empty or doesn't exist)
- `400 Bad Request` - Missing path parameter

**Success Response (files only)**:

```json
{
  "files": [
    {
      "name": "SOP-001-Design-Control.pdf",
      "path": "/Users/username/projects/medical-device-x/Procedures/SOP-001-Design-Control.pdf",
      "type": "file",
      "size": 245678,
      "modified": "2026-02-05T18:30:00.000Z"
    },
    {
      "name": "SOP-002-Risk-Management.docx",
      "path": "/Users/username/projects/medical-device-x/Procedures/SOP-002-Risk-Management.docx",
      "type": "file",
      "size": 123456,
      "modified": "2026-02-04T14:22:00.000Z"
    }
  ]
}
```

**Success Response (with directories)**:

```json
{
  "items": [
    {
      "name": "Initiation",
      "path": "/Users/username/projects/medical-device-x/Context/Initiation",
      "type": "directory",
      "modified": "2026-02-05T18:30:00.000Z"
    },
    {
      "name": "Primary Context.docx",
      "path": "/Users/username/projects/medical-device-x/Context/Primary Context.docx",
      "type": "file",
      "size": 89012,
      "modified": "2026-02-05T12:15:00.000Z"
    }
  ]
}
```

**Empty Directory Response**:

```json
{
  "files": []
}
```

OR (with `includeDirectories: true`):

```json
{
  "items": []
}
```

#### Example curl Commands

**List files only:**
```bash
curl -X POST http://localhost:3001/api/list-files \
  -H "Content-Type: application/json" \
  -d '{
    "path": "/Users/username/projects/medical-device-x/Procedures"
  }'
```

**List files and directories:**
```bash
curl -X POST http://localhost:3001/api/list-files \
  -H "Content-Type: application/json" \
  -d '{
    "path": "/Users/username/projects/medical-device-x/Context",
    "includeDirectories": true
  }'
```

#### Notes

- Returns empty array if directory doesn't exist (non-fatal)
- File sizes are in bytes
- Modification times are ISO 8601 formatted strings
- Response format changes based on `includeDirectories` parameter:
  - `false` (default): Returns `{ files: [...] }`
  - `true`: Returns `{ items: [...] }` with both files and directories

---

### 3. GET /api/health

Health check endpoint for monitoring service status.

#### Request

**Method**: `GET`  
**Path**: `/api/health`

**No parameters required**

#### Response

**Status Codes**:
- `200 OK` - Services are healthy or degraded (check `status` field)
- `500 Internal Server Error` - Health check failed

**Success Response (Healthy)**:

```json
{
  "status": "healthy",
  "timestamp": "2026-02-05T22:00:00.000Z",
  "services": {
    "environment": {
      "status": "ok",
      "llmMode": "anthropic"
    },
    "rag": {
      "status": "ok",
      "details": "RAG service configured for Context and Procedures folders"
    }
  }
}
```

**Success Response (Degraded)**:

```json
{
  "status": "degraded",
  "timestamp": "2026-02-05T22:00:00.000Z",
  "services": {
    "environment": {
      "status": "warning",
      "llmMode": "anthropic"
    },
    "rag": {
      "status": "ok",
      "details": "RAG service configured for Context and Procedures folders"
    }
  },
  "warnings": [
    "LLM_MODE=anthropic but ANTHROPIC_API_KEY not set"
  ]
}
```

**Error Response**:

```json
{
  "status": "unhealthy",
  "timestamp": "2026-02-05T22:00:00.000Z",
  "error": "Health check failed: Connection refused",
  "services": {
    "environment": {
      "status": "unknown"
    },
    "rag": {
      "status": "unknown"
    }
  }
}
```

#### Example curl Command

```bash
curl http://localhost:3001/api/health
```

#### Notes

- Use this endpoint for uptime monitoring and load balancer health checks
- `status` field indicates overall health: `"healthy"`, `"degraded"`, or `"unhealthy"`
- Warnings array lists non-critical issues (e.g., missing API keys)
- Does not test actual LLM connectivity (only checks configuration)

---

## Error Response Format

All error responses follow this structure:

```json
{
  "status": "error",
  "error": "Error message describing what went wrong",
  "message": "Additional context or user-friendly message",
  "timestamp": "2026-02-05T22:00:00.000Z"
}
```

### Common Error Codes

| Status Code | Meaning | Common Causes |
|-------------|---------|---------------|
| 400 | Bad Request | Missing required fields, invalid paths, unsupported file formats |
| 404 | Not Found | Endpoint doesn't exist |
| 500 | Internal Server Error | LLM service error, parsing failure, cache error, unexpected exception |

---

## LLM Provider Configuration

The API supports multiple LLM providers, selected via the `LLM_MODE` environment variable:

### Provider Selection

| LLM_MODE | Provider | Required Env Vars | Models Supported |
|----------|----------|-------------------|------------------|
| `anthropic` | Anthropic Claude | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | claude-sonnet-4-20250514, claude-3-5-sonnet-20241022, claude-3-haiku-20240307 |
| `mistral` | Mistral AI | `MISTRAL_API_KEY`, `MISTRAL_MODEL` | mistral-small-latest, mistral-medium-latest, mistral-large-latest |
| `groq` | Groq LPU | `GROQ_API_KEY`, `GROQ_MODEL` | llama-3.1-8b-instant, llama-3.1-70b-versatile, mixtral-8x7b-32768 |
| `ollama` | Ollama (Local) | `OLLAMA_MODEL`, `OLLAMA_BASE_URL` | Any locally installed model |
| `mock` | Mock Service | None | Test mode with simulated responses |

### Configuration Example

```bash
# .env file in src/api-server/

# Option 1: Use Anthropic Claude
LLM_MODE=anthropic
ANTHROPIC_API_KEY=sk-ant-api03-xxxxx
ANTHROPIC_MODEL=claude-sonnet-4-20250514

# Option 2: Use Mistral AI
LLM_MODE=mistral
MISTRAL_API_KEY=xxxxx
MISTRAL_MODEL=mistral-small-latest

# Option 3: Use Groq
LLM_MODE=groq
GROQ_API_KEY=gsk_xxxxx
GROQ_MODEL=llama-3.1-8b-instant

# Option 4: Use Ollama (local)
LLM_MODE=ollama
OLLAMA_MODEL=llama3.1:70b
OLLAMA_BASE_URL=http://localhost:11434

# Option 5: Use Mock (testing)
LLM_MODE=mock
```

### Provider-Specific Notes

**Anthropic Claude**:
- Best quality for regulatory documentation
- Supports long context windows (200K+ tokens)
- Higher cost but excellent compliance understanding

**Mistral AI**:
- Good balance of quality and cost
- European provider (GDPR compliant)
- Fast inference speeds

**Groq**:
- Fastest inference (LPU architecture)
- Cost-effective for high-volume generation
- Open-source models (Llama, Mixtral)

**Ollama**:
- Fully local/private (no external API calls)
- Free to use
- Requires GPU for reasonable performance

**Mock**:
- For testing and development
- No API keys required
- Returns simulated responses instantly

---

## Rate Limiting and Quotas

The PhaserGun API itself does not impose rate limits, but be aware of:

1. **LLM Provider Limits**: Each LLM provider has its own rate limits and quotas
   - Anthropic: Varies by tier (check your account)
   - Mistral: Varies by subscription
   - Groq: Free tier has request limits
   - Ollama: Limited only by local hardware

2. **Concurrent Requests**: The cache system handles concurrent requests safely via mutex + file locks

3. **Generation Time**: Expect 5-30 seconds per generation depending on:
   - Document count (affects cache build time)
   - LLM provider speed
   - Prompt complexity
   - Context size

---

## Authentication

Currently, the PhaserGun API does not implement authentication. It is designed for:
- **Local development** (localhost only)
- **Private networks** (behind firewall/VPN)
- **Single-user deployments** (trusted environment)

### Production Considerations

For production deployments with multiple users:
1. Deploy behind nginx with authentication
2. Use network-level access control (firewall, VPN)
3. Consider adding JWT or API key authentication
4. Implement rate limiting at nginx level

---

## CORS Configuration

The API includes CORS middleware configured to accept requests from any origin:

```typescript
app.use(cors());
```

### Custom CORS Configuration

To restrict origins in production, modify `src/api-server/src/index.ts`:

```typescript
app.use(cors({
  origin: 'https://yourdomain.com',
  credentials: true
}));
```

---

## Request/Response Examples

### Complete Generation Flow

**1. Check health:**
```bash
curl http://localhost:3001/api/health
```

**2. List available prompts:**
```bash
curl -X POST http://localhost:3001/api/list-files \
  -H "Content-Type: application/json" \
  -d '{"path": "/path/to/project/Context/Prompt"}'
```

**3. Generate content:**
```bash
curl -X POST http://localhost:3001/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "projectPath": "/path/to/project",
    "promptFilePath": "/path/to/project/Context/Prompt/design-input.txt",
    "options": {
      "topKProcedures": 5,
      "topKContext": 3
    }
  }' | jq .
```

### JavaScript/TypeScript Client Example

```typescript
// Using fetch API
async function generateContent(
  projectPath: string,
  promptFilePath: string,
  options?: { topKProcedures?: number; topKContext?: number }
) {
  const response = await fetch('http://localhost:3001/api/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      projectPath,
      promptFilePath,
      options
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Generation failed');
  }

  return await response.json();
}

// Usage
try {
  const result = await generateContent(
    '/path/to/project',
    '/path/to/project/Context/Prompt/design-input.txt',
    { topKProcedures: 5, topKContext: 3 }
  );
  
  console.log('Generated:', result.generatedContent);
  console.log('Confidence:', result.confidence.level);
  console.log('Sources:', result.metadata.sources);
} catch (error) {
  console.error('Generation failed:', error.message);
}
```

### Python Client Example

```python
import requests

def generate_content(project_path, prompt_file_path, options=None):
    url = 'http://localhost:3001/api/generate'
    payload = {
        'projectPath': project_path,
        'promptFilePath': prompt_file_path,
        'options': options or {}
    }
    
    response = requests.post(url, json=payload)
    response.raise_for_status()
    
    return response.json()

# Usage
try:
    result = generate_content(
        '/path/to/project',
        '/path/to/project/Context/Prompt/design-input.txt',
        {'topKProcedures': 5, 'topKContext': 3}
    )
    
    print(f"Generated: {result['generatedContent']}")
    print(f"Confidence: {result['confidence']['level']}")
    print(f"Sources: {result['metadata']['sources']}")
except requests.exceptions.HTTPError as e:
    print(f"Generation failed: {e}")
```

---

## WebSocket Support

Currently, the API uses HTTP POST for generation requests. Long-running generations return the complete response once finished.

### Future Enhancement: Streaming

Consider implementing streaming for real-time generation updates:
- Server-Sent Events (SSE) for progress updates
- WebSocket for bidirectional communication
- Chunked transfer encoding for incremental content

---

## Related Documentation

- **System Architecture**: [ARCHITECTURE.md](./ARCHITECTURE.md)
- **Cache System**: [CACHE.md](./CACHE.md)
- **RAG Service**: [RAG_SERVICE.md](./RAG_SERVICE.md)
- **Deployment**: [DEPLOYMENT.md](./DEPLOYMENT.md)
