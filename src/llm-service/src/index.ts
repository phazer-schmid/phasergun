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
      generatedText: `FDA 510(k) COMPLIANCE ANALYSIS REPORT

EXECUTIVE SUMMARY:
Your Design History File (DHF) has been analyzed across all four phases of the Product Development Process (PDP). The system has successfully traversed through file parsing, document chunking, knowledge retrieval, and AI analysis.

PHASE ANALYSIS:
✓ Planning Phase: Design inputs identified and documented
✓ Design Phase: Risk analysis completed per ISO 14971
✓ Development Phase: Implementation documented
✓ Testing Phase: Verification and validation protocols established

KEY FINDINGS:
• Documents are properly structured for 510(k) submission
• Risk management documentation aligns with ISO 14971
• Design controls follow FDA guidance

RECOMMENDATIONS:
1. Ensure all design inputs are traceable to requirements
2. Complete verification testing for all identified risks
3. Document any design changes in Design History File

COMPLIANCE STATUS: On track for successful 510(k) submission

--- 
This analysis was generated using:
- ${context?.metadata.sources.length || 0} knowledge sources
- Primary thinking document guidance
- FDA 510(k) regulatory framework`,
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
