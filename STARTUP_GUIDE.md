# 🚀 Complete Startup Guide - End-to-End System

This guide shows you how to build and start the **complete end-to-end system** that runs the full analysis pipeline.

## 📋 System Architecture

```
Vue POC (Port 5174)
    ↓ HTTP POST
API Server (Port 3001)
    ↓ calls
Orchestrator Service
    ├─→ File Parser
    ├─→ Chunker
    ├─→ RAG Service
    └─→ LLM Service
    ↓ returns
AI Analysis Results
```

## 🔧 Prerequisites

- Node.js installed
- All project files in place

## 📦 Step 1: Build All Modules

Build all the TypeScript modules that the system needs:

```bash
# Navigate to project root
cd /Users/davidschmid/Documents/gun/code/poc-decoupled-app

# Build shared types (required by all other modules)
cd src/shared-types
npm install
npm run build

# Build file parser
cd ../file-parser
npm install
npm run build

# Build chunker
cd ../chunker
npm install
npm run build

# Build RAG service
cd ../rag-service
npm install
npm run build

# Build LLM service
cd ../llm-service
npm install
npm run build

# Build orchestrator
cd ../orchestrator
npm install
npm run build

# Build API server
cd ../api-server
npm install
npm run build

# Build DHF scanner (optional, for project scanning)
cd ../dhf-scanner
npm install
npm run build
```

## 🎯 Step 2: Start the API Server

The API server now calls the REAL end-to-end pipeline:

```bash
cd /Users/davidschmid/Documents/gun/code/poc-decoupled-app/src/api-server

# Start the server
npm run dev
```

You should see:
```
=== FDA Compliance API Server ===
Server running on http://localhost:3001
Health check: http://localhost:3001/api/health
DHF mapping loaded: 4 phases
```

## 🖥️ Step 3: Start the Vue POC

In a **NEW TERMINAL**:

```bash
cd /Users/davidschmid/Documents/gun/code/poc-decoupled-app/vue-poc

# Start the Vue app (if not already running)
npm run dev
```

You should see:
```
VITE v7.2.7  ready in 470 ms
➜  Local:   http://localhost:5174/
```

## ✅ Step 4: Test the Complete Pipeline

1. **Open browser**: http://localhost:5174

2. **Enter a file path** (use any text/PDF file on your system):
   ```
   /Users/davidschmid/Documents/some-document.pdf
   ```
   
   Or create a test file:
   ```bash
   echo "This is a test DHF document for regulatory compliance." > /tmp/test-document.txt
   ```
   Then use: `/tmp/test-document.txt`

3. **Click "Analyze File"**

4. **Watch the magic happen!** 🎉
   - Check the Vue UI for the results
   - Check the API server terminal for detailed logs showing:
     - File parsing
     - Document chunking
     - RAG initialization
     - Context retrieval  
     - LLM analysis

## 📊 What You'll See

### In the Vue UI:
```
📄 Document Analysis Complete

File: test-document.txt
...
FDA 510(k) COMPLIANCE ANALYSIS REPORT

EXECUTIVE SUMMARY:
Your Design History File (DHF) has been analyzed across all four phases...

PHASE ANALYSIS:
✓ Planning Phase: Design inputs identified and documented
✓ Design Phase: Risk analysis completed per ISO 14971
...
```

### In the API Server Terminal:
```
[API] ========================================
[API] Starting END-TO-END Analysis
[API] File: /tmp/test-document.txt
[API] ========================================

[API] Initializing services...
[API] Starting orchestrator analysis...

=== Orchestrator: Starting Analysis ===
Input folder: /tmp
Source type: local

[Step 1/5] Calling File Parser Module...
✓ Parsed 1 documents

[Step 2/5] Calling Chunker Module...
✓ Created 3 chunks

[Step 3/5] Initializing RAG Service Module...
✓ RAG Service ready

[Step 4/5] Retrieving Knowledge Context...
✓ Retrieved context from 5 sources

[Step 5/5] Calling LLM Service Module...
✓ Generated response (1250 tokens used)

=== Orchestrator: Analysis Complete ===
```

## 🔍 Troubleshooting

### API Server Won't Start
```bash
# Make sure port 3001 is free
lsof -i :3001
# If something is using it, kill it
kill -9 <PID>
```

### Module Not Found Errors
```bash
# Rebuild all modules
cd src/shared-types && npm run build
cd ../file-parser && npm run build
cd ../chunker && npm run build
cd ../rag-service && npm run build
cd ../llm-service && npm run build
cd ../orchestrator && npm run build
cd ../api-server && npm run build
```

### Vue App Won't Start
```bash
cd vue-poc
rm -rf node_modules package-lock.json
npm install
npm run dev
```

## 🎓 Understanding the Flow

1. **User enters file path** in Vue UI
2. **Vue calls** `POST http://localhost:3001/api/analyze`
3. **API Server**:
   - Imports all service modules dynamically
   - Creates Orchestrator with all services
   - Calls `orchestrator.runAnalysis()`
4. **Orchestrator** runs the pipeline:
   - `FileParser.scanAndParseFolder()` - extracts text from files
   - `Chunker.chunkDocuments()` - breaks into semantic chunks
   - `RAGService.initializeKnowledgeBase()` - loads regulatory context
   - `RAGService.retrieveContext()` - finds relevant guidelines
   - `LLMService.generateText()` - generates compliance analysis
5. **Results** returned to Vue UI and displayed

## 🎉 Success!

You now have a **fully working end-to-end system** that:
- ✅ Parses documents
- ✅ Chunks content semantically  
- ✅ Retrieves regulatory context via RAG
- ✅ Generates AI compliance analysis
- ✅ Displays results in a clean UI

## 📝 Quick Start Script

Save this as `start-system.sh`:

```bash
#!/bin/bash

# Start API Server
echo "Starting API Server..."
cd src/api-server
npm run dev &
API_PID=$!

# Wait for API to start
sleep 3

# Start Vue POC
echo "Starting Vue POC..."
cd ../../vue-poc
npm run dev &
VUE_PID=$!

echo ""
echo "System started!"
echo "API Server: http://localhost:3001"
echo "Vue POC: http://localhost:5174"
echo ""
echo "Press Ctrl+C to stop all services"

# Wait for user interrupt
wait
```

Make it executable and run:
```bash
chmod +x start-system.sh
./start-system.sh
```

## 🔗 Useful Links

- Vue POC: http://localhost:5174
- API Health Check: http://localhost:3001/api/health
- API DHF Mapping: http://localhost:3001/api/dhf-mapping
