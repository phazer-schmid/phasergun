# Google Drive API Setup Instructions

## Overview

This application uses **Google Identity Services (GIS)** for authentication and the **Google Drive API** for file access. This guide will walk you through setting up the necessary credentials.

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
3. If prompted, configure the OAuth consent screen first (see section 4 below)

4. Create OAuth client ID:
   - Application type: **Web application**
   - Name: "FDA 510k App"
   - **Authorized JavaScript origins**:
     - `http://localhost:5173` (for local development)
     - `http://localhost:3000` (alternative port)
     - `https://yourdomain.com` (your production domain)
     - `https://www.yourdomain.com` (www subdomain if used)
   - **Authorized redirect URIs**: (Can leave empty for GIS)
   - Click "Create"

5. Copy your credentials:
   - **Client ID**: Copy this value (format: `xxxxx.apps.googleusercontent.com`)
   - **API Key**: Go to "Credentials" → "Create Credentials" → "API Key"

## 4. Configure OAuth Consent Screen

1. Go to "APIs & Services" → "OAuth consent screen"
2. Choose **"External"** user type (unless you have a Google Workspace)
3. Fill in required information:
   - **App name**: FDA 510k Compliance App
   - **User support email**: your email
   - **Application home page**: https://yourdomain.com
   - **Authorized domains**: Add your domain (e.g., `yourdomain.com`)
   - **Developer contact**: your email
4. Click "Save and Continue"

5. **Scopes** section:
   - Click "Add or Remove Scopes"
   - Search for "Google Drive API"
   - Add: `https://www.googleapis.com/auth/drive.readonly`
   - Click "Update" and "Save and Continue"

6. **Test users** (if app is in Testing mode):
   - Add email addresses that should have access during testing
   - Click "Save and Continue"

7. **Publishing**:
   - For limited use: Keep in "Testing" mode and add specific test users
   - For public use: Click "Publish App" (may require verification for sensitive scopes)

## 5. Configure Your Application

### Local Development

1. Copy the `.env.template` file to `.env`:
   ```bash
   cd vue-ui
   cp .env.template .env
   ```

2. Edit the `.env` file and add your credentials:
   ```env
   VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   VITE_GOOGLE_API_KEY=your-api-key
   ```

### Production Deployment

Set environment variables on your server:
```bash
export VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
export VITE_GOOGLE_API_KEY=your-api-key
```

Or add them to your `.env` file (ensure `.env` is in `.gitignore`).

## 6. Test the Integration

1. Build and start the app:
   ```bash
   cd vue-ui
   npm run build
   # Or for development:
   npm run dev
   ```

2. Navigate to your app URL
3. Select "Google Drive" from the source dropdown
4. Click "Browse Google Drive"
5. You should see a Google sign-in popup
6. Grant permissions
7. Browse your Google Drive folders

## Important Notes

### Modern Authentication (GIS)

This app uses **Google Identity Services (GIS)**, the modern authentication approach. Key differences from the deprecated `gapi.auth2`:

✅ **What we use**:
- `google.accounts.oauth2.initTokenClient()` - for authentication
- `gapi.client` - for API calls
- Token-based authorization flow
- Scripts: `https://accounts.google.com/gsi/client` and `https://apis.google.com/js/api.js`

❌ **What we DON'T use** (deprecated):
- `gapi.auth2` - old authentication library
- `gapi.client.init()` with auth configuration

### Scopes Used

The app requests **read-only access**:
- `https://www.googleapis.com/auth/drive.readonly`

This allows the app to:
- ✅ Browse folders
- ✅ List files
- ✅ Download file contents
- ❌ NOT modify or delete files

## Security Best Practices

### For Development:
- ✅ Use `.env.local` (git-ignored) for local credentials
- ✅ Never commit API keys to version control
- ✅ Add `.env` to `.gitignore`

### For Production:
- ✅ Use environment variables on your server
- ✅ Restrict API key by HTTP referrer:
  1. Go to Google Cloud Console → Credentials
  2. Click on your API Key
  3. Under "Application restrictions" → "HTTP referrers"
  4. Add: `https://yourdomain.com/*`
- ✅ Add all production domains to OAuth authorized origins
- ✅ Implement proper error handling
- ✅ Monitor API usage and quotas

## Troubleshooting

### Issue: "Not a valid origin for the client"
**Solution**: 
1. Go to Google Cloud Console → Credentials
2. Click on your OAuth 2.0 Client ID
3. Add your domain to "Authorized JavaScript origins"
4. Save and wait 5-10 minutes for changes to propagate
5. Clear browser cache and try again

### Issue: "Access blocked: This app's request is invalid"
**Solution**: 
- Complete OAuth consent screen configuration
- Ensure all required fields are filled
- Add test users if app is in Testing mode

### Issue: "redirect_uri_mismatch" error
**Solution**: 
- With GIS, redirect URIs are typically not needed
- If you see this error, add the exact URL to "Authorized redirect URIs"

### Issue: "idpiframe_initialization_failed"
**Solution**: 
- Ensure third-party cookies are enabled in your browser
- Check that both Google scripts are loading correctly
- Verify your domain is added to OAuth consent screen

### Issue: Deprecation warnings
**Solution**: 
- This app already uses the modern GIS approach
- If you see warnings about `gapi.auth2`, ensure you're using the latest code

### Issue: Can't see folders after sign-in
**Solution**: 
- Check browser console for errors
- Verify Drive API is enabled
- Check that credentials are correct
- Ensure token was successfully received (check console logs)

## API Quotas

Google Drive API has usage quotas:
- **Queries per day**: 1,000,000,000
- **Queries per 100 seconds per user**: 1,000

For most use cases, these limits are sufficient. Monitor usage in the Google Cloud Console.

## Additional Resources

- [Google Identity Services Documentation](https://developers.google.com/identity/gsi/web/guides/overview)
- [Google Drive API Documentation](https://developers.google.com/drive/api/v3/about-sdk)
- [Migration Guide from gapi.auth2 to GIS](https://developers.google.com/identity/gsi/web/guides/gis-migration)
- [OAuth 2.0 Scopes for Google APIs](https://developers.google.com/identity/protocols/oauth2/scopes#drive)
