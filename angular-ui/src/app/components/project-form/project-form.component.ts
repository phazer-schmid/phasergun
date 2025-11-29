import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ProjectService } from '../../services/project.service';
import { SourceFolderInput } from '@fda-compliance/shared-types';
import { GoogleDrivePickerComponent } from '../google-drive-picker/google-drive-picker.component';

@Component({
  selector: 'app-project-form',
  templateUrl: './project-form.component.html',
  styleUrls: ['./project-form.component.css'],
  imports: [CommonModule, FormsModule, GoogleDrivePickerComponent],
  standalone: true
})
export class ProjectFormComponent {
  projectName: string = '';
  projectDescription: string = '';
  folderPath: string = '';
  selectedSource: 'local' | 'google-drive' = 'local';
  showGoogleDrivePicker = false;
  googleDriveAccessToken: string = '';
  phase1Date: string = '';
  phase2Date: string = '';
  phase3Date: string = '';
  phase4Date: string = '';
  
  fileSources = [
    { value: 'local', label: 'Local Filesystem', icon: '💻' },
    { value: 'google-drive', label: 'Google Drive', icon: '📁' }
  ];

  constructor(
    private projectService: ProjectService,
    private router: Router
  ) {
    // Prefill the local path on component initialization
    this.prefillLocalPath();
  }

  private prefillLocalPath(): void {
    // Get user's home directory from the browser's current user
    // For macOS, construct the Google Drive path
    const homeDir = this.getHomeDirectory();
    if (homeDir && this.selectedSource === 'local') {
      this.folderPath = `${homeDir}/Library/CloudStorage/GoogleDrive-[YOUR EMAIL]@pulsebridgemt.com/Shared drives/PulseBridge Shared/eLum PDP Files/PGPShuteDHF`;
    }
  }

  private getHomeDirectory(): string {
    // Try to determine home directory from current path or use a placeholder
    // In a browser environment, we'll use a placeholder that the user can update
    try {
      // Check if we can detect the username from common macOS paths
      const userMatch = window.location.pathname.match(/\/Users\/([^\/]+)/);
      if (userMatch && userMatch[1]) {
        return `/Users/${userMatch[1]}`;
      }
    } catch (e) {
      // Fallback to placeholder
    }
    return '/Users/[YOUR HOME FOLDER]';
  }

  onSourceChange(): void {
    if (this.selectedSource === 'local') {
      // Prefill local path when switching to local filesystem
      this.prefillLocalPath();
    } else {
      // Clear path when switching to Google Drive
      this.folderPath = '';
    }
  }

  openGoogleDrivePicker(): void {
    this.showGoogleDrivePicker = true;
  }

  onGoogleDriveFolderSelected(data: { folderId: string; folderName: string; accessToken: string }): void {
    this.folderPath = data.folderId;
    this.googleDriveAccessToken = data.accessToken;
    this.showGoogleDrivePicker = false;
  }

  onGoogleDrivePickerCancelled(): void {
    this.showGoogleDrivePicker = false;
  }

  createProject(): void {
    if (!this.projectName.trim() || !this.folderPath.trim()) {
      return;
    }

    const newProject = this.projectService.createProject({
      name: this.projectName.trim(),
      description: this.projectDescription.trim() || undefined,
      folderPath: this.folderPath.trim(),
      sourceType: this.selectedSource,
      credentials: this.selectedSource === 'google-drive' && this.googleDriveAccessToken
        ? { accessToken: this.googleDriveAccessToken }
        : undefined,
      targetDates: {
        phase1: this.phase1Date || undefined,
        phase2: this.phase2Date || undefined,
        phase3: this.phase3Date || undefined,
        phase4: this.phase4Date || undefined
      }
    });

    this.router.navigate(['/projects', newProject.id]);
  }

  cancel(): void {
    this.router.navigate(['/']);
  }
}
