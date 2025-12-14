# Hot-Reload Development Guide

## ✅ Hot-Reload is NOW ENABLED for API Server

Your api-server will automatically restart when you make code changes in the `src/api-server/src/` directory.

## How It Works

### No Rebuild Required! 🎉

- **ts-node** compiles TypeScript on-the-fly (no pre-compilation needed)
- **PM2 watch mode** automatically restarts the server when files change
- **Google Drive libraries** (googleapis) don't need rebuilding - they're already compiled in node_modules

### What Gets Watched

PM2 watches the `src/` directory for changes and automatically restarts the api-server when you:
- Modify any `.ts` files
- Add new files
- Delete files

### What Gets Ignored

These directories/files are ignored to prevent unnecessary restarts:
- `node_modules/` (dependencies)
- `logs/` and `*.log` files
- `dist/` (compiled output)
- `.git/` (version control)
- `*.tsbuildinfo` (TypeScript build info)

## Usage

### Start Development Servers

```bash
./start-dev.sh
```

Or manually with PM2:
```bash
pm2 start ecosystem.dev.config.js
```

### Make Changes

1. Edit any file in `src/api-server/src/`
2. Save the file
3. **PM2 automatically restarts the server** (watch the logs!)
4. Your changes are live in ~1-2 seconds

### Monitor the Restart

```bash
# Watch all logs
pm2 logs

# Watch only api-server logs
pm2 logs api-server-dev

# Check server status
pm2 status
```

### Typical Restart Time

- **~1-2 seconds** - Fast since ts-node compiles on-the-fly
- No need to rebuild the entire project or Google Drive libraries

## Troubleshooting

### Server Not Restarting?

1. Check if watch mode is active:
   ```bash
   pm2 describe api-server-dev
   ```
   Look for "watch & reload" status

2. Manually restart if needed:
   ```bash
   pm2 restart api-server-dev
   ```

3. Restart all services:
   ```bash
   pm2 restart all
   ```

### Too Many Restarts?

If the server restarts too frequently, check that you're not editing:
- Log files
- Generated files
- Files in ignored directories

## Performance Notes

- **ts-node** is slightly slower than pre-compiled JavaScript, but fast enough for development
- **Watch mode** uses file system events (not polling) for efficiency
- **Google Drive libraries** are pre-compiled in node_modules, so they load quickly

## Production vs Development

- **Development** (this setup): Uses ts-node with hot-reload
- **Production**: Uses pre-compiled JavaScript from `dist/` (run `npm run build` first)

---

Last Updated: December 14, 2025
