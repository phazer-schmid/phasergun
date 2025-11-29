import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ProjectService } from '../../services/project.service';
import { Project } from '../../models/project.model';

@Component({
  selector: 'app-project-list',
  templateUrl: './project-list.component.html',
  styleUrls: ['./project-list.component.css'],
  imports: [CommonModule],
  standalone: true
})
export class ProjectListComponent implements OnInit {
  projects: Project[] = [];

  constructor(
    private projectService: ProjectService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadProjects();
  }

  loadProjects(): void {
    this.projects = this.projectService.getAllProjects();
  }

  createNewProject(): void {
    this.router.navigate(['/projects/new']);
  }

  openProject(projectId: string): void {
    this.router.navigate(['/projects', projectId]);
  }

  deleteProject(event: Event, projectId: string): void {
    event.stopPropagation();
    
    if (confirm('Are you sure you want to delete this project?')) {
      this.projectService.deleteProject(projectId);
      this.loadProjects();
    }
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  hasTargetDates(project: Project): boolean {
    return !!(project.targetDates?.phase1 || project.targetDates?.phase2 || 
              project.targetDates?.phase3 || project.targetDates?.phase4);
  }

  getSourceIcon(sourceType: string): string {
    return sourceType === 'google-drive' ? '📁' : '💻';
  }

  getStatusColor(status?: string): string {
    switch (status) {
      case 'complete': return 'text-green-600';
      case 'error': return 'text-red-600';
      case 'processing': return 'text-blue-600';
      default: return 'text-gray-500';
    }
  }
}
