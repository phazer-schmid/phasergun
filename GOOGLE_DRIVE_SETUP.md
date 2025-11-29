# Google Drive API Setup Instructions

## 1. Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click "Select a project" → "New Project"
3. Name your project (e.g., "FDA-510k-Compliance-App")
4. Click "Create"

## 2. Enable Google Drive API

1. In the Google Cloud Console, go to "APIs & Services" → "Library"
2. Search for "Google Drive API"
3. Click on it and press "Enable"

## 3. Create OAuth 2.0 Credentials

1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "OAuth client ID"
3. If prompted, configure the OAuth consent screen:
   - Choose "External" user type
   - Fill in:
     - App name: FDA 510k Compliance App
     - User support email: your email
     - Developer contact: your email
   - Click "Save and Continue"
   - Skip "Scopes" and "Test users" for now
   - Click "Back to Dashboard"

4. Create OAuth client ID:
   - Application type: "Web application"
   - Name: "FDA 510k Angular App"
   - Authorized JavaScript origins:
     - http://localhost:4200
     - http://localhost:3000 (if using different port)
   - Authorized redirect URIs:
     - http://localhost:4200
   - Click "Create"

5. Copy your credentials:
   - **Client ID**: Copy this value
   - **API Key**: Go to "Credentials" → "Create Credentials" → "API Key"

## 4. Configure Your Application

Open the file:
`angular-ui/src/app/services/google-drive.service.ts`

Replace these values:
```typescript
private CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com';
private API_KEY = 'YOUR_API_KEY';
```

With your actual credentials from step 3.

## 5. Test the Integration

1. Start the Angular app: `npm start`
2. Navigate to http://localhost:4200
3. Select "Google Drive" from the dropdown
4. Click "Browse Google Drive"
5. You should see a Google sign-in popup

## Security Notes

**IMPORTANT**: For production:
- Never commit API keys to version control
- Use environment variables or Angular environment files
- Add your production domain to authorized origins
- Implement proper error handling
- Consider using a backend service to handle credentials

## Scopes Used

The app requests read-only access:
- `https://www.googleapis.com/auth/drive.readonly`

This allows the app to:
- Browse folders
- List files
- Download file contents
- But NOT modify or delete files

## Troubleshooting

**Issue**: "Origin not allowed" error
- **Solution**: Add your localhost URL to "Authorized JavaScript origins"

**Issue**: "redirect_uri_mismatch" error
- **Solution**: Add exact URL to "Authorized redirect URIs"

**Issue**: "Access blocked: This app's request is invalid"
- **Solution**: Complete OAuth consent screen configuration

**Issue**: Can't see folders
- **Solution**: Check that Drive API is enabled and credentials are correct
