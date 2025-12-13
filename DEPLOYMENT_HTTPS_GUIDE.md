# HTTPS Deployment Guide for phasergun.app

Complete step-by-step guide to deploy your Vue app with HTTPS on DigitalOcean.

---

## Prerequisites

- ✅ Domain name pointing to your droplet IP (phasergun.app → 165.227.116.224)
- ✅ SSH access to your droplet
- ✅ Project code at `/workspace/phasergun`

---

## Step 1: Install Required Software

SSH to your droplet and run:

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install nginx
sudo apt install nginx -y

# Install Node.js and npm (if not already)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install nodejs -y

# Install PM2 globally
sudo npm install -g pm2

# Install certbot for SSL
sudo apt install certbot python3-certbot-nginx -y
```

---

## Step 2: Build Vue Application (Production Mode)

```bash
# Navigate to project
cd /workspace/phasergun/vue-ui

# Install dependencies
npm install

# Build for production
npm run build

# Verify dist folder was created
ls -la dist/
# Should show: index.html, assets/, etc.
```

---

## Step 3: Get SSL Certificate

```bash
# Get SSL certificate from Let's Encrypt
sudo certbot certonly --nginx -d phasergun.app -d www.phasergun.app

# Follow prompts:
# - Enter email address
# - Agree to terms (Y)
# - Share email with EFF (optional)

# Certificates will be saved at:
# /etc/letsencrypt/live/phasergun.app/fullchain.pem
# /etc/letsencrypt/live/phasergun.app/privkey.pem
```

---

## Step 4: Configure Nginx

```bash
# Copy template to nginx sites
cd /workspace/phasergun
sudo cp nginx.conf.template /etc/nginx/sites-available/phasergun.app

# Optional: Edit if needed (paths should be correct)
sudo nano /etc/nginx/sites-available/phasergun.app

# Enable the site
sudo ln -sf /etc/nginx/sites-available/phasergun.app /etc/nginx/sites-enabled/

# Remove default site
sudo rm -f /etc/nginx/sites-enabled/default

# Test nginx configuration
sudo nginx -t

# Should output:
# nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
# nginx: configuration file /etc/nginx/nginx.conf test is successful
```

---

## Step 5: Start API Server with PM2

```bash
# Navigate to project root
cd /workspace/phasergun

# Build API server (if needed)
cd src/api-server
npm install
npm run build

# Start PM2
cd /workspace/phasergun
pm2 start ecosystem.config.js

# Save PM2 process list
pm2 save

# Setup PM2 to start on boot
pm2 startup
# Run the command it outputs (starts with sudo)

# Check status
pm2 status
# Should show: meddev-api running
```

---

## Step 6: Start/Reload Nginx

```bash
# Reload nginx with new config
sudo systemctl reload nginx

# Or restart if needed
sudo systemctl restart nginx

# Check status
sudo systemctl status nginx

# Should show: active (running)
```

---

## Step 7: Update Firewall

```bash
# Allow HTTP and HTTPS through firewall
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Check firewall status
sudo ufw status

# Should show:
# 80/tcp    ALLOW   Anywhere
# 443/tcp   ALLOW   Anywhere
```

---

## Step 8: Update Google OAuth Console

1. Go to: https://console.cloud.google.com/apis/credentials
2. Click your OAuth 2.0 Client ID
3. Under **"Authorized JavaScript origins"**, remove old entries and add:
   ```
   https://phasergun.app
   https://www.phasergun.app
   ```
4. Click **Save**
5. Wait 60 seconds for changes to propagate

---

## Step 9: Update Environment Variables

```bash
# Update vue-ui .env for production domain
cd /workspace/phasergun/vue-ui
nano .env

# Should contain:
VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
VITE_GOOGLE_API_KEY=your-api-key

# For production build, you'll need to rebuild after changing .env:
npm run build
```

---

## Step 10: Test Deployment

```bash
# Test from droplet
curl -I https://phasergun.app

# Should return:
# HTTP/2 200
# content-type: text/html

# Test HTTP redirect
curl -I http://phasergun.app

# Should return:
# HTTP/1.1 301 Moved Permanently
# Location: https://phasergun.app/

# Test API endpoint
curl -I https://phasergun.app/api/health

# Should return 200 if health endpoint exists
```

---

## Step 11: Verify in Browser

1. Open browser to: **https://phasergun.app**
2. Should see your Vue app (not nginx welcome page)
3. Check browser console for errors (F12)
4. Test Google Drive folder picker
5. Verify HTTPS padlock icon in browser

---

## Troubleshooting

### Issue: Still seeing nginx welcome page

**Solution:**
```bash
# Check if dist folder exists and has files
ls -la /workspace/phasergun/vue-ui/dist/

# If empty or missing, rebuild
cd /workspace/phasergun/vue-ui
npm run build

# Reload nginx
sudo systemctl reload nginx
```

### Issue: SSL certificate errors

**Solution:**
```bash
# Check certificate files exist
sudo ls -la /etc/letsencrypt/live/phasergun.app/

# If missing, get new certificate
sudo certbot certonly --nginx -d phasergun.app -d www.phasergun.app
```

### Issue: 502 Bad Gateway on /api routes

**Solution:**
```bash
# Check if API server is running
pm2 status

# If not running, start it
cd /workspace/phasergun
pm2 start ecosystem.config.js

# Check API logs
pm2 logs meddev-api
```

### Issue: Google OAuth not working

**Solutions:**
1. Verify OAuth origins include `https://phasergun.app`
2. Check browser console for specific error
3. Verify .env has correct Client ID and API Key
4. Rebuild Vue app after changing .env: `npm run build`

---

## Development Mode (Optional)

If you want hot-reload for development:

### 1. Update ecosystem.config.js

Uncomment the Vue UI dev server section:
```javascript
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
  }
}
```

### 2. Update nginx config

```bash
sudo nano /etc/nginx/sites-available/phasergun.app

# Comment out Option 1 (Production)
# Uncomment Option 2 (Development)
```

### 3. Update vite.config.ts

```typescript
server: {
  port: 5173,
  host: '0.0.0.0',
  allowedHosts: [
    'phasergun.app',
    'www.phasergun.app'
  ]
}
```

### 4. Restart services

```bash
cd /workspace/phasergun
pm2 restart ecosystem.config.js
sudo systemctl reload nginx
```

---

## SSL Certificate Renewal

Let's Encrypt certificates expire after 90 days. Set up auto-renewal:

```bash
# Test renewal
sudo certbot renew --dry-run

# Should output: Congratulations, all renewals succeeded

# Certbot automatically sets up cron job for renewal
# Check cron job
sudo systemctl status certbot.timer
```

---

## Useful Commands

```bash
# Check nginx error logs
sudo tail -f /var/log/nginx/phasergun-error.log

# Check nginx access logs
sudo tail -f /var/log/nginx/phasergun-access.log

# Check PM2 logs
pm2 logs

# Restart everything
pm2 restart all
sudo systemctl reload nginx

# Check what's running on ports
sudo netstat -tulpn | grep LISTEN
```

---

## Production Checklist

- [ ] Vue app built (`npm run build` in vue-ui)
- [ ] SSL certificate obtained (`certbot`)
- [ ] Nginx configured and tested (`nginx -t`)
- [ ] API server running (`pm2 status`)
- [ ] Firewall allows 80/443 (`ufw status`)
- [ ] Google OAuth updated with HTTPS origin
- [ ] Environment variables set correctly
- [ ] HTTPS works in browser
- [ ] HTTP redirects to HTTPS
- [ ] API endpoints work
- [ ] Google Drive picker works

---

## Quick Deployment Script

Save this as `deploy-production.sh`:

```bash
#!/bin/bash
set -e

echo "🚀 Deploying PhaserGun App..."

# Build Vue app
echo "📦 Building Vue app..."
cd /workspace/phasergun/vue-ui
npm install
npm run build

# Build API server
echo "📦 Building API server..."
cd /workspace/phasergun/src/api-server
npm install
npm run build

# Restart PM2
echo "🔄 Restarting API server..."
cd /workspace/phasergun
pm2 restart ecosystem.config.js

# Reload nginx
echo "🔄 Reloading nginx..."
sudo systemctl reload nginx

echo "✅ Deployment complete!"
echo "🌐 Visit: https://phasergun.app"
```

Make executable and run:
```bash
chmod +x deploy-production.sh
./deploy-production.sh
```

---

## Need Help?

- **Nginx logs**: `/var/log/nginx/phasergun-error.log`
- **PM2 logs**: `pm2 logs meddev-api`
- **SSL issues**: `sudo certbot certificates`
- **Test config**: `sudo nginx -t`

---

**Your site should now be live at: https://phasergun.app** 🎉
