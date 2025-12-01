# FDA 510(k) Compliance - Vue UI

A Vue 3 application for managing FDA 510(k) compliance projects and Design History File (DHF) analysis.

## Features

- **Project Management**: Create, edit, and manage multiple compliance projects
- **DHF Scanning**: Automated scanning and classification of DHF documents using AI
- **Phase-based Analysis**: Organize documents by development phases (Planning, Design, Development, Qualification)
- **Document Tracking**: Track status, completion, and issues for each DHF requirement
- **Local & Google Drive Support**: Work with local folders or Google Drive storage
- **Target Date Management**: Set and track phase completion deadlines

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Backend API server running on `http://localhost:3001` (see `../src/api-server`)

## Installation

1. Install dependencies:
```bash
cd vue-ui
npm install
```

2. Set up environment variables (optional for Google Drive):
```bash
cp src/environments/environment.template.ts src/environments/environment.ts
# Edit environment.ts with your Google Drive credentials if needed
```

## Development

Start the development server:
```bash
npm run dev
```

The application will be available at `http://localhost:5173`

## Building for Production

Build the application:
```bash
npm run build
```

Preview the production build:
```bash
npm run preview
```

## Project Structure

```
vue-ui/
├── src/
│   ├── components/          # Reusable Vue components
│   ├── composables/         # Vue composables (services)
│   │   ├── useProjectService.ts
│   │   ├── useDhfService.ts
│   │   └── useOrchestratorService.ts
│   ├── models/              # TypeScript interfaces
│   │   └── project.model.ts
│   ├── router/              # Vue Router configuration
│   │   └── index.ts
│   ├── views/               # Page components
│   │   ├── ProjectList.vue
│   │   ├── ProjectForm.vue
│   │   ├── ProjectEdit.vue
│   │   └── ProjectDashboard.vue
│   ├── environments/        # Environment configuration
│   ├── App.vue              # Root component
│   ├── main.ts              # Application entry point
│   └── style.css            # Global styles
├── index.html
├── package.json
├── vite.config.ts
├── tailwind.config.js
└── tsconfig.json
```

## Key Composables

### useProjectService
Manages project CRUD operations and local storage:
- `getAllProjects()` - Get all projects
- `getProject(id)` - Get single project
- `createProject(data)` - Create new project
- `updateProject(id, data)` - Update project
- `deleteProject(id)` - Delete project

### useDhfService
Handles DHF file management and scanning:
- `getDhfFilesForPhase(phaseId)` - Get DHF files for a phase
- `getAllDhfFiles()` - Get all DHF files
- `scanProjectFolder(projectId, path, phaseId?)` - Scan folder for documents

### useOrchestratorService
Manages analysis orchestration:
- `runAnalysis(input)` - Run compliance analysis

## Routes

- `/` - Project list (home)
- `/projects/new` - Create new project
- `/projects/:id` - Project dashboard
- `/projects/:id/edit` - Edit project

## Technology Stack

- **Vue 3** - Progressive JavaScript framework
- **TypeScript** - Type-safe development
- **Vue Router** - Client-side routing
- **Tailwind CSS** - Utility-first CSS framework
- **Vite** - Fast build tool and dev server
- **Axios** - HTTP client for API calls

## Comparison with Angular UI

This Vue implementation replicates the exact functionality of the Angular UI:

| Feature | Angular | Vue |
|---------|---------|-----|
| Component Structure | Angular Components | Vue SFC (Single File Components) |
| State Management | Services with Dependency Injection | Composables with Composition API |
| Routing | Angular Router | Vue Router |
| HTTP Calls | HttpClient (RxJS) | Axios (Promises) |
| Styling | Tailwind CSS | Tailwind CSS |
| Build Tool | Angular CLI | Vite |

## API Integration

The application connects to the backend API server at `http://localhost:3001/api` for:
- DHF document scanning and classification
- Project analysis
- Document metadata extraction

Make sure the API server is running before using the scan features.

## Local Storage

Projects are stored in browser localStorage under the key `fda_compliance_projects`. This allows the application to work offline and persist data between sessions.

## Development Notes

- TypeScript errors related to missing dependencies will resolve after running `npm install`
- The application uses Vue 3 Composition API with `<script setup>` syntax
- Tailwind CSS is configured for JIT (Just-In-Time) compilation
- All services are implemented as composables following Vue 3 best practices

## Contributing

When adding new features:
1. Create components in `src/components/`
2. Create views in `src/views/`
3. Add routes in `src/router/index.ts`
4. Implement business logic in composables in `src/composables/`

## License

See root project LICENSE file.
