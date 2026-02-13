import Anthropic from '@anthropic-ai/sdk';
import { LLMResponse, KnowledgeContext } from '@phasergun/shared-types';
import { LLMService } from './index';

/**
 * Anthropic Claude LLM Service
 * 
 * KEY CHANGE: Uses system message for role + reference materials,
 * user message for the task only. This dramatically reduces output
 * variance because:
 * 
 * 1. System messages are treated as persistent instructions, not
 *    conversational context the LLM can drift from.
 * 2. The task (user message) is shorter and more focused, so the
 *    LLM attends more precisely to format/structure requirements.
 * 3. Reference materials in the system message are treated as
 *    "things I know" rather than "things the user told me."
 */
export class AnthropicLLMService implements LLMService {
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string = 'claude-3-haiku-20240307') {
    this.client = new Anthropic({ apiKey });
    this.model = model;
    console.log(`[AnthropicLLMService] Initialized with model: ${model}`);
  }

  getModelName(): string {
    return this.model;
  }

  async generateText(prompt: string, context?: KnowledgeContext): Promise<LLMResponse> {
    console.log(`[AnthropicLLMService] Generating text with prompt length: ${prompt.length}`);
    
    if (context) {
      console.log(`[AnthropicLLMService] Using knowledge context with ${context.metadata.sources.length} sources`);
    }

    const enhancedPrompt = this.constructPromptWithContext(prompt, context);
    return this.generateTextWithRetry(enhancedPrompt);
  }

  private async generateTextWithRetry(
    enhancedPrompt: string,
    retryCount: number = 0,
    maxRetries: number = 5
  ): Promise<LLMResponse> {
    try {
      // Split on the TASK marker injected by the orchestrator's buildLLMPrompt.
      // Everything before === TASK === is system context (role + reference materials).
      // Everything from === TASK === onward is the user's prompt.
      const taskMarker = '=== TASK ===';
      const markerIndex = enhancedPrompt.indexOf(taskMarker);
      
      let systemMessage: string;
      let userMessage: string;
      
      if (markerIndex !== -1) {
        systemMessage = enhancedPrompt.substring(0, markerIndex).trim();
        userMessage = enhancedPrompt.substring(markerIndex).trim();
      } else {
        // Fallback: no marker found, send everything as user message
        systemMessage = '';
        userMessage = enhancedPrompt;
      }

      const startTime = Date.now();
      
      const requestParams: any = {
        model: this.model,
        max_tokens: 4000,
        temperature: 0,
        top_k: 1,
        messages: [{
          role: 'user',
          content: userMessage
        }]
      };
      
      // Only include system message if we have one
      if (systemMessage.length > 0) {
        requestParams.system = systemMessage;
      }

      const response = await this.client.messages.create(requestParams);

      const duration = Date.now() - startTime;
      
      const textContent = response.content
        .filter(block => block.type === 'text')
        .map(block => (block as any).text)
        .join('\n');

      console.log(`[AnthropicLLMService] Response received in ${duration}ms`);
      console.log(`[AnthropicLLMService] System message: ${systemMessage.length} chars`);
      console.log(`[AnthropicLLMService] User message: ${userMessage.length} chars`);
      console.log(`[AnthropicLLMService] Input tokens: ${response.usage.input_tokens}`);
      console.log(`[AnthropicLLMService] Output tokens: ${response.usage.output_tokens}`);

      const isHaiku = this.model.includes('haiku');
      const inputRate = isHaiku ? 0.25 : 3.00;
      const outputRate = isHaiku ? 1.25 : 15.00;
      
      const inputCost = (response.usage.input_tokens / 1000000) * inputRate;
      const outputCost = (response.usage.output_tokens / 1000000) * outputRate;
      const totalCost = inputCost + outputCost;

      console.log(`[AnthropicLLMService] Cost: $${totalCost.toFixed(4)} (${isHaiku ? 'Haiku' : 'Sonnet'} pricing)`);

      return {
        generatedText: textContent,
        usageStats: {
          tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
          cost: totalCost
        }
      };

    } catch (error: any) {
      const isRateLimitError = 
        error?.status === 429 || 
        error?.error?.type === 'rate_limit_error' ||
        (error?.message && error.message.includes('rate_limit'));

      if (isRateLimitError && retryCount < maxRetries) {
        const delaySeconds = Math.pow(2, retryCount + 1);
        
        console.warn(`[AnthropicLLMService] ⚠️  Rate limit hit. Retry ${retryCount + 1}/${maxRetries} after ${delaySeconds}s`);
        
        await new Promise(resolve => setTimeout(resolve, delaySeconds * 1000));
        return this.generateTextWithRetry(enhancedPrompt, retryCount + 1, maxRetries);
      }

      if (isRateLimitError) {
        console.error(`[AnthropicLLMService] ❌ Rate limit exceeded after ${maxRetries} retries`);
        throw new Error(`Rate limit exceeded. Please wait a moment and try again.`);
      }

      console.error('[AnthropicLLMService] Error calling Anthropic API:', error);
      throw new Error(`Anthropic API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private constructPromptWithContext(prompt: string, context?: KnowledgeContext): string {
    if (!context || !context.ragContext) {
      return prompt;
    }

    const contextSection = `
REGULATORY KNOWLEDGE BASE CONTEXT:
The following regulatory information has been retrieved from the knowledge base:

${context.ragContext}

SOURCE DOCUMENTS:
${context.metadata.sources.map(source => `- ${source}`).join('\n')}

---

`;

    return contextSection + prompt;
  }
}
