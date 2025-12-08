/**
 * Main entry point for DHF RAG Validation System
 */

import { DHFValidationEngine } from './validation-engine';
import { ValidationDatabase } from './database';
import * as dotenv from 'dotenv';

dotenv.config();

export class DHFValidationSystem {
  private engine: DHFValidationEngine;
  private database: ValidationDatabase;
  
  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY not set');
    }
    
    this.engine = new DHFValidationEngine(apiKey);
    
    this.database = new ValidationDatabase({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'dhf_validation',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || ''
    });
  }
  
  async initialize() {
    await this.database.initialize();
    console.log('✓ DHF Validation System initialized');
  }
  
  // Expose engine and database
  getEngine() {
    return this.engine;
  }
  
  getDatabase() {
    return this.database;
  }
}

// Example usage
if (require.main === module) {
  const system = new DHFValidationSystem();
  system.initialize().then(() => {
    console.log('System ready!');
  });
}

export * from './validation-engine';
export * from './database';
