// Load environment variables from .env file
require('dotenv').config({ path: './src/api-server/.env' });

module.exports = {
  apps: [
    {
      name: 'meddev-api',
      cwd: './src/api-server',
      script: 'dist/api-server/src/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: process.env.PORT || 3001,
        // Load all API keys from .env
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
        ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL,
        MISTRAL_API_KEY: process.env.MISTRAL_API_KEY,
        MISTRAL_MODEL: process.env.MISTRAL_MODEL,
        OLLAMA_MODEL: process.env.OLLAMA_MODEL,
        OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL,
        LLM_MODE: process.env.LLM_MODE || 'anthropic'
      },
      error_file: './logs/api-error.log',
      out_file: './logs/api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }
    // Note: Vue UI is served by Nginx in production (static files)
    // If you need dev mode, uncomment below:
    /*
    {
      name: 'meddev-ui-dev',
      cwd: './vue-ui',
      script: 'npm',
      args: 'run dev -- --host 0.0.0.0',
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'development'
      },
      error_file: './logs/ui-error.log',
      out_file: './logs/ui-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }
    */
  ]
};
