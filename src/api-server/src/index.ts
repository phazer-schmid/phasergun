import express, { Request, Response } from 'express';
import cors from 'cors';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { config } from 'dotenv';
import { DHFScanner } from '@fda-compliance/dhf-scanner';
import { PhaseDHFMapping } from '@fda-compliance/shared-types';
import pdf from 'pdf-parse';
import { parseCheckDocument, listCheckFiles, getCheckFilePath } from '../../rag-service/src/check-parser.js';
// We'll add caching later after fixing module structure
// For now, the LLMs are deterministic (temperature=0) which is the key requirement

// Load environment variables
config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Global DHF mapping cache
let dhfMapping: PhaseDHFMapping[] = [];

// Global folder structure cache
let folderStructure: any = null;

/**
 * Load folder structure from YAML file
 */
async function loadFolderStructure(): Promise<void> {
  try {
    const yamlPath = path.join(__dirname, '../../rag-service/config/folder-structure.yaml');
    const fileContents = await fs.readFile(yamlPath, 'utf8');
    folderStructure = yaml.load(fileContents) as any;
    console.log(`[API] Loaded folder structure with ${Object.keys(folderStructure.folder_structure).length} phases`);
  } catch (error) {
    console.error('[API] Error loading folder structure:', error);
    throw error;
  }
}

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
 * GET /api/folder-structure
 * Get the folder structure from folder-structure.yaml
 */
app.get('/api/folder-structure', async (_req: Request, res: Response) => {
  try {
    const yamlPath = path.join(__dirname, '../../rag-service/config/folder-structure.yaml');
    const fileContents = await fs.readFile(yamlPath, 'utf8');
    const folderStructure = yaml.load(fileContents) as any;
    
    res.json(folderStructure);
  } catch (error) {
    console.error('[API] Error loading folder structure:', error);
    res.status(500).json({
      error: 'Failed to load folder structure',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/list-files
 * List files in a specific directory
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
 * Parse phase and category from file path using folder structure
 */
function parsePhaseAndCategory(filePath: string): {
  phaseId: number | null;
  phaseName: string | null;
  category: string | null;
  categoryPath: string | null;
  categoryId: string | null;
} {
  if (!folderStructure) {
    return { phaseId: null, phaseName: null, category: null, categoryPath: null, categoryId: null };
  }

  // Normalize file path for comparison
  const normalizedPath = filePath.replace(/\\/g, '/');

  // Try to match against all phase categories in folder-structure.yaml
  for (const [phaseKey, phaseData] of Object.entries(folderStructure.folder_structure)) {
    const phase = phaseData as any;
    
    if (phase.categories && Array.isArray(phase.categories)) {
      for (const category of phase.categories) {
        const folderPath = category.folder_path;
        
        // Check if file path contains this category folder
        // Handle both "Category Name/" and just "Category Name"
        const folderPattern = folderPath.replace(/\//g, '\\/');
        const regex = new RegExp(`[/\\\\]${folderPattern}[/\\\\]`, 'i');
        
        if (regex.test(normalizedPath) || normalizedPath.includes(`/${folderPath}/`) || normalizedPath.includes(`\\${folderPath}\\`)) {
          return {
            phaseId: phase.phase_id,
            phaseName: phase.phase_name,
            category: category.category_name,
            categoryPath: folderPath,
            categoryId: category.category_id
          };
        }
      }
    }
  }

  // Fallback: try old pattern matching for backwards compatibility
  const phaseMatch = normalizedPath.match(/Phase\s+(\d+)/i);
  const categoryMatch = normalizedPath.match(/Phase\s+\d+[/\\]([^/\\]+)/i);
  
  if (phaseMatch) {
    const phaseId = parseInt(phaseMatch[1]);
    const category = categoryMatch ? categoryMatch[1].trim() : null;
    
    return {
      phaseId,
      phaseName: `Phase ${phaseId}`,
      category,
      categoryPath: category ? `Phase ${phaseId}/${category}` : null,
      categoryId: null
    };
  }

  return { phaseId: null, phaseName: null, category: null, categoryPath: null, categoryId: null };
}

/**
 * Load validation criteria for specific phase and category
 */
async function loadValidationCriteria(phaseId: number, categoryPath: string, categoryId: string | null): Promise<any> {
  try {
    const validationPath = path.join(__dirname, `../../rag-service/config/validation/phase${phaseId}-validation.yaml`);
    const fileContents = await fs.readFile(validationPath, 'utf8');
    const data = yaml.load(fileContents) as any;
    
    // First try to match by category_id (more reliable)
    if (categoryId) {
      for (const [key, value] of Object.entries(data)) {
        if (key === categoryId && typeof value === 'object' && value !== null) {
          const category = value as any;
          return {
            categoryKey: key,
            displayName: category.display_name,
            folderPath: category.folder_path || categoryPath,
            checkCount: category.check_count,
            validationChecks: category.validation_checks || []
          };
        }
      }
    }
    
    // Fallback: match by folder_path or folder_category_id
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'object' && value !== null) {
        const category = value as any;
        if (category.folder_path === categoryPath || category.folder_category_id === categoryId) {
          return {
            categoryKey: key,
            displayName: category.display_name,
            folderPath: category.folder_path || categoryPath,
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
 * GET /api/checks/:phaseId
 * List available check documents for a specific phase
 */
app.get('/api/checks/:phaseId', async (req: Request, res: Response) => {
  const { phaseId } = req.params;
  const phase = parseInt(phaseId, 10);

  if (isNaN(phase) || phase < 1 || phase > 4) {
    return res.status(400).json({
      error: 'Invalid phase ID',
      message: 'Phase ID must be a number between 1 and 4'
    });
  }

  try {
    const ragChecksPath = process.env.RAG_CHECKS;
    
    if (!ragChecksPath) {
      return res.status(500).json({
        error: 'RAG_CHECKS path not configured',
        message: 'RAG_CHECKS environment variable must be set in .env file'
      });
    }

    const checkFiles = await listCheckFiles(ragChecksPath, phase);
    
    // Format check files for UI (remove .docx extension)
    const checks = checkFiles.map(filename => ({
      filename,
      displayName: filename.replace(/\.docx$/i, '')
    }));

    res.json({ checks });
    
  } catch (error) {
    console.error(`[API] Error listing checks for Phase ${phase}:`, error);
    res.status(500).json({
      error: 'Failed to list checks',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/analyze
 * Analyze a single file with REAL or MOCK LLM using a selected check document
 */
app.post('/api/analyze', async (req: Request, res: Response) => {
  const { filePath, selectedCheck } = req.body;

  if (!filePath) {
    return res.status(400).json({
      status: 'error',
      message: 'File path is required',
      timestamp: new Date().toISOString()
    });
  }

  if (!selectedCheck) {
    return res.status(400).json({
      status: 'error',
      message: 'Please select a validation check before analyzing',
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
    
    // Parse phase from file path
    const pathInfo = parsePhaseAndCategory(filePath);
    console.log(`[API] Detected Phase: ${pathInfo.phaseName || 'Unknown'}`);
    
    // Get RAG checks path
    const ragChecksPath = process.env.RAG_CHECKS;
    if (!ragChecksPath) {
      return res.status(500).json({
        status: 'error',
        message: 'RAG_CHECKS path not configured - check server .env file',
        timestamp: new Date().toISOString()
      });
    }
    
    // Parse the selected check document
    if (!pathInfo.phaseId) {
      return res.status(400).json({
        status: 'error',
        message: 'Unable to determine phase from file path',
        timestamp: new Date().toISOString()
      });
    }
    
    const checkFilePath = getCheckFilePath(ragChecksPath, pathInfo.phaseId, selectedCheck);
    console.log(`[API] Parsing check: ${selectedCheck}`);
    
    const parsedCheck = await parseCheckDocument(checkFilePath, selectedCheck, pathInfo.phaseId);
    
    if (!parsedCheck.success) {
      return res.status(400).json({
        status: 'error',
        message: parsedCheck.error,
        timestamp: new Date().toISOString()
      });
    }
    
    console.log(`[API] Check parsed successfully: ${parsedCheck.checkName}`);
    console.log(`[API] Found ${parsedCheck.criteria.length} criteria\n`);
    
    // Read file content based on type
    let fileContent: string;
    const fileExtension = path.extname(filePath).toLowerCase();
    
    if (fileExtension === '.pdf') {
      // Parse PDF properly
      console.log(`[API] Parsing PDF file...`);
      const dataBuffer = await fs.readFile(filePath);
      const pdfData = await pdf(dataBuffer);
      fileContent = pdfData.text;
      console.log(`[API] PDF parsed: ${pdfData.numpages} pages, ${fileContent.length} characters`);
    } else {
      // Read as text file
      fileContent = await fs.readFile(filePath, 'utf-8');
    }
    
    // Check content size and truncate if needed (Anthropic has 200k token limit = ~150k chars safe limit)
    const MAX_CONTENT_CHARS = 150000; // Conservative limit to avoid rate limits
    const contentTruncated = fileContent.length > MAX_CONTENT_CHARS;
    
    if (contentTruncated) {
      console.log(`[API] ⚠️  File content too large (${fileContent.length} chars), truncating to ${MAX_CONTENT_CHARS} chars`);
      fileContent = fileContent.substring(0, MAX_CONTENT_CHARS) + '\n\n[... Content truncated due to size. Consider using document chunking for large files ...]';
    }

    // Check LLM mode from environment
    const llmMode = process.env.LLM_MODE || 'mock';
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    const anthropicModel = process.env.ANTHROPIC_MODEL || 'claude-3-haiku-20240307';
    const mistralApiKey = process.env.MISTRAL_API_KEY;
    const mistralModel = process.env.MISTRAL_MODEL || 'mistral-small-latest';
    const ollamaModel = process.env.OLLAMA_MODEL || 'llama3.1:70b';
    const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

    console.log(`[API] LLM Mode: ${llmMode.toUpperCase()}`);

    // Choose LLM service based on mode
    let llmService;
    let analysis: string;

    if (llmMode === 'ollama') {
      // Use Ollama (local open-source models)
      console.log(`[API] Using Ollama with model: ${ollamaModel}\n`);
      
      const { OllamaLLMService } = await import('../../llm-service/dist/ollama-service.js');
      llmService = new OllamaLLMService(ollamaModel, { baseUrl: ollamaBaseUrl });
      
    } else if (llmMode === 'mistral' && mistralApiKey) {
      // Use Mistral AI
      console.log(`[API] Using Mistral AI API (${mistralModel})\n`);
      
      const { MistralLLMService } = await import('../../llm-service/dist/mistral-service.js');
      llmService = new MistralLLMService(mistralApiKey, mistralModel);
      
    } else if (llmMode === 'anthropic' && anthropicApiKey) {
      // Use REAL Anthropic Claude
      console.log(`[API] Using Anthropic Claude API (${anthropicModel})\n`);
      
      const { AnthropicLLMService } = await import('../../llm-service/dist/anthropic-service.js');
      llmService = new AnthropicLLMService(anthropicApiKey, anthropicModel);
    }

    // Generate analysis with selected LLM service
    if (llmService) {
      // Build prompt using parsed check criteria
      const prompt = `You are a language processing tool analyzing a medical device document against specific criteria.

Your role is to:
1. Compare the document content against each criterion
2. Identify where criteria are met or not met  
3. Provide location-specific findings with exact quotes

You are NOT using your own FDA/ISO knowledge. Only evaluate against the provided criteria.

DOCUMENT TO ANALYZE:
File: ${path.basename(filePath)}
Size: ${(fileStats.size / 1024).toFixed(2)} KB

CHECK: ${parsedCheck.checkName}

CRITERIA FROM CHECK DOCUMENT:
${parsedCheck.criteria.map((criterion, idx) => `${idx + 1}. ${criterion}`).join('\n')}

DOCUMENT CONTENT:
${fileContent}

For EACH criterion, provide:
- Criterion: [restate exactly]
- Status: PASS | FAIL | PARTIAL
- Findings: [detailed explanation with specific locations]
- Locations: [section names, page numbers, paragraph numbers]
- Quotes: [exact text from document]

CRITICAL REQUIREMENTS:
- Reference specific document locations (e.g., "Section 2.1", "Page 3, paragraph 2")
- Quote exact text when identifying issues
- Do not use external regulatory knowledge
- Base analysis ONLY on the criteria provided
- For FAIL status, clearly state what is missing and where it should be located

Provide your analysis in a clear, structured format that addresses each criterion individually.

Temperature: 0 (deterministic output required)`;

      // Call LLM API for analysis
      console.log('[API] Calling LLM API...');
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
    // Load folder structure and DHF mapping on startup
    await loadFolderStructure();
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
