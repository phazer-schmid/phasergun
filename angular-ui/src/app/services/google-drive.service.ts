import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

declare const gapi: any;

export interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime: string;
  webViewLink?: string;
}

@Injectable({
  providedIn: 'root'
})
export class GoogleDriveService {
  private CLIENT_ID = environment.googleDrive.clientId;
  private API_KEY = environment.googleDrive.apiKey;
  private DISCOVERY_DOCS = ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'];
  private SCOPES = environment.googleDrive.scopes;
  
  private gapiInitialized = false;
  private isSignedIn = false;

  constructor() {}

  /**
   * Initialize the Google API client
   */
  async initializeGapi(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.gapiInitialized) {
        resolve();
        return;
      }

      console.log('[GoogleDrive] Starting initialization...');
      console.log('[GoogleDrive] Client ID:', this.CLIENT_ID);
      console.log('[GoogleDrive] API Key length:', this.API_KEY.length);

      // Check if credentials are configured
      if (this.CLIENT_ID.includes('YOUR_') || this.API_KEY.includes('YOUR_')) {
        console.error('[GoogleDrive] Credentials not configured');
        reject(new Error('Google API credentials not configured. Please see GOOGLE_DRIVE_SETUP.md'));
        return;
      }

      // Load the GAPI script
      console.log('[GoogleDrive] Loading Google API script...');
      const script = document.createElement('script');
      script.src = 'https://apis.google.com/js/api.js';
      script.onload = () => {
        console.log('[GoogleDrive] Script loaded, loading client:auth2...');
        gapi.load('client:auth2', async () => {
          console.log('[GoogleDrive] Initializing client...');
          try {
            await gapi.client.init({
              apiKey: this.API_KEY,
              clientId: this.CLIENT_ID,
              discoveryDocs: this.DISCOVERY_DOCS,
              scope: this.SCOPES
            });

            console.log('[GoogleDrive] Client initialized successfully');

            // Listen for sign-in state changes
            gapi.auth2.getAuthInstance().isSignedIn.listen((signedIn: boolean) => {
              this.isSignedIn = signedIn;
            });

            this.isSignedIn = gapi.auth2.getAuthInstance().isSignedIn.get();
            this.gapiInitialized = true;
            console.log('[GoogleDrive] Initialization complete, signed in:', this.isSignedIn);
            resolve();
          } catch (error) {
            console.error('[GoogleDrive] Error initializing GAPI:', error);
            reject(error);
          }
        });
      };
      script.onerror = () => {
        console.error('[GoogleDrive] Failed to load Google API script');
        reject(new Error('Failed to load Google API script'));
      };
      document.body.appendChild(script);
    });
  }

  /**
   * Sign in to Google Drive
   */
  async signIn(): Promise<void> {
    if (!this.gapiInitialized) {
      await this.initializeGapi();
    }

    if (this.isSignedIn) {
      return;
    }

    try {
      await gapi.auth2.getAuthInstance().signIn();
      this.isSignedIn = true;
    } catch (error) {
      console.error('Error signing in:', error);
      throw new Error('Failed to sign in to Google Drive');
    }
  }

  /**
   * Sign out from Google Drive
   */
  async signOut(): Promise<void> {
    if (!this.gapiInitialized || !this.isSignedIn) {
      return;
    }

    try {
      await gapi.auth2.getAuthInstance().signOut();
      this.isSignedIn = false;
    } catch (error) {
      console.error('Error signing out:', error);
    }
  }

  /**
   * Check if user is signed in
   */
  getIsSignedIn(): boolean {
    return this.isSignedIn;
  }

  /**
   * Get user's email
   */
  getUserEmail(): string | null {
    if (!this.isSignedIn || !this.gapiInitialized) {
      return null;
    }

    const profile = gapi.auth2.getAuthInstance().currentUser.get().getBasicProfile();
    return profile ? profile.getEmail() : null;
  }

  /**
   * List files in a folder
   */
  async listFilesInFolder(folderId: string = 'root'): Promise<GoogleDriveFile[]> {
    if (!this.isSignedIn) {
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
    } catch (error) {
      console.error('Error listing files:', error);
      throw new Error('Failed to list files from Google Drive');
    }
  }

  /**
   * Get folder metadata
   */
  async getFolderMetadata(folderId: string): Promise<GoogleDriveFile> {
    if (!this.isSignedIn) {
      throw new Error('Not signed in to Google Drive');
    }

    try {
      const response = await gapi.client.drive.files.get({
        fileId: folderId,
        fields: 'id, name, mimeType, modifiedTime'
      });

      return response.result;
    } catch (error) {
      console.error('Error getting folder metadata:', error);
      throw new Error('Failed to get folder information');
    }
  }

  /**
   * Download file content
   */
  async downloadFile(fileId: string): Promise<string> {
    if (!this.isSignedIn) {
      throw new Error('Not signed in to Google Drive');
    }

    try {
      const response = await gapi.client.drive.files.get({
        fileId: fileId,
        alt: 'media'
      });

      return response.body;
    } catch (error) {
      console.error('Error downloading file:', error);
      throw new Error('Failed to download file from Google Drive');
    }
  }

  /**
   * Search for folders
   */
  async searchFolders(query: string): Promise<GoogleDriveFile[]> {
    if (!this.isSignedIn) {
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
    } catch (error) {
      console.error('Error searching folders:', error);
      throw new Error('Failed to search folders');
    }
  }

  /**
   * Get access token for API calls from backend
   */
  getAccessToken(): string | null {
    if (!this.isSignedIn || !this.gapiInitialized) {
      return null;
    }

    const authInstance = gapi.auth2.getAuthInstance();
    const currentUser = authInstance.currentUser.get();
    const authResponse = currentUser.getAuthResponse();
    
    return authResponse ? authResponse.access_token : null;
  }
}
