import { LLMResponse, KnowledgeContext } from '@phasergun/shared-types';

interface OllamaConfig {
  baseUrl?: string;
  model?: string;
  temperature?: number;
}

interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OllamaRequest {
  model: string;
  messages: OllamaMessage[];
  stream: boolean;
  options?: {
    temperature?: number;
    num_ctx?: number;
  };
}

interface OllamaResponse {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

/**
 * LLM Service implementation using Ollama
 * 
 * Supports local open-source models like:
 * - llama3.1:70b (recommended for FDA compliance)
 * - llama3.1:8b (faster, lower quality)
 * - qwen2.5:72b (alternative to llama)
 * - mixtral:8x7b (good balance)
 * 
 * @example
 * ```typescript
 * const service = new OllamaLLMService('llama3.1:70b');
 * const response = await service.generateText('Analyze this document...');
 * ```
 */
export class OllamaLLMService {
  private baseUrl: string;
  private model: string;
  private temperature: number;

  /**
   * Create a new Ollama LLM service
   * 
   * @param model - Model name (e.g., 'llama3.1:70b', 'llama3.1:8b')
   * @param config - Optional configuration
   */
  constructor(model: string = 'llama3.1:70b', config: OllamaConfig = {}) {
    this.baseUrl = config.baseUrl || 'http://localhost:11434';
    this.model = model;
    this.temperature = config.temperature !== undefined ? config.temperature : 0; // Deterministic by default

    console.log(`[OllamaLLMService] Initialized with model: ${this.model}`);
    console.log(`[OllamaLLMService] Ollama endpoint: ${this.baseUrl}`);
    console.log(`[OllamaLLMService] Temperature: ${this.temperature} (deterministic mode)`);
  }

  /**
   * Generate text using Ollama
   * 
   * @param prompt - The prompt to send to the model
   * @param context - Optional knowledge context (not used in Ollama, but kept for interface compatibility)
   * @returns LLM response with generated text and usage stats
   */
  async generateText(
    prompt: string,
    context?: KnowledgeContext
  ): Promise<LLMResponse> {
    const startTime = Date.now();

    try {
      console.log(`[OllamaLLMService] Generating text with prompt length: ${prompt.length}`);

      // Prepare the request
      const request: OllamaRequest = {
        model: this.model,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        stream: false,
        options: {
          temperature: this.temperature,
          num_ctx: 128000 // 128K context window
        }
      };

      // Make request to Ollama API
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(request)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama API error: ${response.status} - ${errorText}`);
      }

      const data: OllamaResponse = await response.json();
      const endTime = Date.now();
      const duration = endTime - startTime;

      const generatedText = data.message.content;
      
      // Calculate token estimates (Ollama doesn't provide exact token counts)
      const promptTokens = data.prompt_eval_count || Math.ceil(prompt.length / 4);
      const completionTokens = data.eval_count || Math.ceil(generatedText.length / 4);
      const totalTokens = promptTokens + completionTokens;

      console.log(`[OllamaLLMService] Response received in ${duration}ms`);
      console.log(`[OllamaLLMService] Estimated prompt tokens: ${promptTokens}`);
      console.log(`[OllamaLLMService] Estimated completion tokens: ${completionTokens}`);
      console.log(`[OllamaLLMService] Model: ${data.model}`);

      return {
        generatedText,
        usageStats: {
          tokensUsed: totalTokens,
          cost: 0 // Local models are free!
        }
      };
    } catch (error) {
      console.error('[OllamaLLMService] Error calling Ollama API:', error);
      
      if (error instanceof Error) {
        // Check for common Ollama issues
        if (error.message.includes('ECONNREFUSED') || error.message.includes('fetch failed')) {
          throw new Error(
            'Cannot connect to Ollama. Make sure Ollama is running:\n' +
            '1. Install: brew install ollama\n' +
            '2. Start: ollama serve\n' +
            '3. Pull model: ollama pull ' + this.model
          );
        }
        throw new Error(`Ollama API error: ${error.message}`);
      }
      
      throw error;
    }
  }

  /**
   * Check if Ollama is running and model is available
   */
  async healthCheck(): Promise<{
    isRunning: boolean;
    modelAvailable: boolean;
    availableModels: string[];
  }> {
    try {
      // Check if Ollama is running
      const response = await fetch(`${this.baseUrl}/api/tags`);
      
      if (!response.ok) {
        return {
          isRunning: false,
          modelAvailable: false,
          availableModels: []
        };
      }

      const data = await response.json();
      const availableModels = data.models?.map((m: any) => m.name) || [];
      const modelAvailable = availableModels.includes(this.model);

      return {
        isRunning: true,
        modelAvailable,
        availableModels
      };
    } catch (error) {
      return {
        isRunning: false,
        modelAvailable: false,
        availableModels: []
      };
    }
  }

  /**
   * Get information about the current model
   */
  async getModelInfo(): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/api/show`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name: this.model })
      });

      if (!response.ok) {
        return null;
      }

      return await response.json();
    } catch (error) {
      return null;
    }
  }
}
