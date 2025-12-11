/**
 * API Configuration
 * Returns the appropriate API base URL based on the environment
 */

export const getApiUrl = (): string => {
  // In development (localhost), use full URL to backend server
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'http://localhost:3001/api';
  }
  
  // In production, use relative URL
  // Nginx will proxy /api requests to the backend server
  return '/api';
};

/**
 * Get the full API URL for a specific endpoint
 * @param endpoint - The API endpoint path (e.g., '/projects', '/folder-structure')
 */
export const getApiEndpoint = (endpoint: string): string => {
  const baseUrl = getApiUrl();
  // Ensure endpoint starts with /
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${baseUrl}${path}`;
};
