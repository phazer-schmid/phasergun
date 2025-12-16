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
 * POST /api/google-drive/scan-structure
 * Scan Google Drive folder structure and match against folder-structure.yaml
 * Returns complete file tree for all phases and categories
 */
app.post('/api/google-drive/scan-structure', async (req: Request, res: Response) => {
  const { rootFolderId, driveId, accessToken } = req.body;

  if (!accessToken) {
    return res.status(401).json({
      error: 'Access token required',
      message: 'Please provide Google Drive access token'
    });
  }

  if (!rootFolderId) {
    return res.status(400).json({
      error: 'Root folder ID required',
      message: 'Please provide Google Drive root folder ID'
    });
  }

  try {
    const { google } = await import('googleapis');
    const drive = google.drive({ version: 'v3', auth: accessToken });

    // Load folder structure YAML
    const yamlPath = path.join(__dirname, '../../rag-service/config/folder-structure.yaml');
    const fileContents = await fs.readFile(yamlPath, 'utf8');
    const folderStructure = yaml.load(fileContents) as any;

    console.log(`[API] Scanning Google Drive structure from folder: ${rootFolderId}`);
    if (driveId) {
      console.log(`[API] Using Shared Drive: ${driveId}`);
    }

    // Helper function to find subfolder by name
    const findSubfolder = async (parentFolderId: string, folderName: string): Promise<string | null> => {
      const params: any = {
        q: `'${parentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and name='${folderName}' and trashed = false`,
        fields: 'files(id, name)',
        pageSize: 1,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true
      };

      if (driveId) {
        params.corpora = 'drive';
        params.driveId = driveId;
      }

      const response = await drive.files.list(params);
      const folders = response.data.files || [];
      
      if (folders.length > 0 && folders[0].id) {
        console.log(`[API] Found folder '${folderName}': ${folders[0].id}`);
        return folders[0].id;
      }
      
      console.log(`[API] Folder '${folderName}' not found in parent ${parentFolderId}`);
      return null;
    };

    // Helper function to list files in folder
    const listFiles = async (folderId: string): Promise<any[]> => {
      const params: any = {
        q: `'${folderId}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'`,
        fields: 'files(id, name, mimeType, size, modifiedTime)',
        orderBy: 'name',
        pageSize: 100,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true
      };

      if (driveId) {
        params.corpora = 'drive';
        params.driveId = driveId;
      }

      const response = await drive.files.list(params);
      return response.data.files || [];
    };

    // Build response structure
    const result: any = {
      phases: []
    };

    // Iterate through each phase
    for (const [phaseKey, phaseData] of Object.entries(folderStructure.folder_structure)) {
      const phase = phaseData as any;
      console.log(`[API] Processing ${phase.phase_name}...`);

      // Find phase folder
      const phaseFolderId = await findSubfolder(rootFolderId, phase.phase_path);
      
      if (!phaseFolderId) {
        console.log(`[API] Phase folder '${phase.phase_path}' not found, skipping`);
        continue;
      }

      const phaseResult: any = {
        phaseId: phase.phase_id,
        phaseName: phase.phase_name,
        categories: []
      };

      // Iterate through categories in this phase
      for (const category of phase.categories) {
        console.log(`[API]   Processing category: ${category.category_name}`);
        
        // Extract category folder name from path (e.g., "Phase 1/Planning and Scope" -> "Planning and Scope")
        const categoryFolderName = category.folder_path.split('/').pop();
        
        if (!categoryFolderName) {
          console.log(`[API]   Could not extract category folder name from: ${category.folder_path}`);
          continue;
        }

        // Find category folder
        const categoryFolderId = await findSubfolder(phaseFolderId, categoryFolderName);
        
        if (!categoryFolderId) {
          console.log(`[API]   Category folder '${categoryFolderName}' not found`);
          phaseResult.categories.push({
            categoryId: category.category_id,
            categoryName: category.category_name,
            required: category.required,
            files: []
          });
          continue;
        }

        // List files in category folder
        const files = await listFiles(categoryFolderId);
        console.log(`[API]   Found ${files.length} files in ${category.category_name}`);

        phaseResult.categories.push({
          categoryId: category.category_id,
          categoryName: category.category_name,
          required: category.required,
          folderId: categoryFolderId,
          files: files.map(file => ({
            id: file.id,
            name: file.name,
            mimeType: file.mimeType,
            size: file.size,
            modifiedTime: file.modifiedTime
          }))
        });
      }

      result.phases.push(phaseResult);
    }

    console.log(`[API] Scan complete. Found ${result.phases.length} phases`);

    res.json(result);
  } catch (error: any) {
    console.error('[API] Google Drive scan error:', error);
    res.status(500).json({
      error: 'Failed to scan Google Drive structure',
      message: error.message || 'Unknown error'
    });
  }
});

/**
 * POST /api/google-drive/list-files
 * List files in a Google Drive folder using access token from frontend
 */
app.post('/api/google-drive/list-files', async (req: Request, res: Response) => {
  const { folderId, accessToken } = req.body;

  if (!accessToken) {
    return res.status(401).json({
      error: 'Access token required',
      message: 'Please provide Google Drive access token'
    });
  }

  if (!folderId) {
    return res.status(400).json({
      error: 'Folder ID required',
      message: 'Please provide Google Drive folder ID'
    });
  }

  try {
    const { google } = await import('googleapis');
    const drive = google.drive({ version: 'v3', auth: accessToken });

    const response = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'files(id, name, mimeType, size, modifiedTime, webViewLink)',
      orderBy: 'folder,name',
      pageSize: 100
    });

    res.json({ files: response.data.files || [] });
  } catch (error: any) {
    console.error('[API] Google Drive list error:', error);
    res.status(500).json({
      error: 'Failed to list files',
      message: error.message || 'Unknown error'
    });
  }
});

/**
 * POST /api/google-drive/download-file
 * Download file content from Google Drive
 */
app.post('/api/google-drive/download-file', async (req: Request, res: Response) => {
  const { fileId, accessToken } = req.body;

  if (!accessToken) {
    return res.status(401).json({
      error: 'Access token required',
      message: 'Please provide Google Drive access token'
    });
  }

  if (!fileId) {
    return res.status(400).json({
      error: 'File ID required',
      message: 'Please provide Google Drive file ID'
    });
  }

  try {
    const { google } = await import('googleapis');
    const drive = google.drive({ version: 'v3', auth: accessToken });

    const response = await drive.files.get({
      fileId: fileId,
      alt: 'media'
    }, {
      responseType: 'text'
    });

    res.json({ content: response.data });
  } catch (error: any) {
    console.error('[API] Google Drive download error:', error);
    res.status(500).json({
      error: 'Failed to download file',
      message: error.message || 'Unknown error'
    });
  }
});

/**
 * POST /api/analyze-google-drive
 * Analyze a Google Drive file
 */
app.post('/api/analyze-google-drive', async (req: Request, res: Response) => {
  const { fileId, fileName, accessToken } = req.body;

  if (!accessToken) {
    return res.status(401).json({
      status: 'error',
      message: 'Access token required',
      timestamp: new Date().toISOString()
    });
  }

  if (!fileId) {
    return res.status(400).json({
      status: 'error',
      message: 'File ID required',
      timestamp: new Date().toISOString()
    });
  }

  console.log(`\n[API] ========================================`);
  console.log(`[API] Starting Google Drive Analysis`);
  console.log(`[API] File: ${fileName || fileId}`);
  console.log(`[API] ========================================\n`);

  try {
    // Download file from Google Drive
    const { google } = await import('googleapis');
    const drive = google.drive({ version: 'v3', auth: accessToken });

    // Get file metadata
    const fileMetadata = await drive.files.get({
      fileId: fileId,
      fields: 'name, size, mimeType, modifiedTime'
    });

    const realFileName = fileMetadata.data.name || fileName || 'unknown';
    const fileSize = parseInt(fileMetadata.data.size || '0');

    console.log(`[API] File name: ${realFileName}`);
    console.log(`[API] File size: ${(fileSize / 1024).toFixed(2)} KB`);

    // Download file content
    const response = await drive.files.get({
      fileId: fileId,
      alt: 'media'
    }, {
      responseType: 'text'
    });

    const fileContent = response.data as string;

    // Check LLM mode
    const llmMode = process.env.LLM_MODE || 'mock';
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    const anthropicModel = process.env.ANTHROPIC_MODEL || 'claude-3-haiku-20240307';
    
    console.log(`[API] LLM Mode: ${llmMode.toUpperCase()}`);

    let analysis: string;

    if (llmMode === 'anthropic' && anthropicApiKey) {
      // Use REAL Anthropic Claude
      console.log(`[API] Using Anthropic Claude API (${anthropicModel})\n`);
      
      const { AnthropicLLMService } = await import('../../llm-service/dist/anthropic-service.js');
      const llmService = new AnthropicLLMService(anthropicApiKey, anthropicModel);

      const prompt = `You are an FDA regulatory compliance expert analyzing medical device documentation for 510(k) submission readiness.

DOCUMENT TO ANALYZE:
File: ${realFileName}
Size: ${(fileSize / 1024).toFixed(2)} KB

DOCUMENT CONTENT:
${fileContent}

Analyze this document for FDA 510(k) compliance and provide:

1. DOCUMENT ASSESSMENT (2-3 sentences)
   What type of document is this and its purpose?

2. KEY FINDINGS
   - ✅ Strengths: What is well-documented
   - ❌ Gaps: Critical missing elements
   - ⚠️ Areas for improvement

3. RECOMMENDATIONS (5-10 items max)
   Specific actions to improve compliance:
   - What needs to be added/improved
   - Reference to FDA/ISO requirements
   - Priority level if applicable

Keep it concise but informative.`;

      const llmResponse = await llmService.generateText(prompt);
      
      console.log(`[API] ✓ Analysis complete`);
      console.log(`[API] Tokens used: ${llmResponse.usageStats.tokensUsed}`);
      console.log(`[API] Cost: $${llmResponse.usageStats.cost.toFixed(4)}\n`);

      analysis = llmResponse.generatedText;
    } else {
      // Use MOCK service
      console.log(`[API] Using MOCK LLM Service\n`);
      
      analysis = `📄 Document Analysis Complete (Google Drive)

File: ${realFileName}
Size: ${(fileSize / 1024).toFixed(2)} KB
Source: Google Drive

Summary:
This is a MOCK analysis of a Google Drive file. Set LLM_MODE=anthropic and add your ANTHROPIC_API_KEY to get real AI analysis.

Pipeline Steps:
✅ Step 1: Google Drive Authentication - Access token validated
✅ Step 2: File Download - Content retrieved from Google Drive
✅ Step 3: File Parsing - Document structure extracted
✅ Step 4: LLM Analysis - Compliance assessment generated

Status: ✅ Google Drive Integration Complete (MOCK MODE)
Time: ${new Date().toLocaleTimeString()}

To enable REAL AI analysis:
1. Set ANTHROPIC_API_KEY in your .env file
2. Set LLM_MODE=anthropic
3. Restart the API server`;
    }

    console.log(`[API] ========================================`);
    console.log(`[API] Google Drive Analysis Complete`);
    console.log(`[API] ========================================\n`);

    res.json({
      status: 'complete',
      message: 'Analysis successful',
      detailedReport: analysis,
      timestamp: new Date().toISOString(),
      metadata: {
        fileName: realFileName,
        fileSize: (fileSize / 1024).toFixed(2) + ' KB',
        fileType: path.extname(realFileName),
        llmMode: llmMode,
        source: 'google-drive'
      }
    });

  } catch (error: any) {
    console.error('\n[API] ❌ Google Drive analysis error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Analysis failed',
      timestamp: new Date().toISOString()
    });
  }
});

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
      // Create phase and category-specific prompt
      let prompt = `You are an FDA regulatory compliance expert analyzing medical device documentation for 510(k) submission readiness.

DOCUMENT TO ANALYZE:
File: ${path.basename(filePath)}
Size: ${(fileStats.size / 1024).toFixed(2)} KB
`;

      if (validationCriteria) {
        // Category-specific analysis with balanced detail
        prompt += `Phase: ${pathInfo.phaseName}
Category: ${validationCriteria.displayName}

VALIDATION CRITERIA:
`;
        validationCriteria.validationChecks.forEach((check: any, index: number) => {
          prompt += `${index + 1}. [${check.check_id}] ${check.llm_validation.question} (${check.severity})\n`;
        });

        prompt += `
DOCUMENT CONTENT:
${fileContent}

Analyze this document against the validation criteria above and provide:

1. DOCUMENT ASSESSMENT (2-3 sentences)
   What type of document is this and its overall quality?

2. KEY FINDINGS
   For each validation check, briefly state:
   - ✅ PASS: What was found and where
   - ❌ FAIL: What is missing or inadequate
   - ⚠️ PARTIAL: What needs improvement

3. CRITICAL RECOMMENDATIONS (5-10 items max)
   Specific actions to address gaps, with:
   - Brief context of the issue
   - Regulatory reference (check ID or standard)
   - Concrete action needed

Keep it concise but informative. Focus on actionable findings.`;
      } else {
        // Generic analysis with balanced detail
        prompt += `
DOCUMENT CONTENT:
${fileContent}

Analyze this document for FDA 510(k) compliance and provide:

1. DOCUMENT ASSESSMENT (2-3 sentences)
   What type of document is this and its purpose?

2. KEY FINDINGS
   - ✅ Strengths: What is well-documented
   - ❌ Gaps: Critical missing elements
   - ⚠️ Areas for improvement

3. RECOMMENDATIONS (5-10 items max)
   Specific actions to improve compliance:
   - What needs to be added/improved
   - Reference to FDA/ISO requirements
   - Priority level if applicable

Keep it concise but informative.`;
      }

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
