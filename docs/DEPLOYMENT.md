# PhaserGun Deployment Guide

## Overview

This guide covers deploying PhaserGun in production environments, including building, configuring nginx, setting up pm2 process management, SSL certificates, and project file synchronization with rclone.

---

## Prerequisites

### System Requirements

- **Operating System**: Ubuntu 20.04+ or macOS
- **Node.js**: Version 18 or higher
- **npm**: Version 8 or higher
- **Memory**: Minimum 2GB RAM (4GB+ recommended for large document sets)
- **Disk Space**: 10GB+ (for cache, node_modules, and project files)

### Required Software

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install -y curl git nginx certbot python3-certbot-nginx

# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install pm2 globally
sudo npm install -g pm2

# macOS (Homebrew)
brew install node nginx
npm install -g pm2
```

---

## Build Process

### 1. Clone Repository

```bash
cd /var/www  # Or your preferred location
git clone https://github.com/yourorg/phasergun.git
cd phasergun
```

### 2. Install Dependencies

```bash
# Install all workspace dependencies
npm install

# This installs dependencies for:
# - Root workspace
# - All packages in src/*
# - vue-ui
```

### 3. Build Packages

```bash
# Build all TypeScript packages
npm run build-packages

# This compiles:
# - src/shared-types
# - src/file-parser
# - src/file-source
# - src/chunker
# - src/llm-service
# - src/rag-service
# - src/orchestrator
# - src/api-server
```

### 4. Build Vue UI (Production)

```bash
cd vue-ui

# Build static assets for production
npm run build

# Output: vue-ui/dist/
# Contains: index.html, assets/, etc.
```

**Build Output**:
```
vue-ui/dist/
├── index.html
├── assets/
│   ├── index-[hash].js
│   ├── index-[hash].css
│   └── [other assets]
└── favicon.ico
```

---

## Environment Configuration

### API Server Environment

**File**: `src/api-server/.env`

```bash
# Copy template
cp src/api-server/.env.template src/api-server/.env

# Edit with your settings
nano src/api-server/.env
```

**Production Configuration**:

```bash
# Server Configuration
PORT=3001

# LLM Configuration
LLM_MODE=anthropic
ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxxxxxxx
ANTHROPIC_MODEL=claude-sonnet-4-20250514

# Alternative: Mistral AI
# LLM_MODE=mistral
# MISTRAL_API_KEY=xxxxxxxxxxxxx
# MISTRAL_MODEL=mistral-small-latest

# Alternative: Groq
# LLM_MODE=groq
# GROQ_API_KEY=gsk_xxxxxxxxxxxxx
# GROQ_MODEL=llama-3.1-8b-instant

# Alternative: Ollama (local)
# LLM_MODE=ollama
# OLLAMA_MODEL=llama3.1:70b
# OLLAMA_BASE_URL=http://localhost:11434

# Primary Context Path (optional)
PRIMARY_CONTEXT_PATH=/var/www/phasergun/src/rag-service/knowledge-base/context/primary-context.yaml

# Cache Configuration
CACHE_ENABLED=true
```

### Vue UI Environment

**File**: `vue-ui/.env.local`

```bash
# Copy template
cp vue-ui/.env.template vue-ui/.env.local

# Currently no environment variables required
# API URL is configured in vue-ui/src/config/api.ts
```

---

## nginx Configuration

### Production Setup (Static Assets + API Proxy)

**File**: `/etc/nginx/sites-available/phasergun`

```bash
# Copy template
sudo cp nginx.conf.template /etc/nginx/sites-available/phasergun

# Edit configuration
sudo nano /etc/nginx/sites-available/phasergun
```

**Configuration** (update paths and domain):

```nginx
# HTTP - Redirect to HTTPS
server {
    listen 80;
    server_name phasergun.app www.phasergun.app;
    
    return 301 https://$server_name$request_uri;
}

# HTTPS - Main Server
server {
    listen 443 ssl http2;
    server_name phasergun.app www.phasergun.app;

    # SSL Certificate (configured after certbot)
    ssl_certificate /etc/letsencrypt/live/phasergun.app/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/phasergun.app/privkey.pem;
    
    # SSL Configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Vue UI - Serve static build files
    root /var/www/phasergun/vue-ui/dist;
    index index.html;

    # Vue Router support (SPA)
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API Proxy - Forward to Node.js backend
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts for large file uploads/analysis
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/json;

    # Cache static assets
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Logs
    access_log /var/log/nginx/phasergun-access.log;
    error_log /var/log/nginx/phasergun-error.log;
}
```

### Enable Site

```bash
# Create symbolic link
sudo ln -sf /etc/nginx/sites-available/phasergun /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Reload nginx
sudo systemctl reload nginx
```

---

## SSL Certificate Setup

### Using Let's Encrypt (Certbot)

```bash
# Install certbot (if not already installed)
sudo apt install certbot python3-certbot-nginx

# Obtain certificate
sudo certbot certonly --nginx -d phasergun.app -d www.phasergun.app

# Follow prompts:
# - Enter email address
# - Agree to terms
# - Certificate will be saved to /etc/letsencrypt/live/phasergun.app/

# Reload nginx with new certificate
sudo systemctl reload nginx
```

### Auto-Renewal

```bash
# Test renewal
sudo certbot renew --dry-run

# Certbot automatically creates a cron job
# Check with:
sudo systemctl status certbot.timer
```

---

## pm2 Process Management

### Production Configuration

**File**: `ecosystem.config.js` (already exists in repo)

```javascript
module.exports = {
  apps: [
    {
      name: 'phasergun-api',
      cwd: './src/api-server',
      script: 'dist/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        // Load all API keys from .env
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
        ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL,
        LLM_MODE: process.env.LLM_MODE || 'anthropic'
      },
      error_file: './logs/api-error.log',
      out_file: './logs/api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }
  ]
};
```

### Start Application

```bash
# Create logs directory
mkdir -p logs

# Start with pm2
pm2 start ecosystem.config.js

# Check status
pm2 status

# View logs
pm2 logs phasergun-api

# Follow logs in real-time
pm2 logs phasergun-api --lines 100
```

### pm2 Management Commands

```bash
# Restart
pm2 restart phasergun-api

# Stop
pm2 stop phasergun-api

# Delete from pm2
pm2 delete phasergun-api

# View detailed info
pm2 show phasergun-api

# Monitor resources
pm2 monit
```

### Startup Script (Auto-Start on Boot)

```bash
# Generate startup script
pm2 startup

# This will output a command to run with sudo
# Example: sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u username --hp /home/username

# Save current process list
pm2 save

# Now pm2 will auto-start on server reboot
```

---

## Development Mode

For development with hot-reload:

**File**: `ecosystem.dev.config.js`

```bash
# Start both API and UI in dev mode
pm2 start ecosystem.dev.config.js

# API server: localhost:3001 (auto-restarts on code changes)
# Vue UI: localhost:5173 (Vite dev server with HMR)
```

**Alternative (Manual)**:

```bash
# Terminal 1: API Server
cd src/api-server
npm run dev

# Terminal 2: Vue UI
cd vue-ui
npm run dev
```

---

## Project File Synchronization (rclone)

### Overview

Use rclone to sync project files from remote storage (Dropbox, Google Drive, S3, etc.) to the server.

**See [RCLONE.md](./RCLONE.md) for complete details.**

### Quick Setup

```bash
# Install rclone
curl https://rclone.org/install.sh | sudo bash

# Configure remote
rclone config

# Sync projects
rclone sync remote:path/to/projects /var/www/phasergun/projects --progress

# Set up cron job for automatic sync
crontab -e

# Add line (sync every hour):
0 * * * * rclone sync remote:path/to/projects /var/www/phasergun/projects --log-file=/var/log/rclone.log
```

---

## Digital Ocean Droplet Setup

### Recommended Droplet Configuration

**Droplet Size**:
- **Basic**: 2 vCPUs, 4GB RAM, 80GB SSD ($24/month)
- **Recommended**: 4 vCPUs, 8GB RAM, 160GB SSD ($48/month)
- **High-Volume**: 8 vCPUs, 16GB RAM, 320GB SSD ($96/month)

**Operating System**: Ubuntu 22.04 LTS

### Initial Server Setup

```bash
# 1. SSH into droplet
ssh root@your-droplet-ip

# 2. Create non-root user
adduser phasergun
usermod -aG sudo phasergun

# 3. Set up SSH key authentication
mkdir -p /home/phasergun/.ssh
cp /root/.ssh/authorized_keys /home/phasergun/.ssh/
chown -R phasergun:phasergun /home/phasergun/.ssh
chmod 700 /home/phasergun/.ssh
chmod 600 /home/phasergun/.ssh/authorized_keys

# 4. Exit and reconnect as new user
exit
ssh phasergun@your-droplet-ip

# 5. Update system
sudo apt update && sudo apt upgrade -y

# 6. Install required software
sudo apt install -y curl git nginx certbot python3-certbot-nginx

# 7. Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# 8. Install pm2
sudo npm install -g pm2

# 9. Configure firewall
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable

# 10. Clone and build PhaserGun (see Build Process section above)
```

### Domain Configuration

```bash
# 1. Point your domain to the droplet IP
# In your DNS provider:
# A record: @ -> droplet-ip
# A record: www -> droplet-ip

# 2. Wait for DNS propagation (5-60 minutes)
# Check with: dig phasergun.app

# 3. Configure nginx and SSL (see sections above)
```

---

## Firewall Configuration

### UFW (Ubuntu)

```bash
# Check status
sudo ufw status

# Allow SSH
sudo ufw allow OpenSSH

# Allow HTTP and HTTPS
sudo ufw allow 'Nginx Full'

# Enable firewall
sudo ufw enable

# View rules
sudo ufw status verbose
```

### Port Requirements

| Port | Service | Access |
|------|---------|--------|
| 22 | SSH | Admin only |
| 80 | HTTP | Public (redirects to 443) |
| 443 | HTTPS | Public |
| 3001 | API Server | localhost only (proxied via nginx) |

---

## Monitoring and Logs

### pm2 Logs

```bash
# View all logs
pm2 logs

# View specific app logs
pm2 logs phasergun-api

# View last 200 lines
pm2 logs --lines 200

# Log files location
tail -f logs/api-out.log
tail -f logs/api-error.log
```

### nginx Logs

```bash
# Access log
sudo tail -f /var/log/nginx/phasergun-access.log

# Error log
sudo tail -f /var/log/nginx/phasergun-error.log

# Rotate logs
sudo logrotate /etc/logrotate.d/nginx
```

### System Resources

```bash
# pm2 monitoring
pm2 monit

# System resources
htop

# Disk usage
df -h

# Check cache size
du -sh /tmp/phasergun-cache
```

---

## Backup and Recovery

### What to Backup

1. **Environment Files**:
   - `src/api-server/.env`
   - `vue-ui/.env.local`

2. **nginx Configuration**:
   - `/etc/nginx/sites-available/phasergun`

3. **SSL Certificates**:
   - `/etc/letsencrypt/`

4. **Project Files**:
   - `/path/to/projects/` (if not synced via rclone)

5. **pm2 Configuration**:
   - `ecosystem.config.js`
   - pm2 process list: `pm2 save`

### Backup Script

```bash
#!/bin/bash
# backup.sh

BACKUP_DIR="/backup/phasergun-$(date +%Y%m%d)"
mkdir -p $BACKUP_DIR

# Backup env files
cp src/api-server/.env $BACKUP_DIR/

# Backup nginx config
sudo cp /etc/nginx/sites-available/phasergun $BACKUP_DIR/

# Backup SSL certs
sudo cp -r /etc/letsencrypt $BACKUP_DIR/

# Backup pm2 config
cp ecosystem.config.js $BACKUP_DIR/

# Create archive
tar -czf phasergun-backup-$(date +%Y%m%d).tar.gz $BACKUP_DIR/

echo "Backup complete: phasergun-backup-$(date +%Y%m%d).tar.gz"
```

---

## Troubleshooting

### Cache Issues

**Problem**: Cache always rebuilding (slow performance)

**Solutions**:
```bash
# Check CACHE_ENABLED setting
grep CACHE_ENABLED src/api-server/.env

# Check temp directory permissions
ls -la /tmp/phasergun-cache

# Clear and rebuild cache
rm -rf /tmp/phasergun-cache
# Next request will rebuild automatically

# Check if files are changing unexpectedly
find /path/to/project -type f -mmin -60  # Files modified in last hour
```

### Permission Errors

**Problem**: "Failed to save cache" or "EACCES" errors

**Solutions**:
```bash
# Check temp directory ownership
ls -la /tmp/phasergun-cache

# Fix ownership
sudo chown -R $USER:$USER /tmp/phasergun-cache

# Check project file permissions
ls -la /path/to/projects

# Fix project permissions
sudo chown -R phasergun:phasergun /path/to/projects
```

### Missing Environment Variables

**Problem**: "LLM_MODE=anthropic but ANTHROPIC_API_KEY not set"

**Solutions**:
```bash
# Check env file exists
ls -la src/api-server/.env

# Verify contents
cat src/api-server/.env | grep API_KEY

# Restart pm2 to reload env
pm2 restart phasergun-api
```

### nginx Issues

**Problem**: 502 Bad Gateway

**Solutions**:
```bash
# Check if API server is running
pm2 status
curl http://localhost:3001/api/health

# Check nginx error log
sudo tail -f /var/log/nginx/phasergun-error.log

# Test nginx config
sudo nginx -t

# Restart services
pm2 restart phasergun-api
sudo systemctl restart nginx
```

### Out of Memory

**Problem**: Process killed or OOM errors

**Solutions**:
```bash
# Check memory usage
free -h
pm2 monit

# Increase swap space (if needed)
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# Add to /etc/fstab for persistence
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Reduce max_memory_restart in ecosystem.config.js
# Or upgrade droplet size
```

### SSL Certificate Issues

**Problem**: Certificate expired or invalid

**Solutions**:
```bash
# Check certificate expiry
sudo certbot certificates

# Renew certificate
sudo certbot renew

# Test auto-renewal
sudo certbot renew --dry-run

# Check certbot timer
sudo systemctl status certbot.timer
```

### Build Failures

**Problem**: `npm run build-packages` fails

**Solutions**:
```bash
# Clear all node_modules and rebuild
npm run clean-node-modules  # Or: ./clean-node-modules.sh
npm install
npm run build-packages

# Check Node.js version
node --version  # Should be 18+

# Check for TypeScript errors
cd src/api-server
npx tsc --noEmit
```

---

## Updating PhaserGun

### Zero-Downtime Deployment

```bash
# 1. Pull latest code
cd /var/www/phasergun
git pull origin main

# 2. Install dependencies
npm install

# 3. Build packages
npm run build-packages

# 4. Build Vue UI
cd vue-ui
npm run build
cd ..

# 5. Reload pm2 (graceful restart)
pm2 reload phasergun-api

# 6. Clear cache if needed
rm -rf /tmp/phasergun-cache

# Done! No downtime required.
```

### Rollback

```bash
# Revert to previous commit
git log --oneline  # Find commit hash
git reset --hard <commit-hash>

# Rebuild
npm install
npm run build-packages
cd vue-ui && npm run build && cd ..

# Restart
pm2 restart phasergun-api
```

---

## Performance Optimization

### 1. Enable nginx Caching

Add to nginx config:
```nginx
proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=api_cache:10m max_size=1g inactive=60m;

location /api {
    proxy_cache api_cache;
    proxy_cache_valid 200 5m;
    proxy_cache_key "$scheme$request_method$host$request_uri";
    # ... rest of proxy config
}
```

### 2. Optimize pm2 for Multi-Core

```javascript
// ecosystem.config.js
{
  instances: 2,  // Or 'max' for all CPU cores
  exec_mode: 'cluster'
}
```

### 3. Use HTTP/2

nginx config already includes `http2` - ensure it's enabled:
```nginx
listen 443 ssl http2;
```

### 4. Monitor Cache Hit Rate

```bash
# Check cache statistics
du -sh /tmp/phasergun-cache/*

# Monitor cache hits in logs
grep "Cache valid" logs/api-out.log | wc -l
```

---

## Security Best Practices

1. **Keep Software Updated**:
   ```bash
   sudo apt update && sudo apt upgrade -y
   npm outdated
   npm audit fix
   ```

2. **Secure Environment Files**:
   ```bash
   chmod 600 src/api-server/.env
   ```

3. **Use SSH Key Authentication** (disable password auth)

4. **Enable Firewall** (UFW)

5. **Regular Backups** (automated with cron)

6. **Monitor Logs** for suspicious activity

7. **Rate Limiting** at nginx level (optional):
   ```nginx
   limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
   
   location /api {
       limit_req zone=api burst=20 nodelay;
       # ... rest of config
   }
   ```

---

## Related Documentation

- **System Architecture**: [ARCHITECTURE.md](./ARCHITECTURE.md)
- **Cache System**: [CACHE.md](./CACHE.md)
- **API Reference**: [API.md](./API.md)
- **RAG Service**: [RAG_SERVICE.md](./RAG_SERVICE.md)
- **File Sync**: [RCLONE.md](./RCLONE.md)
