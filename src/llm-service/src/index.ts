import { LLMResponse, KnowledgeContext, ChunkedDocumentPart } from '@fda-compliance/shared-types';

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
  
  /**
   * Assess document compliance against guidelines
   * @param docs - Document chunks to assess
   * @param guidelines - Compliance guidelines
   * @returns Assessment results
   */
  assessDocument(docs: ChunkedDocumentPart[], guidelines: string): Promise<LLMResponse>;
}

// Export the real LLM services
export { AnthropicLLMService } from './anthropic-service';
export { MistralLLMService } from './mistral-service';
export { OllamaLLMService } from './ollama-service';

/**
 * Mock Implementation of LLM Service
 * Returns simulated AI responses for testing
 */
export class MockLLMService implements LLMService {
  async generateText(prompt: string, context?: KnowledgeContext): Promise<LLMResponse> {
    console.log(`[MockLLMService] Generating text with prompt length: ${prompt.length}`);
    
    if (context) {
      console.log(`[MockLLMService] Using ${context.contextSnippets.length} context snippets`);
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
- ${context?.sourceMetadata.length || 0} knowledge sources
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
  
  async assessDocument(docs: ChunkedDocumentPart[], guidelines: string): Promise<LLMResponse> {
    console.log(`[MockLLMService] Assessing ${docs.length} document chunks against guidelines`);
    
    await new Promise(resolve => setTimeout(resolve, 300));
    
    return {
      generatedText: `Document assessment complete. Analyzed ${docs.length} chunks against compliance guidelines.`,
      usageStats: {
        tokensUsed: 800,
        cost: 0.008
      }
    };
  }
}
