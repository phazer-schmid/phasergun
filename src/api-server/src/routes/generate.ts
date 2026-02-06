import { Router } from 'express';
import { OrchestratorService } from '@phasergun/orchestrator';
import { ComprehensiveFileParser } from '@phasergun/file-parser';
import { IntelligentChunker } from '@phasergun/chunker';
import { EnhancedRAGService } from '@phasergun/rag-service';
import * as path from 'path';
import * as fs from 'fs/promises';

const router = Router();

/**
 * POST /api/generate
 * Generate text from a prompt using semantic RAG
 */
router.post('/generate', async (req, res) => {
  try {
    const { projectPath, promptFilePath, options } = req.body;
    
    // Validate input
    if (!projectPath || !promptFilePath) {
      return res.status(400).json({
        error: 'Missing required fields: projectPath, promptFilePath'
      });
    }
    
    // Initialize file parser early (needed for .docx prompt files)
    const fileParser = new ComprehensiveFileParser();
    
    // Read prompt file content
    // Support both text files (.txt, .md) and Word documents (.docx)
    let prompt: string;
    try {
      const ext = path.extname(promptFilePath).toLowerCase();
      
      if (ext === '.docx') {
        // Use file parser for Word documents
        console.log('[API /generate] Parsing Word document prompt...');
        const parsedDocs = await fileParser.scanAndParseFolder(path.dirname(promptFilePath));
        const promptDoc = parsedDocs.find(doc => doc.filePath === promptFilePath);
        
        if (!promptDoc) {
          throw new Error('Failed to parse .docx prompt file');
        }
        
        prompt = promptDoc.content;
        console.log('[API /generate] ✓ Word document parsed successfully');
      } else {
        // Read as plain text for .txt, .md, etc.
        prompt = await fs.readFile(promptFilePath, 'utf-8');
      }
    } catch (error) {
      console.error('[API /generate] Failed to read prompt file:', error);
      return res.status(400).json({
        error: `Failed to read prompt file: ${promptFilePath}. Supported formats: .txt, .md, .docx`
      });
    }
    
    // Determine primaryContextPath (from env or default location)
    const primaryContextPath = process.env.PRIMARY_CONTEXT_PATH || 
      path.join(__dirname, '../../../rag-service/knowledge-base/context/primary-context.yaml');
    
    console.log(`\n[API /generate] ========================================`);
    console.log(`[API /generate] Prompt-based generation request`);
    console.log(`[API /generate] Project: ${projectPath}`);
    console.log(`[API /generate] Prompt file: ${promptFilePath}`);
    console.log(`[API /generate] Prompt length: ${prompt.length} chars`);
    console.log(`[API /generate] Primary context: ${primaryContextPath}`);
    console.log(`[API /generate] ========================================\n`);
    
    // Initialize remaining services
    const chunker = new IntelligentChunker();
    const enhancedRAGService = new EnhancedRAGService();
    
    // Choose LLM service based on environment
    const llmMode = process.env.LLM_MODE || 'mock';
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    const anthropicModel = process.env.ANTHROPIC_MODEL || 'claude-3-haiku-20240307';
    const mistralApiKey = process.env.MISTRAL_API_KEY;
    const mistralModel = process.env.MISTRAL_MODEL || 'mistral-small-latest';
    const groqApiKey = process.env.GROQ_API_KEY;
    const groqModel = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';
    const ollamaModel = process.env.OLLAMA_MODEL || 'llama3.1:70b';
    const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    
    let llmService: any;
    
    if (llmMode === 'ollama') {
      console.log(`[API /generate] Using Ollama with model: ${ollamaModel}`);
      const { OllamaLLMService } = await import('@phasergun/llm-service');
      llmService = new OllamaLLMService(ollamaModel, { baseUrl: ollamaBaseUrl });
      
    } else if (llmMode === 'mistral' && mistralApiKey) {
      console.log(`[API /generate] Using Mistral AI (${mistralModel})`);
      const { MistralLLMService } = await import('@phasergun/llm-service');
      llmService = new MistralLLMService(mistralApiKey, mistralModel);
      
    } else if (llmMode === 'groq' && groqApiKey) {
      console.log(`[API /generate] Using Groq LPU (${groqModel})`);
      const { GroqLLMService } = await import('@phasergun/llm-service');
      llmService = new GroqLLMService(groqApiKey, groqModel);
      
    } else if (llmMode === 'anthropic' && anthropicApiKey) {
      console.log(`[API /generate] Using Anthropic Claude (${anthropicModel})`);
      const { AnthropicLLMService } = await import('@phasergun/llm-service');
      llmService = new AnthropicLLMService(anthropicApiKey, anthropicModel);
    } else {
      console.log(`[API /generate] Using MOCK LLM Service`);
      const { MockLLMService } = await import('@phasergun/llm-service');
      llmService = new MockLLMService();
    }
    
    // Create orchestrator
    const orchestrator = new OrchestratorService(
      fileParser,
      chunker,
      enhancedRAGService,
      llmService
    );
    
    // Generate
    const result = await orchestrator.generateFromPrompt({
      projectPath,
      primaryContextPath,
      prompt,
      options
    });
    
    console.log(`[API /generate] ========================================`);
    console.log(`[API /generate] Generation complete`);
    console.log(`[API /generate] Sources: ${result.sources.length}`);
    console.log(`[API /generate] Tokens: ${result.usageStats.tokensUsed}`);
    console.log(`[API /generate] Generated text length: ${result.generatedText?.length || 0} chars`);
    console.log(`[API /generate] Generated text preview: ${result.generatedText?.substring(0, 200) || '(empty)'}`);
    console.log(`[API /generate] ========================================\n`);
    
    // Validate that we have generated text
    if (!result.generatedText || result.generatedText.trim().length === 0) {
      console.error('[API /generate] ❌ ERROR: Generated text is empty or missing!');
      console.error('[API /generate] Full result object:', JSON.stringify(result, null, 2));
      return res.status(500).json({
        status: 'error',
        error: 'Generated text is empty. This may indicate an issue with the LLM service.',
        details: {
          sources: result.sources.length,
          tokensUsed: result.usageStats?.tokensUsed || 0
        }
      });
    }
    
    // Trim leading whitespace from generated text to ensure it displays properly
    const cleanedText = result.generatedText.trimStart();
    
    // Return in GenerationOutput format (aligns with primary-context.yaml generation_workflow.output)
    const response: any = {
      status: 'complete',
      message: 'Content generated successfully',
      timestamp: new Date().toISOString(),
      generatedContent: cleanedText,
      
      // Placeholder fields - will be populated by orchestrator in next iteration
      discrepancies: (result as any).discrepancies || [],
      references: (result as any).references || result.sources || [],
      confidence: (result as any).confidence || undefined,
      
      // Token usage
      usageStats: result.usageStats,
      
      // Additional metadata (footnotes, etc.)
      metadata: {
        footnotes: result.footnotes,
        footnotesMap: result.footnotesMap
      }
    };
    
    res.json(response);
    
  } catch (error) {
    console.error('[API /generate] ❌ CAUGHT ERROR:', error);
    console.error('[API /generate] Error stack:', error instanceof Error ? error.stack : 'N/A');
    res.status(500).json({
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.stack : undefined) : undefined
    });
  }
});

export default router;
