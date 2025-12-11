module.exports = {
  apps: [
    {
      name: 'meddev-api',
      cwd: './src/api-server',
      script: 'dist/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3001
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
