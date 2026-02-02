import Anthropic from '@anthropic-ai/sdk';
import { LLMResponse, KnowledgeContext, ChunkedDocumentPart } from '@fda-compliance/shared-types';
import { LLMService } from './index';

/**
 * Real Anthropic Claude Implementation of LLM Service
 * Uses Anthropic's Claude API for actual AI analysis
 */
export class AnthropicLLMService implements LLMService {
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string = 'claude-3-haiku-20240307') {
    this.client = new Anthropic({ apiKey });
    this.model = model;
    console.log(`[AnthropicLLMService] Initialized with model: ${model}`);
  }

  async generateText(prompt: string, context?: KnowledgeContext): Promise<LLMResponse> {
    console.log(`[AnthropicLLMService] Generating text with prompt length: ${prompt.length}`);
    
    if (context) {
      console.log(`[AnthropicLLMService] Using ${context.contextSnippets.length} context snippets`);
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
      // Call Anthropic API with MAXIMUM deterministic settings
      const startTime = Date.now();
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 4000, // Increased to ensure complete responses
        temperature: 0, // Deterministic: same input = same output
        top_k: 1, // Maximum determinism: only consider top choice
        messages: [{
          role: 'user',
          content: enhancedPrompt
        }]
        // Note: Anthropic does not support seed parameter as of 2024
        // Using temperature=0 and top_k=1 provides best available determinism
      });

      const duration = Date.now() - startTime;
      
      // Extract the text content
      const textContent = response.content
        .filter(block => block.type === 'text')
        .map(block => (block as any).text)
        .join('\n');

      console.log(`[AnthropicLLMService] Response received in ${duration}ms`);
      console.log(`[AnthropicLLMService] Input tokens: ${response.usage.input_tokens}`);
      console.log(`[AnthropicLLMService] Output tokens: ${response.usage.output_tokens}`);

      // Calculate approximate cost based on model
      // Haiku: $0.25 input / $1.25 output per 1M tokens
      // Sonnet: $3 input / $15 output per 1M tokens
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
      // Check if this is a rate limit error (429)
      const isRateLimitError = 
        error?.status === 429 || 
        error?.error?.type === 'rate_limit_error' ||
        (error?.message && error.message.includes('rate_limit'));

      if (isRateLimitError && retryCount < maxRetries) {
        // Calculate exponential backoff: 2^retryCount seconds (2, 4, 8, 16, 32)
        const delaySeconds = Math.pow(2, retryCount + 1);
        
        console.warn(`[AnthropicLLMService] ⚠️  Rate limit hit. Retry ${retryCount + 1}/${maxRetries} after ${delaySeconds}s`);
        console.warn(`[AnthropicLLMService] Rate limit details: ${error?.error?.message || error?.message}`);
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, delaySeconds * 1000));
        
        // Retry with incremented count
        return this.generateTextWithRetry(enhancedPrompt, retryCount + 1, maxRetries);
      }

      // If not a rate limit error, or max retries exceeded, throw the error
      if (isRateLimitError) {
        console.error(`[AnthropicLLMService] ❌ Rate limit exceeded after ${maxRetries} retries`);
        throw new Error(`Rate limit exceeded. Please wait a moment and try again. Your organization's limit is 100,000 input tokens per minute.`);
      }

      console.error('[AnthropicLLMService] Error calling Anthropic API:', error);
      throw new Error(`Anthropic API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async assessDocument(docs: ChunkedDocumentPart[], guidelines: string): Promise<LLMResponse> {
    console.log(`[AnthropicLLMService] Assessing ${docs.length} document chunks against guidelines`);
    
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
