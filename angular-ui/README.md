# FDA 510(k) Compliance Analyzer - Angular UI

This is an alternate Angular-based UI for the FDA 510(k) Compliance Analyzer POC application.

## Architecture

This Angular application uses the same shared service layer as the Vue.js version, demonstrating the decoupled architecture:

- **UI Layer (Angular)**: Components in `src/app/components/`
- **Service Layer (Shared)**: TypeScript services in `../src/services/` (shared with Vue app)
- **Interfaces (Shared)**: TypeScript interfaces in `../src/interfaces/` (shared with Vue app)

## Project Structure

```
angular-ui/
├── src/
│   ├── app/
│   │   ├── components/
│   │   │   ├── app-container/      # Main container component
│   │   │   ├── input-form/          # Input form component
│   │   │   └── output-display/      # Output display component
│   │   ├── services/
│   │   │   └── orchestrator.service.ts  # Angular wrapper for orchestrator
│   │   ├── app.component.ts         # Root component
│   │   └── app.module.ts            # Main module
│   ├── main.ts                      # Bootstrap file
│   ├── index.html                   # HTML entry point
│   └── styles.css                   # Global styles (Tailwind)
├── angular.json                     # Angular CLI configuration
├── package.json                     # Dependencies
├── tsconfig.json                    # TypeScript configuration
├── tailwind.config.js               # Tailwind CSS configuration
└── postcss.config.js                # PostCSS configuration
```

## Setup

1. Install dependencies:
   ```bash
   cd angular-ui
   npm install
   ```

2. Start the development server:
   ```bash
   npm start
   ```

3. Open your browser to `http://localhost:4200`

## Features

- **Decoupled Architecture**: UI is completely separated from business logic
- **Shared Services**: Uses the same TypeScript services as the Vue.js version
- **Mock Services**: Pre-configured with mock implementations for demonstration
- **Responsive Design**: Built with Tailwind CSS
- **Type Safety**: Full TypeScript support

## Components

### AppContainerComponent
Main container that manages state and orchestrates the analysis flow.

### InputFormComponent
Form for entering the folder path to analyze.
- Props: `isProcessing` (boolean)
- Events: `submit` (emits folder path)

### OutputDisplayComponent
Displays analysis results with status indicators.
- Props: `output` (AppStatusOutput | null)

## Service Integration

The Angular UI integrates with the shared service layer through the `OrchestratorService`:

```typescript
// Wraps the core orchestrator with Angular dependency injection
@Injectable({ providedIn: 'root' })
export class OrchestratorService {
  private orchestrator: CoreOrchestratorService;
  
  constructor() {
    this.orchestrator = new CoreOrchestratorService(
      new MockFileParser(),
      new MockChunker(),
      new MockRAGService(),
      new MockLLMService()
    );
  }
}
```

## Building for Production

```bash
npm run build
```

The build artifacts will be stored in the `dist/` directory.

## Comparison with Vue UI

Both UIs share:
- Same business logic (services)
- Same interfaces and types
- Same styling (Tailwind CSS)
- Same functionality

Differences:
- Angular uses dependency injection for services
- Angular uses decorators and NgModule
- Angular uses two-way binding with `[(ngModel)]`
- Vue uses Composition API with `ref()` and reactive data
