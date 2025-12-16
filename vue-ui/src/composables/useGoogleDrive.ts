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
// Include both drive.readonly and drive.metadata.readonly to ensure Shared Drive access
const SCOPES = 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.metadata.readonly';

// Shared state across all instances
let gapiInitialized = false;
let gapiInitializing = false;
let gapiInitPromise: Promise<void> | null = null;
let tokenClient: any = null;
let accessToken: string | null = null;

// LocalStorage key for token persistence
const TOKEN_STORAGE_KEY = 'google_drive_access_token';
const TOKEN_EXPIRY_KEY = 'google_drive_token_expiry';

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
   * Save token to localStorage
   */
  const saveToken = (token: string, expiresIn: number = 3600): void => {
    try {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
      // Set expiry time (default 1 hour from now)
      const expiryTime = Date.now() + (expiresIn * 1000);
      localStorage.setItem(TOKEN_EXPIRY_KEY, expiryTime.toString());
      console.log('[GoogleDrive] Token saved to localStorage');
    } catch (error) {
      console.error('[GoogleDrive] Error saving token:', error);
    }
  };

  /**
   * Restore token from localStorage
   * NOTE: We don't validate the token here - we'll handle 401s when API calls fail
   */
  const restoreToken = (): boolean => {
    try {
      const storedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
      const expiryTime = localStorage.getItem(TOKEN_EXPIRY_KEY);
      
      if (!storedToken || !expiryTime) {
        return false;
      }

      // Check if token is expired based on stored expiry time
      if (Date.now() >= parseInt(expiryTime)) {
        console.log('[GoogleDrive] Stored token expired, clearing');
        clearToken();
        return false;
      }

      // Restore token (assume valid until proven otherwise by API calls)
      accessToken = storedToken;
      gapi.client.setToken({ access_token: storedToken });
      isSignedIn.value = true;
      
      console.log('[GoogleDrive] Token restored from localStorage (will validate on first API call)');
      
      // Fetch user info in background (don't block on it)
      fetchUserInfo().catch(() => {
        // Token might be invalid - will be handled when user tries to use Drive
        console.log('[GoogleDrive] Background user info fetch failed (token may be invalid)');
      });
      
      return true;
    } catch (error) {
      console.error('[GoogleDrive] Error restoring token:', error);
      clearToken();
      return false;
    }
  };

  /**
   * Clear token from localStorage
   */
  const clearToken = (): void => {
    try {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      localStorage.removeItem(TOKEN_EXPIRY_KEY);
      console.log('[GoogleDrive] Token cleared from localStorage');
    } catch (error) {
      console.error('[GoogleDrive] Error clearing token:', error);
    }
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
          clearToken();
          return;
        }

        console.log('[GoogleDrive] Token received successfully');
        accessToken = response.access_token;
        
        // Save token to localStorage
        const expiresIn = response.expires_in || 3600;
        saveToken(response.access_token, expiresIn);
        
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
    if (!accessToken) {
      throw new Error('No access token available');
    }

    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch user info: ${response.status} ${response.statusText}`);
    }

    const userInfo = await response.json();
    userEmail.value = userInfo.email;
    console.log('[GoogleDrive] User info fetched:', userInfo.email);
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
        
        // Try to restore token from localStorage
        restoreToken();
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

      // Clear token from localStorage
      clearToken();

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
   * Handle 401 errors by clearing invalid tokens and prompting re-auth
   */
  const handle401Error = (error: any): void => {
    console.log('[GoogleDrive] 401 error detected - token is invalid, clearing');
    clearToken();
    accessToken = null;
    isSignedIn.value = false;
    gapi.client.setToken(null);
  };

  /**
   * Wrapper for API calls that handles 401 errors gracefully
   */
  const withAuthRetry = async <T>(apiCall: () => Promise<T>): Promise<T> => {
    try {
      return await apiCall();
    } catch (error: any) {
      // Check if this is a 401 error (invalid/expired token)
      const is401 = 
        error?.status === 401 || 
        error?.code === 401 ||
        error?.result?.error?.code === 401 ||
        (error?.message && error.message.includes('401'));

      if (is401) {
        handle401Error(error);
        throw new Error('Your Google Drive session has expired. Please sign in again.');
      }
      
      throw error;
    }
  };

  /**
   * List all Shared Drives accessible to the user
   */
  const listSharedDrives = async (): Promise<SharedDrive[]> => {
    ensureToken();

    return withAuthRetry(async () => {
      try {
        const response = await gapi.client.drive.drives.list({
          pageSize: 100,
          fields: 'drives(id, name)'
        });

        return response.result.drives || [];
      } catch (error: any) {
        console.error('[GoogleDrive] Error listing shared drives:', error);
        throw error;
      }
    });
  };

  /**
   * List files in a Google Drive folder (supports both My Drive and Shared Drives)
   * @param folderId - The folder ID to list files from
   * @param driveId - Optional: The Shared Drive ID if browsing a Shared Drive
   */
  const listFilesInFolder = async (folderId: string = 'root', driveId?: string): Promise<GoogleDriveFile[]> => {
    ensureToken();

    return withAuthRetry(async () => {
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
        throw error;
      }
    });
  };

  /**
   * Get folder metadata (supports both My Drive and Shared Drives)
   */
  const getFolderMetadata = async (folderId: string): Promise<GoogleDriveFile> => {
    ensureToken();

    return withAuthRetry(async () => {
      try {
        const response = await gapi.client.drive.files.get({
          fileId: folderId,
          fields: 'id, name, mimeType, modifiedTime',
          supportsAllDrives: true
        });

        return response.result;
      } catch (error: any) {
        console.error('[GoogleDrive] Error getting folder metadata:', error);
        throw error;
      }
    });
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
