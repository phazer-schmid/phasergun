import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ProjectService } from '../../services/project.service';
import { OrchestratorService } from '../../services/orchestrator.service';
import { Project } from '../../models/project.model';
import { AppStatusOutput, AnalysisContext, SourceFolderInput, DHFFile, DHFDocument } from '@fda-compliance/shared-types';
import { DhfService } from '../../services/dhf.service';

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
  
  // DHF-related properties
  currentView: 'project' | 'phase' = 'project';
  selectedPhaseId?: number;
  dhfFiles: DHFFile[] = [];
  isScanning = false;
  scanError: string | null = null;
  currentViewTitle: string = 'Entire Project';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private projectService: ProjectService,
    private orchestrator: OrchestratorService,
    private dhfService: DhfService
  ) {}

  ngOnInit(): void {
    const projectId = this.route.snapshot.paramMap.get('id');
    if (projectId) {
      this.project = this.projectService.getProject(projectId);
      if (this.project) {
        this.buildNavigation();
        this.loadPreviousAnalysis();
        this.loadDhfFiles();
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
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  getDeadlineClass(dateString: string): string {
    const deadline = new Date(dateString);
    const today = new Date();
    const diffTime = deadline.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    // Convert days to months (approximate)
    const diffMonths = diffDays / 30;
    
    if (diffMonths >= 4) {
      return 'deadline-safe'; // Green - 4+ months left
    } else if (diffMonths >= 2) {
      return 'deadline-warning'; // Orange - 2-4 months left
    } else {
      return 'deadline-critical'; // Red - Less than 2 months left
    }
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

  // DHF-related methods
  onPhaseClick(phaseId: number): void {
    this.selectedPhaseId = phaseId;
    this.currentView = 'phase';
    this.dhfFiles = this.dhfService.getDhfFilesForPhase(phaseId);
    
    // Update title based on phase
    const phaseNames: { [key: number]: string } = {
      1: 'Phase 1: Planning',
      2: 'Phase 2: Design',
      3: 'Phase 3: Development',
      4: 'Phase 4: Testing'
    };
    this.currentViewTitle = phaseNames[phaseId] || `Phase ${phaseId}`;
  }

  onEntireProjectClick(): void {
    this.currentView = 'project';
    this.selectedPhaseId = undefined;
    this.dhfFiles = this.dhfService.getAllDhfFiles();
    this.currentViewTitle = 'Entire Project';
  }

  loadDhfFiles(): void {
    // Load all DHF files for entire project by default
    this.dhfFiles = this.dhfService.getAllDhfFiles();
  }

  /**
   * Scan project folder for real DHF documents using AI classification
   */
  async scanDhfDocuments(): Promise<void> {
    if (!this.project || this.isScanning) return;

    // Validate project has a folder path
    if (!this.project.folderPath) {
      this.scanError = 'Project folder path not configured';
      return;
    }

    // If scanning entire project, show confirmation
    if (this.currentView === 'project') {
      const confirmed = confirm(
        'Scan Entire Project?\n\n' +
        'This will scan all phase folders and may take several minutes depending on the number of documents.\n\n' +
        'Click OK to proceed or Cancel to abort.'
      );
      
      if (!confirmed) {
        return;
      }
    }

    this.isScanning = true;
    this.scanError = null;
    
    const scanScope = this.currentView === 'project' 
      ? 'entire project' 
      : `Phase ${this.selectedPhaseId}`;
    console.log(`[Dashboard] Starting DHF scan for ${scanScope}`);

    try {
      // Determine which phase to scan (undefined = all phases)
      const phaseToScan = this.currentView === 'phase' ? this.selectedPhaseId : undefined;
      
      // Call the API to scan and classify documents
      this.dhfService.scanProjectFolder(
        this.project.id, 
        this.project.folderPath,
        phaseToScan
      ).subscribe({
          next: (scannedFiles) => {
            console.log(`[Dashboard] Scan complete, received ${scannedFiles.length} DHF file categories`);
            
            // Update the display with scanned files
            if (this.currentView === 'phase' && this.selectedPhaseId) {
              // Filter to show only the selected phase
              const phaseFiles = scannedFiles.filter(f => {
                return this.isFileInPhase(f.id, this.selectedPhaseId!);
              });
              this.dhfFiles = phaseFiles;
            } else {
              // Show all files for entire project view
              this.dhfFiles = scannedFiles;
            }
            
            this.isScanning = false;
          },
          error: (error) => {
            console.error('[Dashboard] Scan failed:', error);
            this.scanError = error.error?.message || 'Failed to scan project. Check console for details.';
            this.isScanning = false;
          }
        });
    } catch (error) {
      console.error('[Dashboard] Scan error:', error);
      this.scanError = 'An unexpected error occurred during scanning';
      this.isScanning = false;
    }
  }

  /**
   * Helper to determine if a DHF file belongs to a specific phase
   */
  private isFileInPhase(fileId: string, phaseId: number): boolean {
    const phase = this.dhfService.getDhfFilesForPhase(phaseId);
    return phase.some(f => f.id === fileId);
  }

  getCompletedCount(): number {
    return this.dhfFiles.filter(f => f.status === 'complete').length;
  }

  hasIssues(document: DHFDocument): boolean {
    return !!(document.issues && document.issues.length > 0);
  }
}
