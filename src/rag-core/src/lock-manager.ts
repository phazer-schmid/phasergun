/**
 * Lock Manager for Cache Operations
 * Prevents concurrent cache rebuilds using file-based locks
 */

import * as lockfile from 'proper-lockfile';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

/**
 * Lock handle with release method
 */
export interface Lock {
  release: () => Promise<void>;
  lockPath: string;
}

/**
 * Lock options
 */
export interface LockOptions {
  stale?: number;           // Lock expires after this many ms (default: 60000)
  retries?: number;         // Number of retries (default: 10)
  minTimeout?: number;      // Min wait between retries (default: 500ms)
  maxTimeout?: number;      // Max wait between retries (default: 3000ms)
}

/**
 * Lock Manager for coordinating cache operations
 */
export class LockManager {
  private locks: Map<string, Promise<Lock>> = new Map();
  private defaultOptions: Required<LockOptions>;

  constructor(options?: LockOptions) {
    this.defaultOptions = {
      stale: options?.stale ?? 60000,        // 60 seconds
      retries: options?.retries ?? 10,       // 10 retries
      minTimeout: options?.minTimeout ?? 500, // 500ms min
      maxTimeout: options?.maxTimeout ?? 3000 // 3s max
    };
  }

  /**
   * Get lock file path for a project
   */
  private getLockFilePath(projectPath: string): string {
    const tempBase = os.tmpdir();
    const cacheBaseName = crypto.createHash('md5').update(projectPath).digest('hex').substring(0, 8);
    const lockDir = path.join(tempBase, 'phasergun-cache', 'locks', cacheBaseName);
    return path.join(lockDir, 'cache-build.lock');
  }

  /**
   * Acquire a lock for cache operations
   * @param projectPath - Project path to lock
   * @param options - Lock options (overrides defaults)
   * @returns Lock handle with release() method
   */
  async acquireLock(projectPath: string, options?: LockOptions): Promise<Lock> {
    const lockPath = this.getLockFilePath(projectPath);
    const lockKey = projectPath;

    console.log(`[LockManager] 🔒 Attempting to acquire lock for project: ${path.basename(projectPath)}`);
    console.log(`[LockManager] 📁 Lock file: ${lockPath}`);

    // Check if we already have a lock acquisition in progress for this project
    if (this.locks.has(lockKey)) {
      console.log(`[LockManager] ⏳ Lock acquisition already in progress, waiting...`);
      return await this.locks.get(lockKey)!;
    }

    // Create lock acquisition promise
    const lockPromise = this.doAcquireLock(projectPath, lockPath, options);
    this.locks.set(lockKey, lockPromise);

    try {
      const lock = await lockPromise;
      return lock;
    } catch (error) {
      this.locks.delete(lockKey);
      throw error;
    }
  }

  /**
   * Actually acquire the lock (internal)
   */
  private async doAcquireLock(
    projectPath: string,
    lockPath: string,
    options?: LockOptions
  ): Promise<Lock> {
    // Merge options
    const opts = { ...this.defaultOptions, ...options };

    // Ensure lock directory exists
    const lockDir = path.dirname(lockPath);
    await fs.mkdir(lockDir, { recursive: true });

    // Ensure lock file exists (lockfile library requires it)
    try {
      await fs.access(lockPath);
    } catch {
      // Create empty lock file if it doesn't exist
      await fs.writeFile(lockPath, '', 'utf8');
    }

    // Try to acquire lock with retries
    const startTime = Date.now();
    let attempt = 0;

    while (attempt < opts.retries) {
      try {
        // Attempt to acquire lock
        const releaseFn = await lockfile.lock(lockPath, {
          stale: opts.stale,
          retries: {
            retries: 0, // We handle retries ourselves for better logging
          }
        });

        const waitTime = Date.now() - startTime;
        console.log(`[LockManager] ✅ Lock acquired after ${waitTime}ms (attempt ${attempt + 1}/${opts.retries})`);

        // Create lock handle
        const lock: Lock = {
          lockPath,
          release: async () => {
            try {
              await releaseFn();
              this.locks.delete(projectPath);
              console.log(`[LockManager] 🔓 Lock released for project: ${path.basename(projectPath)}`);
            } catch (error) {
              console.error(`[LockManager] ⚠️  Error releasing lock:`, error);
              // Still remove from tracking
              this.locks.delete(projectPath);
            }
          }
        };

        return lock;
      } catch (error: any) {
        attempt++;
        
        if (attempt >= opts.retries) {
          const totalTime = Date.now() - startTime;
          console.error(`[LockManager] ❌ Failed to acquire lock after ${opts.retries} attempts (${totalTime}ms)`);
          throw new Error(`Failed to acquire lock for ${projectPath} after ${opts.retries} attempts`);
        }

        // Exponential backoff
        const waitTime = Math.min(
          opts.minTimeout * Math.pow(2, attempt - 1),
          opts.maxTimeout
        );

        console.log(`[LockManager] ⏳ Lock busy, retrying in ${waitTime}ms (attempt ${attempt}/${opts.retries})...`);
        await this.sleep(waitTime);
      }
    }

    throw new Error('Unexpected: Lock acquisition loop exited');
  }

  /**
   * Check if a lock is currently held for a project
   */
  async isLocked(projectPath: string): Promise<boolean> {
    const lockPath = this.getLockFilePath(projectPath);
    
    try {
      await fs.access(lockPath);
      // Lock file exists, check if it's actually locked
      return await lockfile.check(lockPath);
    } catch {
      // Lock file doesn't exist
      return false;
    }
  }

  /**
   * Manually release a stale lock (use with caution)
   */
  async releaseStale(projectPath: string): Promise<void> {
    const lockPath = this.getLockFilePath(projectPath);
    
    try {
      await lockfile.unlock(lockPath);
      console.log(`[LockManager] 🔓 Stale lock released for: ${path.basename(projectPath)}`);
    } catch (error) {
      console.error(`[LockManager] ⚠️  Error releasing stale lock:`, error);
    }
  }

  /**
   * Get all currently tracked locks
   */
  getActiveLocks(): string[] {
    return Array.from(this.locks.keys());
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Clean up all locks (for graceful shutdown)
   */
  async cleanup(): Promise<void> {
    console.log(`[LockManager] 🧹 Cleaning up ${this.locks.size} active locks...`);
    
    const cleanupPromises = Array.from(this.locks.entries()).map(async ([key, lockPromise]) => {
      try {
        const lock = await lockPromise;
        await lock.release();
      } catch (error) {
        console.error(`[LockManager] ⚠️  Error cleaning up lock for ${key}:`, error);
      }
    });

    await Promise.all(cleanupPromises);
    this.locks.clear();
    
    console.log(`[LockManager] ✅ Cleanup complete`);
  }
}

// Singleton instance
let lockManagerInstance: LockManager | null = null;

/**
 * Get or create LockManager singleton
 */
export function getLockManager(options?: LockOptions): LockManager {
  if (!lockManagerInstance) {
    lockManagerInstance = new LockManager(options);
  }
  return lockManagerInstance;
}

/**
 * Export for testing/cleanup
 */
export function resetLockManager(): void {
  lockManagerInstance = null;
}
