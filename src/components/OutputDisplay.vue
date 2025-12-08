<template>
  <div v-if="output" class="bg-white rounded-lg shadow-md p-6">
    <div class="flex items-start space-x-3">
      <!-- Status Icon -->
      <div class="flex-shrink-0">
        <div
          v-if="output.status === 'processing'"
          class="w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"
        ></div>
        <svg
          v-else-if="output.status === 'complete'"
          class="w-6 h-6 text-green-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <svg
          v-else-if="output.status === 'error'"
          class="w-6 h-6 text-red-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </div>

      <!-- Content -->
      <div class="flex-1">
        <h3 class="text-lg font-semibold mb-2" :class="statusColorClass">
          {{ statusTitle }}
        </h3>
        
        <p class="text-gray-700 mb-3">
          {{ output.message }}
        </p>

        <!-- Detailed Report -->
        <div
          v-if="output.detailedReport"
          class="mt-4 p-4 bg-gray-50 rounded-md border border-gray-200"
        >
          <h4 class="text-sm font-semibold text-gray-700 mb-2">
            Detailed Report
          </h4>
          <p class="text-sm text-gray-600 whitespace-pre-wrap">
            {{ output.detailedReport }}
          </p>
        </div>

        <!-- Timestamp -->
        <p v-if="output.timestamp" class="text-xs text-gray-500 mt-3">
          {{ formatTimestamp(output.timestamp) }}
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { AppStatusOutput } from '@fda-compliance/shared-types';

const props = defineProps<{
  output: AppStatusOutput | null;
}>();

const statusTitle = computed(() => {
  switch (props.output?.status) {
    case 'processing':
      return 'Processing...';
    case 'complete':
      return 'Analysis Complete';
    case 'error':
      return 'Error';
    default:
      return 'Unknown Status';
  }
});

const statusColorClass = computed(() => {
  switch (props.output?.status) {
    case 'processing':
      return 'text-blue-700';
    case 'complete':
      return 'text-green-700';
    case 'error':
      return 'text-red-700';
    default:
      return 'text-gray-700';
  }
});

const formatTimestamp = (timestamp: string): string => {
  const date = new Date(timestamp);
  return date.toLocaleString();
};
</script>
