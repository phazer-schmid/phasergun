import express, { Request, Response } from 'express';
import cors from 'cors';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { config } from 'dotenv';
import { DHFScanner } from '@fda-compliance/dhf-scanner';
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
      dhfFiles: phase.dhf_files.map((dhfFile: any) => ({
        id: dhfFile.id,
        name: dhfFile.name,
        documentReference: dhfFile.document_reference,
        submissionSection: dhfFile.submission_section,
        required: dhfFile.required,
        status: 'missing',
        documents: []
      }))
    }));
    
    console.log(`[API] Loaded ${dhfMapping.length} phase mappings with ${dhfMapping.reduce((sum, p) => sum + p.dhfFiles.length, 0)} total DHF files`);
  } catch (error) {
    console.error('[API] Error loading DHF mapping:', error);
    throw error;
  }
}

/**
 * Health check endpoint
 */
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    dhfMappingLoaded: dhfMapping.length > 0
  });
});

/**
 * POST /api/projects/:projectId/scan-dhf
 * Scan a project folder and classify DHF documents
 */
app.post('/api/projects/:projectId/scan-dhf', async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const { projectPath, phaseId } = req.body;

  const scanScope = phaseId ? `Phase ${phaseId}` : 'entire project';
  console.log(`[API] Received scan request for ${scanScope} in project ${projectId}`);
  console.log(`[API] Project path: ${projectPath}`);

  if (!projectPath) {
    return res.status(400).json({ 
      error: 'Project path is required',
      message: 'Please provide projectPath in request body'
    });
  }

  // Verify Anthropic API key
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicApiKey) {
    return res.status(500).json({
      error: 'API configuration error',
      message: 'ANTHROPIC_API_KEY not configured in environment variables'
    });
  }

  try {
    // Verify project path exists
    await fs.access(projectPath);

    // Initialize scanner
    const scanner = new DHFScanner({
      anthropicApiKey,
      maxFileSize: 10 * 1024 * 1024, // 10MB
      supportedExtensions: ['.pdf', '.docx', '.txt', '.md', '.doc']
    });

    // Load DHF mapping
    await scanner.loadDHFMapping(dhfMapping);

    // Scan project folder (with optional phase filter)
    console.log(`[API] Starting scan of ${projectPath}...`);
    const dhfFiles = await scanner.scanProjectFolder(projectPath, phaseId);

    console.log(`[API] Scan complete. Found ${dhfFiles.length} DHF files`);

    // Return results
    res.json({
      projectId,
      dhfFiles,
      scanStatus: 'complete',
      timestamp: new Date().toISOString(),
      stats: {
        totalDHFFiles: dhfFiles.length,
        completedFiles: dhfFiles.filter((f: any) => f.status === 'complete').length,
        totalDocuments: dhfFiles.reduce((sum: number, f: any) => sum + (f.documents?.length || 0), 0)
      }
    });
  } catch (error) {
    console.error(`[API] Error scanning project:`, error);
    
    res.status(500).json({
      error: 'Scan failed',
      message: error instanceof Error ? error.message : 'Unknown error occurred',
      projectId
    });
  }
});

/**
 * GET /api/dhf-mapping
 * Get the current DHF phase mapping
 */
app.get('/api/dhf-mapping', (_req: Request, res: Response) => {
  res.json({
    phases: dhfMapping,
    totalFiles: dhfMapping.reduce((sum, p) => sum + p.dhfFiles.length, 0)
  });
});

/**
 * Start server
 */
async function startServer() {
  try {
    // Load DHF mapping on startup
    await loadDHFMapping();

    app.listen(PORT, () => {
      console.log(`\n=== FDA Compliance API Server ===`);
      console.log(`Server running on http://localhost:${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/api/health`);
      console.log(`DHF mapping loaded: ${dhfMapping.length} phases\n`);
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
