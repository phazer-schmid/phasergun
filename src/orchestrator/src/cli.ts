#!/usr/bin/env node
import { OrchestratorService } from './index';
import { MockFileParser } from '@fda-compliance/file-parser';
import { MockChunker } from '@fda-compliance/chunker';
import { EnhancedRAGService } from '@fda-compliance/rag-service';
import { MockLLMService } from '@fda-compliance/llm-service';

async function main() {
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║   FDA 510(k) Compliance Analysis - Orchestrator Test  ║');
  console.log('╚═══════════════════════════════════════════════════════╝');
  console.log('');
  
  // Initialize orchestrator with all services
  const orchestrator = new OrchestratorService(
    new MockFileParser(),
    new MockChunker(),
    new EnhancedRAGService(),
    new MockLLMService()
  );
  
  const testFolder = process.argv[2] || require('path').join(__dirname, '../test-project');
  
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
  
  // Exit with appropriate code based on result
  if (result.status === 'complete') {
    console.log('✓ Orchestration test PASSED - Analysis completed successfully');
    console.log('');
    process.exit(0);
  } else {
    console.log('✗ Orchestration test FAILED - Analysis returned error status');
    console.log('');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('\n✗ Orchestration test FAILED - Unhandled exception');
  console.error(error);
  process.exit(1);
});
