import { LLMResponse, KnowledgeContext } from '@phasergun/shared-types';

/**
 * LLM Service Interface
 * Responsible for AI model interaction and text generation
 */
export interface LLMService {
  /**
   * Generate text using the LLM with optional context
   * @param prompt - The input prompt
   * @param context - Optional knowledge context from RAG
   * @returns LLM response with generated text and usage stats
   */
  generateText(prompt: string, context?: KnowledgeContext): Promise<LLMResponse>;
  /** Returns the model identifier string for capability reporting */
  getModelName(): string;
}

// Export the real LLM services
export { AnthropicLLMService } from './anthropic-service';
export { MistralLLMService } from './mistral-service';
export { OllamaLLMService } from './ollama-service';
export { GroqLLMService } from './groq-service';

/**
 * Mock Implementation of LLM Service
 * Returns simulated AI responses for testing
 */
export class MockLLMService implements LLMService {
  getModelName(): string {
    return 'mock-llm';
  }

  async generateText(prompt: string, context?: KnowledgeContext): Promise<LLMResponse> {
    console.log(`[MockLLMService] Generating text with prompt length: ${prompt.length}`);
    
    if (context) {
      console.log(`[MockLLMService] Using knowledge context with ${context.metadata.sources.length} sources`);
    }
    
    // Simulate LLM processing time
    await new Promise(resolve => setTimeout(resolve, 400));
    
    const response: LLMResponse = {
      generatedText: `GENERATED DOCUMENT CONTENT

INTRODUCTION:
This is mock-generated content created by the PhaserGun RAG-enhanced generation system. The system has successfully processed your generation request through the complete pipeline: document parsing, intelligent chunking, semantic retrieval, and context-aware text generation.

CONTENT GENERATION APPROACH:
The system retrieved relevant information from your knowledge base including procedural documents and contextual materials. This content was generated following the guidance and requirements specified in your source documents, with appropriate citations and references maintained throughout.

KEY FEATURES OF GENERATED CONTENT:
• Context-aware generation based on retrieved knowledge
• Procedural guidance adherence from your knowledge base
• Inline citation markers linking to source documents
• Structured formatting following document conventions
• Domain-appropriate terminology and style

GENERATION QUALITY INDICATORS:
- Knowledge sources referenced: ${context?.metadata.sources.length || 0}
- RAG context integration: Active
- Semantic retrieval: Enabled
- Citation tracking: Automatic

---
This mock content demonstrates the generation pipeline's capability to produce coherent, contextually-relevant text based on your knowledge base and generation prompt. In production, actual LLM services will generate domain-specific content tailored to your requirements.`,
      usageStats: {
        tokensUsed: 1250,
        cost: 0.0125
      }
    };
    
    console.log(`[MockLLMService] Generated ${response.generatedText.length} characters`);
    console.log(`[MockLLMService] Tokens used: ${response.usageStats.tokensUsed}`);
    
    return response;
  }
}
