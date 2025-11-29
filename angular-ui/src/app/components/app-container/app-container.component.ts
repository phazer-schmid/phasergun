import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AppStatusOutput, SourceFolderInput } from '@fda-compliance/shared-types';
import { OrchestratorService } from '../../services/orchestrator.service';
import { InputFormComponent } from '../input-form/input-form.component';
import { OutputDisplayComponent } from '../output-display/output-display.component';

@Component({
  selector: 'app-container',
  templateUrl: './app-container.component.html',
  styleUrls: ['./app-container.component.css'],
  imports: [CommonModule, InputFormComponent, OutputDisplayComponent],
  standalone: true
})
export class AppContainerComponent {
  isProcessing = false;
  analysisOutput: AppStatusOutput | null = null;

  constructor(private orchestrator: OrchestratorService) {}

  async handleAnalysis(input: SourceFolderInput): Promise<void> {
    this.isProcessing = true;
    
    // Show processing status immediately
    this.analysisOutput = {
      status: 'processing',
      message: `Analyzing documents from ${input.sourceType || 'local'} source...`,
      timestamp: new Date().toISOString()
    };

    try {
      // Run the full orchestration flow
      const result = await this.orchestrator.runAnalysis(input);
      this.analysisOutput = result;
    } catch (error) {
      this.analysisOutput = {
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        timestamp: new Date().toISOString()
      };
    } finally {
      this.isProcessing = false;
    }
  }
}
