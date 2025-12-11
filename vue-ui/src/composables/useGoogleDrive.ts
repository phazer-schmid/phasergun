/**
 * Google Drive Integration Composable
 * Provides Google Drive authentication and file access
 */

import { ref, readonly } from 'vue';

// Declare global gapi object from Google API script
declare const gapi: any;

export interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime: string;
  webViewLink?: string;
}

// Google Drive API configuration
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com';
const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY || 'YOUR_API_KEY';
const DISCOVERY_DOCS = ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'];
const SCOPES = 'https://www.googleapis.com/auth/drive.readonly';

// Shared state across all instances
let gapiInitialized = false;
let gapiInitializing = false;
let gapiInitPromise: Promise<void> | null = null;

export function useGoogleDrive() {
  const isSignedIn = ref(false);
  const userEmail = ref<string | null>(null);
  const isInitializing = ref(false);
  const initError = ref<string | null>(null);

  /**
   * Load the Google API script
   */
  const loadGapiScript = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      // Check if script already exists
      if (typeof gapi !== 'undefined') {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://apis.google.com/js/api.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Google API script'));
      document.body.appendChild(script);
    });
  };

  /**
   * Initialize the Google API client
   */
  const initializeGapi = async (): Promise<void> => {
    // Return existing promise if already initializing
    if (gapiInitializing && gapiInitPromise) {
      return gapiInitPromise;
    }

    // Return immediately if already initialized
    if (gapiInitialized) {
      updateSignInStatus();
      return Promise.resolve();
    }

    gapiInitializing = true;
    isInitializing.value = true;
    initError.value = null;

    gapiInitPromise = (async () => {
      try {
        console.log('[GoogleDrive] Starting initialization...');

        // Check if credentials are configured
        if (CLIENT_ID.includes('YOUR_') || API_KEY.includes('YOUR_')) {
          throw new Error('Google API credentials not configured. Please see GOOGLE_DRIVE_SETUP.md');
        }

        // Load the Google API script
        await loadGapiScript();

        // Load the auth2 library and API client library
        await new Promise<void>((resolve, reject) => {
          gapi.load('client:auth2', () => resolve(), () => reject(new Error('Failed to load GAPI client')));
        });

        // Initialize the API client
        await gapi.client.init({
          apiKey: API_KEY,
          clientId: CLIENT_ID,
          discoveryDocs: DISCOVERY_DOCS,
          scope: SCOPES
        });

        console.log('[GoogleDrive] Client initialized successfully');

        // Listen for sign-in state changes
        gapi.auth2.getAuthInstance().isSignedIn.listen((signedIn: boolean) => {
          isSignedIn.value = signedIn;
          updateUserEmail();
        });

        // Update initial sign-in status
        updateSignInStatus();

        gapiInitialized = true;
        console.log('[GoogleDrive] Initialization complete');
      } catch (error: any) {
        console.error('[GoogleDrive] Initialization error:', error);
        initError.value = error.message || 'Failed to initialize Google Drive';
        throw error;
      } finally {
        isInitializing.value = false;
        gapiInitializing = false;
      }
    })();

    return gapiInitPromise;
  };

  /**
   * Update sign-in status from Google Auth
   */
  const updateSignInStatus = () => {
    if (gapiInitialized && gapi?.auth2) {
      isSignedIn.value = gapi.auth2.getAuthInstance().isSignedIn.get();
      updateUserEmail();
    }
  };

  /**
   * Update user email from Google profile
   */
  const updateUserEmail = () => {
    if (isSignedIn.value && gapi?.auth2) {
      const profile = gapi.auth2.getAuthInstance().currentUser.get().getBasicProfile();
      userEmail.value = profile ? profile.getEmail() : null;
    } else {
      userEmail.value = null;
    }
  };

  /**
   * Sign in to Google Drive
   */
  const signIn = async (): Promise<void> => {
    if (!gapiInitialized) {
      await initializeGapi();
    }

    if (isSignedIn.value) {
      return;
    }

    try {
      await gapi.auth2.getAuthInstance().signIn();
      isSignedIn.value = true;
      updateUserEmail();
    } catch (error: any) {
      console.error('[GoogleDrive] Sign-in error:', error);
      throw new Error('Failed to sign in to Google Drive');
    }
  };

  /**
   * Sign out from Google Drive
   */
  const signOut = async (): Promise<void> => {
    if (!gapiInitialized || !isSignedIn.value) {
      return;
    }

    try {
      await gapi.auth2.getAuthInstance().signOut();
      isSignedIn.value = false;
      userEmail.value = null;
    } catch (error: any) {
      console.error('[GoogleDrive] Sign-out error:', error);
    }
  };

  /**
   * List files in a Google Drive folder
   */
  const listFilesInFolder = async (folderId: string = 'root'): Promise<GoogleDriveFile[]> => {
    if (!isSignedIn.value) {
      throw new Error('Not signed in to Google Drive');
    }

    try {
      const response = await gapi.client.drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields: 'files(id, name, mimeType, size, modifiedTime, webViewLink)',
        orderBy: 'folder,name',
        pageSize: 100
      });

      return response.result.files || [];
    } catch (error: any) {
      console.error('[GoogleDrive] Error listing files:', error);
      throw new Error('Failed to list files from Google Drive');
    }
  };

  /**
   * Get folder metadata
   */
  const getFolderMetadata = async (folderId: string): Promise<GoogleDriveFile> => {
    if (!isSignedIn.value) {
      throw new Error('Not signed in to Google Drive');
    }

    try {
      const response = await gapi.client.drive.files.get({
        fileId: folderId,
        fields: 'id, name, mimeType, modifiedTime'
      });

      return response.result;
    } catch (error: any) {
      console.error('[GoogleDrive] Error getting folder metadata:', error);
      throw new Error('Failed to get folder information');
    }
  };

  /**
   * Download file content
   */
  const downloadFile = async (fileId: string): Promise<string> => {
    if (!isSignedIn.value) {
      throw new Error('Not signed in to Google Drive');
    }

    try {
      const response = await gapi.client.drive.files.get({
        fileId: fileId,
        alt: 'media'
      });

      return response.body;
    } catch (error: any) {
      console.error('[GoogleDrive] Error downloading file:', error);
      throw new Error('Failed to download file from Google Drive');
    }
  };

  /**
   * Search for folders
   */
  const searchFolders = async (query: string): Promise<GoogleDriveFile[]> => {
    if (!isSignedIn.value) {
      throw new Error('Not signed in to Google Drive');
    }

    try {
      const response = await gapi.client.drive.files.list({
        q: `mimeType='application/vnd.google-apps.folder' and name contains '${query}' and trashed = false`,
        fields: 'files(id, name, mimeType, modifiedTime)',
        orderBy: 'name',
        pageSize: 20
      });

      return response.result.files || [];
    } catch (error: any) {
      console.error('[GoogleDrive] Error searching folders:', error);
      throw new Error('Failed to search folders');
    }
  };

  /**
   * Get current access token for API calls
   */
  const getAccessToken = (): string | null => {
    if (!isSignedIn.value || !gapiInitialized) {
      return null;
    }

    const authInstance = gapi.auth2.getAuthInstance();
    const currentUser = authInstance.currentUser.get();
    const authResponse = currentUser.getAuthResponse();
    
    return authResponse ? authResponse.access_token : null;
  };

  return {
    // State (readonly)
    isSignedIn: readonly(isSignedIn),
    userEmail: readonly(userEmail),
    isInitializing: readonly(isInitializing),
    initError: readonly(initError),

    // Methods
    initializeGapi,
    signIn,
    signOut,
    listFilesInFolder,
    getFolderMetadata,
    downloadFile,
    searchFolders,
    getAccessToken
  };
}
