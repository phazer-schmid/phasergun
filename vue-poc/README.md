# Vue POC - Simple DHF Document Analyzer

A minimal proof-of-concept Vue application for analyzing DHF (Design History File) documents using AI.

## Features

- 📁 Simple file path input
- 🔍 One-button analysis trigger
- 🤖 Mock AI analysis pipeline (Parse → Chunk → RAG → LLM)
- 📊 Clean results display
- ⚡ Fast and lightweight

## Architecture

```
User Input (File Path)
    ↓
Vue Frontend (vue-poc)
    ↓
API Server (:3001)
    ↓
Mock Analysis Pipeline
    ↓
Results Display
```

## Setup

### 1. Install Dependencies

```bash
cd vue-poc
npm install
```

### 2. Start the API Server

In a separate terminal:

```bash
cd src/api-server
npm run dev
```

The API server will run on `http://localhost:3001`

### 3. Start the Vue POC

```bash
cd vue-poc
npm run dev
```

The app will run on `http://localhost:5174`

## Usage

1. Open `http://localhost:5174` in your browser
2. Enter a file path (e.g., `/path/to/document.pdf`)
3. Click "Analyze File"
4. View the AI analysis results

## API Endpoint

The POC uses the following API endpoint:

**POST** `http://localhost:3001/api/analyze`

Request body:
```json
{
  "filePath": "/path/to/document.pdf"
}
```

Response:
```json
{
  "status": "complete",
  "message": "Analysis successful",
  "detailedReport": "...",
  "timestamp": "2025-12-08T...",
  "metadata": {
    "fileName": "document.pdf",
    "fileSize": "123.45 KB",
    "fileType": ".pdf"
  }
}
```

## File Structure

```
vue-poc/
├── index.html          # HTML entry point
├── package.json        # Dependencies
├── vite.config.ts      # Vite configuration
├── tsconfig.json       # TypeScript config
├── src/
│   ├── main.ts        # Vue app initialization
│   └── App.vue        # Main component (UI + logic)
└── README.md          # This file
```

## Current Implementation

This is a **MOCK** implementation for proof-of-concept:

- ✅ File path input and validation
- ✅ API communication
- ✅ Loading states
- ✅ Error handling
- ✅ Results display
- ⚠️ **Mock analysis** (simulated with delays)

## Next Steps for Production

1. Integrate real file-parser for PDF/DOCX extraction
2. Implement semantic chunking
3. Add RAG vector database integration
4. Connect to actual LLM (Claude/GPT)
5. Generate real compliance assessments
6. Add file upload capability
7. Implement progress tracking
8. Add export functionality

## Tech Stack

- **Frontend**: Vue 3 + TypeScript + Vite
- **Styling**: CSS (scoped, no framework)
- **API**: Axios
- **Backend**: Express (separate module)

## Development

```bash
# Install dependencies
npm install

# Run dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Notes

- Requires API server running on port 3001
- Uses mock analysis for demonstration
- Designed for simplicity and ease of understanding
- ~300 lines of code total
