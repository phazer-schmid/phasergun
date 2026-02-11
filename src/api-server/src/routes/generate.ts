import { Router } from 'express';
import { OrchestratorService } from '@phasergun/orchestrator';
import { ComprehensiveFileParser } from '@phasergun/file-parser';
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
    
    // Read prompt file content
    // Support both text files (.txt, .md) and Word documents (.docx)
    let prompt: string;
    try {
      const ext = path.extname(promptFilePath).toLowerCase();
      
      if (ext === '.docx') {
        console.log('[API /generate] Parsing Word document prompt (HTML mode for structure preservation)...');
        const mammoth = await import('mammoth');
        const buffer = await fs.readFile(promptFilePath);
        const htmlResult = await mammoth.convertToHtml({ buffer });
        
        if (!htmlResult.value || htmlResult.value.trim().length === 0) {
          throw new Error('Failed to parse .docx prompt file (empty HTML output)');
        }
        
        prompt = htmlResult.value;
        console.log(`[API /generate] ✓ Word document parsed as HTML (${prompt.length} chars, ${htmlResult.messages.length} warnings)`);
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
    
    // Initialize services
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
    
    // Create orchestrator with simplified dependencies
    const orchestrator = new OrchestratorService(
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
    console.log(`[API /generate] Status: ${result.status}`);
    console.log(`[API /generate] References: ${result.references?.length || 0}`);
    console.log(`[API /generate] Confidence: ${result.confidence?.level || 'N/A'}`);
    console.log(`[API /generate] Tokens: ${result.usageStats?.tokensUsed || 0}`);
    console.log(`[API /generate] Generated text length: ${result.generatedContent?.length || 0} chars`);
    console.log(`[API /generate] Generated text preview: ${result.generatedContent?.substring(0, 200) || '(empty)'}`);
    console.log(`[API /generate] ========================================\n`);
    
    // Check if generation was successful
    if (result.status === 'error') {
      console.error('[API /generate] ❌ ERROR: Generation failed');
      return res.status(500).json(result);
    }
    
    // Validate that we have generated text
    if (!result.generatedContent || result.generatedContent.trim().length === 0) {
      console.error('[API /generate] ❌ ERROR: Generated text is empty or missing!');
      console.error('[API /generate] Full result object:', JSON.stringify(result, null, 2));
      return res.status(500).json({
        status: 'error',
        message: 'Generated text is empty. This may indicate an issue with the LLM service.',
        timestamp: new Date().toISOString(),
        usageStats: result.usageStats
      });
    }
    
    // Trim leading whitespace from generated text to ensure it displays properly
    const cleanedText = result.generatedContent.trimStart();
    
    // Return the complete GenerationOutput (orchestrator now provides all fields)
    const response = {
      ...result,
      generatedContent: cleanedText
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
