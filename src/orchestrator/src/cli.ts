#!/usr/bin/env node
import { OrchestratorService } from './index';
import { EnhancedRAGService } from '@phasergun/rag-service';
import { MockLLMService } from '@phasergun/llm-service';
import * as path from 'path';
import * as fs from 'fs';

async function main() {
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║   PhaserGun Orchestrator - Generation Test            ║');
  console.log('╚═══════════════════════════════════════════════════════╝');
  console.log('');
  
  // Initialize orchestrator with simplified dependencies
  const orchestrator = new OrchestratorService(
    new EnhancedRAGService(),
    new MockLLMService()
  );
  
  const testProject = process.argv[2] || path.join(__dirname, '../test-project');
  const primaryContextPath = process.env.PRIMARY_CONTEXT_PATH || 
    path.join(__dirname, '../../rag-service/knowledge-base/context/primary-context.yaml');
  
  // Sample test prompt
  const testPrompt = `
INPUT DATA:
- SOP for Design Control
- Primary Context
- Device information

TASK:
Generate a Purpose section for a design specification document for the medical device described in the primary context. The Purpose section should:
- Be 2-3 paragraphs
- Explain the purpose and scope of this specification
- Reference applicable regulatory standards
- Follow the company's Design Control SOP

OUTPUT FORMAT: Paragraph text only, no bullets.
`;
  
  console.log(`Test Project: ${testProject}`);
  console.log(`Primary Context: ${primaryContextPath}`);
  console.log('');
  console.log('─'.repeat(60));
  console.log('');
  
  // Run generation
  const result = await orchestrator.generateFromPrompt({
    projectPath: testProject,
    primaryContextPath,
    prompt: testPrompt
  });
  
  console.log('─'.repeat(60));
  console.log('');
  console.log('=== GENERATION RESULTS ===');
  console.log('');
  console.log(`Status: ${result.status.toUpperCase()}`);
  console.log(`Message: ${result.message}`);
  console.log(`Timestamp: ${result.timestamp}`);
  
  if (result.generatedContent) {
    console.log('');
    console.log('=== GENERATED CONTENT ===');
    console.log('');
    console.log(result.generatedContent);
  }
  
  if (result.confidence) {
    console.log('');
    console.log('=== CONFIDENCE RATING ===');
    console.log(`Level: ${result.confidence.level}`);
    console.log(`Rationale: ${result.confidence.rationale}`);
  }
  
  if (result.references && result.references.length > 0) {
    console.log('');
    console.log('=== REFERENCES ===');
    result.references.forEach(ref => {
      console.log(`[${ref.id}] ${ref.category}: ${ref.fileName}`);
    });
  }
  
  console.log('');
  
  // Exit with appropriate code based on result
  if (result.status === 'complete') {
    console.log('✓ Orchestration test PASSED - Generation completed successfully');
    console.log('');
    process.exit(0);
  } else {
    console.log('✗ Orchestration test FAILED - Generation returned error status');
    console.log('');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('\n✗ Orchestration test FAILED - Unhandled exception');
  console.error(error);
  process.exit(1);
});
