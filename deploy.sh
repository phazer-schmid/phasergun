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

# Step 8: Configure Nginx
echo -e "${YELLOW}[8/10] Configuring Nginx...${NC}"
if command -v nginx &> /dev/null; then
    # Get current directory
    DEPLOY_DIR=$(pwd)
    
    # Get server IP (or use domain if provided)
    SERVER_NAME="${DOMAIN:-$(curl -s ifconfig.me)}"
    
    # Create Nginx config
    sudo tee /etc/nginx/sites-available/meddev-pro > /dev/null <<EOF
server {
    listen 80;
    server_name ${SERVER_NAME};

    # Path to Vue UI dist folder
    root ${DEPLOY_DIR}/vue-ui/dist;
    index index.html;

    # Vue Router support (SPA)
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # API Proxy
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        
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

    # Enable site
    sudo ln -sf /etc/nginx/sites-available/meddev-pro /etc/nginx/sites-enabled/meddev-pro
    
    # Remove default site if it exists
    sudo rm -f /etc/nginx/sites-enabled/default
    
    # Test Nginx configuration
    sudo nginx -t
    if [ $? -ne 0 ]; then
        echo "Error: Nginx configuration test failed"
        exit 1
    fi
    
    echo -e "${GREEN}✓ Nginx configured for ${SERVER_NAME}${NC}"
else
    echo -e "${YELLOW}⚠ Nginx not installed, skipping configuration${NC}"
fi

# Step 9: Restart services (PM2)
echo -e "${YELLOW}[9/10] Restarting services...${NC}"
if command -v pm2 &> /dev/null; then
    pm2 restart ecosystem.config.js || pm2 start ecosystem.config.js
    echo -e "${GREEN}✓ PM2 services restarted${NC}"
else
    echo -e "${YELLOW}⚠ PM2 not installed, skipping PM2 start${NC}"
fi

# Step 10: Reload Nginx
echo -e "${YELLOW}[10/10] Reloading Nginx...${NC}"
if command -v nginx &> /dev/null; then
    sudo systemctl reload nginx
    echo -e "${GREEN}✓ Nginx reloaded${NC}"
fi

echo ""
echo -e "${GREEN}=== Deployment Complete! ===${NC}"
echo ""
echo "Services are now running at:"
echo "  - UI:  http://${SERVER_NAME}"
echo "  - API: http://localhost:3001 (proxied via /api)"
echo ""
echo "Useful commands:"
echo "  - Check PM2 status: pm2 status"
echo "  - View API logs: pm2 logs api-server"
echo "  - View Nginx logs: sudo tail -f /var/log/nginx/error.log"
echo "  - Nginx status: sudo systemctl status nginx"
