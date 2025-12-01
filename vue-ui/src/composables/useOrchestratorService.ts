import { OrchestratorService as CoreOrchestratorService } from '@fda-compliance/orchestrator';
import { MockFileParser } from '@fda-compliance/file-parser';
import { MockChunker } from '@fda-compliance/chunker';
import { MockRAGService } from '@fda-compliance/rag-service';
import { MockLLMService } from '@fda-compliance/llm-service';
import type { SourceFolderInput, AppStatusOutput } from '@fda-compliance/shared-types';

export function useOrchestratorService() {
  // Initialize with mock services
  const orchestrator = new CoreOrchestratorService(
    new MockFileParser(),
    new MockChunker(),
    new MockRAGService(),
    new MockLLMService()
  );

  const runAnalysis = async (input: SourceFolderInput): Promise<AppStatusOutput> => {
    return orchestrator.runAnalysis(input);
  };

  return {
    runAnalysis
  };
}
