<template>
  <div class="app">
    <div class="container">
      <h1>DHF Document Analyzer</h1>
      <p class="subtitle">Simple POC - Analyze regulatory documents with AI</p>

      <div class="input-section">
        <label for="filePath">File Path:</label>
        <input
          id="filePath"
          v-model="filePath"
          type="text"
          placeholder="/path/to/your/document.pdf"
          class="file-input"
          :disabled="isAnalyzing"
        />
        
        <button 
          @click="analyzeFile" 
          class="analyze-btn"
          :disabled="isAnalyzing || !filePath.trim()"
        >
          {{ isAnalyzing ? '⏳ Analyzing...' : '🔍 Analyze File' }}
        </button>
      </div>

      <div class="output-section">
        <h2>AI Analysis Results:</h2>
        
        <div v-if="error" class="error-box">
          <strong>Error:</strong> {{ error }}
        </div>

        <div v-if="isAnalyzing" class="loading-box">
          <p>🤖 Analyzing document...</p>
          <p class="loading-detail">Running: Parse → Chunk → RAG → LLM Analysis</p>
        </div>

        <div v-if="analysisResult && !isAnalyzing" class="result-box">
          <div class="result-meta">
            <span class="result-badge">{{ analysisResult.status }}</span>
            <span class="result-time">{{ formatTime(analysisResult.timestamp) }}</span>
          </div>
          <pre class="result-text">{{ analysisResult.detailedReport || analysisResult.message }}</pre>
        </div>

        <div v-if="!analysisResult && !isAnalyzing && !error" class="empty-box">
          <p>👆 Enter a file path above and click "Analyze File" to begin</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import axios from 'axios';

const filePath = ref('');
const isAnalyzing = ref(false);
const analysisResult = ref<any>(null);
const error = ref('');

const analyzeFile = async () => {
  if (!filePath.value.trim()) {
    error.value = 'Please enter a file path';
    return;
  }

  isAnalyzing.value = true;
  error.value = '';
  analysisResult.value = null;

  try {
    console.log('[POC] Starting analysis for:', filePath.value);
    
    // Call the orchestrator API
    const response = await axios.post('http://localhost:3001/api/analyze', {
      filePath: filePath.value.trim()
    });

    console.log('[POC] Analysis complete:', response.data);
    analysisResult.value = response.data;

  } catch (err: any) {
    console.error('[POC] Analysis failed:', err);
    error.value = err.response?.data?.message || err.message || 'Analysis failed';
  } finally {
    isAnalyzing.value = false;
  }
};

const formatTime = (timestamp: string): string => {
  return new Date(timestamp).toLocaleString();
};
</script>

<style scoped>
.app {
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 2rem;
}

.container {
  max-width: 900px;
  margin: 0 auto;
  background: white;
  border-radius: 12px;
  padding: 2.5rem;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

h1 {
  font-size: 2.5rem;
  color: #2d3748;
  margin: 0 0 0.5rem 0;
  font-weight: 700;
}

.subtitle {
  color: #718096;
  font-size: 1.1rem;
  margin: 0 0 2rem 0;
}

.input-section {
  margin-bottom: 2rem;
}

label {
  display: block;
  font-weight: 600;
  color: #4a5568;
  margin-bottom: 0.5rem;
  font-size: 0.95rem;
}

.file-input {
  width: 100%;
  padding: 0.75rem 1rem;
  border: 2px solid #e2e8f0;
  border-radius: 8px;
  font-size: 1rem;
  margin-bottom: 1rem;
  transition: border-color 0.2s;
}

.file-input:focus {
  outline: none;
  border-color: #667eea;
}

.file-input:disabled {
  background: #f7fafc;
  cursor: not-allowed;
}

.analyze-btn {
  width: 100%;
  padding: 1rem;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 1.1rem;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}

.analyze-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 10px 25px rgba(102, 126, 234, 0.4);
}

.analyze-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.output-section {
  margin-top: 2rem;
}

.output-section h2 {
  font-size: 1.5rem;
  color: #2d3748;
  margin-bottom: 1rem;
  font-weight: 600;
}

.error-box,
.loading-box,
.result-box,
.empty-box {
  padding: 1.5rem;
  border-radius: 8px;
  margin-top: 1rem;
}

.error-box {
  background: #fed7d7;
  border: 2px solid #fc8181;
  color: #742a2a;
}

.loading-box {
  background: #bee3f8;
  border: 2px solid #4299e1;
  color: #2c5282;
}

.loading-detail {
  margin-top: 0.5rem;
  font-size: 0.9rem;
  opacity: 0.8;
}

.result-box {
  background: #f7fafc;
  border: 2px solid #cbd5e0;
}

.result-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid #e2e8f0;
}

.result-badge {
  display: inline-block;
  padding: 0.25rem 0.75rem;
  background: #48bb78;
  color: white;
  border-radius: 20px;
  font-size: 0.85rem;
  font-weight: 600;
  text-transform: uppercase;
}

.result-time {
  color: #718096;
  font-size: 0.9rem;
}

.result-text {
  background: white;
  padding: 1.25rem;
  border-radius: 6px;
  border: 1px solid #e2e8f0;
  color: #2d3748;
  white-space: pre-wrap;
  word-wrap: break-word;
  font-family: 'Courier New', monospace;
  font-size: 0.95rem;
  line-height: 1.6;
  max-height: 500px;
  overflow-y: auto;
}

.empty-box {
  background: #edf2f7;
  border: 2px dashed #cbd5e0;
  color: #718096;
  text-align: center;
}

@media (max-width: 768px) {
  .container {
    padding: 1.5rem;
  }

  h1 {
    font-size: 2rem;
  }
}
</style>
