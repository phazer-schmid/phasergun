# Documentation Index

This directory contains all project documentation organized by topic and module.

## 📚 Root Documentation

Located in the project root:

- **[README.md](../README.md)** - Main project overview and quick start
- **[ARCHITECTURE.md](../ARCHITECTURE.md)** - System architecture overview
- **[ROADMAP.md](../ROADMAP.md)** - Project roadmap and future plans

## 📖 Core Documentation

### Architecture & Design
- [ARCHITECTURE_DIAGRAM.md](./ARCHITECTURE_DIAGRAM.md) - Visual architecture diagrams
- [ARCHITECTURE_SUMMARY.md](./ARCHITECTURE_SUMMARY.md) - Architecture summary
- [PROJECT_SUMMARY.md](./PROJECT_SUMMARY.md) - Project summary and overview
- [README.old.md](./README.old.md) - Previous README (archived)

### Guides
- [GETTING_STARTED.md](./guides/GETTING_STARTED.md) - Initial setup and getting started
- [QUICKSTART.md](./guides/QUICKSTART.md) - Quick start guide
- [DEPLOYMENT_GUIDE.md](./guides/DEPLOYMENT_GUIDE.md) - Deployment instructions
- [GOOGLE_DRIVE_SETUP.md](./guides/GOOGLE_DRIVE_SETUP.md) - Google Drive integration setup
- [VERIFICATION_CHECKLIST.md](./guides/VERIFICATION_CHECKLIST.md) - Testing and verification checklist

### Implementation
- [GOOGLE_DRIVE_INTEGRATION.md](./implementation/GOOGLE_DRIVE_INTEGRATION.md) - Google Drive integration details

## 🎯 Module-Specific Documentation

### DHF Scanner Module
Location: `src/dhf-scanner/docs/`

- [DHF_SCANNER_SETUP.md](../src/dhf-scanner/docs/DHF_SCANNER_SETUP.md) - DHF scanner setup
- [DHF_DYNAMIC_SCANNING_UPDATE.md](../src/dhf-scanner/docs/DHF_DYNAMIC_SCANNING_UPDATE.md) - Dynamic scanning features
- [DHF_FOLDER_STRUCTURE_GUIDE.md](../src/dhf-scanner/docs/DHF_FOLDER_STRUCTURE_GUIDE.md) - DHF folder structure guide
- [DHF_IMPLEMENTATION_STATUS.md](../src/dhf-scanner/docs/DHF_IMPLEMENTATION_STATUS.md) - Implementation status
- [DHF_RAG_UI_IMPLEMENTATION_PLAN.md](../src/dhf-scanner/docs/DHF_RAG_UI_IMPLEMENTATION_PLAN.md) - RAG UI implementation plan

### File Source Module
Location: `src/file-source/docs/`

- [FILE_SOURCE_MODULE.md](../src/file-source/docs/FILE_SOURCE_MODULE.md) - File source module documentation

### RAG Service Module
Location: `src/rag-service/docs/`

- [RAG_CONTEXT_IMPLEMENTATION.md](../src/rag-service/docs/RAG_CONTEXT_IMPLEMENTATION.md) - RAG context implementation details


## 📁 Documentation Organization

```
📁 Project Root
├── README.md                    # Main entry point
├── ARCHITECTURE.md              # Architecture overview
├── ROADMAP.md                   # Project roadmap
│
├── 📁 docs/                     # General documentation
│   ├── INDEX.md                 # This file
│   ├── ARCHITECTURE_DIAGRAM.md
│   ├── ARCHITECTURE_SUMMARY.md
│   ├── PROJECT_SUMMARY.md
│   │
│   ├── 📁 guides/              # User guides
│   │   ├── GETTING_STARTED.md
│   │   ├── QUICKSTART.md
│   │   ├── DEPLOYMENT_GUIDE.md
│   │   ├── GOOGLE_DRIVE_SETUP.md
│   │   └── VERIFICATION_CHECKLIST.md
│   │
│   └── 📁 implementation/      # Implementation details
│       └── GOOGLE_DRIVE_INTEGRATION.md
│
├── 📁 src/
│   ├── 📁 dhf-scanner/docs/   # DHF scanner documentation
│   ├── 📁 file-source/docs/   # File source documentation
│   └── 📁 rag-service/docs/   # RAG service documentation
│
├── 📁 angular-ui/docs/         # Angular dashboard documentation
│
└── 📁 vue-ui/docs/             # Vue UI documentation (if needed)
```

## 🚀 Quick Links

### For New Developers
1. Start with [README.md](../README.md)
2. Read [GETTING_STARTED.md](./guides/GETTING_STARTED.md)
3. Review [ARCHITECTURE.md](../ARCHITECTURE.md)

### For Deployment
1. Check [DEPLOYMENT_GUIDE.md](./guides/DEPLOYMENT_GUIDE.md)
2. Follow [VERIFICATION_CHECKLIST.md](./guides/VERIFICATION_CHECKLIST.md)

### For Feature Development
1. Review [ROADMAP.md](../ROADMAP.md)
2. Check module-specific docs in respective `docs/` folders
3. Review [ARCHITECTURE.md](../ARCHITECTURE.md) for system design

## 📝 Contributing to Documentation

When adding new documentation:

1. **Module-specific docs** → Place in module's `docs/` folder
2. **General guides** → Place in `docs/guides/`
3. **Implementation details** → Place in `docs/implementation/`
4. **High-level overviews** → Keep in project root (README, ARCHITECTURE, ROADMAP)
5. **Update this INDEX** → Add links to new documentation

Keep the root directory clean - only essential high-level docs should remain there!
