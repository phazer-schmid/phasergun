#!/bin/bash

echo "=== Starting Development Servers with PM2 ==="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Step 1: Pull latest code
echo -e "${YELLOW}[1/4] Pulling latest code...${NC}"
git pull origin main

# Step 2: Install dependencies
echo -e "${YELLOW}[2/4] Installing dependencies...${NC}"
cd src/api-server && npm install && cd ../..
cd vue-ui && npm install && cd ..

# Step 3: Stop any existing PM2 processes
echo -e "${YELLOW}[3/4] Stopping existing processes...${NC}"
pm2 delete all || true

# Step 4: Start dev servers
echo -e "${YELLOW}[4/4] Starting dev servers...${NC}"
pm2 start ecosystem.dev.config.js

# Save PM2 process list
pm2 save

echo ""
echo -e "${GREEN}=== Development Servers Started! ===${NC}"
echo ""
echo "Access your app at:"
echo "  - Vue UI:  http://$(curl -s ifconfig.me):5173"
echo "  - API:     http://$(curl -s ifconfig.me):3001"
echo ""
echo "Useful commands:"
echo "  pm2 status              # Check server status"
echo "  pm2 logs                # View all logs"
echo "  pm2 logs api-server-dev # View API logs"
echo "  pm2 logs vue-ui-dev     # View Vue UI logs"
echo "  pm2 restart all         # Restart both servers"
echo "  pm2 stop all            # Stop both servers"
echo ""
echo "To make PM2 start on server reboot:"
echo "  pm2 startup"
echo "  # Then run the command it outputs"
