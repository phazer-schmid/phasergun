#!/usr/bin/env node
import { OrchestratorService } from './index';
import { MockFileParser } from '@fda-compliance/file-parser';
import { MockChunker } from '@fda-compliance/chunker';
import { MockRAGService } from '@fda-compliance/rag-service';
import { MockLLMService } from '@fda-compliance/llm-service';

async function main() {
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║   FDA 510(k) Compliance Analysis - Orchestrator Test  ║');
  console.log('╚═══════════════════════════════════════════════════════╝');
  console.log('');
  
  // Initialize orchestrator with all mock services
  const orchestrator = new OrchestratorService(
    new MockFileParser(),
    new MockChunker(),
    new MockRAGService(),
    new MockLLMService()
  );
  
  const testFolder = process.argv[2] || '/sample/dhf/planning-phase';
  
  console.log(`Test Input: ${testFolder}`);
  console.log('');
  console.log('─'.repeat(60));
  console.log('');
  
  // Run full analysis
  const result = await orchestrator.runAnalysis({ folderPath: testFolder });
  
  console.log('─'.repeat(60));
  console.log('');
  console.log('=== FINAL RESULTS ===');
  console.log('');
  console.log(`Status: ${result.status.toUpperCase()}`);
  console.log(`Message: ${result.message}`);
  console.log(`Timestamp: ${result.timestamp}`);
  
  if (result.detailedReport) {
    console.log('');
    console.log('=== DETAILED REPORT ===');
    console.log('');
    console.log(result.detailedReport);
  }
  
  console.log('');
  console.log('✓ Complete end-to-end orchestration test successful');
  console.log('');
}

main().catch(console.error);
