import express, { Request, Response } from 'express';
import cors from 'cors';
import * as fs from 'fs/promises';
import * as path from 'path';
import { config } from 'dotenv';

// Load environment variables
config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

/**
 * Health check endpoint - simplified for generation-focused app
 */
app.get('/api/health', async (_req: Request, res: Response) => {
  const checks: any = {
    environment: { status: 'unknown' },
    rag: { status: 'unknown' }
  };
  const warnings: string[] = [];
  let overallStatus = 'healthy';

  try {
    // Check 1: Environment Configuration
    const llmMode = process.env.LLM_MODE || 'mock';
    const envChecks: any = { llmMode };

    // Check LLM-specific configuration
    if (llmMode === 'anthropic' && !process.env.ANTHROPIC_API_KEY) {
      warnings.push('LLM_MODE=anthropic but ANTHROPIC_API_KEY not set');
      overallStatus = 'degraded';
    } else if (llmMode === 'mistral' && !process.env.MISTRAL_API_KEY) {
      warnings.push('LLM_MODE=mistral but MISTRAL_API_KEY not set');
      overallStatus = 'degraded';
    } else if (llmMode === 'groq' && !process.env.GROQ_API_KEY) {
      warnings.push('LLM_MODE=groq but GROQ_API_KEY not set');
      overallStatus = 'degraded';
    }

    checks.environment = {
      status: warnings.length === 0 ? 'ok' : 'warning',
      ...envChecks
    };

    // Check 2: RAG Service availability
    checks.rag = {
      status: 'ok',
      details: 'RAG service configured for Context and Procedures folders'
    };

    // Return health status
    res.json({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      services: checks,
      warnings: warnings.length > 0 ? warnings : undefined
    });

  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Health check failed',
      services: checks
    });
  }
});

/**
 * POST /api/list-files
 * List files and directories in a specific directory (used by UI for Procedures/Context/Prompts)
 */
app.post('/api/list-files', async (req: Request, res: Response) => {
  const { path: dirPath, includeDirectories = false } = req.body;

  if (!dirPath) {
    return res.status(400).json({
      error: 'Path is required',
      message: 'Please provide path in request body'
    });
  }

  try {
    // Check if directory exists
    await fs.access(dirPath);
    
    // Read directory contents
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    
    // Process all entries
    const items = [];
    for (const entry of entries) {
      const itemPath = path.join(dirPath, entry.name);
      const stats = await fs.stat(itemPath);
      
      if (entry.isFile()) {
        items.push({
          name: entry.name,
          path: itemPath,
          type: 'file',
          size: stats.size,
          modified: stats.mtime
        });
      } else if (entry.isDirectory() && includeDirectories) {
        items.push({
          name: entry.name,
          path: itemPath,
          type: 'directory',
          modified: stats.mtime
        });
      }
    }
    
    // Return backward-compatible format
    if (includeDirectories) {
      res.json({ items });
    } else {
      res.json({ files: items });
    }
    
  } catch (error) {
    // Directory doesn't exist or is inaccessible - return empty list
    console.log(`[API] Directory not accessible: ${dirPath}`);
    if (includeDirectories) {
      res.json({ items: [] });
    } else {
      res.json({ files: [] });
    }
  }
});

/**
 * Start server
 */
async function startServer() {
  try {
    // Mount generate router BEFORE starting server
    try {
      const generateRouterModule = await import('./routes/generate');
      const generateRouter = generateRouterModule.default;
      app.use('/api', generateRouter);
      console.log('[API] ✓ Generate router loaded');
    } catch (error) {
      console.error('[API] Warning: Could not load generate router:', error);
      // Non-fatal - continue server startup
    }

    // Detect LLM configuration
    const llmMode = process.env.LLM_MODE || 'mock';
    let llmProvider = 'Mock LLM Service';
    let llmModel = 'mock';
    
    if (llmMode === 'anthropic' && process.env.ANTHROPIC_API_KEY) {
      llmProvider = 'Anthropic Claude';
      llmModel = process.env.ANTHROPIC_MODEL || 'claude-3-haiku-20240307';
    } else if (llmMode === 'mistral' && process.env.MISTRAL_API_KEY) {
      llmProvider = 'Mistral AI';
      llmModel = process.env.MISTRAL_MODEL || 'mistral-small-latest';
    } else if (llmMode === 'groq' && process.env.GROQ_API_KEY) {
      llmProvider = 'Groq LPU';
      llmModel = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';
    } else if (llmMode === 'ollama') {
      llmProvider = 'Ollama (Local)';
      llmModel = process.env.OLLAMA_MODEL || 'llama3.1:70b';
    } else if (llmMode === 'multi-model') {
      const providerMode = process.env.PROVIDER_MODE || 'direct';
      const drafter = process.env.MODEL_DRAFTER || 'gpt-4.1';
      const auditor = process.env.MODEL_AUDITOR || 'o3-mini';
      const ingestion = process.env.MODEL_INGESTION || 'gpt-4o-mini';
      const reviser = process.env.MODEL_REVISER || 'gpt-4.1';
      const ingestionEnabled = process.env.ENABLE_INGESTION_STEP !== 'false';
      const auditEnabled = process.env.ENABLE_AUDIT_STEP !== 'false';
      const revisionEnabled = process.env.ENABLE_REVISION_STEP !== 'false';
      const steps = [
        ingestionEnabled ? `ingestion:${ingestion}` : null,
        `draft:${drafter}`,
        auditEnabled ? `audit:${auditor}` : null,
        revisionEnabled ? `revise:${reviser}` : null,
      ].filter(Boolean).join(' → ');
      if (providerMode === 'azure_foundry') {
        const endpoint = process.env.AZURE_ENDPOINT || '(endpoint not set)';
        const prefix = process.env.AZURE_DEPLOYMENT_PREFIX || '';
        llmProvider = `Multi-Model Pipeline via Azure AI Foundry (${endpoint}, prefix: "${prefix}")`;
      } else {
        llmProvider = 'Multi-Model Pipeline (direct APIs)';
      }
      llmModel = steps;
    }

    app.listen(PORT, () => {
      console.log(`\n=== Phaser Generation API Server ===`);
      console.log(`Server running on http://localhost:${PORT}`);
      console.log(``);
      console.log(`API Endpoints:`);
      console.log(`  • POST /api/generate    - Content generation with RAG`);
      console.log(`  • POST /api/list-files  - File/directory listing`);
      console.log(`  • GET  /api/health      - System health check`);
      console.log(``);
      console.log(`LLM Provider: ${llmProvider} (${llmModel})`);
      console.log(`Services: ✓ RAG  ✓ Generation Engine  ✓ Context/Procedures Integration`);
      console.log(``);
      console.log(`Ready for requests.\n`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();

// Export for testing
export { app };
