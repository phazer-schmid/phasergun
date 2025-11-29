import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ProjectService } from '../../services/project.service';
import { Project } from '../../models/project.model';
import { AppContainerComponent } from '../app-container/app-container.component';

@Component({
  selector: 'app-project-detail',
  templateUrl: './project-detail.component.html',
  styleUrls: ['./project-detail.component.css'],
  imports: [CommonModule, AppContainerComponent],
  standalone: true
})
export class ProjectDetailComponent implements OnInit {
  project: Project | null = null;
  notFound = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private projectService: ProjectService
  ) {}

  ngOnInit(): void {
    const projectId = this.route.snapshot.paramMap.get('id');
    if (projectId) {
      this.project = this.projectService.getProject(projectId);
      if (!this.project) {
        this.notFound = true;
      }
    } else {
      this.notFound = true;
    }
  }

  backToProjects(): void {
    this.router.navigate(['/']);
  }

  editProject(): void {
    if (this.project) {
      this.router.navigate(['/projects', this.project.id, 'edit']);
    }
  }

  onAnalysisComplete(result: any): void {
    if (this.project) {
      this.projectService.saveAnalysisResult(
        this.project.id,
        result.status,
        result.detailedReport
      );
      // Reload project to get updated data
      this.project = this.projectService.getProject(this.project.id);
    }
  }
}
