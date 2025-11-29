import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AppStatusOutput, SourceFolderInput } from '@fda-compliance/shared-types';
import { OrchestratorService } from '../../services/orchestrator.service';
import { InputFormComponent } from '../input-form/input-form.component';
import { OutputDisplayComponent } from '../output-display/output-display.component';
import { Project } from '../../models/project.model';

@Component({
  selector: 'app-container',
  templateUrl: './app-container.component.html',
  styleUrls: ['./app-container.component.css'],
  imports: [CommonModule, InputFormComponent, OutputDisplayComponent],
  standalone: true
})
export class AppContainerComponent implements OnInit {
  @Input() project?: Project;
  @Output() analysisComplete = new EventEmitter<AppStatusOutput>();

  isProcessing = false;
  analysisOutput: AppStatusOutput | null = null;

  constructor(private orchestrator: OrchestratorService) {}

  ngOnInit(): void {
    // If project has a previous analysis, show it
    if (this.project?.lastAnalysis) {
      this.analysisOutput = {
        status: this.project.lastAnalysis.status,
        message: 'Previous analysis loaded',
        detailedReport: this.project.lastAnalysis.report,
        timestamp: this.project.lastAnalysis.timestamp
      };
    }
  }

  analyzeProject(): void {
    if (this.project) {
      const input: SourceFolderInput = {
        folderPath: this.project.folderPath,
        sourceType: this.project.sourceType,
        credentials: this.project.credentials
      };
      this.handleAnalysis(input);
    }
  }

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
      
      // Emit the result to parent
      this.analysisComplete.emit(result);
    } catch (error) {
      this.analysisOutput = {
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        timestamp: new Date().toISOString()
      };
      
      // Emit error result
      this.analysisComplete.emit(this.analysisOutput);
    } finally {
      this.isProcessing = false;
    }
  }
}
