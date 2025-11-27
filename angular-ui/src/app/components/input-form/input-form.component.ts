import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-input-form',
  templateUrl: './input-form.component.html',
  styleUrls: ['./input-form.component.css'],
  imports: [FormsModule, CommonModule],
  standalone: true
})
export class InputFormComponent {
  @Input() isProcessing: boolean = false;
  @Output() submit = new EventEmitter<string>();

  folderPath: string = '';

  handleSubmit(): void {
    if (this.folderPath.trim() && !this.isProcessing) {
      this.submit.emit(this.folderPath.trim());
    }
  }
}
