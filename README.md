# FDA 510(k) Compliance System - Modular Architecture

This system provides a fully decoupled architecture for FDA 510(k) compliance analysis with clear separation of concerns.

## Project Structure

```
├── src/                  # Core business logic modules
│   ├── shared-types/     # Common TypeScript interfaces
│   ├── file-parser/      # DHF document scanning
│   ├── chunker/          # Document chunking
│   ├── rag-service/      # Knowledge base & retrieval  
│   ├── llm-service/      # AI model integration
│   └── orchestrator/     # Workflow coordination
└── vue-ui/               # Vue 3 user interface (completely separate)
```

## Quick Start

```bash
# Install all dependencies and build packages
npm run install-all

# Test individual modules via CLI
npm run test-file-parser
npm run test-chunker
npm run test-rag
npm run test-llm
npm run test-orchestrator

# Start the Angular UI
npm run start-ui
# Opens at http://localhost:4200
```

## Key Concepts

- **RAG (Retrieval-Augmented Generation)**: Your "thinking document" (primary context) is stored here along with regulatory guidelines
- **Chunking**: Breaking large documents into smaller pieces for better AI processing
- **Primary Context**: Your strategic thinking document that guides AI behavior

## Module Independence

Each module:
- Has its own package.json and can be installed independently
- Has a CLI test script for standalone testing
- Can be built and tested without other modules
- Exposes clear TypeScript interfaces

## End-to-End Flow

1. User submits folder path in Angular UI
2. Orchestrator coordinates workflow:
   - File Parser scans and extracts text
   - Chunker breaks documents into pieces
   - RAG Service retrieves relevant knowledge/context
   - LLM Service generates compliance analysis
3. Results displayed in UI with detailed report

All modules currently use mocks for rapid development and testing.

## Security

⚠️ **CRITICAL**: Never commit API keys, passwords, or secrets to version control.

This project uses environment variables for sensitive configuration:

```bash
# Required for deployment
export VITE_GOOGLE_CLIENT_ID='your-client-id'
export VITE_GOOGLE_API_KEY='your-api-key'
```

**See [docs/SECURITY_BEST_PRACTICES.md](docs/SECURITY_BEST_PRACTICES.md) for comprehensive security guidelines.**

Key practices:
- Use environment variables for all secrets
- Never hardcode credentials in scripts or code
- Use `.env.template` files with placeholders
- Ensure `.gitignore` protects sensitive files

## Documentation

See detailed documentation in project root:
- Full architecture details
- Module specifications
- Development roadmap
- API contracts
- **[Security Best Practices](docs/SECURITY_BEST_PRACTICES.md)**
