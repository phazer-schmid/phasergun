#!/bin/bash

echo "=== MedDev Pro Deployment Script ==="
echo "Target: Digital Ocean Droplet"
echo "Services: API Server + Vue UI"
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Step 1: Pull latest code
echo -e "${YELLOW}[1/6] Pulling latest code...${NC}"
git pull origin main
if [ $? -ne 0 ]; then
    echo "Error: git pull failed"
    exit 1
fi

# Step 2: Install root dependencies
echo -e "${YELLOW}[2/6] Installing root dependencies...${NC}"
npm install
if [ $? -ne 0 ]; then
    echo "Error: npm install failed"
    exit 1
fi

# Step 3: Build shared packages
echo -e "${YELLOW}[3/6] Building shared packages...${NC}"
npm run build-packages
if [ $? -ne 0 ]; then
    echo "Error: build-packages failed"
    exit 1
fi

# Step 4: Build API Server
echo -e "${YELLOW}[4/6] Building API server...${NC}"
cd src/api-server
npm run build
if [ $? -ne 0 ]; then
    echo "Error: API server build failed"
    exit 1
fi
cd ../..

# Step 5: Install and build Vue UI
echo -e "${YELLOW}[5/6] Building Vue UI...${NC}"
cd vue-ui
rm -rf node_modules  # Clean install to remove old dependencies
npm install
if [ $? -ne 0 ]; then
    echo "Error: Vue UI npm install failed"
    exit 1
fi
npm run build
if [ $? -ne 0 ]; then
    echo "Error: Vue UI build failed"
    exit 1
fi
cd ..

# Step 6: Restart services (if using PM2)
echo -e "${YELLOW}[6/6] Restarting services...${NC}"
if command -v pm2 &> /dev/null; then
    pm2 restart ecosystem.config.js || pm2 start ecosystem.config.js
    echo -e "${GREEN}✓ PM2 services restarted${NC}"
fi

# If using Nginx
if command -v nginx &> /dev/null; then
    sudo systemctl reload nginx
    echo -e "${GREEN}✓ Nginx reloaded${NC}"
fi

echo ""
echo -e "${GREEN}=== Deployment Complete! ===${NC}"
echo ""
echo "Services should be running at:"
echo "  - API: http://localhost:3001"
echo "  - UI:  http://your-domain.com (via Nginx)"
echo ""
echo "Check status with: pm2 status"
echo "View logs with: pm2 logs"
