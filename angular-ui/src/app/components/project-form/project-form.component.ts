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
  ) {}

  onSourceChange(): void {
    this.folderPath = '';
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
