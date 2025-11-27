import { Injectable } from '@angular/core';
import { OrchestratorService as CoreOrchestratorService } from '@/services/Orchestrator';
import { MockFileParser } from '@/services/MockFileParser';
import { MockChunker } from '@/services/MockChunker';
import { MockRAGService } from '@/services/MockRAGService';
import { MockLLMService } from '@/services/MockLLMService';
import type { SourceFolderInput } from '@/interfaces/SourceFolderInput';
import type { AppStatusOutput } from '@/interfaces/AppStatusOutput';

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
