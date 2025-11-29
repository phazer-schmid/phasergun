import { Injectable } from '@angular/core';
import { Project } from '../models/project.model';

@Injectable({
  providedIn: 'root'
})
export class ProjectService {
  private readonly STORAGE_KEY = 'fda_compliance_projects';

  constructor() {}

  /**
   * Get all projects
   */
  getAllProjects(): Project[] {
    const projectsJson = localStorage.getItem(this.STORAGE_KEY);
    if (!projectsJson) {
      return [];
    }
    try {
      return JSON.parse(projectsJson);
    } catch (error) {
      console.error('Error parsing projects from localStorage:', error);
      return [];
    }
  }

  /**
   * Get a single project by ID
   */
  getProject(id: string): Project | null {
    const projects = this.getAllProjects();
    return projects.find(p => p.id === id) || null;
  }

  /**
   * Create a new project
   */
  createProject(project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Project {
    const newProject: Project = {
      ...project,
      id: this.generateId(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const projects = this.getAllProjects();
    projects.push(newProject);
    this.saveProjects(projects);

    return newProject;
  }

  /**
   * Update an existing project
   */
  updateProject(id: string, updates: Partial<Project>): Project | null {
    const projects = this.getAllProjects();
    const index = projects.findIndex(p => p.id === id);

    if (index === -1) {
      return null;
    }

    projects[index] = {
      ...projects[index],
      ...updates,
      id, // Ensure ID doesn't change
      updatedAt: new Date().toISOString()
    };

    this.saveProjects(projects);
    return projects[index];
  }

  /**
   * Delete a project
   */
  deleteProject(id: string): boolean {
    const projects = this.getAllProjects();
    const filteredProjects = projects.filter(p => p.id !== id);

    if (filteredProjects.length === projects.length) {
      return false; // Project not found
    }

    this.saveProjects(filteredProjects);
    return true;
  }

  /**
   * Save analysis results to a project
   */
  saveAnalysisResult(projectId: string, status: 'complete' | 'error' | 'processing', report?: string): void {
    this.updateProject(projectId, {
      lastAnalysis: {
        timestamp: new Date().toISOString(),
        status,
        report
      }
    });
  }

  /**
   * Private helper to save projects to localStorage
   */
  private saveProjects(projects: Project[]): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(projects));
    } catch (error) {
      console.error('Error saving projects to localStorage:', error);
    }
  }

  /**
   * Generate a unique ID for a project
   */
  private generateId(): string {
    return `project_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
