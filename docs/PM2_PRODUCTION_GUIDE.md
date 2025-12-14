# PM2 & Production Reload Guide

Quick reference for managing your PhaserGun app on the droplet.

---

## Understanding Production Setup

### Vue UI (Frontend)
- **Built to:** `vue-ui/dist/` (static HTML/CSS/JS files)
- **Served by:** nginx (directly serves files)
- **NOT managed by PM2** (no need - they're just static files)

### API Server (Backend)
- **Built to:** `src/api-server/dist/`
- **Runs on:** PM2 (process manager)
- **Port:** 3001 (proxied by nginx)

---

## How to Reload Vue UI in Production

### ⚠️ IMPORTANT: When You Must Rebuild

**YES, rebuild is REQUIRED if you changed:**
- ✅ `.env` file (environment variables are compiled into the build!)
- ✅ Any `.vue`, `.ts`, `.js`, `.css` files
- ✅ `package.json` dependencies
- ✅ Any code or configuration files

**Why .env changes require rebuild:**
- Vue environment variables (like `VITE_GOOGLE_CLIENT_ID`) are read at **build time**
- They're embedded directly into the JavaScript bundle by Vite
- The browser never reads the .env file - only the built code
- So if you update `.env`, you MUST rebuild to see changes!

**NO rebuild needed if you only changed:**
- ❌ API server code only
- ❌ Documentation files
- ❌ Files outside vue-ui folder

### Option 1: SSH and Rebuild Manually

```bash
# 1. SSH to your droplet
ssh root@165.227.116.224
cd /workspace/phasergun

# 2. Update .env if needed
cd vue-ui
nano .env  # Edit your environment variables

# 3. REBUILD Vue UI (this embeds the .env values)
npm run build

# 4. Reload nginx (optional, but recommended)
systemctl reload nginx

# Done! Your changes are now live.
```

**That's it!** Since nginx serves static files, the new build is immediately available.

### Option 2: Deploy from Local Machine (Recommended)

```bash
# From your local machine
cd /Users/davidschmid/Documents/gun/code/poc-decoupled-app

# This script does everything:
# - Uploads code
# - Rebuilds Vue UI
# - Rebuilds API
# - Restarts PM2
./deploy-to-droplet.sh 165.227.116.224
```

---

## How to Reload API Server in Production

### Quick Restart

```bash
# SSH to droplet
ssh root@165.227.116.224

# Restart API with PM2
pm2 restart meddev-api

# Or restart all PM2 processes
pm2 restart all
```

### Full Rebuild and Restart

```bash
# SSH to droplet
ssh root@165.227.116.224
cd /workspace/phasergun

# Rebuild API
cd src/api-server
npm run build

# Restart PM2
pm2 restart meddev-api

# Check status
pm2 status
pm2 logs meddev-api --lines 20
```

---

## Essential PM2 Commands

### Status and Monitoring

```bash
# View all processes
pm2 status
pm2 list

# Monitor in real-time
pm2 monit

# View logs
pm2 logs                    # All apps
pm2 logs meddev-api         # Specific app
pm2 logs --lines 100        # Last 100 lines
pm2 logs --err              # Error logs only
```

### Start, Stop, Restart

```bash
# Start production config
pm2 start ecosystem.config.js

# Restart apps
pm2 restart meddev-api      # Specific app
pm2 restart all             # All apps

# Stop apps
pm2 stop meddev-api         # Specific app
pm2 stop all                # All apps

# Delete from PM2
pm2 delete meddev-api       # Remove specific app
pm2 delete all              # Remove all apps
```

### Save and Restore

```bash
# Save current PM2 state (survives reboots)
pm2 save

# Restore saved processes
pm2 resurrect

# Clear saved state
pm2 cleardump
```

### Information

```bash
# Detailed info about an app
pm2 info meddev-api

# Show environment variables
pm2 env 0

# Show startup script
pm2 startup
```

---

## Common Workflows

### 0. Changed .env File (Special Case!)

**If you only changed `.env` in vue-ui:**

```bash
ssh root@165.227.116.224
cd /workspace/phasergun/vue-ui

# Edit .env file
nano .env
# Update VITE_GOOGLE_CLIENT_ID or other variables

# MUST REBUILD (env vars are baked into the build)
npm run build

# That's it! nginx serves the new build immediately
# No need to restart PM2 (that's only for API server)
```

**Remember:** Environment variables in Vue are **compile-time**, not runtime!

### 1. Update Vue UI Only

**From your local machine:**
```bash
# Make changes to Vue files
cd vue-ui/src
# ... edit files ...

# Commit and push
git add .
git commit -m "Update UI"
git push

# Deploy
cd ..
./deploy-to-droplet.sh 165.227.116.224
```

**On droplet (manual method):**
```bash
ssh root@165.227.116.224
cd /workspace/phasergun/vue-ui

# Pull latest code
git pull

# Rebuild
npm install  # If package.json changed
npm run build

# nginx automatically serves new files!
```

### 2. Update API Only

```bash
ssh root@165.227.116.224
cd /workspace/phasergun/src/api-server

# Pull latest code
git pull

# Rebuild and restart
npm install  # If package.json changed
npm run build
pm2 restart meddev-api

# Check logs
pm2 logs meddev-api --lines 20
```

### 3. Update Both (Full Deploy)

**From local machine:**
```bash
./deploy-to-droplet.sh 165.227.116.224
```

This automatically:
- ✓ Uploads all code
- ✓ Rebuilds shared-types
- ✓ Rebuilds Vue UI
- ✓ Rebuilds API server
- ✓ Restarts PM2
- ✓ Reloads nginx

### 4. Emergency Restart

```bash
ssh root@165.227.116.224

# Restart everything
pm2 restart all
systemctl reload nginx

# Check status
pm2 status
systemctl status nginx
curl -I http://localhost
```

### 5. View Production Logs

```bash
ssh root@165.227.116.224

# PM2 logs (API)
pm2 logs meddev-api --lines 50

# Nginx logs
tail -f /var/log/nginx/phasergun-access.log
tail -f /var/log/nginx/phasergun-error.log

# System logs
journalctl -u nginx -f
```

---

## Troubleshooting

### Vue UI Changes Not Appearing

**Problem:** Made changes but old version still shows in browser

**Solution:**
```bash
# 1. Clear browser cache (Ctrl+Shift+R or Cmd+Shift+R)

# 2. Verify dist folder updated
ssh root@165.227.116.224
ls -la /workspace/phasergun/vue-ui/dist/
stat /workspace/phasergun/vue-ui/dist/index.html

# 3. Rebuild if needed
cd /workspace/phasergun/vue-ui
npm run build

# 4. Check nginx is serving correct directory
nginx -t
cat /etc/nginx/sites-available/phasergun.app | grep root

# 5. Reload nginx
systemctl reload nginx
```

### API Not Responding (502 Error)

**Problem:** nginx shows 502 Bad Gateway

**Solution:**
```bash
ssh root@165.227.116.224

# 1. Check PM2 status
pm2 status
# Is meddev-api running?

# 2. Check PM2 logs
pm2 logs meddev-api --err --lines 50

# 3. Restart API
pm2 restart meddev-api

# 4. Verify API is listening
curl http://localhost:3001/api/health

# 5. Check nginx proxy config
cat /etc/nginx/sites-available/phasergun.app | grep proxy_pass
```

### PM2 Process Keeps Crashing

**Problem:** PM2 shows "errored" or "stopped"

**Solution:**
```bash
# 1. Check error logs
pm2 logs meddev-api --err --lines 100

# 2. Check environment variables
pm2 env 0
cat /workspace/phasergun/src/api-server/.env

# 3. Test API manually
cd /workspace/phasergun/src/api-server
node dist/index.js
# Look for errors

# 4. Check dependencies
npm install

# 5. Rebuild
npm run build

# 6. Restart PM2
pm2 restart meddev-api
```

### nginx Not Serving Updated Files

**Problem:** nginx serves old cached version

**Solution:**
```bash
# 1. Check nginx cache settings
cat /etc/nginx/sites-available/phasergun.app | grep cache

# 2. Reload nginx
systemctl reload nginx

# 3. Full nginx restart (if reload doesn't work)
systemctl restart nginx

# 4. Clear browser cache
# In browser: Ctrl+Shift+R (Windows/Linux) or Cmd+Shift+R (Mac)

# 5. Test with curl (bypasses browser cache)
curl -I https://phasergun.app
```

---

## Quick Command Reference

### Most Common Commands

```bash
# Deploy from local machine
./deploy-to-droplet.sh 165.227.116.224

# On droplet - restart API
pm2 restart meddev-api

# On droplet - rebuild Vue UI
cd /workspace/phasergun/vue-ui && npm run build

# On droplet - view logs
pm2 logs meddev-api

# On droplet - check status
pm2 status && systemctl status nginx

# On droplet - reload nginx
systemctl reload nginx
```

---

## Development vs Production

### Production Mode (Current Setup)

```bash
# What's running:
pm2 start ecosystem.config.js
# - meddev-api on port 3001
# - Vue UI: static files in vue-ui/dist/

# To reload Vue UI:
cd vue-ui && npm run build

# To reload API:
pm2 restart meddev-api
```

### Development Mode (Optional)

```bash
# Start dev mode with hot reload
pm2 start ecosystem.dev.config.js
# - api-server-dev on port 3001 (hot reload)
# - vue-ui-dev on port 5173 (hot reload)

# Both apps auto-reload on file changes!

# To switch back to production:
pm2 delete all
pm2 start ecosystem.config.js
pm2 save
```

---

## Auto-Deployment Options

### Option 1: GitHub Actions (Future)

Set up CI/CD to auto-deploy on push to main branch.

### Option 2: Webhook

Set up webhook to trigger deploy script on git push.

### Option 3: Cron Job

Schedule regular deploys:
```bash
# On droplet
crontab -e

# Add line (deploy every hour at :30):
30 * * * * cd /workspace/phasergun && git pull && npm run build
```

### Option 4: Watch Script (Current Method)

Use deployment script whenever you want to update:
```bash
./deploy-to-droplet.sh 165.227.116.224
```

---

## Best Practices

### ✅ DO

- Always test locally before deploying
- Use `./deploy-to-droplet.sh` for full deploys
- Check `pm2 logs` after deploying
- Save PM2 state after changes: `pm2 save`
- Keep backups before major changes
- Use hard refresh in browser (Ctrl+Shift+R)
- Monitor logs during deploy: `pm2 logs --lines 0`

### ❌ DON'T

- Don't edit files directly on droplet (edit locally, then deploy)
- Don't forget to rebuild after code changes
- Don't skip testing after deploy
- Don't delete PM2 processes without saving first
- Don't restart nginx unnecessarily (use reload)

---

## Summary

**To reload Vue UI in production:**
```bash
ssh root@165.227.116.224
cd /workspace/phasergun/vue-ui
npm run build
# Done! nginx serves the new files immediately
```

**To reload API in production:**
```bash
ssh root@165.227.116.224
pm2 restart meddev-api
```

**To reload everything (recommended):**
```bash
# From local machine
./deploy-to-droplet.sh 165.227.116.224
```

---

## Need Help?

```bash
# Check all services
ssh root@165.227.116.224
pm2 status
systemctl status nginx
ufw status

# Check logs
pm2 logs
tail -f /var/log/nginx/phasergun-error.log

# Test connectivity
curl -I https://phasergun.app
curl http://localhost:3001/api/health
```

**Your app is live at:** https://phasergun.app 🚀
