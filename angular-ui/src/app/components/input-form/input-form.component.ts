import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { SourceFolderInput } from '@fda-compliance/shared-types';
import { GoogleDrivePickerComponent } from '../google-drive-picker/google-drive-picker.component';

@Component({
  selector: 'app-input-form',
  templateUrl: './input-form.component.html',
  styleUrls: ['./input-form.component.css'],
  imports: [FormsModule, CommonModule, GoogleDrivePickerComponent],
  standalone: true
})
export class InputFormComponent {
  @Input() isProcessing: boolean = false;
  @Output() submit = new EventEmitter<SourceFolderInput>();

  folderPath: string = '';
  selectedSource: 'local' | 'google-drive' = 'local';
  showGoogleDrivePicker = false;
  googleDriveAccessToken: string = '';
  
  fileSources = [
    { value: 'local', label: 'Local Filesystem', icon: '💻' },
    { value: 'google-drive', label: 'Google Drive', icon: '📁' }
  ];

  onSourceChange(): void {
    // Clear folder path when switching sources
    this.folderPath = '';
  }

  openGoogleDrivePicker(): void {
    this.showGoogleDrivePicker = true;
  }

  onGoogleDriveFolderSelected(data: { folderId: string; folderName: string; accessToken: string }): void {
    this.folderPath = data.folderId;
    this.googleDriveAccessToken = data.accessToken;
    this.showGoogleDrivePicker = false;
    
    // Auto-submit after folder selection
    this.handleSubmit();
  }

  onGoogleDrivePickerCancelled(): void {
    this.showGoogleDrivePicker = false;
  }

  handleSubmit(): void {
    if (this.folderPath.trim() && !this.isProcessing) {
      const input: SourceFolderInput = {
        folderPath: this.folderPath.trim(),
        sourceType: this.selectedSource
      };

      // Add access token for Google Drive
      if (this.selectedSource === 'google-drive' && this.googleDriveAccessToken) {
        input.credentials = {
          accessToken: this.googleDriveAccessToken
        };
      }

      this.submit.emit(input);
    }
  }
}
