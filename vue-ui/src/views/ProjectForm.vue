<template>
  <div class="min-h-screen bg-gray-100 py-8">
    <div class="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
      <!-- Header -->
      <div class="mb-8">
        <button
          @click="goBack"
          class="inline-flex items-center text-blue-600 hover:text-blue-700 mb-4"
        >
          <svg class="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
          </svg>
          Back to Projects
        </button>
        <h1 class="text-3xl font-bold text-gray-900">Create New Project</h1>
      </div>

      <!-- Form -->
      <div class="bg-white rounded-lg shadow-md p-6">
        <form @submit.prevent="handleSubmit">
          <!-- Project Name -->
          <div class="mb-6">
            <label for="name" class="block text-sm font-medium text-gray-700 mb-2">
              Project Name <span class="text-red-500">*</span>
            </label>
            <input
              id="name"
              v-model="formData.name"
              type="text"
              required
              class="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              placeholder="Enter project name"
            />
          </div>

          <!-- Description -->
          <div class="mb-6">
            <label for="description" class="block text-sm font-medium text-gray-700 mb-2">
              Description
            </label>
            <textarea
              id="description"
              v-model="formData.description"
              rows="3"
              class="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              placeholder="Enter project description (optional)"
            ></textarea>
          </div>

          <!-- Source Type -->
          <div class="mb-6">
            <label class="block text-sm font-medium text-gray-700 mb-2">
              Source Type <span class="text-red-500">*</span>
            </label>
            <div class="space-y-2">
              <label class="flex items-center">
                <input
                  v-model="formData.sourceType"
                  type="radio"
                  value="local"
                  class="mr-2"
                />
                <span>Local Folder</span>
              </label>
              <label class="flex items-center">
                <input
                  v-model="formData.sourceType"
                  type="radio"
                  value="google-drive"
                  class="mr-2"
                />
                <span>Google Drive</span>
              </label>
            </div>
          </div>

          <!-- Folder Path -->
          <div class="mb-6">
            <label for="folderPath" class="block text-sm font-medium text-gray-700 mb-2">
              Folder Path <span class="text-red-500">*</span>
            </label>
            <input
              id="folderPath"
              v-model="formData.folderPath"
              type="text"
              required
              class="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              :placeholder="formData.sourceType === 'local' ? '/path/to/dhf/folder' : 'Google Drive folder ID or path'"
            />
            <p class="mt-1 text-sm text-gray-500">
              {{ formData.sourceType === 'local' ? 'Enter the absolute path to your DHF folder' : 'Enter your Google Drive folder ID' }}
            </p>
          </div>

          <!-- Target Dates -->
          <div class="mb-6">
            <label class="block text-sm font-medium text-gray-700 mb-2">
              Target Dates (Optional)
            </label>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label for="phase1" class="block text-xs text-gray-600 mb-1">Phase 1</label>
                <input
                  id="phase1"
                  v-model="formData.targetDates.phase1"
                  type="date"
                  class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label for="phase2" class="block text-xs text-gray-600 mb-1">Phase 2</label>
                <input
                  id="phase2"
                  v-model="formData.targetDates.phase2"
                  type="date"
                  class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label for="phase3" class="block text-xs text-gray-600 mb-1">Phase 3</label>
                <input
                  id="phase3"
                  v-model="formData.targetDates.phase3"
                  type="date"
                  class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label for="phase4" class="block text-xs text-gray-600 mb-1">Phase 4</label>
                <input
                  id="phase4"
                  v-model="formData.targetDates.phase4"
                  type="date"
                  class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          <!-- Action Buttons -->
          <div class="flex justify-end space-x-4">
            <button
              type="button"
              @click="goBack"
              class="px-6 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              class="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              Create Project
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useProjectService } from '../composables/useProjectService';

const router = useRouter();
const projectService = useProjectService();

const formData = ref({
  name: '',
  description: '',
  sourceType: 'local' as 'local' | 'google-drive',
  folderPath: '',
  targetDates: {
    phase1: '',
    phase2: '',
    phase3: '',
    phase4: ''
  }
});

const handleSubmit = () => {
  const project = projectService.createProject({
    name: formData.value.name,
    description: formData.value.description,
    sourceType: formData.value.sourceType,
    folderPath: formData.value.folderPath,
    targetDates: {
      phase1: formData.value.targetDates.phase1 || undefined,
      phase2: formData.value.targetDates.phase2 || undefined,
      phase3: formData.value.targetDates.phase3 || undefined,
      phase4: formData.value.targetDates.phase4 || undefined
    }
  });

  router.push(`/projects/${project.id}`);
};

const goBack = () => {
  router.push('/');
};
</script>
