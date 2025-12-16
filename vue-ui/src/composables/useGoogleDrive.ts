/**
 * Google Drive Integration Composable
 * Uses Google Identity Services (GIS) for authentication
 */

import { ref, readonly } from 'vue';

// Declare global objects from Google scripts
declare const gapi: any;
declare const google: any;

export interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime: string;
  webViewLink?: string;
}

export interface SharedDrive {
  id: string;
  name: string;
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
let tokenClient: any = null;
let accessToken: string | null = null;

export function useGoogleDrive() {
  const isSignedIn = ref(false);
  const userEmail = ref<string | null>(null);
  const isInitializing = ref(false);
  const initError = ref<string | null>(null);

  /**
   * Wait for Google scripts to load
   */
  const waitForGoogleScripts = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        if (typeof gapi !== 'undefined' && typeof google !== 'undefined') {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);

      // Timeout after 10 seconds
      setTimeout(() => {
        clearInterval(checkInterval);
        if (typeof gapi === 'undefined' || typeof google === 'undefined') {
          reject(new Error('Google scripts failed to load'));
        }
      }, 10000);
    });
  };

  /**
   * Initialize GAPI client (for API calls, not auth)
   */
  const initializeGapiClient = async (): Promise<void> => {
    return new Promise((resolve, reject) => {
      gapi.load('client', async () => {
        try {
          await gapi.client.init({
            apiKey: API_KEY,
            discoveryDocs: DISCOVERY_DOCS,
            // No auth configuration - we handle that with GIS token client
          });
          console.log('[GoogleDrive] GAPI client initialized');
          resolve();
        } catch (error) {
          console.error('[GoogleDrive] GAPI client init error:', error);
          reject(error);
        }
      });
    });
  };

  /**
   * Initialize Google Identity Services token client
   */
  const initializeTokenClient = (): void => {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: (response: any) => {
        if (response.error) {
          console.error('[GoogleDrive] Token error:', response);
          initError.value = response.error_description || 'Authentication failed';
          isSignedIn.value = false;
          accessToken = null;
          return;
        }

        console.log('[GoogleDrive] Token received successfully');
        accessToken = response.access_token;
        
        // Set token for GAPI client
        gapi.client.setToken({ access_token: response.access_token });
        
        isSignedIn.value = true;
        initError.value = null;
        
        // Fetch user info
        fetchUserInfo();
      },
    });
    console.log('[GoogleDrive] Token client initialized');
  };

  /**
   * Fetch user profile information
   */
  const fetchUserInfo = async (): Promise<void> => {
    if (!accessToken) return;

    try {
      const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (response.ok) {
        const userInfo = await response.json();
        userEmail.value = userInfo.email;
        console.log('[GoogleDrive] User info fetched:', userInfo.email);
      }
    } catch (error) {
      console.error('[GoogleDrive] Error fetching user info:', error);
    }
  };

  /**
   * Initialize the Google Drive integration
   */
  const initializeGapi = async (): Promise<void> => {
    // Return existing promise if already initializing
    if (gapiInitializing && gapiInitPromise) {
      return gapiInitPromise;
    }

    // Return immediately if already initialized
    if (gapiInitialized) {
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

        // Wait for Google scripts to load
        await waitForGoogleScripts();

        // Initialize GAPI client (for API calls)
        await initializeGapiClient();

        // Initialize GIS token client (for authentication)
        initializeTokenClient();

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
      console.log('[GoogleDrive] Requesting access token...');
      // Trigger the OAuth2 flow
      tokenClient.requestAccessToken({ prompt: 'consent' });
    } catch (error: any) {
      console.error('[GoogleDrive] Sign-in error:', error);
      throw new Error('Failed to sign in to Google Drive');
    }
  };

  /**
   * Sign out from Google Drive
   */
  const signOut = async (): Promise<void> => {
    if (!gapiInitialized || !isSignedIn.value || !accessToken) {
      return;
    }

    try {
      // Revoke the access token
      google.accounts.oauth2.revoke(accessToken, () => {
        console.log('[GoogleDrive] Token revoked');
      });

      // Clear token from GAPI client
      gapi.client.setToken(null);

      // Reset state
      accessToken = null;
      isSignedIn.value = false;
      userEmail.value = null;
    } catch (error: any) {
      console.error('[GoogleDrive] Sign-out error:', error);
    }
  };

  /**
   * Ensure we have a valid token before API calls
   */
  const ensureToken = (): void => {
    if (!isSignedIn.value || !accessToken) {
      throw new Error('Not signed in to Google Drive');
    }
  };

  /**
   * List all Shared Drives accessible to the user
   */
  const listSharedDrives = async (): Promise<SharedDrive[]> => {
    ensureToken();

    try {
      const response = await gapi.client.drive.drives.list({
        pageSize: 100,
        fields: 'drives(id, name)'
      });

      return response.result.drives || [];
    } catch (error: any) {
      console.error('[GoogleDrive] Error listing shared drives:', error);
      throw new Error('Failed to list shared drives');
    }
  };

  /**
   * List files in a Google Drive folder (supports both My Drive and Shared Drives)
   * @param folderId - The folder ID to list files from
   * @param driveId - Optional: The Shared Drive ID if browsing a Shared Drive
   */
  const listFilesInFolder = async (folderId: string = 'root', driveId?: string): Promise<GoogleDriveFile[]> => {
    ensureToken();

    try {
      const params: any = {
        q: `'${folderId}' in parents and trashed = false`,
        fields: 'files(id, name, mimeType, size, modifiedTime, webViewLink)',
        orderBy: 'folder,name',
        pageSize: 100,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true
      };

      // If browsing a Shared Drive, specify the drive context
      if (driveId) {
        params.corpora = 'drive';
        params.driveId = driveId;
      }

      const response = await gapi.client.drive.files.list(params);

      return response.result.files || [];
    } catch (error: any) {
      console.error('[GoogleDrive] Error listing files:', error);
      throw new Error('Failed to list files from Google Drive');
    }
  };

  /**
   * Get folder metadata (supports both My Drive and Shared Drives)
   */
  const getFolderMetadata = async (folderId: string): Promise<GoogleDriveFile> => {
    ensureToken();

    try {
      const response = await gapi.client.drive.files.get({
        fileId: folderId,
        fields: 'id, name, mimeType, modifiedTime',
        supportsAllDrives: true
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
    ensureToken();

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
    ensureToken();

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
    return accessToken;
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
    listSharedDrives,
    listFilesInFolder,
    getFolderMetadata,
    downloadFile,
    searchFolders,
    getAccessToken
  };
}
