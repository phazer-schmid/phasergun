<template>
  <div v-if="isOpen" class="modal-overlay" @click.self="close">
    <div class="modal-container">
      <!-- Header -->
      <div class="modal-header">
        <h2 class="modal-title">Select Google Drive Folder</h2>
        <button @click="close" class="close-button">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <!-- Content -->
      <div class="modal-content">
        <!-- Sign In State -->
        <div v-if="!googleDrive.isSignedIn.value && !googleDrive.isInitializing.value" class="sign-in-prompt">
          <div class="icon-container">
            <svg class="w-16 h-16 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/>
            </svg>
          </div>
          <h3 class="text-xl font-semibold mb-2">Connect to Google Drive</h3>
          <p class="text-gray-600 mb-6">Sign in to browse and select your DHF folder</p>
          <button @click="handleSignIn" class="btn-primary">
            Sign in with Google
          </button>
          <p v-if="error" class="error-message mt-4">{{ error }}</p>
        </div>

        <!-- Initializing State -->
        <div v-else-if="googleDrive.isInitializing.value" class="loading-state">
          <div class="spinner"></div>
          <p class="text-gray-600">Initializing Google Drive...</p>
        </div>

        <!-- Drive Selection / Folder Browser -->
        <div v-else class="folder-browser">
          <!-- Show drive list if at root level -->
          <div v-if="!currentDriveContext.driveId && !currentFolder">
            <h3 class="section-title">Select a Drive</h3>
            
            <!-- My Drive -->
            <div class="drive-section">
              <h4 class="drive-section-title">My Drive</h4>
              <div class="drive-item" @click="enterMyDrive">
                <svg class="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/>
                </svg>
                <span class="drive-name">My Drive</span>
                <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                </svg>
              </div>
            </div>

            <!-- Shared Drives -->
            <div v-if="sharedDrives.length > 0" class="drive-section">
              <h4 class="drive-section-title">Shared Drives</h4>
              <div
                v-for="drive in sharedDrives"
                :key="drive.id"
                @click="enterSharedDrive(drive)"
                class="drive-item"
              >
                <svg class="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/>
                </svg>
                <span class="drive-name">{{ drive.name }}</span>
                <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                </svg>
              </div>
            </div>

            <!-- Loading Shared Drives -->
            <div v-if="loadingDrives" class="loading-state-small">
              <div class="spinner-small"></div>
              <p class="text-gray-600 text-sm">Loading Shared Drives...</p>
            </div>
          </div>

          <!-- Folder navigation (when inside a drive) -->
          <div v-else>
            <!-- Breadcrumb -->
            <div class="breadcrumb">
              <button @click="goBackToDriveSelection" class="breadcrumb-item">
                <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>
                </svg>
                {{ currentDriveContext.driveName }}
              </button>
              <span v-for="(folder) in breadcrumbs" :key="folder.id" class="breadcrumb-separator">
                /
                <button @click="navigateToFolder(folder.id)" class="breadcrumb-item">
                  {{ folder.name }}
                </button>
              </span>
            </div>

            <!-- Current Folder Info -->
            <div v-if="currentFolder" class="current-folder-info">
              <div class="folder-icon">
                <svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/>
                </svg>
              </div>
              <div>
                <div class="font-semibold">{{ currentFolder.name }}</div>
                <div class="text-sm text-gray-500">Folder ID: {{ currentFolder.id }}</div>
              </div>
            </div>

            <!-- Loading -->
            <div v-if="loading" class="loading-state">
              <div class="spinner"></div>
              <p class="text-gray-600">Loading folders...</p>
            </div>

            <!-- Folder List -->
            <div v-else-if="folders.length > 0" class="folder-list">
              <div
                v-for="folder in folders"
                :key="folder.id"
                @click="navigateToFolder(folder.id)"
                class="folder-item"
              >
                <svg class="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/>
                </svg>
                <span class="folder-name">{{ folder.name }}</span>
                <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                </svg>
              </div>
            </div>

            <!-- Empty State -->
            <div v-else class="empty-state">
              <svg class="w-12 h-12 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/>
              </svg>
              <p class="text-gray-500">No folders found in this location</p>
            </div>
          </div>

          <p v-if="error" class="error-message">{{ error }}</p>
        </div>
      </div>

      <!-- Footer -->
      <div v-if="googleDrive.isSignedIn.value" class="modal-footer">
        <button @click="close" class="btn-secondary">
          Cancel
        </button>
        <button 
          @click="selectCurrentFolder" 
          :disabled="!currentFolder"
          class="btn-primary"
        >
          Select This Folder
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useGoogleDrive, type GoogleDriveFile, type SharedDrive } from '../composables/useGoogleDrive';

const props = defineProps<{
  isOpen: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'select', data: { 
    folderId: string; 
    folderName: string; 
    driveId?: string; 
    driveType: 'my-drive' | 'shared-drive';
  }): void;
}>();

const googleDrive = useGoogleDrive();

const loading = ref(false);
const loadingDrives = ref(false);
const error = ref<string | null>(null);
const folders = ref<GoogleDriveFile[]>([]);
const sharedDrives = ref<SharedDrive[]>([]);
const currentFolder = ref<GoogleDriveFile | null>(null);
const breadcrumbs = ref<GoogleDriveFile[]>([]);

// Track current drive context
const currentDriveContext = ref<{
  driveId: string | null;
  driveName: string;
  driveType: 'my-drive' | 'shared-drive';
}>({
  driveId: null,
  driveName: '',
  driveType: 'my-drive'
});

// Watch for modal opening
watch(() => props.isOpen, async (isOpen) => {
  if (isOpen) {
    error.value = null;
    if (googleDrive.isSignedIn.value) {
      await loadSharedDrives();
      resetToRoot();
    } else {
      // Try to initialize
      try {
        await googleDrive.initializeGapi();
      } catch (err: any) {
        error.value = err.message || 'Failed to initialize Google Drive';
      }
    }
  }
});

// Watch for sign-in status changes - load Shared Drives when authenticated
watch(() => googleDrive.isSignedIn.value, async (isSignedIn) => {
  if (isSignedIn && props.isOpen) {
    console.log('[GoogleDriveFolderPicker] User signed in, loading Shared Drives...');
    await loadSharedDrives();
    resetToRoot();
  }
});

// Sign in to Google Drive
async function handleSignIn() {
  try {
    error.value = null;
    await googleDrive.initializeGapi();
    await googleDrive.signIn();
    // Don't call loadSharedDrives here - the watcher will do it after auth completes
  } catch (err: any) {
    error.value = err.message || 'Failed to sign in to Google Drive';
  }
}

// Load available Shared Drives
async function loadSharedDrives() {
  try {
    loadingDrives.value = true;
    sharedDrives.value = await googleDrive.listSharedDrives();
    console.log('[GoogleDriveFolderPicker] Loaded', sharedDrives.value.length, 'shared drives');
    if (sharedDrives.value.length === 0) {
      console.log('[GoogleDriveFolderPicker] No shared drives found - user may not have access to any');
    }
  } catch (err: any) {
    console.error('[GoogleDriveFolderPicker] Error loading shared drives:', err);
    console.error('[GoogleDriveFolderPicker] Full error details:', err.message, err.stack);
    // Show error temporarily for debugging
    error.value = `Shared Drives error: ${err.message}`;
    sharedDrives.value = [];
  } finally {
    loadingDrives.value = false;
  }
}

// Reset to root (drive selection screen)
function resetToRoot() {
  currentFolder.value = null;
  breadcrumbs.value = [];
  folders.value = [];
  currentDriveContext.value = {
    driveId: null,
    driveName: '',
    driveType: 'my-drive'
  };
}

// Enter My Drive
async function enterMyDrive() {
  currentDriveContext.value = {
    driveId: null,
    driveName: 'My Drive',
    driveType: 'my-drive'
  };
  await loadFolders('root');
}

// Enter a Shared Drive
async function enterSharedDrive(drive: SharedDrive) {
  currentDriveContext.value = {
    driveId: drive.id,
    driveName: drive.name,
    driveType: 'shared-drive'
  };
  // Load root of shared drive
  await loadFolders(drive.id);
}

// Go back to drive selection
function goBackToDriveSelection() {
  resetToRoot();
}

// Load folders from a specific folder
async function loadFolders(folderId: string) {
  try {
    loading.value = true;
    error.value = null;
    
    // Get folder metadata
    if (folderId === 'root' || folderId === currentDriveContext.value.driveId) {
      // Root of drive
      currentFolder.value = { 
        id: folderId, 
        name: currentDriveContext.value.driveName, 
        mimeType: 'application/vnd.google-apps.folder' 
      } as GoogleDriveFile;
    } else {
      currentFolder.value = await googleDrive.getFolderMetadata(folderId);
    }
    
    // List folders in current folder
    const files = await googleDrive.listFilesInFolder(folderId, currentDriveContext.value.driveId || undefined);
    
    // Filter to only show folders
    folders.value = files.filter(file => 
      file.mimeType === 'application/vnd.google-apps.folder'
    );
  } catch (err: any) {
    error.value = err.message || 'Failed to load folders';
    folders.value = [];
  } finally {
    loading.value = false;
  }
}

// Navigate to a folder
async function navigateToFolder(folderId: string) {
  const driveRootId = currentDriveContext.value.driveId || 'root';
  
  // Check if navigating back to drive root
  if (folderId === driveRootId) {
    breadcrumbs.value = [];
    await loadFolders(folderId);
    return;
  }
  
  // Update breadcrumbs
  const folderIndex = breadcrumbs.value.findIndex(f => f.id === folderId);
  if (folderIndex >= 0) {
    // Going back in breadcrumbs
    breadcrumbs.value = breadcrumbs.value.slice(0, folderIndex + 1);
  } else if (currentFolder.value && currentFolder.value.id !== driveRootId) {
    // Going forward, add current to breadcrumbs
    breadcrumbs.value.push(currentFolder.value);
  }
  
  await loadFolders(folderId);
}

// Select the current folder
function selectCurrentFolder() {
  if (currentFolder.value) {
    emit('select', {
      folderId: currentFolder.value.id,
      folderName: currentFolder.value.name,
      driveId: currentDriveContext.value.driveId || undefined,
      driveType: currentDriveContext.value.driveType
    });
    close();
  }
}

// Close modal
function close() {
  emit('close');
}
</script>

<style scoped>
/* Modal Overlay */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

/* Modal Container */
.modal-container {
  background: white;
  border-radius: 12px;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
  width: 90%;
  max-width: 600px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}

/* Modal Header */
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid #e5e7eb;
}

.modal-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: #111827;
  margin: 0;
}

.close-button {
  background: none;
  border: none;
  cursor: pointer;
  color: #6b7280;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.2s;
}

.close-button:hover {
  background-color: #f3f4f6;
  color: #111827;
}

/* Modal Content */
.modal-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

/* Sign In Prompt */
.sign-in-prompt {
  text-align: center;
  padding: 40px 20px;
}

.icon-container {
  margin-bottom: 20px;
}

/* Loading State */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
}

.loading-state-small {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px;
}

.spinner {
  border: 3px solid #f3f4f6;
  border-top: 3px solid #3b82f6;
  border-radius: 50%;
  width: 40px;
  height: 40px;
  animation: spin 1s linear infinite;
  margin-bottom: 16px;
}

.spinner-small {
  border: 2px solid #f3f4f6;
  border-top: 2px solid #3b82f6;
  border-radius: 50%;
  width: 24px;
  height: 24px;
  animation: spin 1s linear infinite;
  margin-bottom: 8px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* Folder Browser */
.folder-browser {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* Section Title */
.section-title {
  font-size: 1.125rem;
  font-weight: 600;
  color: #111827;
  margin-bottom: 16px;
}

/* Drive Section */
.drive-section {
  margin-bottom: 24px;
}

.drive-section-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 8px;
}

.drive-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  cursor: pointer;
  transition: background-color 0.2s;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  margin-bottom: 8px;
}

.drive-item:hover {
  background-color: #f9fafb;
}

.drive-name {
  flex: 1;
  font-size: 0.9375rem;
  color: #111827;
  font-weight: 500;
}

/* Breadcrumb */
.breadcrumb {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  padding: 12px;
  background-color: #f9fafb;
  border-radius: 8px;
  font-size: 0.875rem;
}

.breadcrumb-item {
  background: none;
  border: none;
  cursor: pointer;
  color: #3b82f6;
  padding: 4px 8px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  transition: background-color 0.2s;
}

.breadcrumb-item:hover {
  background-color: #e5e7eb;
}

.breadcrumb-separator {
  color: #9ca3af;
  padding: 0 4px;
}

/* Current Folder Info */
.current-folder-info {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background-color: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 8px;
}

.folder-icon {
  flex-shrink: 0;
}

/* Folder List */
.folder-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
}

.folder-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  cursor: pointer;
  transition: background-color 0.2s;
  border-bottom: 1px solid #f3f4f6;
}

.folder-item:last-child {
  border-bottom: none;
}

.folder-item:hover {
  background-color: #f9fafb;
}

.folder-name {
  flex: 1;
  font-size: 0.9375rem;
  color: #111827;
}

/* Empty State */
.empty-state {
  text-align: center;
  padding: 60px 20px;
}

/* Error Message */
.error-message {
  color: #dc2626;
  font-size: 0.875rem;
  text-align: center;
  margin-top: 12px;
}

/* Modal Footer */
.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 24px;
  border-top: 1px solid #e5e7eb;
}

/* Buttons */
.btn-primary {
  padding: 10px 20px;
  background-color: #3b82f6;
  color: white;
  border: none;
  border-radius: 8px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s;
}

.btn-primary:hover:not(:disabled) {
  background-color: #2563eb;
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  padding: 10px 20px;
  background-color: white;
  color: #374151;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-secondary:hover {
  background-color: #f9fafb;
  border-color: #9ca3af;
}
</style>
