import { Project, DateHistoryEntry } from '../models/project.model';

const STORAGE_KEY = 'fda_compliance_projects';

export function useProjectService() {
  /**
   * Get all projects
   */
  const getAllProjects = (): Project[] => {
    const projectsJson = localStorage.getItem(STORAGE_KEY);
    if (!projectsJson) {
      return [];
    }
    try {
      return JSON.parse(projectsJson);
    } catch (error) {
      console.error('Error parsing projects from localStorage:', error);
      return [];
    }
  };

  /**
   * Get a single project by ID
   */
  const getProject = (id: string): Project | null => {
    const projects = getAllProjects();
    return projects.find(p => p.id === id) || null;
  };

  /**
   * Create a new project
   */
  const createProject = (project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Project => {
    const newProject: Project = {
      ...project,
      id: generateId(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const projects = getAllProjects();
    projects.push(newProject);
    saveProjects(projects);

    return newProject;
  };

  /**
   * Update an existing project
   */
  const updateProject = (id: string, updates: Partial<Project>): Project | null => {
    const projects = getAllProjects();
    const index = projects.findIndex(p => p.id === id);

    if (index === -1) {
      return null;
    }

    const existingProject = projects[index];

    // Track date changes in history
    if (updates.targetDates) {
      const dateChanged = hasDateChanged(existingProject.targetDates, updates.targetDates);
      
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

    saveProjects(projects);
    return projects[index];
  };

  /**
   * Check if target dates have changed
   */
  const hasDateChanged = (
    oldDates: Project['targetDates'], 
    newDates: Project['targetDates']
  ): boolean => {
    if (!oldDates && !newDates) return false;
    if (!oldDates || !newDates) return true;

    return oldDates.phase1 !== newDates.phase1 ||
           oldDates.phase2 !== newDates.phase2 ||
           oldDates.phase3 !== newDates.phase3 ||
           oldDates.phase4 !== newDates.phase4;
  };

  /**
   * Delete a project
   */
  const deleteProject = (id: string): boolean => {
    const projects = getAllProjects();
    const filteredProjects = projects.filter(p => p.id !== id);

    if (filteredProjects.length === projects.length) {
      return false; // Project not found
    }

    saveProjects(filteredProjects);
    return true;
  };

  /**
   * Save analysis results to a project
   */
  const saveAnalysisResult = (projectId: string, status: 'complete' | 'error' | 'processing', report?: string): void => {
    updateProject(projectId, {
      lastAnalysis: {
        timestamp: new Date().toISOString(),
        status,
        report
      }
    });
  };

  /**
   * Private helper to save projects to localStorage
   */
  const saveProjects = (projects: Project[]): void => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
    } catch (error) {
      console.error('Error saving projects to localStorage:', error);
    }
  };

  /**
   * Generate a unique ID for a project
   */
  const generateId = (): string => {
    return `project_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  };

  return {
    getAllProjects,
    getProject,
    createProject,
    updateProject,
    deleteProject,
    saveAnalysisResult
  };
}
