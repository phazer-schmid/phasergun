module.exports = {
  apps: [
    {
      name: 'api-server-dev',
      cwd: './src/api-server',
      script: 'npm',
      args: 'run dev',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'development',
        PORT: 3001
      },
      error_file: './logs/api-dev-error.log',
      out_file: './logs/api-dev-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },
    {
      name: 'vue-ui-dev',
      cwd: './vue-ui',
      script: 'npm',
      args: 'run dev -- --host 0.0.0.0',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'development'
      },
      error_file: './logs/vue-dev-error.log',
      out_file: './logs/vue-dev-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }
  ]
};
