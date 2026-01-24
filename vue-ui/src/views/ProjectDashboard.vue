<template>
  <div class="dashboard-container">
    <!-- Sidebar -->
    <aside class="dashboard-sidebar">
      <!-- Logo/Branding -->
      <div class="sidebar-header">
        <div class="app-logo">
          <div class="logo-icon">PG</div>
          <div class="logo-content">
            <span class="logo-text">Phaser Gun</span>
            <span class="logo-subtitle">Quality Regulatory Generation</span>
          </div>
        </div>
      </div>

      <!-- Navigation -->
      <nav class="sidebar-nav">
        <div class="nav-section">
          <!-- Dynamic Phase Items -->
          <div 
            v-for="phaseId in [1, 2, 3, 4]" 
            :key="phaseId"
            class="phase-container">
            
            <!-- Phase Header -->
            <div class="nav-item-container">
              <div 
                class="nav-item phase-item"
                @click="togglePhase(phaseId)">
                <span class="expand-icon">{{ expandedPhases.has(phaseId) ? '▼' : '▶' }}</span>
                <span class="nav-icon-number">{{ phaseId }}</span>
                <span class="nav-label">Phase {{ phaseId }}</span>
              </div>
              
              <!-- Deadline -->
              <div v-if="getPhaseDeadline(phaseId)" class="phase-deadline">
                Deadline: {{ getPhaseDeadline(phaseId) }}
              </div>
            </div>

            <!-- Files (shown when expanded) -->
            <div v-if="expandedPhases.has(phaseId)" class="files-container">
              <!-- Files List -->
              <div 
                v-if="getPhaseFiles(phaseId).length > 0"
                class="files-list">
                <div 
                  v-for="file in getPhaseFiles(phaseId)" 
                  :key="file.path"
                  class="file-item"
                  @click="selectFile(phaseId, file)">
                  
                  <input 
                    type="radio"
                    :name="`file-selection`"
                    :checked="isFileSelected(file.path)"
                    class="file-radio">
                  <span class="file-name">{{ file.name }}</span>
                </div>
              </div>

              <!-- No files message -->
              <div v-else class="no-files-message">
                No files found in Phase {{ phaseId }} base folder
              </div>
            </div>
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
          <select 
            v-model="selectedCheck"
            class="check-dropdown"
            :disabled="!selectedFile || availableChecks.length === 0">
            <option value="">-- Select Prompt --</option>
            <option 
              v-for="check in availableChecks" 
              :key="check.filename"
              :value="check.filename">
              {{ check.displayName }}
            </option>
          </select>
          <button 
            class="btn-refresh"
            :disabled="!selectedFile || isScanning"
            @click="analyzeSelectedDocument()">
            <span v-if="!isScanning">🔍 Generate Text</span>
            <span v-if="isScanning">⏳ Generating...</span>
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
      <div class="dashboard-content">
        <!-- AI Analysis Panel -->
        <div class="card analysis-card">
          <div class="section-header">
            <h2 class="section-title">AI Analysis & Narrative</h2>
          </div>

          <div class="analysis-content">
            <div v-if="scanError" class="analysis-error">
              <p><strong>Analysis Error:</strong> {{ scanError }}</p>
            </div>

            <div v-if="!analysisResult && !isScanning && !scanError" class="analysis-empty">
              <p>No document analyzed yet. Select a file from the left navigation and click "Analyze Document".</p>
            </div>

            <div v-if="isScanning" class="analysis-loading">
              <p>🤖 Analyzing document using AI...</p>
              <p class="scan-details">This may take a moment depending on document size.</p>
            </div>

            <div v-if="analysisResult?.status === 'complete'" class="analysis-narrative">
              <!-- Document Name Header -->
              <div v-if="getDocumentName()" class="document-header">
                <h3 class="document-name">📄 {{ getDocumentName() }}</h3>
              </div>
              
              <!-- Compliance Summary -->
              <div class="compliance-summary">
                <div class="summary-badge" :class="getComplianceBadgeClass()">
                  {{ getOverallCompliance() }}
                </div>
                <p class="summary-text">{{ getSummaryText() }}</p>
              </div>

              <!-- Issues Section -->
              <div v-if="hasIssues()" class="issues-section">
                <h4 class="section-heading">⚠️ Issues Identified</h4>
                
                <div v-for="(issue, idx) in getIssues()" :key="idx" class="issue-card">
                  <div class="issue-header">
                    <span class="issue-number">#{{ idx + 1 }}</span>
                    <span class="severity-badge" :class="getSeverityClass(issue.severity)">
                      {{ issue.severity?.toUpperCase() }}
                    </span>
                  </div>
                  
                  <div class="issue-body">
                    <div v-if="issue.location" class="issue-location">
                      <strong>Location:</strong> {{ issue.location }}
                    </div>
                    
                    <div v-if="issue.description" class="issue-description">
                      <strong>Issue:</strong> {{ issue.description }}
                    </div>
                    
                    <div v-if="issue.quoted_text" class="issue-quote">
                      <strong>Problematic Text:</strong>
                      <blockquote>"{{ issue.quoted_text }}"</blockquote>
                    </div>
                    
                    <div v-if="issue.severity_rationale" class="issue-rationale">
                      <strong>Why {{ issue.severity }}:</strong> {{ issue.severity_rationale }}
                    </div>
                    
                    <div v-if="issue.recommendation" class="issue-recommendation">
                      <strong>💡 Recommendation:</strong> {{ issue.recommendation }}
                    </div>
                    
                    <div v-if="issue.suggested_text" class="issue-suggested">
                      <strong>Suggested Text:</strong>
                      <blockquote class="suggested-quote">"{{ issue.suggested_text }}"</blockquote>
                    </div>
                    
                    <div v-if="issue.regulatory_reference" class="issue-reference">
                      <strong>Regulatory Reference:</strong> {{ issue.regulatory_reference }}
                    </div>
                  </div>
                </div>
              </div>

              <!-- Strengths Section -->
              <div v-if="hasStrengths()" class="strengths-section">
                <h4 class="section-heading">✅ Strengths</h4>
                <ul class="strengths-list">
                  <li v-for="(strength, idx) in getStrengths()" :key="idx">{{ strength }}</li>
                </ul>
              </div>

              <!-- Fallback to raw report if structured data not available -->
              <div v-if="!hasStructuredData()" class="narrative-text">
                <pre>{{ analysisResult.detailedReport }}</pre>
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
import { Project } from '../models/project.model';
import { AppStatusOutput } from '@fda-compliance/shared-types';
import { getApiEndpoint } from '../config/api';

const router = useRouter();
const route = useRoute();
const projectService = useProjectService();

const project = ref<Project | null>(null);
const isScanning = ref(false);
const scanError = ref<string | null>(null);
const analysisResult = ref<AppStatusOutput | null>(null);

// Phase files state
const expandedPhases = ref<Set<number>>(new Set());
const phaseFiles = ref<Map<number, any[]>>(new Map());

// Selected file and check state
const selectedFile = ref<{
  phaseId: number;
  file: any;
} | null>(null);

const selectedCheck = ref<string>('');
const availableChecks = ref<Array<{ filename: string; displayName: string }>>([]);

onMounted(async () => {
  const projectId = route.params.id as string;
  project.value = projectService.getProject(projectId);
});

// Toggle phase expand/collapse
async function togglePhase(phaseId: number) {
  if (expandedPhases.value.has(phaseId)) {
    expandedPhases.value.delete(phaseId);
  } else {
    expandedPhases.value.add(phaseId);
    // Load files for this phase base folder
    await loadPhaseFiles(phaseId);
  }
}

// Load files from phase base folder only
async function loadPhaseFiles(phaseId: number) {
  if (!project.value?.folderPath) return;

  // Construct path to phase base folder
  const phaseFolderPath = `${project.value.folderPath}/Phase ${phaseId}`;
  
  try {
    const response = await fetch(getApiEndpoint('/list-files'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: phaseFolderPath })
    });
    
    const result = await response.json();
    phaseFiles.value.set(phaseId, result.files || []);
    console.log(`[Dashboard] Loaded ${result.files?.length || 0} files from Phase ${phaseId} base folder`);
    
  } catch (error) {
    console.error(`[Dashboard] Failed to load files for Phase ${phaseId}:`, error);
    phaseFiles.value.set(phaseId, []);
  }
}

// Get files for a phase
function getPhaseFiles(phaseId: number): any[] {
  return phaseFiles.value.get(phaseId) || [];
}

// Select a file
async function selectFile(phaseId: number, file: any) {
  selectedFile.value = { phaseId, file };
  selectedCheck.value = ''; // Reset check selection
  console.log('[Dashboard] Selected file:', file.path);
  
  // Load available checks for this phase
  await loadAvailableChecks(phaseId);
}

// Load available checks for a phase
async function loadAvailableChecks(phaseId: number) {
  try {
    const response = await fetch(getApiEndpoint(`/checks/${phaseId}`));
    const result = await response.json();
    
    availableChecks.value = result.checks || [];
    console.log(`[Dashboard] Loaded ${availableChecks.value.length} checks for Phase ${phaseId}`);
  } catch (error) {
    console.error(`[Dashboard] Failed to load checks for Phase ${phaseId}:`, error);
    availableChecks.value = [];
  }
}

// Check if file is selected
function isFileSelected(filePath: string): boolean {
  return selectedFile.value?.file.path === filePath;
}

// Get phase deadline
function getPhaseDeadline(phaseId: number): string | null {
  if (!project.value?.targetDates) return null;
  
  const deadlineKey = `phase${phaseId}` as keyof typeof project.value.targetDates;
  const deadline = project.value.targetDates[deadlineKey];
  
  if (deadline) {
    return formatDate(deadline);
  }
  return null;
}

// Format date
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Analyze selected document
async function analyzeSelectedDocument() {
  if (!selectedFile.value || !project.value) return;

  // Validate that a check is selected
  if (!selectedCheck.value) {
    scanError.value = 'Please select a validation check before analyzing';
    return;
  }

  isScanning.value = true;
  scanError.value = null;
  analysisResult.value = null;
  
  try {
    // Local file analysis with selected check
    const response = await fetch(getApiEndpoint('/analyze'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filePath: selectedFile.value.file.path,
        selectedCheck: selectedCheck.value
      })
    });
    
    const result = await response.json();
    
    if (result.status === 'complete') {
      analysisResult.value = result;
    } else {
      scanError.value = result.message || 'Analysis failed';
    }
    
  } catch (error: any) {
    console.error('[Dashboard] Analysis failed:', error);
    scanError.value = error.message || 'Failed to analyze document';
  } finally {
    isScanning.value = false;
  }
}

// Navigation
function backToProjects() {
  router.push('/');
}

function editProject() {
  if (project.value) {
    router.push(`/projects/${project.value.id}/edit`);
  }
}

// Helper functions for structured analysis display
function hasStructuredData(): boolean {
  if (!analysisResult.value?.detailedReport) return false;
  try {
    const parsed = JSON.parse(analysisResult.value.detailedReport);
    return !!(parsed.document_name || parsed.issues || parsed.strengths);
  } catch {
    return false;
  }
}

function getStructuredData(): any {
  if (!analysisResult.value?.detailedReport) return null;
  try {
    return JSON.parse(analysisResult.value.detailedReport);
  } catch {
    return null;
  }
}

function getDocumentName(): string {
  const data = getStructuredData();
  return data?.document_name || '';
}

function getOverallCompliance(): string {
  const data = getStructuredData();
  const compliance = data?.overall_compliance || 'unknown';
  return compliance.toUpperCase().replace(/-/g, ' ');
}

function getComplianceBadgeClass(): string {
  const data = getStructuredData();
  const compliance = data?.overall_compliance || '';
  
  if (compliance === 'compliant') return 'badge-compliant';
  if (compliance === 'partially-compliant') return 'badge-partial';
  if (compliance === 'non-compliant') return 'badge-non-compliant';
  return '';
}

function getSummaryText(): string {
  const data = getStructuredData();
  return data?.summary || '';
}

function hasIssues(): boolean {
  const data = getStructuredData();
  return Array.isArray(data?.issues) && data.issues.length > 0;
}

function getIssues(): any[] {
  const data = getStructuredData();
  return data?.issues || [];
}

function getSeverityClass(severity: string): string {
  if (severity === 'high') return 'severity-high';
  if (severity === 'moderate') return 'severity-moderate';
  return '';
}

function hasStrengths(): boolean {
  const data = getStructuredData();
  return Array.isArray(data?.strengths) && data.strengths.length > 0;
}

function getStrengths(): string[] {
  const data = getStructuredData();
  return data?.strengths || [];
}
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
  width: 320px;
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
  overflow-y: auto;
}

.nav-section {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: 10px 12px;
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

.expand-icon {
  width: 16px;
  font-size: 12px;
  color: var(--text-gray);
  flex-shrink: 0;
}

.nav-icon-number {
  width: 24px;
  height: 24px;
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

.phase-item:hover .nav-icon-number {
  background: rgba(74, 59, 140, 0.15);
  color: var(--primary-purple);
}

.nav-label {
  flex: 1;
  font-size: var(--font-size-sm);
}

.nav-item-container {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.phase-container {
  margin-bottom: 4px;
}

.phase-deadline {
  font-size: var(--font-size-xs);
  font-style: italic;
  font-weight: var(--font-weight-bold);
  padding-left: 56px;
  margin-top: 2px;
  margin-bottom: 4px;
  color: var(--text-gray);
}

/* Categories Container */
.categories-container {
  margin-left: 40px;
  margin-top: 4px;
  margin-bottom: 8px;
  border-left: 2px solid var(--border-light);
  padding-left: 8px;
}

.category-item {
  margin-bottom: 8px;
}

.category-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  font-size: var(--font-size-xs);
  color: var(--text-dark);
}

.category-checkbox {
  opacity: 0.3;
  cursor: not-allowed;
}

.category-name {
  flex: 1;
  font-weight: var(--font-weight-medium);
}

.required-badge {
  font-size: var(--font-size-xs);
  padding: 2px 6px;
  background: rgba(74, 59, 140, 0.1);
  color: var(--primary-purple);
  border-radius: var(--radius-sm);
  font-weight: var(--font-weight-medium);
}

/* Files List */
.files-list {
  margin-left: 20px;
  margin-top: 4px;
}

.file-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: background var(--transition-fast);
}

.file-item:hover {
  background: rgba(74, 59, 140, 0.06);
}

.file-radio {
  flex-shrink: 0;
  cursor: pointer;
}

.file-name {
  font-size: var(--font-size-xs);
  color: var(--text-dark);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.no-files-message {
  margin-left: 20px;
  font-size: var(--font-size-xs);
  color: var(--text-light);
  font-style: italic;
  padding: 4px 8px;
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
  margin-left: 320px;
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

/* Analysis Controls */
.analysis-controls {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}

.check-dropdown {
  padding: 10px 14px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--text-dark);
  background: white;
  cursor: pointer;
  transition: all var(--transition-fast);
  min-width: 250px;
}

.check-dropdown:hover:not(:disabled) {
  border-color: var(--primary-purple);
}

.check-dropdown:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  background: var(--light-bg);
}

.check-dropdown:focus {
  outline: none;
  border-color: var(--primary-purple);
  box-shadow: 0 0 0 3px rgba(74, 59, 140, 0.1);
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

/* Dashboard Content - Full Width */
.dashboard-content {
  display: block;
  width: 100%;
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
  font-size: var(--font-size-sm);
  line-height: var(--line-height-relaxed);
  color: var(--text-dark);
}

.narrative-text pre {
  white-space: pre-wrap;
  font-family: inherit;
  margin: 0;
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

/* Structured Analysis Output Styles */
.document-header {
  padding: var(--spacing-md) 0;
  border-bottom: 2px solid var(--border-light);
  margin-bottom: var(--spacing-lg);
}

.document-name {
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-bold);
  color: var(--primary-purple);
  margin: 0;
}

.compliance-summary {
  padding: var(--spacing-lg);
  background: var(--light-bg);
  border-radius: var(--radius-md);
  margin-bottom: var(--spacing-xl);
}

.summary-badge {
  display: inline-block;
  padding: 8px 16px;
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-bold);
  margin-bottom: var(--spacing-md);
}

.badge-compliant {
  background: #D4EDDA;
  color: #155724;
}

.badge-partial {
  background: #FFF3CD;
  color: #856404;
}

.badge-non-compliant {
  background: #F8D7DA;
  color: #721C24;
}

.summary-text {
  font-size: var(--font-size-base);
  color: var(--text-dark);
  line-height: var(--line-height-relaxed);
  margin: 0;
}

.section-heading {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  color: var(--text-dark);
  margin: 0 0 var(--spacing-lg) 0;
}

/* Issues Section */
.issues-section {
  margin-bottom: var(--spacing-2xl);
}

.issue-card {
  background: white;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  padding: var(--spacing-lg);
  margin-bottom: var(--spacing-lg);
}

.issue-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacing-md);
  padding-bottom: var(--spacing-sm);
  border-bottom: 1px solid var(--border-light);
}

.issue-number {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  color: var(--text-gray);
}

.severity-badge {
  padding: 4px 12px;
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
}

.severity-high {
  background: #F8D7DA;
  color: #721C24;
}

.severity-moderate {
  background: #FFF3CD;
  color: #856404;
}

.issue-body {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.issue-body > div {
  font-size: var(--font-size-sm);
  line-height: var(--line-height-relaxed);
}

.issue-body strong {
  color: var(--text-dark);
  font-weight: var(--font-weight-semibold);
}

.issue-location {
  color: var(--text-gray);
  font-style: italic;
}

.issue-description {
  color: var(--text-dark);
}

.issue-quote blockquote {
  margin: var(--spacing-sm) 0;
  padding: var(--spacing-md);
  background: #FFF5F0;
  border-left: 4px solid var(--orange-alert);
  font-style: italic;
  color: var(--text-dark);
}

.issue-rationale {
  color: var(--text-gray);
}

.issue-recommendation {
  padding: var(--spacing-md);
  background: #E8F5E9;
  border-left: 4px solid #4CAF50;
  border-radius: var(--radius-sm);
  color: var(--text-dark);
}

.issue-suggested blockquote {
  margin: var(--spacing-sm) 0;
  padding: var(--spacing-md);
  background: #E3F2FD;
  border-left: 4px solid #2196F3;
  font-style: normal;
  color: var(--text-dark);
}

.issue-reference {
  color: var(--primary-purple);
  font-size: var(--font-size-xs);
}

/* Strengths Section */
.strengths-section {
  padding: var(--spacing-lg);
  background: #F1F8F4;
  border-radius: var(--radius-md);
  border-left: 4px solid #4CAF50;
}

.strengths-list {
  margin: 0;
  padding-left: var(--spacing-xl);
  color: var(--text-dark);
}

.strengths-list li {
  margin-bottom: var(--spacing-sm);
  line-height: var(--line-height-relaxed);
}

/* Responsive */
@media (max-width: 1200px) {
  .dashboard-main {
    margin-left: 280px;
  }
  
  .dashboard-sidebar {
    width: 280px;
  }
  
  .stats-row {
    grid-template-columns: 1fr;
  }
}
</style>
