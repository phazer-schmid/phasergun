# Digital Ocean Deployment Guide

## Issue Resolved
The error you encountered was due to the `@fda-compliance/shared-types` package being configured as CommonJS instead of ES modules. Vite/Vue requires ES modules.

## Changes Made
1. Updated `src/shared-types/tsconfig.json` to use `"module": "ESNext"`
2. Updated `src/shared-types/package.json` to include `"type": "module"` and proper `exports` field
3. Added `vue-ui` to the root workspace configuration
4. Rebuilt the shared-types package

## Deployment Steps for Digital Ocean

### 1. On Your Digital Ocean Droplet

#### Step 1: Pull the latest code
```bash
cd /workspace/phasergun
git pull origin main
```

#### Step 2: Clean install dependencies
```bash
# Clean node_modules and package-lock files
rm -rf node_modules
rm -rf vue-ui/node_modules
rm -rf src/*/node_modules
rm package-lock.json
rm vue-ui/package-lock.json

# Install from root (this handles workspaces)
npm install

# Build all workspace packages
npm run build-packages
```

#### Step 3: Build shared-types specifically
```bash
cd src/shared-types
npm run build
cd ../..
```

#### Step 4: Reinstall vue-ui dependencies to link local packages
```bash
cd vue-ui
rm -rf node_modules
npm install
```

#### Step 5: Start the Vue app
```bash
npm run dev
```

### 2. Alternative: One-Command Rebuild

Create a deployment script on your droplet:

```bash
#!/bin/bash
# File: deploy.sh

echo "=== Starting Deployment ==="

# Navigate to project directory
cd /workspace/phasergun

# Pull latest code
echo "Pulling latest code..."
git pull origin main

# Clean everything
echo "Cleaning old builds..."
rm -rf node_modules
rm -rf vue-ui/node_modules
rm -rf src/*/node_modules
find . -name "package-lock.json" -type f -delete

# Install root dependencies (handles workspaces)
echo "Installing dependencies..."
npm install

# Build all packages
echo "Building workspace packages..."
npm run build-packages

# Specific build for shared-types
echo "Building shared-types..."
cd src/shared-types
npm run build
cd ../..

# Install vue-ui dependencies
echo "Installing vue-ui dependencies..."
cd vue-ui
npm install

# Start the dev server
echo "Starting Vue dev server..."
npm run dev
```

Make it executable:
```bash
chmod +x deploy.sh
```

Run it:
```bash
./deploy.sh
```

### 3. For Production Deployment

#### Build the Vue app for production:
```bash
cd vue-ui
npm run build
```

This creates a `dist/` folder with optimized static files.

#### Serve with Nginx:

1. Install Nginx:
```bash
sudo apt update
sudo apt install nginx
```

2. Configure Nginx (`/etc/nginx/sites-available/vue-app`):
```nginx
server {
    listen 80;
    server_name your-domain.com;  # or your droplet IP

    root /workspace/phasergun/vue-ui/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # API proxy (if your API runs on same server)
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

3. Enable the site:
```bash
sudo ln -s /etc/nginx/sites-available/vue-app /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

#### Or serve with PM2 (for development server):

1. Install PM2:
```bash
sudo npm install -g pm2
```

2. Create ecosystem file (`ecosystem.config.js`):
```javascript
module.exports = {
  apps: [{
    name: 'vue-ui',
    cwd: '/workspace/phasergun/vue-ui',
    script: 'npm',
    args: 'run dev',
    env: {
      NODE_ENV: 'development',
    }
  }]
}
```

3. Start with PM2:
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### 4. Troubleshooting

#### If you still get the shared-types error:

1. Check if shared-types was built:
```bash
ls -la src/shared-types/dist/
# Should show: index.js, index.d.ts, and other .js/.d.ts files
```

2. Check the module type:
```bash
head -n 5 src/shared-types/dist/index.js
# Should show: export * from './SourceFolderInput';
# NOT: Object.defineProperty(exports, "__esModule", { value: true });
```

3. Verify package.json has correct type:
```bash
cat src/shared-types/package.json | grep '"type"'
# Should show: "type": "module",
```

4. Check workspace linking:
```bash
cd vue-ui
npm ls @fda-compliance/shared-types
# Should show: @fda-compliance/shared-types@0.1.0 -> ./../src/shared-types
```

#### If dependencies fail to install:

1. Check Node version (should be 18+):
```bash
node --version
```

2. Update npm:
```bash
npm install -g npm@latest
```

3. Clear npm cache:
```bash
npm cache clean --force
```

#### If port 5173 is already in use:

1. Check what's using the port:
```bash
lsof -i :5173
```

2. Kill the process:
```bash
kill -9 <PID>
```

3. Or use a different port:
```bash
# In vue-ui/package.json, update:
"dev": "vite --host 0.0.0.0 --port 3000"
```

### 5. Environment Variables

If you need environment variables on the droplet:

1. Create `.env` file in `vue-ui/`:
```bash
VITE_API_URL=http://localhost:3001
VITE_ENV=production
```

2. Access in code:
```typescript
const apiUrl = import.meta.env.VITE_API_URL;
```

### 6. Firewall Configuration

Ensure your firewall allows the port:

```bash
# For UFW (Ubuntu)
sudo ufw allow 5173/tcp
sudo ufw reload

# Or for production (port 80)
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

### 7. Quick Health Check

After deployment, verify everything works:

```bash
# Check if process is running
ps aux | grep vite

# Check if port is listening
netstat -tuln | grep 5173

# Test locally on droplet
curl http://localhost:5173

# Test from outside (replace with your IP)
curl http://165.227.116.224:5173
```

### 8. Continuous Deployment

For automatic deployments, set up a GitHub webhook or use GitHub Actions:

```yaml
# .github/workflows/deploy.yml
name: Deploy to Digital Ocean

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to droplet
        uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.DROPLET_IP }}
          username: ${{ secrets.DROPLET_USER }}
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          script: |
            cd /workspace/phasergun
            git pull origin main
            ./deploy.sh
```

## Summary

The main fix was converting the `shared-types` package from CommonJS to ES modules. After pulling the latest code on your droplet, run:

```bash
# Quick fix
cd /workspace/phasergun
rm -rf node_modules vue-ui/node_modules src/*/node_modules
npm install
npm run build-packages
cd vue-ui
npm install
npm run dev
```

This should resolve the `Failed to resolve entry for package "@fda-compliance/shared-types"` error.
