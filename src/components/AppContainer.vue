<template>
  <div class="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8 px-4">
    <div class="max-w-4xl mx-auto">
      <!-- Header -->
      <header class="mb-8 text-center">
        <h1 class="text-4xl font-bold text-gray-900 mb-2">
          FDA 510(k) Compliance Analyzer
        </h1>
        <p class="text-gray-600">
          AI-Powered Regulatory Document Analysis
        </p>
        <div class="mt-2 inline-block px-3 py-1 bg-yellow-100 text-yellow-800 text-xs font-medium rounded-full">
          POC - Mock Services Active
        </div>
      </header>

      <!-- Main Content -->
      <div class="space-y-6">
        <!-- Input Section -->
        <InputForm 
          :is-processing="isProcessing" 
          @submit="handleAnalysis" 
        />

        <!-- Output Section -->
        <OutputDisplay :output="analysisOutput" />

        <!-- Architecture Info -->
        <div class="bg-white rounded-lg shadow-md p-6 mt-8">
          <h3 class="text-lg font-semibold text-gray-800 mb-3">
            System Architecture
          </h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div class="flex items-center space-x-2">
              <span class="w-3 h-3 bg-green-500 rounded-full"></span>
              <span class="text-gray-700">UI Module (Active)</span>
            </div>
            <div class="flex items-center space-x-2">
              <span class="w-3 h-3 bg-green-500 rounded-full"></span>
              <span class="text-gray-700">Orchestration Module (Active)</span>
            </div>
            <div class="flex items-center space-x-2">
              <span class="w-3 h-3 bg-yellow-500 rounded-full"></span>
              <span class="text-gray-700">File Parser (Mocked)</span>
            </div>
            <div class="flex items-center space-x-2">
              <span class="w-3 h-3 bg-yellow-500 rounded-full"></span>
              <span class="text-gray-700">Chunker (Mocked)</span>
            </div>
            <div class="flex items-center space-x-2">
              <span class="w-3 h-3 bg-yellow-500 rounded-full"></span>
              <span class="text-gray-700">RAG Service (Mocked)</span>
            </div>
            <div class="flex items-center space-x-2">
              <span class="w-3 h-3 bg-yellow-500 rounded-full"></span>
              <span class="text-gray-700">LLM Service (Mocked)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import InputForm from './InputForm.vue';
import OutputDisplay from './OutputDisplay.vue';
import type { AppStatusOutput } from '@/interfaces/AppStatusOutput';
import { OrchestratorService } from '@/services/Orchestrator';
import { MockFileParser } from '@/services/MockFileParser';
import { MockChunker } from '@/services/MockChunker';
import { MockRAGService } from '@/services/MockRAGService';
import { MockLLMService } from '@/services/MockLLMService';

// Initialize services
const orchestrator = new OrchestratorService(
  new MockFileParser(),
  new MockChunker(),
  new MockRAGService(),
  new MockLLMService()
);

const isProcessing = ref(false);
const analysisOutput = ref<AppStatusOutput | null>(null);

const handleAnalysis = async (folderPath: string) => {
  isProcessing.value = true;
  
  // Show processing status immediately
  analysisOutput.value = {
    status: 'processing',
    message: 'Analyzing documents...',
    timestamp: new Date().toISOString()
  };

  try {
    // Run the full orchestration flow
    const result = await orchestrator.runAnalysis({ folderPath });
    analysisOutput.value = result;
  } catch (error) {
    analysisOutput.value = {
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error occurred',
      timestamp: new Date().toISOString()
    };
  } finally {
    isProcessing.value = false;
  }
};
</script>
