# DHF-Based RAG & UI Implementation Plan

## Overview
Transform the application to use DHF (Design History File) concept from the PDP Guidebook, where documents are organized by DHF files that map to project phases.

## Completed
✅ Created `src/rag-service/knowledge-base/context/dhf-phase-mapping.yaml` with:
- DHF files mapped to all 4 phases
- Mock document status (completed, in_progress, missing)
- 3 documents for completed DHF
- 2 documents for in-progress DHF
- 0 documents for missing DHF

## Implementation Steps

### 1. Update Shared Types (`src/shared-types/src/`)

#### Create new `DHFFile.ts`:
```typescript
export interface DHFFile {
  id: string;
  name: string;
  documentReference: string;
  submissionSection: string;
  required: boolean;
  status: 'complete' | 'in_progress' | 'missing';
  documents: DHFDocument[];
}

export interface DHFDocument {
  name: string;
  status: 'complete' | 'in_progress' | 'missing';
  date?: string;
  reviewer?: string;
  progress?: number;
  issues?: DocumentIssue[];
}

export interface DocumentIssue {
  type: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
}

export interface PhaseD HFMapping {
  phaseId: number;
  phaseName: string;
  dhfFiles: DHFFile[];
}
```

### 2. Update Project Model (`angular-ui/src/app/models/project.model.ts`)

Add DHF tracking to Project:
```typescript
export interface Project {
  // ... existing fields
  dhfFiles?: {
    [dhfId: string]: {
      status: 'complete' | 'in_progress' | 'missing';
      documents: Array<{
        name: string;
        status: string;
        date?: string;
        reviewer?: string;
      }>;
    };
  };
}
```

### 3. Create DHF Service (`angular-ui/src/app/services/dhf.service.ts`)

```typescript
@Injectable({ providedIn: 'root' })
export class DhfService {
  // Load YAML mapping
  loadDhfPhaseMapping(): Observable<any>
  
  // Get DHF files for a specific phase
  getDhfFilesForPhase(phaseId: number): DHFFile[]
  
  // Get all DHF files (for entire project view)
  getAllDhfFiles(): DHFFile[]
  
  // Get DHF file status from project
  getDhfFileStatus(projectId: string, dhfId: string): string
  
  // Mock: Get documents for a DHF file
  getDocumentsForDhf(dhfId: string): DHFDocument[]
}
```

### 4. Update Dashboard Component

#### TypeScript (`project-dashboard.component.ts`):
```typescript
export class ProjectDashboardComponent {
  currentView: 'project' | 'phase' = 'project';
  selectedPhaseId?: number;
  dhfFiles: DHFFile[] = [];
  
  ngOnInit() {
    // Load DHF mapping
    this.loadDhfFiles();
  }
  
  onPhaseClick(phaseId: number) {
    this.selectedPhaseId = phaseId;
    this.currentView = 'phase';
    this.dhfFiles = this.dhfService.getDhfFilesForPhase(phaseId);
  }
  
  onEntireProjectClick() {
    this.currentView = 'project';
    this.selectedPhaseId = undefined;
    this.dhfFiles = this.dhfService.getAllDhfFiles();
  }
  
  getDhfStatusClass(status: string): string {
    return {
      'complete': 'dhf-complete',
      'in_progress': 'dhf-in-progress',
      'missing': 'dhf-missing'
    }[status] || '';
  }
  
  hasIssues(document: DHFDocument): boolean {
    return document.issues && document.issues.length > 0;
  }
}
```

#### HTML Template Updates:

**Left Sidebar - Make phases clickable:**
```html
<div class="nav-item-container">
  <div class="nav-item" (click)="onPhaseClick(1)">
    <span class="nav-icon-number">1</span>
    <span class="nav-label">Phase 1: Planning</span>
  </div>
  <div *ngIf="project?.targetDates?.phase1" class="phase-deadline">
    Deadline: {{ formatDate(project!.targetDates!.phase1!) }}
  </div>
</div>
<!-- Repeat for phases 2, 3, 4 -->

<!-- Entire Project should also be clickable -->
<div class="nav-item nav-item-active" (click)="onEntireProjectClick()">
  <span class="nav-icon">📁</span>
  <span class="nav-label">Entire Project</span>
</div>
```

**Document Checklist - Replace with DHF files:**
```html
<div class="card checklist-card">
  <div class="section-header">
    <h2 class="section-title">DHF Document Checklist</h2>
    <span class="section-meta">{{ getCompletedCount() }}/{{ dhfFiles.length }}</span>
  </div>

  <div class="checklist-content">
    <!-- DHF File Item -->
    <div *ngFor="let dhfFile of dhfFiles" class="dhf-file-item">
      <!-- DHF File Header -->
      <div class="dhf-file-header">
        <input 
          type="checkbox" 
          [checked]="dhfFile.status === 'complete'" 
          disabled 
          class="checkbox">
        
        <div class="dhf-file-info">
          <div class="dhf-file-name" [innerHTML]="dhfFile.name"></div>
          
          <!-- Status Badge -->
          <div class="dhf-file-meta">
            <span class="dhf-reference">{{ dhfFile.documentReference }}</span>
            <span 
              *ngIf="dhfFile.status === 'missing'" 
              class="badge badge-orange">MISSING</span>
            <span 
              *ngIf="dhfFile.status === 'in_progress'" 
              class="badge badge-yellow">IN PROGRESS</span>
          </div>
        </div>
      </div>

      <!-- Documents under DHF File -->
      <div *ngIf="dhfFile.documents && dhfFile.documents.length > 0" 
           class="dhf-documents">
        <div *ngFor="let doc of dhfFile.documents" class="dhf-document-item">
          <span class="document-bullet">•</span>
          <div class="document-info">
            <span class="document-name">{{ doc.name }}</span>
            <span *ngIf="hasIssues(doc)" class="issue-icon" title="Issues detected">
              ⚠️
            </span>
            <span *ngIf="doc.date" class="document-meta">
              {{ doc.date }} • {{ doc.reviewer }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
```

### 5. CSS Styling (`project-dashboard.component.css`)

```css
/* DHF File Item */
.dhf-file-item {
  border-bottom: 1px solid var(--border-light);
  padding: var(--spacing-md) 0;
}

.dhf-file-item:last-child {
  border-bottom: none;
}

.dhf-file-header {
  display: flex;
  gap: var(--spacing-sm);
  align-items: flex-start;
  margin-bottom: var(--spacing-sm);
}

.dhf-file-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dhf-file-name {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--text-dark);
  white-space: pre-line; /* Allows \n in names */
}

.dhf-file-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--font-size-xs);
}

.dhf-reference {
  color: var(--text-gray);
}

/* DHF Documents (nested under DHF files) */
.dhf-documents {
  margin-left: 32px;
  padding-left: var(--spacing-md);
  border-left: 2px solid var(--border-light);
  margin-top: var(--spacing-sm);
}

.dhf-document-item {
  display: flex;
  gap: var(--spacing-xs);
  align-items: flex-start;
  padding: 6px 0;
  font-size: var(--font-size-sm);
}

.document-bullet {
  color: var(--text-gray);
  flex-shrink: 0;
}

.document-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.document-name {
  color: var(--text-dark);
  font-weight: var(--font-weight-medium);
}

.document-meta {
  color: var(--text-gray);
  font-size: var(--font-size-xs);
}

.issue-icon {
  color: var(--orange-alert);
  font-size: 16px;
  cursor: help;
}

/* Make phases clickable */
.nav-item {
  cursor: pointer;
}

.nav-item:hover {
  background: rgba(74, 59, 140, 0.06);
}
```

### 6. RAG Service Integration

Update `src/rag-service/src/index.ts` to:
1. Load and parse `dhf-phase-mapping.yaml`
2. Include DHF context in analysis responses
3. Map parsed documents to DHF files
4. Provide document classification based on content

### 7. File Parser Updates

Update `src/file-parser/src/index.ts` to:
1. Extract document metadata (dates, reviewers, etc.)
2. Identify document type for DHF mapping
3. Parse document reference numbers

### 8. LLM Service Enhancement

Update `src/llm-service/src/index.ts` to:
1. Classify documents into DHF categories
2. Extract key information (status, completeness)
3. Identify issues/gaps in documentation

## Testing Plan

1. **Unit Tests**: Test DHF service methods
2. **Integration Tests**: Test phase selection and DHF loading
3. **UI Tests**: Verify checklist displays correctly
4. **Mock Data**: Use the mock status from YAML for initial testing

## Next Steps Priority

1. Create DHFFile interface in shared-types
2. Create DhfService in Angular
3. Update dashboard component TypeScript
4. Update dashboard HTML template
5. Add CSS styling
6. Test with mock data
7. Integrate with RAG service (later phase)

## Notes

- Start with mock data from YAML
- DHF file status should be stored in Project model
- Real document parsing/classification comes later
- Focus on UI/UX first, then RAG integration
- Orange triangle (⚠️) indicates issues in documents
