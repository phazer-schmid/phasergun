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

  constructor(apiKey: string, model: string = 'claude-3-5-sonnet-20241022') {
    this.client = new Anthropic({ apiKey });
    this.model = model;
    console.log(`[AnthropicLLMService] Initialized with model: ${model}`);
  }

  async generateText(prompt: string, context?: KnowledgeContext): Promise<LLMResponse> {
    console.log(`[AnthropicLLMService] Generating text with prompt length: ${prompt.length}`);
    
    if (context) {
      console.log(`[AnthropicLLMService] Using ${context.contextSnippets.length} context snippets`);
    }

    try {
      // Construct the enhanced prompt with context
      const enhancedPrompt = this.constructPromptWithContext(prompt, context);

      // Call Anthropic API
      const startTime = Date.now();
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 4096,
        temperature: 0.3, // Lower temperature for more focused, technical responses
        messages: [{
          role: 'user',
          content: enhancedPrompt
        }]
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

      // Calculate approximate cost (Claude 3.5 Sonnet pricing)
      const inputCost = (response.usage.input_tokens / 1000000) * 3.00;  // $3 per 1M input tokens
      const outputCost = (response.usage.output_tokens / 1000000) * 15.00; // $15 per 1M output tokens
      const totalCost = inputCost + outputCost;

      return {
        generatedText: textContent,
        usageStats: {
          tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
          cost: totalCost
        }
      };

    } catch (error) {
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
