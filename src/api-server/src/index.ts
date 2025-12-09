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
  let { projectPath, phaseId } = req.body;

  const scanScope = phaseId ? `Phase ${phaseId}` : 'entire project';
  console.log(`[API] Received scan request for ${scanScope} in project ${projectId}`);
  console.log(`[API] Raw project path: ${projectPath}`);

  if (!projectPath) {
    return res.status(400).json({ 
      error: 'Project path is required',
      message: 'Please provide projectPath in request body'
    });
  }

  // Normalize the path by removing shell escape sequences
  // Replace escaped spaces (\ ) with actual spaces
  projectPath = projectPath.replace(/\\ /g, ' ');
  console.log(`[API] Normalized project path: ${projectPath}`);

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
 * POST /api/analyze
 * Analyze a single file through the complete pipeline
 */
app.post('/api/analyze', async (req: Request, res: Response) => {
  const { filePath } = req.body;

  if (!filePath) {
    return res.status(400).json({
      status: 'error',
      message: 'File path is required',
      timestamp: new Date().toISOString()
    });
  }

  console.log(`[API] Analyzing file: ${filePath}`);

  try {
    // Verify file exists
    await fs.access(filePath);
    const fileStats = await fs.stat(filePath);

    // Simulate processing steps
    console.log('[API] Step 1: Parsing file...');
    await new Promise(resolve => setTimeout(resolve, 500));
    
    console.log('[API] Step 2: Chunking document...');
    await new Promise(resolve => setTimeout(resolve, 500));
    
    console.log('[API] Step 3: RAG analysis...');
    await new Promise(resolve => setTimeout(resolve, 500));
    
    console.log('[API] Step 4: LLM analysis...');
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Mock analysis result
    const analysis = `
📄 Document Analysis Complete

File: ${path.basename(filePath)}
Size: ${(fileStats.size / 1024).toFixed(2)} KB
Type: ${path.extname(filePath)}

Summary:
The document has been successfully processed through the analysis pipeline.

Pipeline Steps:
✅ Step 1: File Parsing - Document structure extracted
✅ Step 2: Semantic Chunking - Content segmented for analysis
✅ Step 3: RAG Indexing - Regulatory context retrieved
✅ Step 4: LLM Analysis - Compliance assessment generated

Analysis Results:
This is a MOCK analysis for the simple POC. In production, this would contain:
- Detailed regulatory compliance assessment
- Comparison against FDA 510(k) requirements
- Identification of missing documentation
- Recommendations for addressing gaps
- Risk analysis and mitigation strategies

Next Steps for Full Implementation:
1. Integrate actual file-parser module for PDF/DOCX extraction
2. Apply semantic chunking with proper boundaries
3. Index chunks in RAG vector database
4. Retrieve relevant regulatory context
5. Generate detailed LLM analysis with Claude/GPT
6. Provide actionable compliance recommendations

Status: ✅ POC Pipeline Complete
Time: ${new Date().toLocaleTimeString()}
`;

    res.json({
      status: 'complete',
      message: 'Analysis successful',
      detailedReport: analysis,
      timestamp: new Date().toISOString(),
      metadata: {
        fileName: path.basename(filePath),
        fileSize: (fileStats.size / 1024).toFixed(2) + ' KB',
        fileType: path.extname(filePath)
      }
    });

  } catch (error) {
    console.error('[API] Analysis error:', error);
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Analysis failed',
      timestamp: new Date().toISOString()
    });
  }
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
