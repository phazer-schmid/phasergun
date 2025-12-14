#!/bin/bash
#
# PhaserGun Server Setup Script
# Run this ONCE on a fresh Ubuntu 24.04 NodeJS droplet
#
# Usage: Run on droplet after uploading code
# ssh root@your-droplet-ip
# cd /workspace/phasergun
# chmod +x setup-server.sh
# ./setup-server.sh
#

set -e  # Exit on error

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

DOMAIN="phasergun.app"
EMAIL="your-email@example.com"  # Change this!

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  PhaserGun Server Setup${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}Please run as root (you are logged in as root by default on DO droplets)${NC}"
    exit 1
fi

# Confirm domain
echo -e "${YELLOW}Domain: $DOMAIN${NC}"
echo -e "${YELLOW}Email (for SSL): $EMAIL${NC}"
echo ""
read -p "Is this correct? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Edit this script and change DOMAIN and EMAIL variables"
    exit 1
fi

# Step 1: Update system
echo -e "\n${BLUE}[1/10] Updating system packages...${NC}"
apt update && apt upgrade -y
echo -e "${GREEN}✓ System updated${NC}"

# Step 2: Install dependencies
echo -e "\n${BLUE}[2/10] Installing dependencies...${NC}"
apt install -y nginx certbot python3-certbot-nginx ufw curl build-essential
echo -e "${GREEN}✓ Dependencies installed${NC}"

# Step 3: Verify Node.js
echo -e "\n${BLUE}[3/10] Checking Node.js...${NC}"
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v)
    echo -e "${GREEN}✓ Node.js $NODE_VERSION installed${NC}"
else
    echo -e "${RED}✗ Node.js not found${NC}"
    echo "Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt install -y nodejs
    echo -e "${GREEN}✓ Node.js installed${NC}"
fi

# Step 4: Install PM2
echo -e "\n${BLUE}[4/10] Installing PM2...${NC}"
npm install -g pm2
echo -e "${GREEN}✓ PM2 installed${NC}"

# Step 5: Configure firewall
echo -e "\n${BLUE}[5/10] Configuring firewall...${NC}"
echo -e "${YELLOW}⚠ IMPORTANT: Allowing SSH (port 22) first!${NC}"
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
echo -e "${GREEN}✓ Firewall configured${NC}"
ufw status

# Step 6: Stop nginx for certbot
echo -e "\n${BLUE}[6/10] Preparing for SSL certificate...${NC}"
systemctl stop nginx 2>/dev/null || true
echo -e "${GREEN}✓ Nginx stopped${NC}"

# Step 7: Get SSL certificate
echo -e "\n${BLUE}[7/10] Getting SSL certificate from Let's Encrypt...${NC}"
echo -e "${YELLOW}This will ask for your email and agreement to terms${NC}"

if [ -d "/etc/letsencrypt/live/$DOMAIN" ]; then
    echo -e "${YELLOW}⚠ Certificate already exists for $DOMAIN${NC}"
    echo -e "${GREEN}✓ Skipping certificate generation${NC}"
else
    certbot certonly --standalone \
        --non-interactive \
        --agree-tos \
        --email $EMAIL \
        -d $DOMAIN \
        -d www.$DOMAIN
    
    if [ -d "/etc/letsencrypt/live/$DOMAIN" ]; then
        echo -e "${GREEN}✓ SSL certificate obtained${NC}"
    else
        echo -e "${RED}✗ Failed to get SSL certificate${NC}"
        echo "Check that:"
        echo "  1. Domain DNS is pointing to this server"
        echo "  2. Port 80 is not blocked"
        echo "  3. No other web server is running"
        exit 1
    fi
fi

# Step 8: Configure nginx
echo -e "\n${BLUE}[8/10] Configuring nginx...${NC}"

# Copy config
cp /workspace/phasergun/nginx.conf.template /etc/nginx/sites-available/$DOMAIN

# Enable site
ln -sf /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/

# Remove default
rm -f /etc/nginx/sites-enabled/default

# Test config
if nginx -t; then
    echo -e "${GREEN}✓ Nginx configured${NC}"
else
    echo -e "${RED}✗ Nginx configuration error${NC}"
    exit 1
fi

# Step 9: Start services
echo -e "\n${BLUE}[9/10] Starting services...${NC}"

# Start nginx
systemctl start nginx
systemctl enable nginx
echo -e "${GREEN}✓ Nginx started${NC}"

# Start PM2 (if not already running)
cd /workspace/phasergun
if ! pm2 status | grep -q meddev-api; then
    pm2 start ecosystem.config.js
    pm2 save
    echo -e "${GREEN}✓ PM2 started${NC}"
else
    echo -e "${YELLOW}⚠ PM2 already running${NC}"
fi

# Step 10: Setup PM2 startup (with confirmation)
echo -e "\n${BLUE}[10/10] PM2 startup configuration...${NC}"
echo -e "${YELLOW}This will make PM2 start automatically on boot${NC}"
read -p "Configure PM2 auto-start? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    pm2 startup systemd -u root --hp /root
    pm2 save
    echo -e "${GREEN}✓ PM2 auto-start configured${NC}"
else
    echo -e "${YELLOW}⚠ Skipped PM2 auto-start (you can run 'pm2 startup' manually later)${NC}"
fi

# Final checks
echo -e "\n${BLUE}Running final checks...${NC}"
echo ""
echo "PM2 Status:"
pm2 status
echo ""
echo "Nginx Status:"
systemctl status nginx --no-pager
echo ""
echo "Firewall Status:"
ufw status

# Test local access
echo -e "\n${BLUE}Testing local access...${NC}"
if curl -s -o /dev/null -w "%{http_code}" http://localhost | grep -q "200\|301"; then
    echo -e "${GREEN}✓ Local HTTP works${NC}"
else
    echo -e "${YELLOW}⚠ Local HTTP test failed (might be OK if nginx redirects)${NC}"
fi

# Final message
echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}  Setup Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo ""
echo "1. Test your site:"
echo "   ${BLUE}https://$DOMAIN${NC}"
echo ""
echo "2. Update Google OAuth Console:"
echo "   Go to: ${BLUE}https://console.cloud.google.com/apis/credentials${NC}"
echo "   Add authorized origin: ${BLUE}https://$DOMAIN${NC}"
echo ""
echo "3. Check logs if needed:"
echo "   ${BLUE}pm2 logs${NC}"
echo "   ${BLUE}tail -f /var/log/nginx/phasergun-error.log${NC}"
echo ""
echo "4. To deploy updates in the future, run from your local machine:"
echo "   ${BLUE}./deploy-to-droplet.sh $DOMAIN${NC}"
echo ""
echo -e "${GREEN}Your app should now be live! 🎉${NC}"
echo ""
echo -e "${YELLOW}SSL Certificate Info:${NC}"
certbot certificates
