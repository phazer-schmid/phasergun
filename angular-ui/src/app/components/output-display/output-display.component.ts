import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AppStatusOutput } from '@fda-compliance/shared-types';

@Component({
  selector: 'app-output-display',
  templateUrl: './output-display.component.html',
  styleUrls: ['./output-display.component.css'],
  imports: [CommonModule],
  standalone: true
})
export class OutputDisplayComponent {
  @Input() output: AppStatusOutput | null = null;

  get statusTitle(): string {
    switch (this.output?.status) {
      case 'processing':
        return 'Processing...';
      case 'complete':
        return 'Analysis Complete';
      case 'error':
        return 'Error';
      default:
        return 'Unknown Status';
    }
  }

  get statusColorClass(): string {
    switch (this.output?.status) {
      case 'processing':
        return 'text-blue-700';
      case 'complete':
        return 'text-green-700';
      case 'error':
        return 'text-red-700';
      default:
        return 'text-gray-700';
    }
  }

  formatTimestamp(timestamp: string): string {
    const date = new Date(timestamp);
    return date.toLocaleString();
  }
}
