# Fix 502 Bad Gateway Error on Droplet

## The Problem

Your droplet is returning `502 (Bad Gateway)` when accessing:
```
https://phasergun.app/api/folder-structure
```

This means **nginx can't connect to your API server** on port 3001.

## Quick Diagnosis

SSH into your droplet and run these commands:

```bash
# 1. Check if API server is running
pm2 list

# 2. Check API server logs for errors
pm2 logs api-server --lines 50

# 3. Check if API server is listening on port 3001
netstat -tlnp | grep 3001

# 4. Check nginx error logs
tail -50 /var/log/nginx/error.log

# 5. Test API directly (bypass nginx)
curl http://localhost:3001/api/health
```

## Common Causes & Fixes

### Fix 1: API Server Not Running

If `pm2 list` shows api-server is stopped or errored:

```bash
# Try to restart it
pm2 restart api-server

# If that fails, start fresh:
pm2 delete api-server
cd /root/code/poc-decoupled-app
pm2 start ecosystem.config.js

# Save the PM2 configuration
pm2 save
```

### Fix 2: API Server Crashed on Startup

Check the logs for errors:

```bash
pm2 logs api-server --lines 100 --nostream
```

Common startup errors:
- **Missing dependencies**: Run `cd src/api-server && npm install`
- **Missing .env file**: Check if `.env` exists with required variables
- **Port already in use**: Another process is using port 3001
- **Missing build files**: Run `cd src/api-server && npm run build`

### Fix 3: Build Files Missing

The API server needs compiled JavaScript files:

```bash
cd /root/code/poc-decoupled-app/src/api-server
npm install
npm run build

# Verify dist folder exists
ls -la dist/

# Restart PM2
pm2 restart api-server
```

### Fix 4: Wrong Working Directory

Check the PM2 config:

```bash
pm2 describe api-server
```

The `cwd` (current working directory) should be:
```
/root/code/poc-decoupled-app/src/api-server
```

If it's wrong, fix `ecosystem.config.js` and restart.

### Fix 5: Environment Variables Missing

The API server needs these environment variables:

```bash
cd /root/code/poc-decoupled-app/src/api-server

# Check if .env exists
ls -la .env

# If missing, create it:
cat > .env << 'EOF'
PORT=3001
NODE_ENV=production
ANTHROPIC_API_KEY=your_key_here
LLM_MODE=anthropic
EOF

# Restart API server
pm2 restart api-server
```

### Fix 6: Nginx Configuration

Check nginx is properly configured to proxy to port 3001:

```bash
# View nginx config
cat /etc/nginx/sites-available/phasergun.app

# Should contain something like:
location /api/ {
    proxy_pass http://localhost:3001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
}

# Test nginx config
nginx -t

# Reload nginx if config changed
systemctl reload nginx
```

### Fix 7: Port 3001 Already in Use

If something else is using port 3001:

```bash
# Find what's using the port
lsof -i :3001

# Kill the process if needed
kill -9 <PID>

# Or change the port in ecosystem.config.js and .env
```

## Complete Reset Procedure

If nothing else works, do a clean restart:

```bash
# 1. Stop everything
pm2 stop all
pm2 delete all

# 2. Go to project directory
cd /root/code/poc-decoupled-app

# 3. Rebuild API server
cd src/api-server
npm install
npm run build
cd ../..

# 4. Rebuild Vue UI
cd vue-ui
npm install
npm run build
cd ..

# 5. Start everything fresh
pm2 start ecosystem.config.js
pm2 save

# 6. Wait a few seconds for startup
sleep 5

# 7. Check status
pm2 list

# 8. Check logs
pm2 logs --lines 20

# 9. Test API directly
curl http://localhost:3001/api/health

# 10. Test through nginx
curl https://phasergun.app/api/health
```

## Verify It's Fixed

Once the API is running, test these endpoints:

```bash
# 1. Health check
curl https://phasergun.app/api/health

# Should return:
# {"status":"ok","timestamp":"...","dhfMappingLoaded":true}

# 2. Folder structure
curl https://phasergun.app/api/folder-structure

# Should return JSON with folder_structure

# 3. DHF mapping
curl https://phasergun.app/api/dhf-mapping

# Should return JSON with phases
```

## Still Getting 502?

If you've tried everything above and still getting 502, provide these logs:

```bash
# Collect all relevant logs
echo "=== PM2 Status ==="
pm2 list

echo "=== API Server Logs ==="
pm2 logs api-server --lines 50 --nostream

echo "=== Nginx Error Log ==="
tail -50 /var/log/nginx/error.log

echo "=== Port 3001 Status ==="
netstat -tlnp | grep 3001

echo "=== Direct API Test ==="
curl -v http://localhost:3001/api/health
```

Send me the output and I can help diagnose further!

## Quick Test Script

Save this as `test-api-connection.sh` on the droplet:

```bash
#!/bin/bash

echo "Testing API Connection..."
echo ""

# Test 1: Check PM2
echo "1. PM2 Status:"
pm2 list | grep api-server
echo ""

# Test 2: Test localhost
echo "2. Testing localhost:3001..."
curl -s http://localhost:3001/api/health || echo "FAILED: Can't connect to localhost:3001"
echo ""

# Test 3: Test through nginx
echo "3. Testing through nginx..."
curl -s https://phasergun.app/api/health || echo "FAILED: Can't connect through nginx"
echo ""

# Test 4: Check port
echo "4. Port 3001 status:"
netstat -tlnp | grep 3001 || echo "Nothing listening on port 3001"
echo ""

echo "Done!"
```

Run it:
```bash
chmod +x test-api-connection.sh
./test-api-connection.sh
```
