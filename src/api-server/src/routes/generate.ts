import { Router } from 'express';
import { OrchestratorService } from '@fda-compliance/orchestrator';
import { ComprehensiveFileParser } from '@fda-compliance/file-parser';
import { IntelligentChunker } from '@fda-compliance/chunker';
import { EnhancedRAGService } from '@fda-compliance/rag-service';
import * as path from 'path';

const router = Router();

/**
 * POST /api/generate
 * Generate text from a prompt using semantic RAG
 */
router.post('/generate', async (req, res) => {
  try {
    const { projectPath, primaryContextPath, prompt, options } = req.body;
    
    // Validate input
    if (!projectPath || !primaryContextPath || !prompt) {
      return res.status(400).json({
        error: 'Missing required fields: projectPath, primaryContextPath, prompt'
      });
    }
    
    console.log(`\n[API /generate] ========================================`);
    console.log(`[API /generate] Prompt-based generation request`);
    console.log(`[API /generate] Project: ${projectPath}`);
    console.log(`[API /generate] Prompt length: ${prompt.length} chars`);
    console.log(`[API /generate] ========================================\n`);
    
    // Initialize services
    const fileParser = new ComprehensiveFileParser();
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
      const { OllamaLLMService } = await import('@fda-compliance/llm-service');
      llmService = new OllamaLLMService(ollamaModel, { baseUrl: ollamaBaseUrl });
      
    } else if (llmMode === 'mistral' && mistralApiKey) {
      console.log(`[API /generate] Using Mistral AI (${mistralModel})`);
      const { MistralLLMService } = await import('@fda-compliance/llm-service');
      llmService = new MistralLLMService(mistralApiKey, mistralModel);
      
    } else if (llmMode === 'groq' && groqApiKey) {
      console.log(`[API /generate] Using Groq LPU (${groqModel})`);
      const { GroqLLMService } = await import('@fda-compliance/llm-service');
      llmService = new GroqLLMService(groqApiKey, groqModel);
      
    } else if (llmMode === 'anthropic' && anthropicApiKey) {
      console.log(`[API /generate] Using Anthropic Claude (${anthropicModel})`);
      const { AnthropicLLMService } = await import('@fda-compliance/llm-service');
      llmService = new AnthropicLLMService(anthropicApiKey, anthropicModel);
    } else {
      console.log(`[API /generate] Using MOCK LLM Service`);
      const { MockLLMService } = await import('@fda-compliance/llm-service');
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
    console.log(`[API /generate] ========================================\n`);
    
    // Return with sources for footnotes
    res.json({
      success: true,
      generatedText: result.generatedText,
      sources: result.sources,
      usageStats: result.usageStats
    });
    
  } catch (error) {
    console.error('[API /generate] Error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
