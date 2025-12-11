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
echo -e "${YELLOW}[1/8] Pulling latest code...${NC}"
git pull origin main
if [ $? -ne 0 ]; then
    echo "Error: git pull failed"
    exit 1
fi

# Step 2: Install root dependencies
echo -e "${YELLOW}[2/8] Installing root dependencies...${NC}"
npm install
if [ $? -ne 0 ]; then
    echo "Error: npm install failed"
    exit 1
fi

# Step 3: Build shared-types FIRST (required by all other packages)
echo -e "${YELLOW}[3/8] Building shared-types...${NC}"
cd src/shared-types
npm run build
if [ $? -ne 0 ]; then
    echo "Error: shared-types build failed"
    exit 1
fi
cd ../..

# Step 4: Build llm-service (required by api-server)
echo -e "${YELLOW}[4/8] Building llm-service...${NC}"
cd src/llm-service
npm run build
if [ $? -ne 0 ]; then
    echo "Error: llm-service build failed"
    exit 1
fi
cd ../..

# Step 5: Build dhf-scanner (required by api-server)
echo -e "${YELLOW}[5/8] Building dhf-scanner...${NC}"
cd src/dhf-scanner
npm run build
if [ $? -ne 0 ]; then
    echo "Error: dhf-scanner build failed"
    exit 1
fi
cd ../..

# Step 6: Build API Server
echo -e "${YELLOW}[6/8] Building API server...${NC}"
cd src/api-server
npm run build
if [ $? -ne 0 ]; then
    echo "Error: API server build failed"
    exit 1
fi
cd ../..

# Step 7: Install and build Vue UI
echo -e "${YELLOW}[7/8] Building Vue UI...${NC}"
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

# Step 8: Restart services (if using PM2)
echo -e "${YELLOW}[8/8] Restarting services...${NC}"
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
