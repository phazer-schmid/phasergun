import Groq from 'groq-sdk';
import { LLMResponse, KnowledgeContext, ChunkedDocumentPart } from '@fda-compliance/shared-types';
import { LLMService } from './index';

/**
 * Groq AI Implementation of LLM Service
 * Uses Groq's ultra-fast LPU inference with Llama models
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
      console.log(`[GroqLLMService] Using ${context.contextSnippets.length} context snippets`);
    }

    // Construct the enhanced prompt with context
    const enhancedPrompt = this.constructPromptWithContext(prompt, context);

    // Call with retry logic for rate limiting
    return this.generateTextWithRetry(enhancedPrompt);
  }

  private async generateTextWithRetry(
    enhancedPrompt: string,
    retryCount: number = 0,
    maxRetries: number = 5
  ): Promise<LLMResponse> {
    try {
      // Call Groq API with deterministic settings
      const startTime = Date.now();
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [{
          role: 'user',
          content: enhancedPrompt
        }],
        max_tokens: 32000, // Increased to 32K for long-form regulatory documents
        temperature: 0, // Deterministic: same input = same output
        top_p: 1, // Maximum determinism
      });

      const duration = Date.now() - startTime;
      
      // Extract the text content
      const textContent = response.choices[0]?.message?.content || '';

      // Calculate token usage
      const inputTokens = response.usage?.prompt_tokens || 0;
      const outputTokens = response.usage?.completion_tokens || 0;
      
      console.log(`[GroqLLMService] Response received in ${duration}ms (⚡ Groq LPU™)`);
      console.log(`[GroqLLMService] Input tokens: ${inputTokens}`);
      console.log(`[GroqLLMService] Output tokens: ${outputTokens}`);
      
      // Warn if approaching token limit
      if (outputTokens >= 30000) {
        console.warn(`[GroqLLMService] ⚠️  Output approaching 32K token limit (${outputTokens}/32000)`);
      }

      // Calculate approximate cost based on model
      // Groq pricing (as of 2024):
      // llama-3.1-8b-instant: $0.05 input / $0.08 output per 1M tokens
      // llama-3.1-70b-versatile: $0.59 input / $0.79 output per 1M tokens
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
      // Check if this is a rate limit error
      const isRateLimitError = 
        error?.status === 429 || 
        error?.error?.type === 'rate_limit_error' ||
        (error?.message && error.message.includes('rate_limit'));

      if (isRateLimitError && retryCount < maxRetries) {
        // Calculate exponential backoff: 2^retryCount seconds (2, 4, 8, 16, 32)
        const delaySeconds = Math.pow(2, retryCount + 1);
        
        console.warn(`[GroqLLMService] ⚠️  Rate limit hit. Retry ${retryCount + 1}/${maxRetries} after ${delaySeconds}s`);
        console.warn(`[GroqLLMService] Rate limit details: ${error?.error?.message || error?.message}`);
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, delaySeconds * 1000));
        
        // Retry with incremented count
        return this.generateTextWithRetry(enhancedPrompt, retryCount + 1, maxRetries);
      }

      // If not a rate limit error, or max retries exceeded, throw the error
      if (isRateLimitError) {
        console.error(`[GroqLLMService] ❌ Rate limit exceeded after ${maxRetries} retries`);
        throw new Error(`Rate limit exceeded. Groq free tier: 30 requests/minute. Please wait and try again.`);
      }

      console.error('[GroqLLMService] Error calling Groq API:', error);
      throw new Error(`Groq API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async assessDocument(docs: ChunkedDocumentPart[], guidelines: string): Promise<LLMResponse> {
    console.log(`[GroqLLMService] Assessing ${docs.length} document chunks against guidelines`);
    
    const prompt = `You are an expert FDA regulatory compliance analyst. Assess the following medical device documentation against the provided guidelines.

GUIDELINES:
${guidelines}

DOCUMENTS TO ASSESS:
${docs.map((doc, idx) => `
Document ${idx + 1}:
${doc.chunk}
`).join('\n---\n')}

Please provide a detailed compliance assessment including:
1. Overall compliance status
2. Strengths of the documentation
3. Areas needing improvement
4. Specific regulatory gaps
5. Actionable recommendations`;

    return this.generateText(prompt);
  }

  private constructPromptWithContext(prompt: string, context?: KnowledgeContext): string {
    if (!context || context.contextSnippets.length === 0) {
      return prompt;
    }

    // Build context section
    const contextSection = `
REGULATORY KNOWLEDGE BASE CONTEXT:
The following regulatory information has been retrieved from FDA guidelines and standards:

${context.contextSnippets.map((snippet, idx) => `
[Context ${idx + 1}]
${snippet}
`).join('\n')}

SOURCE DOCUMENTS:
${context.sourceMetadata.map(meta => `- ${meta}`).join('\n')}

---

`;

    return contextSection + prompt;
  }
}
