/**
 * Database interface for storing validation results
 */

import { Pool } from 'pg';

export interface DBConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

export class ValidationDatabase {
  private pool: Pool;
  
  constructor(config: DBConfig) {
    this.pool = new Pool(config);
  }
  
  async initialize() {
    // Create tables
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS file_analysis_results (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        file_id VARCHAR(255),
        file_name VARCHAR(255),
        file_path TEXT,
        category_path VARCHAR(255),
        phase INTEGER,
        checks JSONB,
        total_checks INTEGER,
        passed INTEGER,
        failed INTEGER,
        critical_issues INTEGER,
        high_issues INTEGER,
        status VARCHAR(50),
        analyzed_at TIMESTAMP DEFAULT NOW(),
        analyzed_by VARCHAR(255),
        dhf_version VARCHAR(50),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS category_analysis_results (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        category_path VARCHAR(255),
        phase INTEGER,
        file_result_ids UUID[],
        checks JSONB,
        total_files INTEGER,
        files_analyzed INTEGER,
        total_checks INTEGER,
        passed INTEGER,
        failed INTEGER,
        critical_issues INTEGER,
        high_issues INTEGER,
        status VARCHAR(50),
        analyzed_at TIMESTAMP DEFAULT NOW(),
        dhf_version VARCHAR(50),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    console.log('✓ Database initialized');
  }
  
  async storeFileResult(result: any): Promise<string> {
    const query = `
      INSERT INTO file_analysis_results (
        file_id, file_name, file_path, category_path, phase,
        checks, total_checks, passed, failed, critical_issues, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id
    `;
    
    const values = [
      result.fileId,
      result.fileName,
      result.filePath,
      result.categoryPath,
      result.phase,
      JSON.stringify(result.checks),
      result.summary.totalChecks,
      result.summary.passed,
      result.summary.failed,
      result.summary.criticalIssues,
      result.status
    ];
    
    const res = await this.pool.query(query, values);
    return res.rows[0].id;
  }
  
  async getPhaseProgress(phase: number): Promise<any> {
    const query = `
      SELECT 
        category_path,
        status,
        total_checks,
        passed,
        critical_issues,
        analyzed_at
      FROM category_analysis_results
      WHERE phase = $1
      ORDER BY category_path
    `;
    
    const res = await this.pool.query(query, [phase]);
    return res.rows;
  }
  
  async getDHFProgress(): Promise<any> {
    const query = `
      SELECT 
        phase,
        COUNT(*) as categories,
        SUM(total_checks) as total_checks,
        SUM(passed) as passed,
        SUM(critical_issues) as critical_issues
      FROM category_analysis_results
      GROUP BY phase
      ORDER BY phase
    `;
    
    const res = await this.pool.query(query);
    return res.rows;
  }
}
