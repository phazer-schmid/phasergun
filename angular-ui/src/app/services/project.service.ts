import { Injectable } from '@angular/core';
import { Project, DateHistoryEntry } from '../models/project.model';

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

    const existingProject = projects[index];

    // Track date changes in history
    if (updates.targetDates) {
      const dateChanged = this.hasDateChanged(existingProject.targetDates, updates.targetDates);
      
      if (dateChanged && existingProject.targetDates) {
        const historyEntry: DateHistoryEntry = {
          changedAt: new Date().toISOString(),
          previousDates: {
            phase1: existingProject.targetDates.phase1,
            phase2: existingProject.targetDates.phase2,
            phase3: existingProject.targetDates.phase3,
            phase4: existingProject.targetDates.phase4
          },
          newDates: {
            phase1: updates.targetDates.phase1,
            phase2: updates.targetDates.phase2,
            phase3: updates.targetDates.phase3,
            phase4: updates.targetDates.phase4
          }
        };

        const dateHistory = existingProject.dateHistory || [];
        updates = {
          ...updates,
          dateHistory: [...dateHistory, historyEntry]
        };
      }
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
   * Check if target dates have changed
   */
  private hasDateChanged(
    oldDates: Project['targetDates'], 
    newDates: Project['targetDates']
  ): boolean {
    if (!oldDates && !newDates) return false;
    if (!oldDates || !newDates) return true;

    return oldDates.phase1 !== newDates.phase1 ||
           oldDates.phase2 !== newDates.phase2 ||
           oldDates.phase3 !== newDates.phase3 ||
           oldDates.phase4 !== newDates.phase4;
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
