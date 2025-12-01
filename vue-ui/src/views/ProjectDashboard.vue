<template>
  <div class="dashboard-container">
    <!-- Sidebar -->
    <aside class="dashboard-sidebar">
      <!-- Logo/Branding -->
      <div class="sidebar-header">
        <div class="app-logo">
          <div class="logo-icon">M</div>
          <div class="logo-content">
            <span class="logo-text">MedDev Pro</span>
            <span class="logo-subtitle">Regulatory Control</span>
          </div>
        </div>
      </div>

      <!-- Navigation -->
      <nav class="sidebar-nav">
        <div class="nav-section">
          <!-- Entire Project -->
          <div 
            class="nav-item"
            :class="{ 'nav-item-active': currentView === 'project' }"
            @click="onEntireProjectClick()">
            <span class="nav-icon">📁</span>
            <span class="nav-label">Entire Project</span>
          </div>

          <!-- Phase Items -->
          <div class="nav-item-container">
            <div 
              class="nav-item"
              :class="{ 'nav-item-active': selectedPhaseId === 1 }"
              @click="onPhaseClick(1)">
              <span class="nav-icon-number">1</span>
              <span class="nav-label">Phase 1: Planning</span>
            </div>
            <div v-if="project?.targetDates?.phase1" class="phase-deadline">
              Deadline: {{ formatDate(project.targetDates.phase1) }}
            </div>
          </div>

          <div class="nav-item-container">
            <div 
              class="nav-item"
              :class="{ 'nav-item-active': selectedPhaseId === 2 }"
              @click="onPhaseClick(2)">
              <span class="nav-icon-number">2</span>
              <span class="nav-label">Phase 2: Design</span>
            </div>
            <div v-if="project?.targetDates?.phase2" class="phase-deadline">
              Deadline: {{ formatDate(project.targetDates.phase2) }}
            </div>
          </div>

          <div class="nav-item-container">
            <div 
              class="nav-item"
              :class="{ 'nav-item-active': selectedPhaseId === 3 }"
              @click="onPhaseClick(3)">
              <span class="nav-icon-number">3</span>
              <span class="nav-label">Phase 3: Development</span>
            </div>
            <div v-if="project?.targetDates?.phase3" class="phase-deadline">
              Deadline: {{ formatDate(project.targetDates.phase3) }}
            </div>
          </div>

          <div class="nav-item-container">
            <div 
              class="nav-item"
              :class="{ 'nav-item-active': selectedPhaseId === 4 }"
              @click="onPhaseClick(4)">
              <span class="nav-icon-number">4</span>
              <span class="nav-label">Phase 4: Testing</span>
            </div>
            <div v-if="project?.targetDates?.phase4" class="phase-deadline">
              Deadline: {{ formatDate(project.targetDates.phase4) }}
            </div>
          </div>

          <!-- Regulatory Submission -->
          <div class="nav-item">
            <span class="nav-icon">✓</span>
            <span class="nav-label">Regulatory Submission</span>
          </div>
        </div>
      </nav>

      <!-- Sidebar Footer -->
      <div class="sidebar-footer">
        <div class="footer-text">© 2025 MedDev Pro</div>
        <div class="footer-version">v1.0.0 - HIPAA Compliant</div>
      </div>
    </aside>

    <!-- Main Content -->
    <main class="dashboard-main">
      <!-- Header -->
      <div class="dashboard-header">
        <div class="header-actions">
          <button class="btn-text" @click="backToProjects()">← Back to Projects</button>
          <button class="btn-text" @click="editProject()">✎ Edit Project</button>
        </div>
        <div class="header-title-row">
          <h1 class="page-title">{{ currentViewTitle }}</h1>
          <button 
            class="btn-refresh"
            :disabled="isScanning"
            @click="scanDhfDocuments()">
            <span v-if="!isScanning">🔄 Scan Documents</span>
            <span v-if="isScanning">⏳ Scanning...</span>
          </button>
        </div>
      </div>

      <!-- Stats Cards Row -->
      <div class="stats-row">
        <!-- Project Completeness Card -->
        <div class="card stats-card">
          <div class="stats-header">
            <div class="stats-label">Project Completeness</div>
            <div class="stats-value-large">57%</div>
          </div>
          <div class="progress-bar">
            <div class="progress-fill progress-gradient" style="width: 57%"></div>
          </div>
          <div class="stats-meta">24 of 42 documents submitted</div>
        </div>

        <!-- Document Quality Risk Card -->
        <div class="card stats-card stats-card-risk">
          <div class="stats-header">
            <div class="stats-label-row">
              <span class="stats-label">Document Quality Risk</span>
              <span class="badge badge-medium">MEDIUM</span>
            </div>
          </div>
          <div class="stats-value-row">
            <span class="stats-value-large">68</span>
            <span class="stats-suffix">/100 quality score</span>
          </div>
          <div class="stats-meta">3 issues detected in submitted documents</div>
        </div>
      </div>

      <!-- Main Content Row -->
      <div class="dashboard-grid">
        <!-- DHF Document Checklist -->
        <div class="card checklist-card">
          <div class="section-header">
            <h2 class="section-title">DHF Document Checklist</h2>
            <span class="section-meta">{{ getCompletedCount() }}/{{ dhfFiles.length }}</span>
          </div>

          <div class="checklist-content">
            <!-- DHF File Item -->
            <div v-for="dhfFile in dhfFiles" :key="dhfFile.id" class="dhf-file-item">
              <!-- DHF File Header -->
              <div class="dhf-file-header">
                <input 
                  type="checkbox" 
                  :checked="dhfFile.status === 'complete'" 
                  disabled 
                  class="checkbox">
                
                <div class="dhf-file-info">
                  <div class="dhf-file-title-row">
                    <div class="dhf-file-name" v-html="dhfFile.name"></div>
                    <!-- Status Badge - Right aligned -->
                    <span 
                      v-if="dhfFile.status === 'missing'" 
                      class="badge badge-orange">NOT FOUND</span>
                    <span 
                      v-if="dhfFile.status === 'in_progress'" 
                      class="badge badge-yellow">IN PROGRESS</span>
                    <span 
                      v-if="dhfFile.status === 'complete'" 
                      class="badge badge-green">{{ dhfFile.documents?.length || 0 }} DOC(S)</span>
                  </div>
                  
                  <!-- Show submission section reference -->
                  <div class="dhf-reference">{{ dhfFile.submissionSection }}</div>
                </div>
              </div>

              <!-- Documents under DHF File -->
              <div v-if="dhfFile.documents && dhfFile.documents.length > 0" 
                   class="dhf-documents">
                <div v-for="(doc, idx) in dhfFile.documents" :key="idx" class="dhf-document-item">
                  <span class="document-bullet">•</span>
                  <div class="document-info">
                    <span class="document-name">{{ doc.name }}</span>
                    <span v-if="hasIssues(doc)" class="issue-icon" 
                          title="Issues detected">⚠️</span>
                    <span v-if="doc.date" class="document-meta">
                      {{ doc.date }} • {{ doc.reviewer }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- AI Analysis Panel -->
        <div class="card analysis-card">
          <div class="section-header">
            <h2 class="section-title">AI Analysis & Narrative</h2>
          </div>

          <div class="analysis-content">
            <div v-if="scanError" class="analysis-error">
              <p><strong>Scan Error:</strong> {{ scanError }}</p>
            </div>

            <div v-if="!analysisResult && !isScanning && !scanError" class="analysis-empty">
              <p>No documents scanned yet. Click "Scan Documents" to analyze your project folder using AI-powered classification.</p>
            </div>

            <div v-if="isScanning" class="analysis-loading">
              <p>🤖 Scanning project folder and classifying documents using Claude AI...</p>
              <p class="scan-details">This may take a minute depending on the number of documents.</p>
            </div>

            <div v-if="analysisResult?.status === 'complete'" class="analysis-narrative">
              <h3 class="narrative-title">Project Status & AI Recommendations</h3>
              
              <div class="narrative-text">
                <p>Your medical device project is progressing well with 57% document completion rate. The quality score of 68/100 indicates moderate risk in submitted documents. Key areas requiring attention: Shelf Life Testing shows critical gaps, and Sterilization Validation documentation needs strengthening. Current trajectory suggests Phase 4 completion within 8 weeks if risk mitigation actions are implemented immediately.</p>
              </div>

              <!-- Show detailed report if available -->
              <div v-if="analysisResult.detailedReport" class="narrative-details">
                {{ analysisResult.detailedReport }}
              </div>
            </div>

            <div v-if="analysisResult?.status === 'error'" class="analysis-error">
              <p><strong>Error:</strong> {{ analysisResult.message }}</p>
              <p class="error-details">{{ analysisResult.detailedReport }}</p>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useProjectService } from '../composables/useProjectService';
import { useDhfService } from '../composables/useDhfService';
import { Project } from '../models/project.model';
import { DHFFile, DHFDocument, AppStatusOutput } from '@fda-compliance/shared-types';

const router = useRouter();
const route = useRoute();
const projectService = useProjectService();
const dhfService = useDhfService();

const project = ref<Project | null>(null);
const currentView = ref<'project' | 'phase'>('project');
const selectedPhaseId = ref<number | undefined>(undefined);
const dhfFiles = ref<DHFFile[]>([]);
const isScanning = ref(false);
const scanError = ref<string | null>(null);
const currentViewTitle = ref('Entire Project');
const analysisResult = ref<AppStatusOutput | null>(null);

onMounted(() => {
  const projectId = route.params.id as string;
  project.value = projectService.getProject(projectId);
  
  if (project.value) {
    loadDhfFiles();
  }
});

const loadDhfFiles = () => {
  dhfFiles.value = dhfService.getAllDhfFiles();
};

const onPhaseClick = (phaseId: number) => {
  selectedPhaseId.value = phaseId;
  currentView.value = 'phase';
  dhfFiles.value = dhfService.getDhfFilesForPhase(phaseId);
  
  const phaseNames: { [key: number]: string } = {
    1: 'Phase 1: Planning',
    2: 'Phase 2: Design',
    3: 'Phase 3: Development',
    4: 'Phase 4: Testing'
  };
  currentViewTitle.value = phaseNames[phaseId] || `Phase ${phaseId}`;
};

const onEntireProjectClick = () => {
  currentView.value = 'project';
  selectedPhaseId.value = undefined;
  dhfFiles.value = dhfService.getAllDhfFiles();
  currentViewTitle.value = 'Entire Project';
};

const getCompletedCount = (): number => {
  return dhfFiles.value.filter(f => f.status === 'complete').length;
};

const hasIssues = (doc: DHFDocument): boolean => {
  return !!(doc.issues && doc.issues.length > 0);
};

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const scanDhfDocuments = async () => {
  if (!project.value || isScanning.value) return;

  if (!project.value.folderPath) {
    scanError.value = 'Project folder path not configured';
    return;
  }

  if (currentView.value === 'project') {
    const confirmed = confirm(
      'Scan Entire Project?\n\n' +
      'This will scan all phase folders and may take several minutes depending on the number of documents.\n\n' +
      'Click OK to proceed or Cancel to abort.'
    );
    
    if (!confirmed) {
      return;
    }
  }

  isScanning.value = true;
  scanError.value = null;
  
  try {
    const phaseToScan = currentView.value === 'phase' ? selectedPhaseId.value : undefined;
    
    const scannedFiles = await dhfService.scanProjectFolder(
      project.value.id,
      project.value.folderPath,
      phaseToScan
    );
    
    if (currentView.value === 'phase' && selectedPhaseId.value) {
      dhfFiles.value = scannedFiles.filter(f => isFileInPhase(f.id, selectedPhaseId.value!));
    } else {
      dhfFiles.value = scannedFiles;
    }
    
    // Set mock analysis result
    analysisResult.value = {
      status: 'complete',
      message: 'Analysis complete',
      timestamp: new Date().toISOString()
    };
    
    isScanning.value = false;
  } catch (error: any) {
    console.error('[Dashboard] Scan failed:', error);
    scanError.value = error.response?.data?.message || 'Failed to scan project. Check console for details.';
    isScanning.value = false;
  }
};

const isFileInPhase = (fileId: string, phaseId: number): boolean => {
  const phase = dhfService.getDhfFilesForPhase(phaseId);
  return phase.some(f => f.id === fileId);
};

const backToProjects = () => {
  router.push('/');
};

const editProject = () => {
  if (project.value) {
    router.push(`/projects/${project.value.id}/edit`);
  }
};
</script>

<style scoped>
/* Dashboard Container */
.dashboard-container {
  display: flex;
  min-height: 100vh;
  background: var(--light-bg);
}

/* Sidebar Styles */
.dashboard-sidebar {
  width: 280px;
  background: var(--light-bg);
  padding: var(--spacing-lg);
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--border-light);
  position: fixed;
  height: 100vh;
  overflow-y: auto;
}

.sidebar-header {
  margin-bottom: var(--spacing-2xl);
}

.app-logo {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.logo-icon {
  width: 44px;
  height: 44px;
  background-color: var(--primary-purple);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: var(--font-weight-bold);
  font-size: var(--font-size-xl);
  border-radius: var(--radius-md);
  flex-shrink: 0;
}

.logo-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.logo-text {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  color: var(--text-dark);
  line-height: 1.2;
}

.logo-subtitle {
  font-size: var(--font-size-sm);
  color: var(--text-gray);
  line-height: 1.2;
}

/* Navigation */
.sidebar-nav {
  flex: 1;
}

.nav-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: 12px 16px;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--text-dark);
}

.nav-item:hover {
  background: rgba(74, 59, 140, 0.06);
}

.nav-item-active {
  background: var(--primary-purple);
  color: white;
}

.nav-icon {
  font-size: 18px;
  width: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.nav-icon-number {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--border-light);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--text-gray);
  flex-shrink: 0;
}

.nav-item:hover .nav-icon-number {
  background: rgba(74, 59, 140, 0.15);
  color: var(--primary-purple);
}

.nav-item-active .nav-icon-number {
  background: rgba(255, 255, 255, 0.2);
  color: white;
}

.nav-label {
  flex: 1;
}

.nav-item-container {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.phase-deadline {
  font-size: var(--font-size-xs);
  font-style: italic;
  font-weight: var(--font-weight-bold);
  padding-left: 64px;
  margin-top: -4px;
  margin-bottom: 4px;
  color: var(--text-gray);
}

/* Sidebar Footer */
.sidebar-footer {
  margin-top: auto;
  padding-top: var(--spacing-lg);
  border-top: 1px solid var(--border-light);
}

.footer-text {
  font-size: var(--font-size-xs);
  color: var(--text-gray);
  margin-bottom: 2px;
}

.footer-version {
  font-size: var(--font-size-xs);
  color: var(--text-light);
}

/* Main Content */
.dashboard-main {
  margin-left: 280px;
  flex: 1;
  padding: var(--spacing-3xl);
  background: var(--light-bg);
}

.dashboard-header {
  margin-bottom: var(--spacing-2xl);
}

.header-actions {
  display: flex;
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-md);
}

.btn-text {
  background: transparent;
  border: none;
  color: var(--primary-purple);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  cursor: pointer;
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  transition: all var(--transition-fast);
  display: flex;
  align-items: center;
  gap: 6px;
}

.btn-text:hover {
  background: rgba(74, 59, 140, 0.06);
}

.header-title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--spacing-lg);
}

.page-title {
  font-size: var(--font-size-3xl);
  font-weight: var(--font-weight-bold);
  color: var(--text-dark);
  margin: 0;
}

.header-title-row .btn-refresh {
  padding: 10px 18px;
  background: var(--primary-purple);
  color: white;
  border: none;
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.header-title-row .btn-refresh:hover:not(:disabled) {
  background: #5A4A99;
}

.header-title-row .btn-refresh:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Stats Row */
.stats-row {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--spacing-xl);
  margin-bottom: var(--spacing-2xl);
}

.stats-card {
  padding: var(--spacing-xl);
}

.stats-card-risk {
  background: #FFF5F0;
}

.stats-header {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-md);
}

.stats-label {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
  color: var(--text-dark);
}

.stats-label-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.stats-value-large {
  font-size: 48px;
  font-weight: var(--font-weight-bold);
  color: var(--primary-purple);
  line-height: 1;
}

.stats-value-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: var(--spacing-md);
}

.stats-value-row .stats-value-large {
  font-size: 56px;
  color: var(--orange-alert);
}

.stats-suffix {
  font-size: var(--font-size-base);
  color: var(--text-gray);
  font-weight: var(--font-weight-normal);
}

.stats-meta {
  font-size: var(--font-size-sm);
  color: var(--text-gray);
  margin-top: var(--spacing-sm);
}

/* Progress Bar */
.progress-bar {
  width: 100%;
  height: 10px;
  background: var(--border-light);
  border-radius: var(--radius-sm);
  overflow: hidden;
  margin: var(--spacing-md) 0;
}

.progress-fill {
  height: 100%;
  border-radius: var(--radius-sm);
  transition: width var(--transition-normal);
}

.progress-gradient {
  background: linear-gradient(
    to right,
    var(--primary-purple) 0%,
    #7C6BAD 40%,
    var(--yellow-warning) 80%,
    var(--border-light) 100%
  );
}

/* Dashboard Grid */
.dashboard-grid {
  display: grid;
  grid-template-columns: 40% 1fr;
  gap: var(--spacing-xl);
}

/* Section Header */
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacing-lg);
  padding-bottom: var(--spacing-md);
  border-bottom: 1px solid var(--border-light);
}

.section-title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--text-dark);
  margin: 0;
}

.section-meta {
  font-size: var(--font-size-sm);
  color: var(--text-gray);
  font-weight: var(--font-weight-medium);
}

/* Checklist */
.checklist-card {
  padding: var(--spacing-xl);
}

.checklist-content {
  display: flex;
  flex-direction: column;
  gap: 0;
}

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

.dhf-file-title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--spacing-md);
}

.dhf-file-name {
  flex: 1;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--text-dark);
  white-space: pre-line;
}

.dhf-reference {
  font-size: var(--font-size-xs);
  color: var(--text-gray);
  line-height: 1.5;
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

/* Analysis Panel */
.analysis-card {
  padding: var(--spacing-xl);
}

.analysis-content {
  line-height: var(--line-height-relaxed);
}

.analysis-empty {
  padding: var(--spacing-xl);
  text-align: center;
  color: var(--text-gray);
  font-size: var(--font-size-sm);
}

.analysis-loading {
  padding: var(--spacing-xl);
  text-align: center;
  color: var(--primary-purple);
  font-size: var(--font-size-sm);
}

.scan-details {
  margin-top: var(--spacing-sm);
  font-size: var(--font-size-xs);
  color: var(--text-gray);
}

.analysis-narrative {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
}

.narrative-title {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
  color: var(--text-dark);
  margin: 0;
}

.narrative-text {
  font-size: var(--font-size-base);
  line-height: var(--line-height-relaxed);
  color: var(--text-dark);
}

.narrative-text p {
  margin: 0;
}

.narrative-details {
  font-size: var(--font-size-sm);
  color: var(--text-gray);
  padding: var(--spacing-md);
  background: var(--light-bg);
  border-radius: var(--radius-sm);
}

.analysis-error {
  padding: var(--spacing-lg);
  background-color: #FEE;
  border: 1px solid var(--orange-alert);
  border-radius: var(--radius-md);
  color: var(--text-dark);
}

.error-details {
  margin-top: var(--spacing-sm);
  font-size: var(--font-size-sm);
  color: var(--text-gray);
  font-family: monospace;
}

/* Responsive */
@media (max-width: 1200px) {
  .dashboard-grid {
    grid-template-columns: 1fr;
  }
  
  .stats-row {
    grid-template-columns: 1fr;
  }
}
</style>
