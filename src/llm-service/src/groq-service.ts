import Groq from 'groq-sdk';
import { LLMResponse, KnowledgeContext } from '@phasergun/shared-types';
import { LLMService } from './index';

/**
 * Groq AI Implementation of LLM Service
 * Uses Groq's ultra-fast LPU inference with Llama models
 * 
 * KEY CHANGE: Uses system message for role + reference materials,
 * user message for the task only.
 * 
 * Why this matters MORE for Llama models than Claude:
 * - Llama is trained to treat system messages as persistent behavioral rules
 * - Long user messages cause Llama to "forget" instructions at the top
 * - Format compliance (no titles, no bullets) is much more stable in system
 * - The seed parameter helps but can't overcome structural ambiguity
 */
export class GroqLLMService implements LLMService {
  private client: Groq;
  private model: string;

  constructor(apiKey: string, model: string = 'llama-3.1-8b-instant') {
    this.client = new Groq({ apiKey });
    this.model = model;
    console.log(`[GroqLLMService] Initialized with model: ${model}`);
  }

  async generateText(prompt: string, context?: KnowledgeContext): Promise<LLMResponse> {
    console.log(`[GroqLLMService] Generating text with prompt length: ${prompt.length}`);
    
    if (context) {
      console.log(`[GroqLLMService] Using knowledge context with ${context.metadata.sources.length} sources`);
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
      
      // Build messages array
      const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
      
      if (systemMessage.length > 0) {
        messages.push({ role: 'system', content: systemMessage });
      }
      messages.push({ role: 'user', content: userMessage });

      const response = await this.client.chat.completions.create({
        model: this.model,
        messages,
        max_tokens: 32000,
        temperature: 0,
        top_p: 1,
        seed: 42,
      });

      const duration = Date.now() - startTime;
      
      let textContent = response.choices[0]?.message?.content || '';
      
      // Validate response for corruption BEFORE cleaning
      this.validateResponseQuality(textContent, enhancedPrompt.length);
      
      // Clean Llama special tokens from output
      textContent = this.cleanLlamaTokens(textContent);

      const inputTokens = response.usage?.prompt_tokens || 0;
      const outputTokens = response.usage?.completion_tokens || 0;
      
      console.log(`[GroqLLMService] Response received in ${duration}ms (⚡ Groq LPU™)`);
      console.log(`[GroqLLMService] System message: ${systemMessage.length} chars`);
      console.log(`[GroqLLMService] User message: ${userMessage.length} chars`);
      console.log(`[GroqLLMService] Input tokens: ${inputTokens}`);
      console.log(`[GroqLLMService] Output tokens: ${outputTokens}`);
      
      if (outputTokens >= 30000) {
        console.warn(`[GroqLLMService] ⚠️  Output approaching 32K token limit (${outputTokens}/32000)`);
      }

      const is8B = this.model.includes('8b');
      const inputRate = is8B ? 0.05 : 0.59;
      const outputRate = is8B ? 0.08 : 0.79;
      
      const inputCost = (inputTokens / 1000000) * inputRate;
      const outputCost = (outputTokens / 1000000) * outputRate;
      const totalCost = inputCost + outputCost;

      console.log(`[GroqLLMService] Cost: $${totalCost.toFixed(4)} (${is8B ? '8B' : '70B'} pricing)`);

      return {
        generatedText: textContent,
        usageStats: {
          tokensUsed: inputTokens + outputTokens,
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
        
        console.warn(`[GroqLLMService] ⚠️  Rate limit hit. Retry ${retryCount + 1}/${maxRetries} after ${delaySeconds}s`);
        console.warn(`[GroqLLMService] Rate limit details: ${error?.error?.message || error?.message}`);
        
        await new Promise(resolve => setTimeout(resolve, delaySeconds * 1000));
        return this.generateTextWithRetry(enhancedPrompt, retryCount + 1, maxRetries);
      }

      if (isRateLimitError) {
        console.error(`[GroqLLMService] ❌ Rate limit exceeded after ${maxRetries} retries`);
        throw new Error(`Rate limit exceeded. Groq free tier: 30 requests/minute. Please wait and try again.`);
      }

      console.error('[GroqLLMService] Error calling Groq API:', error);
      throw new Error(`Groq API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
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

  /**
   * Clean Llama model special tokens from generated text
   */
  private cleanLlamaTokens(text: string): string {
    const llamaTokenPatterns = [
      /<\|start_header_id\|>/g,
      /<\|end_header_id\|>/g,
      /<\|eot_id\|>/g,
      /<\|begin_of_text\|>/g,
      /<\|end_of_text\|>/g,
      /^(system|user|assistant)\s*$/gm,
    ];

    let cleanedText = text;
    for (const pattern of llamaTokenPatterns) {
      cleanedText = cleanedText.replace(pattern, '');
    }

    return cleanedText.trim();
  }

  /**
   * Validate response quality and detect genuine corruption
   */
  private validateResponseQuality(response: string, promptLength: number): void {
    if (!response || response.length === 0) {
      throw new Error('LLM returned empty response');
    }

    const charCodes = [...response].map(c => c.charCodeAt(0));
    
    const VALID_CONTROL_CHARS = new Set([9, 10, 13]);

    let harmfulControlChars = 0;
    const harmfulCodes: number[] = [];
    
    for (let i = 0; i < charCodes.length && harmfulCodes.length < 100; i++) {
      const code = charCodes[i];
      const isControlChar = (code >= 0 && code <= 31) || (code >= 127 && code <= 159);
      
      if (isControlChar && !VALID_CONTROL_CHARS.has(code)) {
        harmfulControlChars++;
        harmfulCodes.push(code);
      }
    }

    const hasRepeatingPattern = this.detectRepeatingPattern(charCodes);

    if (harmfulControlChars > 5 || hasRepeatingPattern) {
      console.error(`[GroqLLMService] ❌ Response validation failed!`);
      console.error(`[GroqLLMService] Harmful control characters: ${harmfulControlChars}`);
      console.error(`[GroqLLMService] Harmful codes (first 20):`, harmfulCodes.slice(0, 20));
      console.error(`[GroqLLMService] Repeating pattern: ${hasRepeatingPattern}`);
      console.error(`[GroqLLMService] Response length: ${response.length} chars`);
      console.error(`[GroqLLMService] Prompt length: ${promptLength} chars`);
      
      throw new Error(
        `LLM returned corrupted output (${harmfulControlChars} harmful control characters). ` +
        `Prompt length: ${promptLength} chars. This indicates a Groq API issue or model confusion. ` +
        `Try: 1) Reducing prompt size, 2) Simplifying prompt format, 3) Using a different model.`
      );
    }

    if (harmfulControlChars > 0 && harmfulControlChars <= 5) {
      console.warn(`[GroqLLMService] ⚠️  Detected ${harmfulControlChars} stray control characters (within acceptable range)`);
    }
  }

  /**
   * Detect repeating patterns that indicate corruption
   */
  private detectRepeatingPattern(charCodes: number[]): boolean {
    if (charCodes.length < 100) {
      return false;
    }

    let pattern2Count = 0;
    for (let i = 0; i < Math.min(200, charCodes.length - 3); i += 2) {
      if (charCodes[i] === charCodes[i + 2] && charCodes[i + 1] === charCodes[i + 3]) {
        pattern2Count++;
      }
    }
    
    if (pattern2Count > 80) {
      console.warn(`[GroqLLMService] ⚠️  Repeating 2-byte pattern detected (${pattern2Count}/100 matches)`);
      return true;
    }

    let pattern1Count = 0;
    for (let i = 0; i < Math.min(200, charCodes.length - 1); i++) {
      if (charCodes[i] === charCodes[i + 1]) {
        pattern1Count++;
      }
    }
    
    if (pattern1Count > 150) {
      console.warn(`[GroqLLMService] ⚠️  Repeating 1-byte pattern detected (${pattern1Count}/200 matches)`);
      return true;
    }

    return false;
  }
}
