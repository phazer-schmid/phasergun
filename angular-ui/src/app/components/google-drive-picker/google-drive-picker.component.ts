import { Component, EventEmitter, Input, Output, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GoogleDriveService, GoogleDriveFile } from '../../services/google-drive.service';

@Component({
  selector: 'app-google-drive-picker',
  templateUrl: './google-drive-picker.component.html',
  styleUrls: ['./google-drive-picker.component.css'],
  imports: [CommonModule],
  standalone: true
})
export class GoogleDrivePickerComponent implements OnInit {
  @Input() isProcessing: boolean = false;
  @Output() folderSelected = new EventEmitter<{ folderId: string; folderName: string; accessToken: string }>();
  @Output() cancelled = new EventEmitter<void>();

  isSignedIn = false;
  userEmail: string | null = null;
  currentFolderId = 'root';
  currentFolderName = 'My Drive';
  breadcrumbs: { id: string; name: string }[] = [];
  files: GoogleDriveFile[] = [];
  isLoading = false;
  error: string | null = null;

  constructor(private googleDrive: GoogleDriveService) {}

  async ngOnInit() {
    try {
      this.isLoading = true;
      
      // Add 10 second timeout
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Google Drive initialization timed out after 10 seconds')), 10000)
      );
      
      await Promise.race([
        this.googleDrive.initializeGapi(),
        timeoutPromise
      ]);
      
      this.isSignedIn = this.googleDrive.getIsSignedIn();
      
      if (this.isSignedIn) {
        this.userEmail = this.googleDrive.getUserEmail();
        await this.loadFolder('root');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (errorMessage.includes('credentials not configured')) {
        this.error = 'Google API credentials not configured. Please follow the setup instructions in GOOGLE_DRIVE_SETUP.md to get your Client ID and API Key.';
      } else if (errorMessage.includes('timed out')) {
        this.error = 'Google Drive took too long to load. Check browser console (F12) for details. Make sure you have the correct API Key (should start with AIzaSy..., not GOCSPX-).';
      } else {
        this.error = 'Failed to initialize Google Drive: ' + errorMessage;
      }
      console.error('Google Drive initialization error:', error);
    } finally {
      this.isLoading = false;
    }
  }

  async handleSignIn() {
    try {
      this.isLoading = true;
      this.error = null;
      await this.googleDrive.signIn();
      this.isSignedIn = true;
      this.userEmail = this.googleDrive.getUserEmail();
      await this.loadFolder('root');
    } catch (error) {
      this.error = 'Failed to sign in to Google Drive. Please try again.';
      console.error(error);
    } finally {
      this.isLoading = false;
    }
  }

  async handleSignOut() {
    try {
      await this.googleDrive.signOut();
      this.isSignedIn = false;
      this.userEmail = null;
      this.files = [];
      this.breadcrumbs = [];
    } catch (error) {
      console.error('Sign out error:', error);
    }
  }

  async loadFolder(folderId: string, folderName?: string) {
    try {
      this.isLoading = true;
      this.error = null;
      this.currentFolderId = folderId;
      
      if (folderName) {
        this.currentFolderName = folderName;
      } else if (folderId === 'root') {
        this.currentFolderName = 'My Drive';
      }

      this.files = await this.googleDrive.listFilesInFolder(folderId);
    } catch (error) {
      this.error = 'Failed to load folder contents.';
      console.error(error);
    } finally {
      this.isLoading = false;
    }
  }

  async openFolder(folder: GoogleDriveFile) {
    this.breadcrumbs.push({
      id: this.currentFolderId,
      name: this.currentFolderName
    });
    await this.loadFolder(folder.id, folder.name);
  }

  async navigateToBreadcrumb(index: number) {
    if (index === -1) {
      // Navigate to root
      this.breadcrumbs = [];
      await this.loadFolder('root');
    } else {
      const target = this.breadcrumbs[index];
      this.breadcrumbs = this.breadcrumbs.slice(0, index);
      await this.loadFolder(target.id, target.name);
    }
  }

  selectCurrentFolder() {
    const accessToken = this.googleDrive.getAccessToken();
    if (accessToken) {
      this.folderSelected.emit({
        folderId: this.currentFolderId,
        folderName: this.currentFolderName,
        accessToken: accessToken
      });
    }
  }

  cancel() {
    this.cancelled.emit();
  }

  getFolders(): GoogleDriveFile[] {
    return this.files.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
  }

  getFiles(): GoogleDriveFile[] {
    return this.files.filter(f => f.mimeType !== 'application/vnd.google-apps.folder');
  }

  formatFileSize(bytes: string | undefined): string {
    if (!bytes) return '-';
    const size = parseInt(bytes);
    if (size < 1024) return size + ' B';
    if (size < 1024 * 1024) return (size / 1024).toFixed(1) + ' KB';
    if (size < 1024 * 1024 * 1024) return (size / (1024 * 1024)).toFixed(1) + ' MB';
    return (size / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
}
