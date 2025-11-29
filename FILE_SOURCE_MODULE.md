# File Source Module Documentation

## Overview

The `file-source` module provides an interface-based abstraction for accessing DHF (Design History File) documents from multiple storage providers. This allows the application to seamlessly work with local filesystems, cloud storage providers like Google Drive and Dropbox, and other storage services.

## Architecture

### Interface-Based Design

The module uses a **Strategy Pattern** with a common `FileSource` interface that all providers implement:

```typescript
interface FileSource {
  initialize(config: FileSourceConfig): Promise<void>;
  listFolder(folderId: string): Promise<FolderContents>;
  readFile(fileId: string): Promise<string>;
  downloadFile(fileId: string): Promise<Buffer>;
  getFileMetadata(fileId: string): Promise<FileMetadata>;
  searchFiles(query: string, folderId?: string): Promise<FileMetadata[]>;
}
```

### Supported Providers

1. **Local Filesystem** (`FileSourceType.LOCAL_FILESYSTEM`)
   - Direct access to local directories
   - Icon: 💻

2. **Google Drive** (`FileSourceType.GOOGLE_DRIVE`)
   - OAuth-based authentication
   - Folder ID or path-based access
   - Icon: 📁

3. **Dropbox** (`FileSourceType.DROPBOX`)
   - OAuth-based authentication
   - Path-based access
   - Icon: 📦

4. **OneDrive** (`FileSourceType.ONEDRIVE`)
   - Microsoft authentication
   - Icon: ☁️

5. **Amazon S3** (`FileSourceType.S3`)
   - AWS credential-based access
   - Icon: 🪣

## Module Structure

```
src/file-source/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts       # Main module with interface & implementations
    └── cli.ts         # Standalone CLI test runner
```

## Usage

### Factory Pattern

Use the factory function to create the appropriate file source:

```typescript
import { createFileSource, FileSourceType } from '@fda-compliance/file-source';

const localSource = createFileSource(FileSourceType.LOCAL_FILESYSTEM);
await localSource.initialize({ type: FileSourceType.LOCAL_FILESYSTEM });

const googleSource = createFileSource(FileSourceType.GOOGLE_DRIVE);
await googleSource.initialize({ 
  type: FileSourceType.GOOGLE_DRIVE,
  credentials: { accessToken: 'your-oauth-token' }
});
```

### Angular UI Integration

The Angular UI now includes a **File Source Dropdown** in the input form:

- Users select their preferred storage provider from the dropdown
- Each provider shows an icon for easy recognition
- The folder path input placeholder changes based on the selected provider
- The form emits a `SourceFolderInput` object containing both `folderPath` and `sourceType`

## Data Flow

```
User Input (Angular UI)
    ↓
SourceFolderInput { folderPath, sourceType }
    ↓
Orchestrator Service
    ↓
File Source Module (selected provider)
    ↓
File Parser Module
    ↓
... (rest of workflow)
```

## Updated Interfaces

### SourceFolderInput

```typescript
interface SourceFolderInput {
  folderPath: string;
  sourceType?: 'local' | 'google-drive' | 'dropbox' | 'onedrive' | 's3';
  credentials?: {
    apiKey?: string;
    accessToken?: string;
    refreshToken?: string;
  };
}
```

## Current Implementation Status

### ✅ Completed

- Interface design for all file sources
- Mock implementations for testing
- Factory pattern for provider instantiation
- CLI test runner showing all providers
- Angular UI dropdown integration
- Updated shared types with sourceType
- Full workflow integration

### 🚧 Future Work

The current implementations are **mocks** that return hardcoded sample data. To make them production-ready:

1. **Local Filesystem**
   - Integrate Node.js `fs` module
   - Implement real directory scanning
   - Add file reading capabilities

2. **Google Drive**
   - Integrate Google Drive API SDK
   - Implement OAuth 2.0 flow
   - Handle file downloads and metadata

3. **Dropbox**
   - Integrate Dropbox SDK
   - Implement OAuth authentication
   - Add real file operations

4. **OneDrive & S3**
   - Similar integration patterns
   - Provider-specific authentication

## Testing

### Module Test

Run the standalone file-source module test:

```bash
npm run test-file-source
```

This will test all three providers and show sample folder listings.

### Integration Test

The orchestrator now logs the selected source type:

```bash
npm run test-orchestrator
```

### UI Test

Start the Angular UI and test the dropdown:

```bash
cd angular-ui && npm start
# Navigate to http://localhost:4200
```

## Benefits

1. **Decoupled Architecture** - File access logic is separated from business logic
2. **Extensible** - Easy to add new storage providers
3. **Testable** - Each provider can be tested independently
4. **User Choice** - Users can choose their preferred storage location
5. **Future-Proof** - Interface-based design allows swapping implementations

## Dependencies

```json
{
  "@fda-compliance/shared-types": "file:../shared-types"
}
```

## NPM Scripts

- `npm run build` - Compile TypeScript to JavaScript
- `npm run test` - Run CLI test
- `npm run dev` - Build and run test in one command

## Next Steps

1. Implement real OAuth flows for Google Drive/Dropbox
2. Add credential storage/management
3. Implement caching for remote file metadata
4. Add progress indicators for large file downloads
5. Implement retry logic for network errors
6. Add file type validation
7. Support for pagination in large folders
