/**
 * API Configuration
 * Returns the appropriate API base URL based on the environment
 */

export const getApiUrl = (): string => {
  const hostname = window.location.hostname;
  const port = window.location.port;
  
  // Development mode: Running on Vite dev server (port 5173 or 5174)
  // This works for both localhost and remote servers (Digital Ocean)
  if (port === '5173' || port === '5174') {
    // Use full URL with current hostname (works for localhost or remote IP)
    return `http://${hostname}:3001/api`;
  }
  
  // Production mode: Served by Nginx on port 80 (or 443 for HTTPS)
  // Use relative URL - Nginx proxies /api to backend
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
