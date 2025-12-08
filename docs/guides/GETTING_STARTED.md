# Getting Started Guide

## Welcome! 👋

This guide will get you up and running with the FDA 510(k) Compliance POC application in minutes.

## Prerequisites

Before you begin, ensure you have:

- **Node.js 18+** installed ([Download here](https://nodejs.org/))
- **npm** (comes with Node.js)
- A terminal/command prompt
- A code editor (VS Code recommended)

### Verify Prerequisites

```bash
node --version   # Should show v18.x or higher
npm --version    # Should show 9.x or higher
```

## Installation Steps

### Option 1: Automated Setup (Recommended)

```bash
# Navigate to project directory
cd poc-decoupled-app

# Run setup script (Mac/Linux)
chmod +x setup.sh
./setup.sh

# Or manually (all platforms):
npm install
```

### Option 2: Manual Setup

```bash
# 1. Navigate to project
cd poc-decoupled-app

# 2. Install dependencies
npm install

# Wait for installation to complete...
```

## Running the Application

### Start Development Server

```bash
npm run dev
```

You should see output like:
```
  VITE v5.2.8  ready in 543 ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
  ➜  press h to show help
```

### Open in Browser

1. Open your browser
2. Navigate to: `http://localhost:5173`
3. You should see the application interface

## Using the Application

### Step 1: Enter Folder Path

In the input field, enter any folder path. For example:
- `/home/user/documents/dhf`
- `C:\Projects\medical-device\phase1`
- `/tmp/test-folder`

**Note**: Since all services are mocked, the actual path doesn't need to exist!

### Step 2: Click "Analyze Folder"

Click the blue "Analyze Folder" button.

### Step 3: Watch the Magic Happen

1. **Status Changes**: You'll see "Processing..." status immediately
2. **Console Logs**: Open browser DevTools (F12) to see detailed workflow
3. **Results**: After ~2 seconds, you'll see completion message

### Expected Result

You should see:
```
Status: Analysis Complete ✅
Message: Analysis completed successfully

Detailed Report:
The application has successfully traversed all modules: 
File Parsing → Chunking → RAG Retrieval → LLM Processing. 
All systems operational.

Timestamp: [current date/time]
```

## Viewing Console Logs

To see the detailed workflow execution:

1. **Open DevTools**:
   - Chrome/Edge: Press `F12` or `Ctrl+Shift+I` (Windows) / `Cmd+Option+I` (Mac)
   - Firefox: Press `F12` or `Ctrl+Shift+K` (Windows) / `Cmd+Option+K` (Mac)
   - Safari: Enable Developer menu, then press `Cmd+Option+C`

2. **Navigate to Console tab**

3. **Click "Analyze Folder"** and watch the logs

### Expected Console Output

```
=== Orchestrator: Starting Analysis ===
Input folder: /your/folder/path

[Step 1] Calling File Parser...
[MockFileParser] Scanning folder: /your/folder/path
✓ Parsed 2 documents

[Step 2] Calling Chunker...
[MockChunker] Chunking 2 documents
✓ Created 6 chunks

[Step 3] Initializing RAG Service...
[MockRAGService] Initializing knowledge base...
[MockRAGService] Knowledge base initialized
✓ RAG Service ready

[Step 4] Retrieving knowledge context...
[MockRAGService] Retrieving context for query: "Analyze documents for FDA 510(k) compliance"
✓ Retrieved context from 3 sources

[Step 5] Calling LLM Service...
[MockLLMService] Generating text with prompt length: 123
[MockLLMService] Using context from: 3 sources
✓ Generated response (150 tokens used)

=== Orchestrator: Analysis Complete ===
```

## Understanding the Interface

### Input Section
- **Folder Path Field**: Enter any path (mocked, doesn't need to exist)
- **Analyze Folder Button**: Starts the analysis workflow
- **Disabled State**: Button disabled while processing

### Output Section
- **Status Icon**: 
  - 🔵 Spinning loader = Processing
  - ✅ Green checkmark = Success
  - ❌ Red X = Error
- **Status Title**: Current state
- **Message**: Short description
- **Detailed Report**: Full results
- **Timestamp**: When analysis completed

### Architecture Info Section
- Shows which modules are active
- Green = Implemented and working
- Yellow = Mocked (placeholder implementation)

## Development Workflow

### Making Changes

1. **Edit Files**: Make changes to any `.vue` or `.ts` files
2. **Auto-Reload**: Vite will automatically reload the page
3. **See Changes**: Refresh browser if needed

### Common Edit Locations

- **UI Changes**: Edit files in `src/components/`
- **Mock Data**: Edit files in `src/services/Mock*.ts`
- **Interfaces**: Edit files in `src/interfaces/`
- **Styling**: Edit `src/style.css` or component `<style>` blocks

### Example: Change Mock Response

Edit `src/services/MockLLMService.ts`:

```typescript
// Find this method:
async generateText(prompt: string, context?: KnowledgeContext): Promise<LLMResponse> {
  // ...
  return {
    generatedText: 'YOUR CUSTOM MESSAGE HERE', // ← Change this
    usageStats: {
      tokensUsed: 150,
      cost: 0.0023
    }
  };
}
```

Save the file, and the next analysis will show your custom message!

## Available Commands

```bash
# Start development server (with hot reload)
npm run dev

# Check TypeScript types (no output = success)
npm run type-check

# Build for production
npm run build

# Preview production build
npm run preview
```

## Project Structure Quick Reference

```
poc-decoupled-app/
│
├── src/
│   ├── components/          # Vue UI components
│   │   ├── AppContainer.vue
│   │   ├── InputForm.vue
│   │   └── OutputDisplay.vue
│   │
│   ├── interfaces/          # TypeScript contracts
│   │   └── [6 interface files]
│   │
│   ├── services/           # Business logic
│   │   ├── Orchestrator.ts
│   │   └── [4 mock services]
│   │
│   ├── App.vue            # Root component
│   ├── main.ts            # Entry point
│   └── style.css          # Global styles
│
├── Documentation/
│   ├── README.md
│   ├── QUICKSTART.md
│   ├── ARCHITECTURE.md
│   ├── ARCHITECTURE_DIAGRAM.md
│   ├── PROJECT_SUMMARY.md
│   └── ROADMAP.md
│
└── Configuration files
```

## Troubleshooting

### Port 5173 Already in Use

**Problem**: Another application is using port 5173

**Solution**:
```bash
# Option 1: Kill the process
kill -9 $(lsof -t -i:5173)

# Option 2: Use different port
npm run dev -- --port 3000
```

### Dependencies Won't Install

**Problem**: `npm install` fails

**Solutions**:
1. Delete `node_modules` and `package-lock.json`:
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

2. Clear npm cache:
   ```bash
   npm cache clean --force
   npm install
   ```

3. Try using a different Node version (with nvm):
   ```bash
   nvm install 18
   nvm use 18
   npm install
   ```

### TypeScript Errors in Editor

**Problem**: Red squiggly lines in VS Code

**Solution**:
1. Open VS Code command palette (`Cmd/Ctrl + Shift + P`)
2. Type: "TypeScript: Restart TS Server"
3. Press Enter

### Page Not Loading

**Problem**: Browser shows "Cannot connect"

**Solutions**:
1. Verify dev server is running (check terminal)
2. Check the correct URL: `http://localhost:5173`
3. Try different browser
4. Restart dev server (`Ctrl+C`, then `npm run dev`)

### Styles Not Appearing

**Problem**: Page has no styling

**Solutions**:
1. Hard refresh: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)
2. Clear browser cache
3. Rebuild:
   ```bash
   rm -rf node_modules/.vite
   npm run dev
   ```

## Next Steps

Once you have the application running:

1. ✅ **Explore the Code**
   - Read through component files
   - Understand the interfaces
   - Review the orchestration flow

2. ✅ **Read Documentation**
   - `ARCHITECTURE.md` - System design
   - `ARCHITECTURE_DIAGRAM.md` - Visual diagrams
   - `PROJECT_SUMMARY.md` - Complete overview
   - `ROADMAP.md` - Future development

3. ✅ **Experiment**
   - Modify mock responses
   - Add console.log statements
   - Change UI components
   - Try different folder paths

4. ✅ **Plan Real Implementation**
   - Review `ROADMAP.md` for phases
   - Identify first module to replace (FileParser recommended)
   - Set up real services (vector DB, LLM API)

## Learning Resources

### Vue 3
- [Official Documentation](https://vuejs.org/)
- [Composition API Guide](https://vuejs.org/guide/extras/composition-api-faq.html)

### TypeScript
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [TypeScript with Vue](https://vuejs.org/guide/typescript/overview.html)

### Tailwind CSS
- [Documentation](https://tailwindcss.com/docs)
- [Playground](https://play.tailwindcss.com/)

### Vite
- [Getting Started](https://vitejs.dev/guide/)
- [Features](https://vitejs.dev/guide/features.html)

## Getting Help

### Documentation
- Check the `docs/` folder for detailed guides
- Review code comments in source files
- Look at TypeScript interface definitions

### Debugging Tips
1. Always check browser console (F12)
2. Add `console.log()` statements
3. Use Vue DevTools browser extension
4. Read error messages carefully

### Common Questions

**Q: Can I use a real folder path?**  
A: Yes, but it won't be read since FileParser is mocked. That's coming in Phase 1!

**Q: How do I add a new field to the output?**  
A: Edit the `AppStatusOutput` interface, then update the UI component.

**Q: Can I deploy this?**  
A: Yes! Run `npm run build` and deploy the `dist/` folder to any static host.

**Q: How do I replace a mock with real implementation?**  
A: See `ROADMAP.md` Phase 1-4 for step-by-step instructions.

## Success! 🎉

If you can:
- ✅ Start the dev server
- ✅ See the UI in browser
- ✅ Click "Analyze Folder"
- ✅ See the success message
- ✅ View console logs

**You're all set!** The POC is working correctly.

---

**Ready to build something amazing! 🚀**

For detailed architecture information, see `ARCHITECTURE.md`  
For development phases, see `ROADMAP.md`  
For quick reference, see `PROJECT_SUMMARY.md`
