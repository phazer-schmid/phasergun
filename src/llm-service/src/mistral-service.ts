import { Mistral } from '@mistralai/mistralai';
import { LLMResponse, KnowledgeContext, ChunkedDocumentPart } from '@fda-compliance/shared-types';
import { LLMService } from './index';

/**
 * Mistral AI Implementation of LLM Service
 * Uses Mistral's API for cost-effective AI analysis
 */
export class MistralLLMService implements LLMService {
  private client: Mistral;
  private model: string;

  constructor(apiKey: string, model: string = 'mistral-small-latest') {
    this.client = new Mistral({ apiKey });
    this.model = model;
    console.log(`[MistralLLMService] Initialized with model: ${model}`);
  }

  async generateText(prompt: string, context?: KnowledgeContext): Promise<LLMResponse> {
    console.log(`[MistralLLMService] Generating text with prompt length: ${prompt.length}`);
    
    if (context) {
      console.log(`[MistralLLMService] Using ${context.contextSnippets.length} context snippets`);
    }

    try {
      // Construct the enhanced prompt with context
      const enhancedPrompt = this.constructPromptWithContext(prompt, context);

      // Call Mistral API with deterministic settings
      const startTime = Date.now();
      const response = await this.client.chat.complete({
        model: this.model,
        messages: [{
          role: 'user',
          content: enhancedPrompt
        }],
        maxTokens: 1500, // Fixed for deterministic output
        temperature: 0, // Deterministic: same input = same output
      });

      const duration = Date.now() - startTime;
      
      // Extract the text content (handle both string and array types)
      const messageContent = response.choices?.[0]?.message?.content;
      let textContent = '';
      
      if (typeof messageContent === 'string') {
        textContent = messageContent;
      } else if (Array.isArray(messageContent)) {
        // If content is an array of chunks, extract text from each
        textContent = messageContent
          .map(chunk => typeof chunk === 'string' ? chunk : (chunk as any).text || '')
          .join('');
      }

      // Get token usage
      const inputTokens = response.usage?.promptTokens || 0;
      const outputTokens = response.usage?.completionTokens || 0;

      console.log(`[MistralLLMService] Response received in ${duration}ms`);
      console.log(`[MistralLLMService] Input tokens: ${inputTokens}`);
      console.log(`[MistralLLMService] Output tokens: ${outputTokens}`);

      // Calculate approximate cost based on model
      // Mistral Small: $0.20 input / $0.60 output per 1M tokens
      // Mistral Medium: $2.50 input / $7.50 output per 1M tokens
      const isSmall = this.model.includes('small');
      const inputRate = isSmall ? 0.20 : 2.50;
      const outputRate = isSmall ? 0.60 : 7.50;
      
      const inputCost = (inputTokens / 1000000) * inputRate;
      const outputCost = (outputTokens / 1000000) * outputRate;
      const totalCost = inputCost + outputCost;

      console.log(`[MistralLLMService] Cost: $${totalCost.toFixed(4)} (${isSmall ? 'Small' : 'Medium'} pricing)`);

      return {
        generatedText: textContent,
        usageStats: {
          tokensUsed: inputTokens + outputTokens,
          cost: totalCost
        }
      };

    } catch (error) {
      console.error('[MistralLLMService] Error calling Mistral API:', error);
      throw new Error(`Mistral API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async assessDocument(docs: ChunkedDocumentPart[], guidelines: string): Promise<LLMResponse> {
    console.log(`[MistralLLMService] Assessing ${docs.length} document chunks against guidelines`);
    
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
