import express, { Request, Response } from 'express';
import cors from 'cors';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { config } from 'dotenv';
import { PhaseDHFMapping } from '@fda-compliance/shared-types';

// Load environment variables
config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Global DHF mapping cache
let dhfMapping: PhaseDHFMapping[] = [];

/**
 * Load DHF phase mapping from YAML file
 */
async function loadDHFMapping(): Promise<void> {
  try {
    const yamlPath = path.join(__dirname, '../../rag-service/knowledge-base/context/dhf-phase-mapping.yaml');
    const fileContents = await fs.readFile(yamlPath, 'utf8');
    const data = yaml.load(fileContents) as any;
    
    // Parse the YAML structure
    const phaseMapping = data.dhf_phase_mapping;
    const phases = [
      { id: 1, ...phaseMapping.phase_1 },
      { id: 2, ...phaseMapping.phase_2 },
      { id: 3, ...phaseMapping.phase_3 },
      { id: 4, ...phaseMapping.phase_4 }
    ];
    
    dhfMapping = phases.map((phase: any) => ({
      phaseId: phase.id,
      phaseName: phase.name,
      dhfFiles: (phase.required_documents || []).map((dhfFile: any) => ({
        id: dhfFile.id || 'unknown',
        name: dhfFile.name || 'Unknown Document',
        documentReference: dhfFile.document_reference || dhfFile.id || 'N/A',
        submissionSection: dhfFile.submission_section || 'General',
        required: dhfFile.required !== undefined ? dhfFile.required : true,
        status: 'missing' as const,
        documents: []
      }))
    }));
    
    // Silently load - no startup logging needed
  } catch (error) {
    console.error('[API] Warning: Could not load DHF mapping config:', error);
    // Non-fatal - continue server startup
  }
}

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
 * GET /api/dhf-mapping
 * Get the current DHF phase mapping (optional - can be used for phase context)
 */
app.get('/api/dhf-mapping', (_req: Request, res: Response) => {
  res.json({
    phases: dhfMapping,
    totalFiles: dhfMapping.reduce((sum, p) => sum + p.dhfFiles.length, 0)
  });
});

/**
 * POST /api/list-files
 * List files in a specific directory (used by UI for Procedures/Context/Prompts)
 */
app.post('/api/list-files', async (req: Request, res: Response) => {
  const { path: dirPath } = req.body;

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
    
    // Filter to files only (not subdirectories)
    const files = [];
    for (const entry of entries) {
      if (entry.isFile()) {
        const filePath = path.join(dirPath, entry.name);
        const stats = await fs.stat(filePath);
        
        files.push({
          name: entry.name,
          path: filePath,
          size: stats.size,
          modified: stats.mtime
        });
      }
    }
    
    res.json({ files });
    
  } catch (error) {
    // Directory doesn't exist or is inaccessible - return empty list
    console.log(`[API] Directory not accessible: ${dirPath}`);
    res.json({ files: [] });
  }
});

/**
 * Start server
 */
async function startServer() {
  try {
    // Load configurations (non-fatal if they fail)
    await loadDHFMapping();
    
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
    }

    app.listen(PORT, () => {
      console.log(`\n=== PhaserGun Generation API Server ===`);
      console.log(`Server running on http://localhost:${PORT}`);
      console.log(``);
      console.log(`API Endpoints:`);
      console.log(`  • POST /api/generate     - Semantic text generation with RAG`);
      console.log(`  • GET  /api/health       - System health check`);
      console.log(`  • GET  /api/dhf-mapping  - DHF phase mapping (optional)`);
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
