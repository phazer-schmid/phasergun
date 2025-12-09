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
 * Parse phase and category from file path
 */
function parsePhaseAndCategory(filePath: string): {
  phaseId: number | null;
  phaseName: string | null;
  category: string | null;
  categoryPath: string | null;
} {
  // Extract "Phase 1", "Phase 2", etc.
  const phaseMatch = filePath.match(/Phase\s+(\d+)/i);
  // Extract category folder (text between "Phase X/" and the next "/")
  const categoryMatch = filePath.match(/Phase\s+\d+\/([^/]+)/i);
  
  const phaseId = phaseMatch ? parseInt(phaseMatch[1]) : null;
  const category = categoryMatch ? categoryMatch[1].trim() : null;
  
  return {
    phaseId,
    phaseName: phaseId ? `Phase ${phaseId}` : null,
    category,
    categoryPath: phaseId && category ? `Phase ${phaseId}/${category}` : null
  };
}

/**
 * Load validation criteria for specific phase and category
 */
async function loadValidationCriteria(phaseId: number, categoryPath: string): Promise<any> {
  try {
    const validationPath = path.join(__dirname, `../../rag-service/config/validation/phase${phaseId}-validation.yaml`);
    const fileContents = await fs.readFile(validationPath, 'utf8');
    const data = yaml.load(fileContents) as any;
    
    // Find matching category by folder_path
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'object' && value !== null) {
        const category = value as any;
        if (category.folder_path === categoryPath) {
          return {
            categoryKey: key,
            displayName: category.display_name,
            folderPath: category.folder_path,
            checkCount: category.check_count,
            validationChecks: category.validation_checks || []
          };
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error(`[API] Error loading validation criteria:`, error);
    return null;
  }
}

/**
 * POST /api/analyze
 * Analyze a single file with REAL or MOCK LLM
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

  console.log(`\n[API] ========================================`);
  console.log(`[API] Starting Analysis`);
  console.log(`[API] File: ${filePath}`);
  console.log(`[API] ========================================\n`);

  try {
    // Verify file exists
    await fs.access(filePath);
    const fileStats = await fs.stat(filePath);
    
    // Check if it's a directory
    if (fileStats.isDirectory()) {
      return res.status(400).json({
        status: 'error',
        message: `The path is a directory, not a file. Please select a specific file to analyze.`,
        detailedReport: `Error: "${path.basename(filePath)}" is a directory.\n\nPlease provide the full path to a specific file (e.g., .txt, .pdf, .docx) instead of a folder.`,
        timestamp: new Date().toISOString()
      });
    }
    
    // Parse phase and category from file path
    const pathInfo = parsePhaseAndCategory(filePath);
    console.log(`[API] Detected Phase: ${pathInfo.phaseName || 'Unknown'}`);
    console.log(`[API] Detected Category: ${pathInfo.category || 'Unknown'}`);
    
    // Load category-specific validation criteria
    let validationCriteria: any = null;
    if (pathInfo.phaseId && pathInfo.categoryPath) {
      validationCriteria = await loadValidationCriteria(pathInfo.phaseId, pathInfo.categoryPath);
      if (validationCriteria) {
        console.log(`[API] Loaded ${validationCriteria.checkCount} validation checks for ${validationCriteria.displayName}\n`);
      } else {
        console.log(`[API] No validation criteria found for ${pathInfo.categoryPath}\n`);
      }
    }
    
    // Read file content
    const fileContent = await fs.readFile(filePath, 'utf-8');

    // Check LLM mode from environment
    const llmMode = process.env.LLM_MODE || 'mock';
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    const anthropicModel = process.env.ANTHROPIC_MODEL || 'claude-3-haiku-20240307';

    console.log(`[API] LLM Mode: ${llmMode.toUpperCase()}`);

    // Choose LLM service based on mode
    let llmService;
    let analysis: string;

    if (llmMode === 'real' && anthropicApiKey) {
      // Use REAL Anthropic Claude
      console.log(`[API] Using REAL Anthropic Claude API\n`);
      
      const { AnthropicLLMService } = await import('../../llm-service/dist/anthropic-service.js');
      llmService = new AnthropicLLMService(anthropicApiKey, anthropicModel);

      // Create phase and category-specific prompt
      let prompt = `You are an FDA regulatory compliance expert analyzing medical device documentation for 510(k) submission readiness.

DOCUMENT TO ANALYZE:
File: ${path.basename(filePath)}
Size: ${(fileStats.size / 1024).toFixed(2)} KB
`;

      if (validationCriteria) {
        // Category-specific analysis
        prompt += `Phase: ${pathInfo.phaseName}
Category: ${validationCriteria.displayName}

This document should be analyzed ONLY against the following ${validationCriteria.checkCount} specific validation criteria for ${validationCriteria.displayName}:

`;
        validationCriteria.validationChecks.forEach((check: any, index: number) => {
          prompt += `${index + 1}. [${check.check_id}] ${check.llm_validation.question}
   Regulatory Source: ${check.regulatory_source}
   Severity: ${check.severity}

`;
        });

        prompt += `
Content:
${fileContent}

Please provide a focused analysis addressing ONLY these ${validationCriteria.checkCount} validation criteria:

1. DOCUMENT ASSESSMENT
   - Document type and purpose
   - Relevance to ${validationCriteria.displayName}

2. VALIDATION CHECK RESULTS
   For each of the ${validationCriteria.checkCount} checks listed above:
   - Status: PASS/FAIL/PARTIAL
   - Evidence found (or missing)
   - Specific findings

3. COMPLIANCE SUMMARY
   - How many checks passed
   - Critical gaps identified
   - Overall readiness for this category

4. SPECIFIC RECOMMENDATIONS
   - What needs to be added/improved
   - References to regulatory requirements
   - Priority actions for ${validationCriteria.displayName}

Format as a professional regulatory analysis report focused on ${validationCriteria.displayName}.`;
      } else {
        // Generic analysis if category not detected
        prompt += `
Content:
${fileContent}

Please provide a comprehensive FDA 510(k) compliance analysis covering:

1. DOCUMENT ASSESSMENT
   - What type of document this appears to be
   - Quality and completeness of the content
   - Regulatory relevance

2. KEY FINDINGS
   - Strengths of the documentation
   - Compliance with FDA requirements
   - Alignment with ISO standards

3. RECOMMENDATIONS
   - Specific actions needed
   - Documentation gaps to address
   - Next steps for 510(k) readiness

4. REGULATORY COMPLIANCE STATUS
   - Overall readiness assessment
   - Risk areas
   - Timeline considerations

Format your response as a professional regulatory analysis report.`;
      }

      // Call real LLM
      console.log('[API] Calling Anthropic Claude API...');
      const llmResponse = await llmService.generateText(prompt);
      
      console.log(`[API] ✓ Analysis complete`);
      console.log(`[API] Tokens used: ${llmResponse.usageStats.tokensUsed}`);
      console.log(`[API] Cost: $${llmResponse.usageStats.cost.toFixed(4)}\n`);

      analysis = llmResponse.generatedText;

    } else {
      // Use MOCK service
      console.log(`[API] Using MOCK LLM Service\n`);
      
      analysis = `📄 Document Analysis Complete

File: ${path.basename(filePath)}
Size: ${(fileStats.size / 1024).toFixed(2)} KB
Type: ${path.extname(filePath)}

Summary:
This is a MOCK analysis. Set LLM_MODE=real and add your ANTHROPIC_API_KEY to get real AI analysis.

Pipeline Steps:
✅ Step 1: File Parsing - Document structure extracted
✅ Step 2: Semantic Chunking - Content segmented for analysis
✅ Step 3: RAG Indexing - Regulatory context retrieved
✅ Step 4: LLM Analysis - Compliance assessment generated

Status: ✅ POC Pipeline Complete (MOCK MODE)
Time: ${new Date().toLocaleTimeString()}

To enable REAL AI analysis:
1. Set ANTHROPIC_API_KEY in your .env file
2. Set LLM_MODE=real
3. Restart the API server`;
    }

    console.log(`[API] ========================================`);
    console.log(`[API] Analysis Complete`);
    console.log(`[API] ========================================\n`);

    res.json({
      status: 'complete',
      message: 'Analysis successful',
      detailedReport: analysis,
      timestamp: new Date().toISOString(),
      metadata: {
        fileName: path.basename(filePath),
        fileSize: (fileStats.size / 1024).toFixed(2) + ' KB',
        fileType: path.extname(filePath),
        llmMode: llmMode
      }
    });

  } catch (error) {
    console.error('\n[API] ❌ Analysis error:', error);
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
