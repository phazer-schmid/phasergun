import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ProjectService } from '../../services/project.service';
import { Project } from '../../models/project.model';
import { GoogleDrivePickerComponent } from '../google-drive-picker/google-drive-picker.component';

@Component({
  selector: 'app-project-edit',
  templateUrl: './project-edit.component.html',
  styleUrls: ['./project-edit.component.css'],
  imports: [CommonModule, FormsModule, GoogleDrivePickerComponent],
  standalone: true
})
export class ProjectEditComponent implements OnInit {
  project: Project | null = null;
  projectName: string = '';
  projectDescription: string = '';
  folderPath: string = '';
  selectedSource: 'local' | 'google-drive' = 'local';
  showGoogleDrivePicker = false;
  googleDriveAccessToken: string = '';
  notFound = false;
  phase1Date: string = '';
  phase2Date: string = '';
  phase3Date: string = '';
  phase4Date: string = '';
  
  fileSources = [
    { value: 'local', label: 'Local Filesystem', icon: '💻' },
    { value: 'google-drive', label: 'Google Drive', icon: '📁' }
  ];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private projectService: ProjectService
  ) {}

  ngOnInit(): void {
    const projectId = this.route.snapshot.paramMap.get('id');
    if (projectId) {
      this.project = this.projectService.getProject(projectId);
      if (this.project) {
        this.projectName = this.project.name;
        this.projectDescription = this.project.description || '';
        this.folderPath = this.project.folderPath;
        this.selectedSource = this.project.sourceType;
        this.googleDriveAccessToken = this.project.credentials?.accessToken || '';
        this.phase1Date = this.project.targetDates?.phase1 || '';
        this.phase2Date = this.project.targetDates?.phase2 || '';
        this.phase3Date = this.project.targetDates?.phase3 || '';
        this.phase4Date = this.project.targetDates?.phase4 || '';
      } else {
        this.notFound = true;
      }
    } else {
      this.notFound = true;
    }
  }

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

  saveProject(): void {
    if (!this.project || !this.projectName.trim() || !this.folderPath.trim()) {
      return;
    }

    this.projectService.updateProject(this.project.id, {
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

    this.router.navigate(['/projects', this.project.id]);
  }

  cancel(): void {
    if (this.project) {
      this.router.navigate(['/projects', this.project.id]);
    } else {
      this.router.navigate(['/']);
    }
  }
}
