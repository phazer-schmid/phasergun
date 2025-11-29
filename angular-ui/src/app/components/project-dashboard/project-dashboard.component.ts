import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ProjectService } from '../../services/project.service';
import { OrchestratorService } from '../../services/orchestrator.service';
import { Project } from '../../models/project.model';
import { AppStatusOutput, AnalysisContext, SourceFolderInput } from '@fda-compliance/shared-types';

interface NavItem {
  id: string;
  label: string;
  icon?: string;
  type: 'project' | 'phase' | 'file';
  phaseId?: number;
  filePath?: string;
  children?: NavItem[];
  expanded?: boolean;
}

@Component({
  selector: 'app-project-dashboard',
  templateUrl: './project-dashboard.component.html',
  styleUrls: ['./project-dashboard.component.css'],
  imports: [CommonModule],
  standalone: true
})
export class ProjectDashboardComponent implements OnInit {
  project: Project | null = null;
  selectedContext: AnalysisContext = { viewType: 'project' };
  analysisResult: AppStatusOutput | null = null;
  isAnalyzing = false;
  
  navItems: NavItem[] = [];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private projectService: ProjectService,
    private orchestrator: OrchestratorService
  ) {}

  ngOnInit(): void {
    const projectId = this.route.snapshot.paramMap.get('id');
    if (projectId) {
      this.project = this.projectService.getProject(projectId);
      if (this.project) {
        this.buildNavigation();
        this.loadPreviousAnalysis();
      }
    }
  }

  buildNavigation(): void {
    if (!this.project) return;

    this.navItems = [
      {
        id: 'entire-project',
        label: 'Entire Project',
        icon: '📋',
        type: 'project'
      },
      {
        id: 'phase-1',
        label: 'Phase 1: Planning',
        icon: '1',
        type: 'phase',
        phaseId: 1,
        expanded: false,
        children: []
      },
      {
        id: 'phase-2',
        label: 'Phase 2: Design',
        icon: '2',
        type: 'phase',
        phaseId: 2,
        expanded: false,
        children: []
      },
      {
        id: 'phase-3',
        label: 'Phase 3: Development',
        icon: '3',
        type: 'phase',
        phaseId: 3,
        expanded: false,
        children: []
      },
      {
        id: 'phase-4',
        label: 'Phase 4: Testing',
        icon: '4',
        type: 'phase',
        phaseId: 4,
        expanded: false,
        children: []
      },
      {
        id: 'regulatory',
        label: 'Regulatory Submission',
        icon: '✓',
        type: 'phase',
        phaseId: 5
      }
    ];
  }

  loadPreviousAnalysis(): void {
    if (this.project?.lastAnalysis) {
      this.analysisResult = {
        status: this.project.lastAnalysis.status as 'complete' | 'error' | 'processing',
        message: 'Previous analysis loaded',
        detailedReport: this.project.lastAnalysis.report,
        timestamp: this.project.lastAnalysis.timestamp,
        analysisLevel: 'project',
        completionPercentage: 57, // Mock data - will come from real analysis
        rtaStatus: {
          total: 42,
          passed: 24,
          failed: 3,
          missing: 12,
          needsReview: 3
        },
        qualityScore: {
          overall: 68,
          completeness: 57,
          traceability: 72,
          compliance: 75
        }
      };
    }
  }

  selectNavItem(item: NavItem): void {
    // Build analysis context based on selection
    this.selectedContext = {
      viewType: item.type,
      phaseId: item.phaseId,
      filePath: item.filePath,
      documentType: item.filePath ? this.getDocumentType(item.filePath) : undefined
    };

    // If it's a phase with children, toggle expansion
    if (item.children && item.children.length > 0) {
      item.expanded = !item.expanded;
    }
  }

  getDocumentType(filePath: string): string {
    // Extract document type from file path
    const fileName = filePath.split('/').pop() || '';
    return fileName.replace(/\.[^/.]+$/, ''); // Remove extension
  }

  isItemActive(item: NavItem): boolean {
    if (item.type === 'project' && this.selectedContext.viewType === 'project') {
      return true;
    }
    if (item.type === 'phase' && this.selectedContext.viewType === 'phase' && 
        this.selectedContext.phaseId === item.phaseId) {
      return true;
    }
    if (item.type === 'file' && this.selectedContext.filePath === item.filePath) {
      return true;
    }
    return false;
  }

  async runAnalysis(): Promise<void> {
    if (!this.project || this.isAnalyzing) return;

    this.isAnalyzing = true;
    this.analysisResult = {
      status: 'processing',
      message: 'Analyzing...',
      timestamp: new Date().toISOString()
    };

    try {
      const input: SourceFolderInput = {
        folderPath: this.project.folderPath,
        sourceType: this.project.sourceType,
        credentials: this.project.credentials
      };

      const result = await this.orchestrator.runAnalysis(input);
      this.analysisResult = result;
      
      // Save analysis result to project
      this.projectService.saveAnalysisResult(
        this.project.id,
        result.status,
        result.detailedReport
      );
    } catch (error) {
      this.analysisResult = {
        status: 'error',
        message: 'Analysis failed',
        detailedReport: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      };
    } finally {
      this.isAnalyzing = false;
    }
  }

  backToProjects(): void {
    this.router.navigate(['/']);
  }

  editProject(): void {
    if (this.project) {
      this.router.navigate(['/projects', this.project.id, 'edit']);
    }
  }

  getCompletionPercentage(): number {
    return this.analysisResult?.completionPercentage || 0;
  }

  getQualityScore(): number {
    return this.analysisResult?.qualityScore?.overall || 0;
  }

  getRiskLevel(): string {
    const score = this.getQualityScore();
    if (score >= 80) return 'LOW';
    if (score >= 60) return 'MEDIUM';
    return 'HIGH';
  }

  getRiskBadgeClass(): string {
    const level = this.getRiskLevel();
    return `badge-${level.toLowerCase()}`;
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' });
  }

  getProgressStyle(): any {
    return {
      width: `${this.getCompletionPercentage()}%`
    };
  }

  hasTargetDates(): boolean {
    return !!(this.project?.targetDates?.phase1 || 
              this.project?.targetDates?.phase2 || 
              this.project?.targetDates?.phase3 || 
              this.project?.targetDates?.phase4);
  }
}
