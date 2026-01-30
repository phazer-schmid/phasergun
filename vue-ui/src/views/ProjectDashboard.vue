<template>
  <div class="dashboard-container">
    <!-- Sidebar -->
    <aside class="dashboard-sidebar">
      <!-- Logo/Branding -->
      <div class="sidebar-header">
        <div class="app-logo">
          <div class="logo-icon">PG</div>
          <div class="logo-content">
            <span class="logo-text">PhaserGun</span>
            <span class="logo-subtitle">Quality Regulatory Generation</span>
          </div>
        </div>
      </div>

      <!-- File Lists -->
      <div class="sidebar-content">
        <!-- Procedures Section -->
        <div class="card sidebar-card">
          <div class="sidebar-card-header">
            <h3 class="sidebar-card-title">Procedures</h3>
          </div>
          <div class="sidebar-card-content">
            <ul v-if="proceduresFiles.length > 0" class="file-bullet-list">
              <li v-for="file in proceduresFiles" :key="file.path">
                {{ file.name }}
              </li>
            </ul>
            <p v-else class="no-files-text">No files found</p>
          </div>
        </div>

        <!-- Context Section -->
        <div class="card sidebar-card">
          <div class="sidebar-card-header">
            <h3 class="sidebar-card-title">Context</h3>
          </div>
          <div class="sidebar-card-content">
            <div v-if="contextItems.length > 0" class="file-tree-list">
              <div v-for="item in sortedContextItems" :key="item.path" class="tree-item">
                <!-- Folder -->
                <div v-if="item.type === 'directory'" class="tree-folder">
                  <div class="tree-folder-header" @click="toggleFolder(item.path)">
                    <span class="tree-toggle">{{ expandedFolders.has(item.path) ? '▼' : '▶' }}</span>
                    <span class="tree-folder-name">{{ item.name }}/</span>
                  </div>
                  <div v-if="expandedFolders.has(item.path)" class="tree-folder-content">
                    <div v-if="item.children && item.children.length > 0" class="tree-nested">
                      <div v-for="child in item.children" :key="child.path" class="tree-item">
                        <div v-if="child.type === 'directory'" class="tree-folder">
                          <div class="tree-folder-header" @click="toggleFolder(child.path)">
                            <span class="tree-toggle">{{ expandedFolders.has(child.path) ? '▼' : '▶' }}</span>
                            <span class="tree-folder-name">{{ child.name }}/</span>
                          </div>
                          <div v-if="expandedFolders.has(child.path) && child.children" class="tree-nested">
                            <div v-for="nestedChild in child.children" :key="nestedChild.path" class="tree-file">
                              • {{ nestedChild.name }}
                            </div>
                          </div>
                        </div>
                        <div v-else class="tree-file">
                          • {{ child.name }}
                        </div>
                      </div>
                    </div>
                    <p v-else class="tree-empty">Empty folder</p>
                  </div>
                </div>
                <!-- File -->
                <div v-else class="tree-file">
                  • {{ item.name }}
                </div>
              </div>
            </div>
            <p v-else class="no-files-text">No files found</p>
          </div>
        </div>
      </div>

      <!-- Sidebar Footer -->
      <div class="sidebar-footer">
        <div class="footer-text">© 2026 PhaserGun</div>
        <div class="footer-version">v2.0.0</div>
      </div>
    </aside>

    <!-- Main Content -->
    <main class="dashboard-main">
      <!-- Header -->
      <div class="dashboard-header">
        <div class="header-row">
          <div class="header-actions">
            <button class="btn-text" @click="backToProjects()">← Back to Projects</button>
            <button class="btn-text" @click="editProject()">✎ Edit Project</button>
          </div>
          <div class="header-controls">
            <select 
              v-model="selectedCheck"
              class="check-dropdown">
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
              :disabled="!selectedCheck || isScanning"
              @click="analyzeSelectedDocument()">
              <span v-if="!isScanning">🔍 Generate Text</span>
              <span v-if="isScanning">⏳ Generating...</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Main Content Row -->
      <div class="dashboard-content">
        <!-- AI Analysis Panel -->
        <div class="card analysis-card">
          <div class="section-header">
            <h2 class="section-title">Generated Text</h2>
          </div>

          <div class="analysis-content">
            <div v-if="scanError" class="analysis-error">
              <p><strong>Analysis Error:</strong> {{ scanError }}</p>
            </div>

            <div v-if="!analysisResult && !isScanning && !scanError" class="analysis-empty">
              <p>Select a Prompt and click Generate Text.</p>
            </div>

            <div v-if="isScanning" class="analysis-loading">
              <p>🤖 Generating content using AI...</p>
              <p class="scan-details">This may take a moment.</p>
            </div>

            <div v-if="analysisResult?.status === 'complete'" class="analysis-narrative">
              <!-- Document Name Header -->
              <div v-if="getDocumentName()" class="document-header">
                <h3 class="document-name">📄 {{ getDocumentName() }}</h3>
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
import { ref, onMounted, computed } from 'vue';
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

// Sidebar files state
const proceduresFiles = ref<any[]>([]);
const contextItems = ref<any[]>([]); // Changed to support folders and files
const expandedFolders = ref<Set<string>>(new Set()); // Track expanded folders

// Selected check state
const selectedCheck = ref<string>('');
const availableChecks = ref<Array<{ filename: string; displayName: string }>>([]);

onMounted(async () => {
  const projectId = route.params.id as string;
  project.value = projectService.getProject(projectId);
  
  // Load sidebar files
  await loadProceduresFiles();
  await loadContextFiles();
  
  // Load prompts for dropdown
  await loadPromptsFiles();
});

// Load files from Procedures folder
async function loadProceduresFiles() {
  if (!project.value?.folderPath) return;

  const proceduresFolderPath = `${project.value.folderPath}/Procedures`;
  
  try {
    const response = await fetch(getApiEndpoint('/list-files'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: proceduresFolderPath })
    });
    
    const result = await response.json();
    proceduresFiles.value = result.files || [];
    console.log(`[Dashboard] Loaded ${proceduresFiles.value.length} files from Procedures folder`);
    
  } catch (error) {
    console.error('[Dashboard] Failed to load Procedures files:', error);
    proceduresFiles.value = [];
  }
}

// Load files from Context folder
async function loadContextFiles() {
  if (!project.value?.folderPath) return;

  const contextFolderPath = `${project.value.folderPath}/Context`;
  
  try {
    const response = await fetch(getApiEndpoint('/list-files'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        path: contextFolderPath,
        includeDirectories: true 
      })
    });
    
    const result = await response.json();
    contextItems.value = result.items || [];
    console.log(`[Dashboard] Loaded ${contextItems.value.length} items from Context folder`);
    
  } catch (error) {
    console.error('[Dashboard] Failed to load Context files:', error);
    contextItems.value = [];
  }
}

// Toggle folder expansion
async function toggleFolder(folderPath: string) {
  const newExpanded = new Set(expandedFolders.value);
  
  if (newExpanded.has(folderPath)) {
    // Collapse
    newExpanded.delete(folderPath);
  } else {
    // Expand - load children if not already loaded
    newExpanded.add(folderPath);
    await loadFolderContents(folderPath);
  }
  
  expandedFolders.value = newExpanded;
}

// Load contents of a folder
async function loadFolderContents(folderPath: string) {
  try {
    const response = await fetch(getApiEndpoint('/list-files'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        path: folderPath,
        includeDirectories: true 
      })
    });
    
    const result = await response.json();
    const children = result.items || [];
    
    // Find the folder in contextItems and add children
    const updateChildren = (items: any[]): any[] => {
      return items.map(item => {
        if (item.path === folderPath) {
          return { ...item, children };
        } else if (item.children) {
          return { ...item, children: updateChildren(item.children) };
        }
        return item;
      });
    };
    
    contextItems.value = updateChildren(contextItems.value);
    
  } catch (error) {
    console.error('[Dashboard] Failed to load folder contents:', error);
  }
}

// Sort items with "Primary Context" doc first, then folders, then other files
const sortedContextItems = computed(() => {
  const items = [...contextItems.value];
  
  return items.sort((a, b) => {
    // Check if either is the "Primary Context" file
    const aIsPrimaryContext = a.type === 'file' && a.name.toLowerCase().includes('primary context');
    const bIsPrimaryContext = b.type === 'file' && b.name.toLowerCase().includes('primary context');
    
    // Primary Context file always comes first
    if (aIsPrimaryContext) return -1;
    if (bIsPrimaryContext) return 1;
    
    // Then folders before other files
    if (a.type === 'directory' && b.type === 'file') return -1;
    if (a.type === 'file' && b.type === 'directory') return 1;
    
    // Within same type, sort alphabetically
    return a.name.localeCompare(b.name);
  });
});

// Load files from Prompts folder for dropdown
async function loadPromptsFiles() {
  if (!project.value?.folderPath) return;

  const promptsFolderPath = `${project.value.folderPath}/Prompts`;
  
  try {
    const response = await fetch(getApiEndpoint('/list-files'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: promptsFolderPath })
    });
    
    const result = await response.json();
    const files = result.files || [];
    
    // Transform files to dropdown options with displayName
    availableChecks.value = files.map((file: any) => ({
      filename: file.path,
      displayName: file.name.replace(/\.[^/.]+$/, '') // Remove file extension for display
    }));
    
    console.log(`[Dashboard] Loaded ${availableChecks.value.length} prompts from Prompts folder`);
    
  } catch (error) {
    console.error('[Dashboard] Failed to load Prompts files:', error);
    availableChecks.value = [];
  }
}

// Generate content from prompt
async function analyzeSelectedDocument() {
  if (!project.value) return;

  // Validate that a prompt is selected
  if (!selectedCheck.value) {
    scanError.value = 'Please select a prompt before generating';
    return;
  }

  isScanning.value = true;
  scanError.value = null;
  analysisResult.value = null;
  
  try {
    console.log('[Dashboard] Starting generation with:', {
      projectPath: project.value.folderPath,
      promptFilePath: selectedCheck.value
    });
    
    // Generate content using the new /api/generate endpoint
    const response = await fetch(getApiEndpoint('/generate'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectPath: project.value.folderPath,
        promptFilePath: selectedCheck.value
      })
    });
    
    console.log('[Dashboard] Response status:', response.status);
    
    const result = await response.json();
    console.log('[Dashboard] Result:', {
      status: result.status,
      hasContent: !!result.generatedContent,
      contentLength: result.generatedContent?.length || 0,
      error: result.error
    });
    
    if (result.status === 'complete') {
      // Validate that we actually have content
      if (!result.generatedContent || result.generatedContent.trim().length === 0) {
        scanError.value = 'Generation completed but returned no content. Check server logs for details.';
        console.error('[Dashboard] Empty content received despite complete status');
        return;
      }
      
      // Map the response to match the expected structure
      analysisResult.value = {
        status: 'complete',
        message: result.message,
        detailedReport: result.generatedContent,
        timestamp: result.timestamp,
        metadata: result.metadata
      };
      
      console.log('[Dashboard] Content successfully displayed:', result.generatedContent.substring(0, 100));
    } else if (result.status === 'error') {
      scanError.value = result.error || result.message || 'Content generation failed';
      console.error('[Dashboard] Generation error:', result);
    } else {
      scanError.value = result.message || 'Content generation failed';
      console.error('[Dashboard] Unexpected result status:', result.status);
    }
    
  } catch (error: any) {
    console.error('[Dashboard] Generation failed with exception:', error);
    scanError.value = `Failed to generate content: ${error.message || 'Unknown error'}`;
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

/* Sidebar Content */
.sidebar-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
  overflow: hidden;
  min-height: 0;
}

/* Sidebar Cards */
.sidebar-card {
  background: white;
  border: 1px solid var(--border-light);
  border-radius: 12px;
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 0 !important;
}

.sidebar-card-header {
  padding: 16px 20px 16px !important;
  border-bottom: 1px solid var(--border-light);
}

.sidebar-card-title {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  color: var(--text-dark);
  margin: 0 !important;
  padding: 0 !important;
  line-height: 1 !important;
}

.sidebar-card-content {
  padding: var(--spacing-md) var(--spacing-lg);
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.file-bullet-list {
  list-style-type: disc;
  margin: 0;
  padding-left: var(--spacing-lg);
  color: var(--text-dark);
}

.file-bullet-list li {
  font-size: var(--font-size-sm);
  margin-bottom: 6px;
  line-height: 1.4;
}

.no-files-text {
  font-size: var(--font-size-sm);
  color: var(--text-light);
  font-style: italic;
  margin: 0;
}

/* File Tree Styles */
.file-tree-list {
  margin: 0;
  padding: 0;
}

.tree-item {
  margin: 0;
}

.tree-folder {
  margin-bottom: 4px;
}

.tree-folder-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: background var(--transition-fast);
  user-select: none;
}

.tree-folder-header:hover {
  background: rgba(74, 59, 140, 0.06);
}

.tree-toggle {
  font-size: 10px;
  color: var(--text-gray);
  width: 12px;
  flex-shrink: 0;
  display: inline-block;
  transition: transform var(--transition-fast);
}

.tree-folder-name {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--text-dark);
}

.tree-folder-content {
  margin-top: 2px;
}

.tree-nested {
  margin-left: 18px;
  padding-left: 8px;
  border-left: 1px solid var(--border-light);
}

.tree-file {
  font-size: var(--font-size-sm);
  color: var(--text-dark);
  padding: 2px 8px 2px 18px;
  line-height: 1.6;
}

.tree-empty {
  font-size: var(--font-size-xs);
  color: var(--text-light);
  font-style: italic;
  margin: 4px 0 4px 18px;
  padding-left: 8px;
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
  display: flex;
  flex-direction: column;
  height: 100vh;
  max-height: 100vh;
  width: calc(100vw - 320px);
  max-width: calc(100vw - 320px);
  overflow-x: hidden;
  box-sizing: border-box;
}

.dashboard-header {
  margin-bottom: 0;
  position: sticky;
  top: 0;
  background: var(--light-bg);
  z-index: 10;
  padding-bottom: var(--spacing-lg);
  width: 100%;
}

.header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacing-2xl);
  flex-wrap: wrap;
  gap: var(--spacing-md);
}

.header-actions {
  display: flex;
  gap: var(--spacing-md);
}

.header-controls {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
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
  align-items: center;
  gap: var(--spacing-md);
}

.page-title {
  font-size: var(--font-size-3xl);
  font-weight: var(--font-weight-bold);
  color: var(--text-dark);
  margin: 0;
}

.btn-refresh {
  padding: 10px 18px;
  background: var(--primary-purple);
  color: white;
  border: none;
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  cursor: pointer;
  transition: all var(--transition-fast);
  display: flex;
  align-items: center;
  gap: 6px;
}

.btn-refresh:hover:not(:disabled) {
  background: #5A4A99;
}

.btn-refresh:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  background: var(--primary-purple);
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
  max-width: 400px;
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
  display: flex;
  flex-direction: column;
  width: 100%;
  flex: 1;
  min-height: 0;
}

/* Section Header */
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0;
  padding: 16px 20px 16px !important;
  border-bottom: 1px solid var(--border-light);
}

.section-title {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  color: var(--text-dark);
  margin: 0 !important;
  padding: 0 !important;
  line-height: 1 !important;
}

/* Analysis Panel */
.analysis-card {
  border-radius: 12px;
  padding: 0 !important;
  width: 100%;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  max-height: 100%;
}

.analysis-content {
  line-height: var(--line-height-relaxed);
  padding: 0 var(--spacing-lg) var(--spacing-md) var(--spacing-lg);
  word-wrap: break-word;
  overflow-wrap: break-word;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}

.analysis-empty {
  padding: var(--spacing-xl) 0;
  text-align: center;
  color: var(--text-gray);
  font-size: var(--font-size-sm);
}

.analysis-loading {
  padding: var(--spacing-xl) 0;
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
  padding-top: var(--spacing-md);
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
  margin: 0;
}

.narrative-text pre {
  white-space: pre-wrap;
  font-family: inherit;
  margin: 0;
  color: var(--text-dark);
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
