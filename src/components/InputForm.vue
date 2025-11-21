<template>
  <div class="bg-white rounded-lg shadow-md p-6">
    <h2 class="text-xl font-semibold text-gray-800 mb-4">
      Source Folder Analysis
    </h2>
    
    <form @submit.prevent="handleSubmit" class="space-y-4">
      <div>
        <label 
          for="folderPath" 
          class="block text-sm font-medium text-gray-700 mb-2"
        >
          Folder Path
        </label>
        <input
          id="folderPath"
          v-model="folderPath"
          type="text"
          placeholder="/path/to/dhf/documents"
          class="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          :disabled="isProcessing"
          required
        />
        <p class="mt-1 text-sm text-gray-500">
          Enter the path to the folder containing documents to analyze
        </p>
      </div>

      <button
        type="submit"
        :disabled="isProcessing || !folderPath.trim()"
        class="w-full py-3 px-6 rounded-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        :class="
          isProcessing || !folderPath.trim()
            ? 'bg-gray-300 text-gray-500'
            : 'bg-blue-600 text-white hover:bg-blue-700'
        "
      >
        {{ isProcessing ? 'Analyzing...' : 'Analyze Folder' }}
      </button>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const emit = defineEmits<{
  submit: [folderPath: string]
}>();

const props = defineProps<{
  isProcessing: boolean;
}>();

const folderPath = ref('');

const handleSubmit = () => {
  if (folderPath.value.trim() && !props.isProcessing) {
    emit('submit', folderPath.value.trim());
  }
};
</script>
