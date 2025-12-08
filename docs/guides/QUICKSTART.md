# Quick Start Guide

## Getting Started in 5 Minutes

### Step 1: Install Dependencies

```bash
cd poc-decoupled-app
npm install
```

### Step 2: Start Development Server

```bash
npm run dev
```

The application will start at `http://localhost:5173`

### Step 3: Test the Application

1. Open your browser to `http://localhost:5173`
2. Enter any folder path in the input field (e.g., `/my/documents/folder`)
3. Click "Analyze Folder"
4. Watch the console logs (F12) to see the orchestration flow
5. View the results in the output section

## What to Expect

When you click "Analyze Folder", the application will:

1. Show "Processing..." status immediately
2. Execute the full orchestration pipeline:
   - File Parser (mock) scans the folder
   - Chunker (mock) breaks documents into chunks
   - RAG Service (mock) retrieves regulatory context
   - LLM Service (mock) generates analysis
3. Display completion message with detailed report

**Console Output Example:**
```
=== Orchestrator: Starting Analysis ===
Input folder: /my/documents/folder

[Step 1] Calling File Parser...
[MockFileParser] Scanning folder: /my/documents/folder
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

## Available Commands

```bash
# Development server with hot reload
npm run dev

# Type check without emitting files
npm run type-check

# Build for production
npm run build

# Preview production build
npm run preview
```

## Project Structure Overview

```
src/
├── components/          # Vue UI components
│   ├── AppContainer.vue    # Main app container
│   ├── InputForm.vue       # Input form component
│   └── OutputDisplay.vue   # Results display component
│
├── interfaces/          # TypeScript contracts
│   ├── SourceFolderInput.ts
│   ├── AppStatusOutput.ts
│   ├── ParsedDocument.ts
│   ├── ChunkedDocumentPart.ts
│   ├── KnowledgeContext.ts
│   └── LLMResponse.ts
│
└── services/           # Service implementations
    ├── Orchestrator.ts       # Workflow coordinator
    ├── MockFileParser.ts     # File parsing (mocked)
    ├── MockChunker.ts        # Document chunking (mocked)
    ├── MockRAGService.ts     # RAG retrieval (mocked)
    └── MockLLMService.ts     # LLM integration (mocked)
```

## Understanding the Mock Services

All services are currently mocked to demonstrate the complete workflow without external dependencies:

### MockFileParser
- Returns 2 sample documents (PDF and DOCX)
- Simulates 300ms delay

### MockChunker
- Creates 3 chunks per document
- Adds metadata for tracking

### MockRAGService
- Returns ISO 13485 and FDA guidance snippets
- Requires initialization call
- Simulates 400ms retrieval time

### MockLLMService
- Returns success message demonstrating full traversal
- Reports mock token usage and costs
- Simulates 600ms processing time

## Next Steps

1. **Review Architecture**: Read `ARCHITECTURE.md` for detailed system design
2. **Explore Interfaces**: Check `src/interfaces/` to understand contracts
3. **Modify Mocks**: Update mock services to return different data
4. **Add Features**: Extend components with additional UI elements
5. **Replace Mocks**: Implement real services one module at a time

## Common Issues

### Port Already in Use
If port 5173 is in use:
```bash
# Kill existing process
kill -9 $(lsof -t -i:5173)

# Or specify different port
npm run dev -- --port 3000
```

### TypeScript Errors
Make sure dependencies are installed:
```bash
npm install
```

### Styling Not Loading
Clear browser cache and restart dev server:
```bash
# Stop server (Ctrl+C)
rm -rf node_modules/.vite
npm run dev
```

## Customization Tips

### Change Mock Response Time
Edit the `delay()` calls in mock services:
```typescript
await this.delay(300); // Change to 1000 for 1 second delay
```

### Modify Mock Data
Update return values in mock services to test different scenarios:
```typescript
// In MockFileParser.ts
return [
  {
    id: 'your-doc-id',
    fileName: 'your-file.pdf',
    content: 'Your mock content',
    // ... other fields
  }
];
```

### Add New Components
Create new `.vue` files in `src/components/` and import them in `AppContainer.vue`

## Additional Resources

- [Vue 3 Documentation](https://vuejs.org/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [Vite Guide](https://vitejs.dev/guide/)

## Support

For issues or questions:
1. Check console logs (F12 in browser)
2. Review `ARCHITECTURE.md` for design details
3. Inspect component props and interfaces

---

**Happy coding! 🚀**
