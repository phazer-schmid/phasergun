<template>
  <div class="min-h-screen bg-gray-100 py-8">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <!-- Header -->
      <div class="mb-8">
        <h1 class="text-3xl font-bold text-gray-900 mb-2">FDA 510(k) Compliance Projects</h1>
        <p class="text-gray-600">Manage your medical device Design History File (DHF) analysis projects</p>
      </div>

      <!-- New Project Button -->
      <div class="mb-6">
        <button
          @click="createNewProject"
          class="inline-flex items-center px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium shadow-sm"
        >
          <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
          </svg>
          New Project
        </button>
      </div>

      <!-- Projects Grid -->
      <div v-if="projects.length > 0" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div
          v-for="project in projects"
          :key="project.id"
          @click="openProject(project.id)"
          class="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow cursor-pointer p-6 relative group"
        >
          <!-- Delete Button -->
          <button
            @click.stop="handleDeleteProject(project.id)"
            class="absolute top-4 right-4 p-2 text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
            title="Delete project"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
            </svg>
          </button>

          <!-- Project Info -->
          <div class="mb-4">
            <h3 class="text-xl font-semibold text-gray-900 mb-2 pr-8">{{ project.name }}</h3>
            <p v-if="project.description" class="text-gray-600 text-sm mb-3">{{ project.description }}</p>
            
            <!-- Source Info -->
            <div class="flex items-center text-sm text-gray-500 mb-2">
              <span class="mr-2">{{ getSourceIcon() }}</span>
              <span class="truncate">{{ project.folderPath }}</span>
            </div>

            <!-- Last Analysis -->
            <div v-if="project.lastAnalysis" class="mt-3 pt-3 border-t border-gray-200">
              <div class="flex items-center justify-between text-sm">
                <span class="text-gray-600">Last Analysis:</span>
                <span :class="getStatusColor(project.lastAnalysis.status)" class="font-medium capitalize">
                  {{ project.lastAnalysis.status }}
                </span>
              </div>
              <div class="text-xs text-gray-500 mt-1">
                {{ formatDate(project.lastAnalysis.timestamp) }}
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div class="text-xs text-gray-400 mt-4 pt-4 border-t border-gray-100">
            Created {{ formatDate(project.createdAt) }}
          </div>

        </div>
      </div>

      <!-- Empty State -->
      <div v-else class="bg-white rounded-lg shadow-md p-12 text-center">
        <svg class="w-24 h-24 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
        </svg>
        <h3 class="text-xl font-semibold text-gray-900 mb-2">No Projects Yet</h3>
        <p class="text-gray-600 mb-6">Create your first FDA 510(k) compliance analysis project</p>
        <button
          @click="createNewProject"
          class="inline-flex items-center px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium"
        >
          <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
          </svg>
          Create First Project
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useProjectService } from '../composables/useProjectService';
import { Project } from '../models/project.model';

const router = useRouter();
const projectService = useProjectService();
const projects = ref<Project[]>([]);

onMounted(() => {
  loadProjects();
});

const loadProjects = () => {
  projects.value = projectService.getAllProjects();
};

const createNewProject = () => {
  router.push('/projects/new');
};

const openProject = (projectId: string) => {
  router.push(`/projects/${projectId}`);
};

const handleDeleteProject = (projectId: string) => {
  if (confirm('Are you sure you want to delete this project?')) {
    projectService.deleteProject(projectId);
    loadProjects();
  }
};

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const hasTargetDates = (project: Project): boolean => {
  return !!(project.targetDates?.phase1 || project.targetDates?.phase2 || 
            project.targetDates?.phase3 || project.targetDates?.phase4);
};

const getSourceIcon = (): string => {
  return '💻'; // Local filesystem only
};

const getStatusColor = (status?: string): string => {
  switch (status) {
    case 'complete': return 'text-green-600';
    case 'error': return 'text-red-600';
    case 'processing': return 'text-blue-600';
    default: return 'text-gray-500';
  }
};
</script>
