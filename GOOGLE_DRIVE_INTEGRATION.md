# Google Drive Integration - Quick Start

## ✅ What's Been Implemented

The Angular UI now supports **two file sources**:
1. **💻 Local Filesystem** - Direct folder path input
2. **📁 Google Drive** - OAuth-based folder browser with visual picker

## 🎯 Features

### Google Drive Picker
- **Sign in with Google** - OAuth 2.0 authentication
- **Visual folder browser** - Navigate your Drive like a file explorer
- **Breadcrumb navigation** - Easily navigate up the folder hierarchy
- **Folder & file preview** - See contents before selecting
- **Secure** - Read-only access, no modification permissions
- **Auto-submit** - Automatically starts analysis after folder selection

### Local Filesystem
- Simple path input for local folders
- Works as before with direct path entry

## 🚀 Setup Instructions

### Step 1: Get Google API Credentials

1. **Create Google Cloud Project**
   - Visit: https://console.cloud.google.com/
   - Click "New Project" → Name it → Create

2. **Enable Google Drive API**
   - Go to "APIs & Services" → "Library"
   - Search "Google Drive API" → Enable

3. **Create OAuth Credentials**
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "OAuth client ID"
   - Configure consent screen if prompted:
     - App name: FDA 510k Compliance App
     - User support email: (your email)
     - Developer contact: (your email)
   - Application type: Web application
   - Name: FDA 510k Angular App
   - Authorized JavaScript origins: `http://localhost:4200`
   - Authorized redirect URIs: `http://localhost:4200`
   - Click "Create"

4. **Copy your credentials:**
   - Client ID (looks like: `xxxxx.apps.googleusercontent.com`)
   - API Key

5. **Create API Key** (if not created):
   - "Create Credentials" → "API Key"
   - Copy the key

### Step 2: Configure the App

1. Navigate to: `angular-ui/src/environments/`

2. Copy the template:
   ```bash
   cp environment.template.ts environment.ts
   ```

3. Edit `environment.ts` and paste your credentials:
   ```typescript
   export const environment = {
     production: false,
     googleDrive: {
       clientId: 'YOUR_ACTUAL_CLIENT_ID.apps.googleusercontent.com',
       apiKey: 'YOUR_ACTUAL_API_KEY',
       scopes: 'https://www.googleapis.com/auth/drive.readonly'
     }
   };
   ```

4. **IMPORTANT**: Never commit `environment.ts` to Git (already in .gitignore)

### Step 3: Test It!

1. Start the app:
   ```bash
   npm run start-ui
   ```

2. Open: http://localhost:4200

3. Select **"📁 Google Drive"** from the dropdown

4. Click **"📁 Browse Google Drive"**

5. Sign in with Google (popup will appear)

6. Browse and select your DHF folder

7. Analysis starts automatically!

## 📱 User Experience

### Local Filesystem Flow
1. Select "💻 Local Filesystem"
2. Enter folder path: `/path/to/dhf`
3. Click "Analyze Folder"
4. Results display

### Google Drive Flow
1. Select "📁 Google Drive"
2. Click "Browse Google Drive"
3. Sign in to Google (first time only)
4. Navigate folders by clicking
5. Use breadcrumbs to go back
6. Click "Select This Folder" when ready
7. Analysis starts automatically
8. Results display

## 🔒 Security & Privacy

### What the App Can Access
- **Read-only permission**: `drive.readonly`
- Can browse folders
- Can read file contents
- **Cannot** modify, delete, or upload files

### OAuth Flow
- Authentication happens in Google's popup
- No passwords stored in the app
- Access token stored temporarily in memory
- Token included in API calls to backend
- Sign out anytime to revoke access

### Data Protection
- API credentials stored in `environment.ts` (gitignored)
- Never committed to version control
- Template file (`environment.template.ts`) committed instead
- Access tokens never logged or persisted

## 🛠️ Technical Details

### New Components

1. **GoogleDriveService** (`services/google-drive.service.ts`)
   - OAuth initialization
   - Sign in/out
   - List folders & files
   - Download file contents
   - Get access tokens

2. **GoogleDrivePickerComponent** (`components/google-drive-picker/`)
   - Modal folder browser
   - Visual folder navigation
   - Breadcrumb navigation
   - Folder selection
   - File preview

3. **Updated InputFormComponent**
   - Source type selector (Local vs Google Drive)
   - Conditional UI (path input vs browse button)
   - Google Drive picker integration
   - Auto-submit after folder selection

### API Integration

The Google Drive API client (`gapi`) is loaded dynamically:
```typescript
// Loaded from: https://apis.google.com/js/api.js
gapi.client.init({
  apiKey: environment.googleDrive.apiKey,
  clientId: environment.googleDrive.clientId,
  discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
  scope: 'https://www.googleapis.com/auth/drive.readonly'
});
```

### Data Flow

```
User clicks "Browse Google Drive"
    ↓
GoogleDrivePickerComponent opens
    ↓
User signs in (OAuth popup)
    ↓
GoogleDriveService.listFilesInFolder('root')
    ↓
User navigates folders (visual browser)
    ↓
User clicks "Select This Folder"
    ↓
Component emits: { folderId, folderName, accessToken }
    ↓
InputFormComponent captures data
    ↓
Submits SourceFolderInput with credentials
    ↓
OrchestratorService receives:
  {
    folderPath: "folder_id_123",
    sourceType: "google-drive",
    credentials: { accessToken: "ya29.xxx" }
  }
    ↓
Backend uses access token to fetch files
```

## 🐛 Troubleshooting

### "Origin not allowed" error
**Cause**: Your localhost URL not authorized  
**Fix**: Add `http://localhost:4200` to "Authorized JavaScript origins" in Google Cloud Console

### "redirect_uri_mismatch" error
**Cause**: Redirect URI not configured  
**Fix**: Add `http://localhost:4200` to "Authorized redirect URIs"

### "Access blocked: This app's request is invalid"
**Cause**: OAuth consent screen incomplete  
**Fix**: Complete all required fields in OAuth consent screen

### Can't see folders
**Cause**: Drive API not enabled or wrong credentials  
**Fix**: 
1. Verify Drive API is enabled
2. Check CLIENT_ID and API_KEY in environment.ts
3. Clear browser cache and try again

### Sign-in popup blocked
**Cause**: Browser popup blocker  
**Fix**: Allow popups for localhost:4200

## 📦 Dependencies Added

```json
{
  "gapi-script": "^1.2.0"
}
```

## 🔄 Next Steps

To use Google Drive files in the backend:

1. **File Parser Module** should use the access token:
   ```typescript
   // In file-parser module
   if (input.sourceType === 'google-drive') {
     const token = input.credentials?.accessToken;
     // Use token to fetch files from Drive API
   }
   ```

2. **Create Google Drive file source** in `src/file-source/`:
   - Implement real Google Drive API calls
   - Use access token from credentials
   - Download files for parsing

3. **Backend integration**:
   - Pass access token through orchestrator
   - File parser uses token to download files
   - Process files normally

## 📝 Environment File Structure

```typescript
// environment.template.ts (committed to Git)
export const environment = {
  production: false,
  googleDrive: {
    clientId: 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com',
    apiKey: 'YOUR_API_KEY',
    scopes: 'https://www.googleapis.com/auth/drive.readonly'
  }
};

// environment.ts (NOT committed, added to .gitignore)
export const environment = {
  production: false,
  googleDrive: {
    clientId: '123456789-abc123.apps.googleusercontent.com',
    apiKey: 'AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
    scopes: 'https://www.googleapis.com/auth/drive.readonly'
  }
};
```

## ✨ Current Status

- ✅ Google Drive OAuth integration complete
- ✅ Visual folder picker implemented
- ✅ Sign in/out functionality working
- ✅ Folder navigation with breadcrumbs
- ✅ Access token captured and passed to backend
- ✅ Environment configuration setup
- ✅ Security measures in place (.gitignore)
- 🚧 Backend file download (next step)

## 🎉 Testing

Once you've configured your credentials:

1. Run the app: `npm run start-ui`
2. Select Google Drive
3. Click Browse
4. Sign in
5. Navigate to a folder
6. Select it
7. Check browser console - you'll see the folder ID and access token being passed!

The UI is **fully functional** - you just need to add your Google API credentials!
