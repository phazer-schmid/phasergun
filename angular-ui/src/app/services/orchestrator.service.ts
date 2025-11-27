import { Injectable } from '@angular/core';
import { OrchestratorService as CoreOrchestratorService } from '@fda-compliance/orchestrator';
import { MockFileParser } from '@fda-compliance/file-parser';
import { MockChunker } from '@fda-compliance/chunker';
import { MockRAGService } from '@fda-compliance/rag-service';
import { MockLLMService } from '@fda-compliance/llm-service';
import type { SourceFolderInput, AppStatusOutput } from '@fda-compliance/shared-types';

@Injectable({
  providedIn: 'root'
})
export class OrchestratorService {
  private orchestrator: CoreOrchestratorService;

  constructor() {
    // Initialize with mock services
    this.orchestrator = new CoreOrchestratorService(
      new MockFileParser(),
      new MockChunker(),
      new MockRAGService(),
      new MockLLMService()
    );
  }

  async runAnalysis(input: SourceFolderInput): Promise<AppStatusOutput> {
    return this.orchestrator.runAnalysis(input);
  }
}
