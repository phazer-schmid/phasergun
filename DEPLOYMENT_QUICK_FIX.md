# Digital Ocean Deployment Quick Fix

## Current Issue
The IP detection in deploy.sh failed, showing empty `http://`. Here's how to fix it and access your app.

---

## Step 1: Clean Up Old PM2 Process

```bash
# Delete the old stopped vue-app process
pm2 delete vue-app

# Save PM2 process list
pm2 save

# Check status - should only show meddev-api
pm2 status
```

---

## Step 2: Manually Configure Nginx

Since IP detection failed, let's manually create the Nginx config:

```bash
# Create Nginx configuration
sudo tee /etc/nginx/sites-available/meddev-pro > /dev/null <<'EOF'
server {
    listen 80;
    server_name 165.227.116.224;

    # Path to Vue UI dist folder
    root /workspace/phasergun/vue-ui/dist;
    index index.html;

    # Vue Router support (SPA)
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API Proxy
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
        
        # Timeouts for large file analysis
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/json;
    gzip_min_length 1000;

    # Cache static assets
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
EOF

# Enable the site
sudo ln -sf /etc/nginx/sites-available/meddev-pro /etc/nginx/sites-enabled/meddev-pro

# Remove default site
sudo rm -f /etc/nginx/sites-enabled/default

# Test Nginx configuration
sudo nginx -t

# If test passes, restart Nginx
sudo systemctl restart nginx

# Check Nginx status
sudo systemctl status nginx
```

---

## Step 3: Verify Everything is Running

```bash
# Check PM2 (API server)
pm2 status
# Should show meddev-api as "online"

# Check Nginx
sudo systemctl status nginx
# Should show "active (running)"

# Check if Vue UI files exist
ls -la /workspace/phasergun/vue-ui/dist/
# Should show index.html and assets folder
```

---

## Step 4: Access Your App

Open a browser and go to:

**http://165.227.116.224**

You should see your Vue UI!

---

## Troubleshooting

### If You Get 404 or Nginx Error

Check Nginx logs:
```bash
sudo tail -f /var/log/nginx/error.log
```

Check if dist folder exists:
```bash
ls -la /workspace/phasergun/vue-ui/dist/
```

If missing, rebuild Vue UI:
```bash
cd /workspace/phasergun/vue-ui
npm install
npm run build
sudo systemctl reload nginx
```

### If API Calls Fail

Check API server logs:
```bash
pm2 logs meddev-api --lines 50
```

Restart API server:
```bash
pm2 restart meddev-api
```

### If Port 80 is Busy

Check what's using port 80:
```bash
sudo lsof -i :80
```

---

## Understanding the Setup

### Production Architecture

```
Browser (http://165.227.116.224)
    ↓
Nginx (Port 80)
    ├─ Serves: /workspace/phasergun/vue-ui/dist/* (Vue UI)
    └─ Proxies: /api/* → localhost:3001 (PM2 API server)
```

### What Runs Where

- **Nginx**: Serves Vue UI static files on port 80
- **PM2**: Runs API server on port 3001 (background daemon)
- **No PM2 for UI**: UI is pre-built and served by Nginx!

---

## Quick Commands Reference

```bash
# PM2
pm2 status                    # Check status
pm2 logs meddev-api          # View logs
pm2 restart meddev-api       # Restart API
pm2 save                     # Save process list

# Nginx
sudo systemctl status nginx   # Check status
sudo systemctl restart nginx  # Restart Nginx
sudo nginx -t                # Test config
sudo tail -f /var/log/nginx/error.log  # View logs

# Check if services are listening
sudo lsof -i :80             # Nginx
sudo lsof -i :3001           # API server
```

---

## Success!

Once you complete these steps, you should be able to access:
- **UI**: http://165.227.116.224
- **API**: http://165.227.116.224/api (proxied by Nginx)

No more CORS errors, no more port 5174! 🚀
