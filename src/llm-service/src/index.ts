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
  async generateText(prompt: string, context?: KnowledgeContext): Promise<LLMResponse> {
    console.log(`[MockLLMService] Generating text with prompt length: ${prompt.length}`);
    
    if (context) {
      console.log(`[MockLLMService] Using knowledge context with ${context.metadata.sources.length} sources`);
    }
    
    // Simulate LLM processing time
    await new Promise(resolve => setTimeout(resolve, 400));
    
    const response: LLMResponse = {
      generatedText: `GENERATED DHF DOCUMENT CONTENT

EXECUTIVE SUMMARY:
This is a mock-generated DHF document created by the PhaserGun system. The generation pipeline has successfully processed your project through file parsing, document chunking, knowledge retrieval, and AI text generation.

DOCUMENT OVERVIEW:
The system has analyzed your procedural documents and contextual knowledge to generate this compliant DHF content. Key sections have been structured according to regulatory requirements and industry best practices.

KEY SECTIONS GENERATED:
• Introduction and Purpose
• Scope and Applicability  
• Requirements and Specifications
• Verification and Validation Approach
• Risk Management Considerations
• Traceability Matrix

CONTENT QUALITY:
This generated document incorporates:
- Regulatory requirements from context documents
- Procedural guidance from your knowledge base
- Industry standard formatting and structure
- Appropriate technical terminology

--- 
Generation Metadata:
- Knowledge sources used: ${context?.metadata.sources.length || 0}
- Prompt-based generation with RAG context
- Enhanced with domain-specific knowledge`,
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
