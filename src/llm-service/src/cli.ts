#!/usr/bin/env node
import { MockLLMService } from './index';
import { KnowledgeContext } from '@phasergun/shared-types';

async function main() {
  console.log('=== LLM Service CLI Test ===\n');
  
  const llmService = new MockLLMService();
  
  const testPrompt = 'Analyze the following DHF documents for FDA 510(k) compliance...';
  
  const testContext: KnowledgeContext = {
    contextSnippets: [
      'FDA 510(k) requires demonstration of substantial equivalence',
      'ISO 13485 quality management system documentation required'
    ],
    sourceMetadata: [
      { sourceName: 'FDA Guidance', path: '/kb/fda-510k.pdf' },
      { sourceName: 'ISO 13485', path: '/kb/iso-13485.pdf' }
    ]
  };
  
  console.log(`Prompt: "${testPrompt}"\n`);
  console.log(`Context sources: ${testContext.sourceMetadata.length}\n`);
  
  const response = await llmService.generateText(testPrompt, testContext);
  
  console.log('\n=== Results ===\n');
  console.log('Generated Text:');
  console.log('---');
  console.log(response.generatedText);
  console.log('---\n');
  
  console.log(`Tokens Used: ${response.usageStats.tokensUsed}`);
  console.log(`Cost: $${response.usageStats.cost.toFixed(4)}\n`);
  
  console.log('✓ LLM Service module test complete\n');
}

main().catch(console.error);
