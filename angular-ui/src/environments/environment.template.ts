// Copy this file to environment.ts and fill in your Google API credentials
// See GOOGLE_DRIVE_SETUP.md for instructions

export const environment = {
  production: false,
  googleDrive: {
    // Get these from Google Cloud Console
    // See: https://console.cloud.google.com/apis/credentials
    clientId: 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com',
    apiKey: 'YOUR_API_KEY',
    scopes: 'https://www.googleapis.com/auth/drive.readonly'
  }
};
