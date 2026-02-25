#!/bin/bash

set -e

echo "🔧 Rebuilding sharp..."
npm install --include=optional sharp
npm rebuild sharp

echo "🔄 Reloading nginx..."
sudo systemctl reload nginx

echo "♻️  Restarting PM2..."
pm2 delete all
pm2 flush
pm2 start ecosystem.config.js

echo "✅ Done!"
