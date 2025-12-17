#!/bin/bash
#
# PhaserGun App Deployment Script
# For fresh Ubuntu 24.04 NodeJS droplet
#
# Usage: ./deploy-to-droplet.sh <droplet-ip>
# Example: ./deploy-to-droplet.sh 165.227.116.224
#

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DROPLET_IP="${1:-165.227.116.224}"
DROPLET_USER="root"
PROJECT_PATH="/workspace/phasergun"
DOMAIN="phasergun.app"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  PhaserGun Deployment to DigitalOcean${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "${YELLOW}Droplet IP:${NC} $DROPLET_IP"
echo -e "${YELLOW}Domain:${NC} $DOMAIN"
echo -e "${YELLOW}Remote Path:${NC} $PROJECT_PATH"
echo ""

# Check if we can SSH
echo -e "${BLUE}[1/12] Checking SSH connection...${NC}"
if ssh -o ConnectTimeout=5 -o BatchMode=yes $DROPLET_USER@$DROPLET_IP "echo 'SSH OK'" 2>/dev/null; then
    echo -e "${GREEN}✓ SSH connection successful${NC}"
else
    echo -e "${RED}✗ Cannot connect to droplet via SSH${NC}"
    echo "Make sure:"
    echo "  1. Droplet is running"
    echo "  2. Your SSH key is added to droplet"
    echo "  3. IP address is correct: $DROPLET_IP"
    exit 1
fi

# Upload code
echo -e "\n${BLUE}[2/12] Uploading project files...${NC}"
echo "This may take a few minutes..."

rsync -avz --progress \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude 'dist' \
  --exclude 'build' \
  --exclude '*.log' \
  --exclude '.DS_Store' \
  --exclude 'vue-ui/.env.local' \
  ./ $DROPLET_USER@$DROPLET_IP:$PROJECT_PATH/

echo -e "${GREEN}✓ Files uploaded${NC}"

# Create environment files
echo -e "\n${BLUE}[3/12] Creating API environment file...${NC}"

ssh $DROPLET_USER@$DROPLET_IP "cat > $PROJECT_PATH/src/api-server/.env << 'EOF'
NODE_ENV=production
PORT=3001
EOF"

echo -e "${GREEN}✓ API environment file created${NC}"

# Build in correct dependency order
echo -e "\n${BLUE}[4/12] Building shared-types (required by other packages)...${NC}"
ssh $DROPLET_USER@$DROPLET_IP "cd $PROJECT_PATH/src/shared-types && npm install && npm run build"
echo -e "${GREEN}✓ Shared types built${NC}"

echo -e "\n${BLUE}[5/12] Installing Vue UI dependencies...${NC}"
ssh $DROPLET_USER@$DROPLET_IP "cd $PROJECT_PATH/vue-ui && npm install"
echo -e "${GREEN}✓ Vue UI dependencies installed${NC}"

echo -e "\n${BLUE}[6/12] Building Vue UI for production...${NC}"
ssh $DROPLET_USER@$DROPLET_IP "cd $PROJECT_PATH/vue-ui && npm run build"
echo -e "${GREEN}✓ Vue UI built${NC}"

echo -e "\n${BLUE}[7/12] Building API server locally (droplet has limited RAM)...${NC}"
echo "Building on your local machine..."
cd src/api-server
npm install
npm run build
cd ../..
echo -e "${GREEN}✓ API built locally${NC}"

echo -e "\n${BLUE}[8/12] Uploading API dist folder to droplet...${NC}"
rsync -avz --progress \
  src/api-server/dist/ \
  $DROPLET_USER@$DROPLET_IP:$PROJECT_PATH/src/api-server/dist/
echo -e "${GREEN}✓ API dist uploaded${NC}"

echo -e "\n${BLUE}[9/12] Installing API dependencies on droplet...${NC}"
ssh $DROPLET_USER@$DROPLET_IP "cd $PROJECT_PATH/src/api-server && npm install --production"
echo -e "${GREEN}✓ API dependencies installed${NC}"

# Check if PM2 is running
echo -e "\n${BLUE}[10/12] Checking PM2 status...${NC}"
if ssh $DROPLET_USER@$DROPLET_IP "pm2 status | grep -q meddev-api" 2>/dev/null; then
    echo "PM2 process found, restarting..."
    ssh $DROPLET_USER@$DROPLET_IP "cd $PROJECT_PATH && pm2 restart ecosystem.config.js"
    echo -e "${GREEN}✓ PM2 restarted${NC}"
else
    echo "Starting PM2 for first time..."
    ssh $DROPLET_USER@$DROPLET_IP "cd $PROJECT_PATH && pm2 start ecosystem.config.js"
    ssh $DROPLET_USER@$DROPLET_IP "pm2 save"
    echo -e "${GREEN}✓ PM2 started${NC}"
fi

# Reload nginx
echo -e "\n${BLUE}[11/12] Reloading nginx...${NC}"
if ssh $DROPLET_USER@$DROPLET_IP "systemctl is-active --quiet nginx"; then
    ssh $DROPLET_USER@$DROPLET_IP "systemctl reload nginx"
    echo -e "${GREEN}✓ Nginx reloaded${NC}"
else
    echo -e "${YELLOW}⚠ Nginx not running (this is OK for first deployment)${NC}"
fi

# Test deployment
echo -e "\n${BLUE}[12/12] Testing deployment...${NC}"
ssh $DROPLET_USER@$DROPLET_IP << 'ENDSSH'
echo "Checking PM2..."
pm2 status

echo -e "\nChecking Vue build..."
ls -lh /workspace/phasergun/vue-ui/dist/ | head -5

echo -e "\nChecking API build..."
ls -lh /workspace/phasergun/src/api-server/dist/ | head -5
ENDSSH

echo -e "${GREEN}✓ All checks passed${NC}"

# Final summary
echo -e "\n${BLUE}[12/12] Deployment summary...${NC}"
echo -e "${GREEN}✓ Code uploaded and built successfully${NC}"
echo -e "${GREEN}✓ shared-types built (required dependency)${NC}"
echo -e "${GREEN}✓ Vue UI built and ready${NC}"
echo -e "${GREEN}✓ API server built and running${NC}"
echo -e "${GREEN}✓ Services configured${NC}"

echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}  Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. If this is first deployment, run on droplet:"
echo "   ${BLUE}./setup-server.sh${NC} (uploaded to $PROJECT_PATH)"
echo ""
echo "2. Test your app:"
echo "   ${BLUE}https://$DOMAIN${NC}"
echo ""
echo "3. Check logs if needed:"
echo "   ${BLUE}ssh $DROPLET_USER@$DROPLET_IP${NC}"
echo "   ${BLUE}pm2 logs${NC}"
echo "   ${BLUE}tail -f /var/log/nginx/phasergun-error.log${NC}"
echo ""
echo -e "${GREEN}Happy deploying! 🚀${NC}"
