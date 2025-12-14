# PhaserGun Deployment Guide

Complete automated deployment to DigitalOcean with HTTPS support.

---

## Quick Start (3 Easy Steps)

### 1. From Your Local Machine

```bash
# Make scripts executable (one time)
chmod +x deploy-to-droplet.sh setup-server.sh

# Deploy code to droplet
./deploy-to-droplet.sh 165.227.116.224
```

### 2. SSH to Your Droplet

```bash
ssh root@165.227.116.224
cd /workspace/phasergun

# Edit setup script with your email
nano setup-server.sh
# Change: EMAIL="your-email@example.com"

# Run setup script
./setup-server.sh
```

### 3. Visit Your Site

Open browser to: **https://phasergun.app** 🎉

---

## What These Scripts Do

### `deploy-to-droplet.sh` (Run from Local Machine)

**Purpose**: Upload and build your code on the droplet

**What it does:**
1. ✓ Tests SSH connection
2. ✓ Uploads all project files via rsync
3. ✓ Creates `.env` files with Google OAuth credentials
4. ✓ Installs dependencies (npm install)
5. ✓ Builds Vue UI for production
6. ✓ Builds API server
7. ✓ Starts/restarts PM2
8. ✓ Reloads nginx (if already running)

**Usage:**
```bash
./deploy-to-droplet.sh <droplet-ip>

# Examples:
./deploy-to-droplet.sh 165.227.116.224
./deploy-to-droplet.sh phasergun.app
```

---

### `setup-server.sh` (Run on Droplet - One Time Only)

**Purpose**: Configure a fresh droplet with nginx, SSL, firewall, etc.

**What it does:**
1. ✓ Updates system packages
2. ✓ Installs nginx, certbot, PM2
3. ✓ Configures firewall (ports 22, 80, 443)
4. ✓ Gets SSL certificate from Let's Encrypt
5. ✓ Configures nginx with HTTPS
6. ✓ Starts all services
7. ✓ Optionally sets up PM2 auto-start

**Usage:**
```bash
ssh root@your-droplet-ip
cd /workspace/phasergun

# Edit email first!
nano setup-server.sh
# Change: EMAIL="your-email@example.com"

./setup-server.sh
```

---

## Complete First-Time Deployment

### Prerequisites

- ✅ Fresh Ubuntu 24.04 NodeJS droplet on DigitalOcean
- ✅ Domain DNS pointing to droplet IP (phasergun.app → 165.227.116.224)
- ✅ SSH key access configured
- ✅ Google OAuth credentials ready

### Step-by-Step

#### 1. Deploy Code (5 minutes)

From your local machine:

```bash
cd /Users/davidschmid/Documents/gun/code/poc-decoupled-app

# Deploy to droplet
./deploy-to-droplet.sh 165.227.116.224
```

Wait for it to complete. You'll see colored output showing progress.

#### 2. Setup Server (10 minutes)

SSH to droplet:

```bash
ssh root@165.227.116.224
cd /workspace/phasergun

# IMPORTANT: Edit the setup script first
nano setup-server.sh
```

Change these lines:
```bash
DOMAIN="phasergun.app"         # Your domain
EMAIL="your-email@example.com"  # Your email for SSL
```

Save (Ctrl+X, Y, Enter) and run:

```bash
./setup-server.sh
```

The script will:
- Ask if domain/email are correct (answer: y)
- Install everything
- Get SSL certificate (automatic)
- Configure services
- Ask about PM2 auto-start (answer: y)

#### 3. Update Google OAuth Console

1. Go to: https://console.cloud.google.com/apis/credentials
2. Click your OAuth 2.0 Client ID
3. Update **"Authorized JavaScript origins"**:
   - Remove: `http://localhost:5173`
   - Add: `https://phasergun.app`
   - Add: `https://www.phasergun.app`
4. Click **Save**
5. Wait 60 seconds

#### 4. Test Your App

1. Open: **https://phasergun.app**
2. You should see your Vue app
3. Try creating a project
4. Try Google Drive folder picker
5. Check browser console for errors (F12)

---

## Updating Your App (After Initial Deployment)

When you make changes to your code and want to deploy updates:

```bash
# From your local machine
cd /Users/davidschmid/Documents/gun/code/poc-decoupled-app

# Commit your changes
git add .
git commit -m "Your changes"
git push

# Deploy updates
./deploy-to-droplet.sh 165.227.116.224
```

That's it! The script will:
- Upload new code
- Rebuild everything
- Restart services
- Your updates are live!

---

## File Structure on Droplet

```
/workspace/phasergun/
├── vue-ui/
│   ├── dist/                    # Built Vue app (served by nginx)
│   ├── .env                     # Google OAuth credentials
│   └── ... source files
├── src/
│   └── api-server/
│       ├── dist/                # Built API server (runs on PM2)
│       ├── .env                 # API environment variables
│       └── ... source files
├── nginx.conf.template          # Nginx configuration
├── ecosystem.config.js          # PM2 configuration
├── setup-server.sh              # Server setup script
└── deploy-to-droplet.sh         # Deployment script
```

---

## How It Works

### Architecture

```
User Browser
    ↓ HTTPS (port 443)
Nginx
    ├→ Vue App (serves /workspace/phasergun/vue-ui/dist/)
    └→ API Proxy (/api → localhost:3001)
        ↓
    PM2 → API Server (Node.js on port 3001)
```

### What Runs Where

| Component | Runtime | Port | Managed By |
|-----------|---------|------|------------|
| Vue UI | Static files | - | nginx |
| API Server | Node.js | 3001 | PM2 |
| Nginx | Web server | 80, 443 | systemd |
| SSL/TLS | Let's Encrypt | 443 | certbot |

---

## Troubleshooting

### Can't connect via SSH

```bash
# Check droplet is running
# Go to DigitalOcean dashboard

# Test SSH manually
ssh -v root@165.227.116.224
```

### Deployment script fails

```bash
# Check you're in correct directory
pwd
# Should show: /Users/davidschmid/Documents/gun/code/poc-decoupled-app

# Check SSH works
ssh root@165.227.116.224 "echo works"
```

### Site shows nginx welcome page

```bash
# SSH to droplet
ssh root@165.227.116.224

# Check if dist folder exists
ls -la /workspace/phasergun/vue-ui/dist/

# If empty, rebuild
cd /workspace/phasergun/vue-ui
npm run build

# Reload nginx
systemctl reload nginx
```

### API not working (502 Bad Gateway)

```bash
# SSH to droplet
ssh root@165.227.116.224

# Check PM2 status
pm2 status

# Check logs
pm2 logs meddev-api

# Restart if needed
pm2 restart all
```

### SSL certificate errors

```bash
# SSH to droplet
ssh root@165.227.116.224

# Check certificate
certbot certificates

# Renew if needed
certbot renew

# Reload nginx
systemctl reload nginx
```

### Google Drive picker not working

1. Check browser console (F12) for errors
2. Verify OAuth origins include `https://phasergun.app`
3. Check `.env` file has correct credentials:
   ```bash
   ssh root@165.227.116.224
   cat /workspace/phasergun/vue-ui/.env
   ```
4. Rebuild Vue app if .env changed:
   ```bash
   cd /workspace/phasergun/vue-ui
   npm run build
   systemctl reload nginx
   ```

---

## Useful Commands

### On Your Local Machine

```bash
# Deploy latest code
./deploy-to-droplet.sh 165.227.116.224

# SSH to droplet
ssh root@165.227.116.224

# View deployment script
cat deploy-to-droplet.sh
```

### On Droplet

```bash
# Check all services
pm2 status
systemctl status nginx
ufw status

# View logs
pm2 logs
tail -f /var/log/nginx/phasergun-error.log
tail -f /var/log/nginx/phasergun-access.log

# Restart services
pm2 restart all
systemctl reload nginx

# Rebuild app
cd /workspace/phasergun/vue-ui && npm run build
cd /workspace/phasergun/src/api-server && npm run build

# Check what's using ports
netstat -tulpn | grep LISTEN
```

---

## Configuration Files

### Environment Variables

**vue-ui/.env:**
```env
VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
VITE_GOOGLE_API_KEY=your-api-key
```

**src/api-server/.env:**
```env
NODE_ENV=production
PORT=3001
```

### PM2 Configuration

**ecosystem.config.js:**
- Runs API server in production mode
- Auto-restarts on crash
- Logs to ./logs/ directory
- Port 3001

### Nginx Configuration

**nginx.conf.template:**
- HTTP → HTTPS redirect
- Serves Vue UI static files
- Proxies /api to port 3001
- SSL/TLS enabled
- Security headers
- Gzip compression
- Asset caching

---

## Security Best Practices

✅ **Always use HTTPS** - Let's Encrypt certificates auto-renew  
✅ **Firewall configured** - Only ports 22, 80, 443 open  
✅ **Environment variables** - Credentials not in code  
✅ **PM2 process isolation** - API runs as separate process  
✅ **Nginx proxy** - API not directly exposed  
✅ **Security headers** - HSTS, XSS protection, etc.  

---

## Backup & Recovery

### Before Major Changes

```bash
# On droplet
ssh root@165.227.116.224

# Backup current deployment
cd /workspace
tar -czf phasergun-backup-$(date +%Y%m%d).tar.gz phasergun/

# Move to safe location
mv phasergun-backup-*.tar.gz ~/backups/
```

### In DigitalOcean Dashboard

1. Go to your droplet
2. Click **Snapshots**
3. Click **Take Snapshot**
4. Name it (e.g., "Before deployment 2024-12-14")
5. Wait for snapshot to complete

### Restore from Backup

```bash
# Extract backup
cd /workspace
tar -xzf ~/backups/phasergun-backup-YYYYMMDD.tar.gz

# Restart services
pm2 restart all
systemctl reload nginx
```

---

## Cost Optimization

- **Let's Encrypt** - Free SSL certificates
- **Basic droplet** - $4-6/month is enough for development
- **PM2** - Free process manager
- **Nginx** - Free web server
- **Google OAuth** - Free tier sufficient

---

## Next Steps

1. ✅ Deploy to droplet (`./deploy-to-droplet.sh`)
2. ✅ Run setup script (`./setup-server.sh`)
3. ✅ Update Google OAuth console
4. ✅ Test your app
5. ✅ Configure PM2 auto-start
6. ✅ Take a snapshot in DigitalOcean
7. ✅ Set up monitoring (optional)
8. ✅ Configure backups (optional)

---

## Support Resources

- **DigitalOcean Docs**: https://docs.digitalocean.com/
- **Let's Encrypt**: https://letsencrypt.org/docs/
- **PM2 Docs**: https://pm2.keymetrics.io/docs/
- **Nginx Docs**: https://nginx.org/en/docs/
- **Vue.js Docs**: https://vuejs.org/guide/

---

## Questions?

Check the logs:
```bash
# Application logs
ssh root@165.227.116.224
pm2 logs

# Web server logs
tail -f /var/log/nginx/phasergun-error.log

# System logs
journalctl -u nginx -f
```

---

**Your app is now deployed with automated scripts! 🚀**

To deploy updates: `./deploy-to-droplet.sh 165.227.116.224`
