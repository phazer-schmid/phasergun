import { ParsedDocument } from '@phasergun/shared-types';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

export class SummaryGenerator {
  extractiveSummary(doc: ParsedDocument, targetWordCount: number = 250): string {
    const content = doc.content;
    const sentences = content.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 20);
    
    if (sentences.length === 0) return content.substring(0, targetWordCount * 5);
    
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been', 'be', 'have', 'has',
      'had', 'do', 'does', 'did', 'will', 'would', 'should', 'could', 'may', 'might', 'must',
      'can', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they']);
    
    const words = content.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/)
      .filter(word => word.length > 3 && !stopWords.has(word));
    
    const wordFreq = new Map<string, number>();
    words.forEach(word => wordFreq.set(word, (wordFreq.get(word) || 0) + 1));
    
    const sentenceScores = sentences.map(sentence => {
      const sentenceWords = sentence.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/)
        .filter(word => word.length > 3 && !stopWords.has(word));
      
      let score = 0;
      sentenceWords.forEach(word => score += wordFreq.get(word) || 0);
      const normalizedScore = sentenceWords.length > 0 ? score / sentenceWords.length : 0;
      
      return { sentence, score: normalizedScore };
    });
    
    sentenceScores.sort((a, b) => b.score - a.score);
    
    const selectedSentences: string[] = [];
    let currentWordCount = 0;
    
    for (const item of sentenceScores) {
      const sentenceWords = item.sentence.split(/\s+/).length;
      if (currentWordCount + sentenceWords > targetWordCount * 1.2) break;
      
      selectedSentences.push(item.sentence);
      currentWordCount += sentenceWords;
      
      if (currentWordCount >= targetWordCount) break;
    }
    
    if (selectedSentences.length === 0) selectedSentences.push(sentences[0]);
    
    const sentenceOrder = new Map<string, number>();
    sentences.forEach((s, idx) => sentenceOrder.set(s, idx));
    
    selectedSentences.sort((a, b) => (sentenceOrder.get(a) || 0) - (sentenceOrder.get(b) || 0));
    
    return selectedSentences.join('. ') + '.';
  }

  async generateSOPSummaries(
    proceduresFiles: ParsedDocument[],
    projectPath: string,
    summaryWordCount: number = 250
  ): Promise<Map<string, string>> {
    const summaryCache = new Map<string, string>();
    if (proceduresFiles.length === 0) return summaryCache;
    
    console.log('[SummaryGenerator] Generating SOP summaries...');
    
    const cachePath = this.getSOPSummariesCachePath(projectPath);
    let cached: any = {};
    
    try {
      const cacheData = await fs.readFile(cachePath, 'utf-8');
      cached = JSON.parse(cacheData);
      
      for (const doc of proceduresFiles) {
        const hash = this.hashContent(doc.content);
        if (cached[doc.fileName] && cached[doc.fileName].hash === hash) {
          summaryCache.set(doc.fileName, cached[doc.fileName].summary);
          console.log(`[SummaryGenerator] ✓ Using cached summary for ${doc.fileName}`);
        }
      }
    } catch {
      console.log('[SummaryGenerator] No existing summary cache found');
    }
    
    for (const doc of proceduresFiles) {
      if (!summaryCache.has(doc.fileName)) {
        console.log(`[SummaryGenerator] Summarizing ${doc.fileName}...`);
        const summary = this.extractiveSummary(doc, summaryWordCount);
        summaryCache.set(doc.fileName, summary);
      }
    }
    
    const cacheData: any = {};
    for (const doc of proceduresFiles) {
      const summary = summaryCache.get(doc.fileName);
      if (summary) {
        const hash = this.hashContent(doc.content);
        const existingEntry = cached[doc.fileName];
        const generatedAt = (existingEntry && existingEntry.hash === hash) 
          ? existingEntry.generatedAt : new Date().toISOString();
        
        cacheData[doc.fileName] = { hash, summary, generatedAt };
      }
    }
    
    try {
      await fs.mkdir(path.dirname(cachePath), { recursive: true });
      await fs.writeFile(cachePath, JSON.stringify(cacheData, null, 2));
    } catch (error) {
      console.warn('[SummaryGenerator] Failed to save SOP summaries cache (non-fatal)');
    }
    
    console.log('[SummaryGenerator] ✓ SOP summaries complete');
    return summaryCache;
  }

  async generateContextSummaries(
    contextFiles: { doc: ParsedDocument; contextCategory: string }[],
    projectPath: string,
    summaryWordCount: number = 250
  ): Promise<Map<string, string>> {
    const summaryCache = new Map<string, string>();
    if (contextFiles.length === 0) return summaryCache;
    
    console.log('[SummaryGenerator] Generating Context file summaries...');
    
    const cachePath = this.getContextSummariesCachePath(projectPath);
    let cached: any = {};
    
    try {
      const cacheData = await fs.readFile(cachePath, 'utf-8');
      cached = JSON.parse(cacheData);
      
      for (const { doc } of contextFiles) {
        const hash = this.hashContent(doc.content);
        if (cached[doc.fileName] && cached[doc.fileName].hash === hash) {
          summaryCache.set(doc.fileName, cached[doc.fileName].summary);
          console.log(`[SummaryGenerator] ✓ Using cached summary for ${doc.fileName}`);
        }
      }
    } catch {
      console.log('[SummaryGenerator] No existing context summary cache found');
    }
    
    for (const { doc } of contextFiles) {
      if (!summaryCache.has(doc.fileName)) {
        console.log(`[SummaryGenerator] Summarizing ${doc.fileName}...`);
        const summary = this.extractiveSummary(doc, summaryWordCount);
        summaryCache.set(doc.fileName, summary);
      }
    }
    
    const cacheData: any = {};
    for (const { doc } of contextFiles) {
      const summary = summaryCache.get(doc.fileName);
      if (summary) {
        const hash = this.hashContent(doc.content);
        const existingEntry = cached[doc.fileName];
        const generatedAt = (existingEntry && existingEntry.hash === hash) 
          ? existingEntry.generatedAt : new Date().toISOString();
        
        cacheData[doc.fileName] = { hash, summary, generatedAt };
      }
    }
    
    try {
      await fs.mkdir(path.dirname(cachePath), { recursive: true });
      await fs.writeFile(cachePath, JSON.stringify(cacheData, null, 2));
    } catch (error) {
      console.warn('[SummaryGenerator] Failed to save Context summaries cache (non-fatal)');
    }
    
    console.log('[SummaryGenerator] ✓ Context file summaries complete');
    return summaryCache;
  }

  hashContent(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  private getSOPSummariesCachePath(projectPath: string): string {
    const os = require('os');
    const tempBase = os.tmpdir();
    const cacheBaseName = crypto.createHash('md5').update(projectPath).digest('hex').substring(0, 8);
    return path.join(tempBase, 'phasergun-cache', 'sop-summaries', cacheBaseName, 'sop-summaries.json');
  }

  private getContextSummariesCachePath(projectPath: string): string {
    const os = require('os');
    const tempBase = os.tmpdir();
    const cacheBaseName = crypto.createHash('md5').update(projectPath).digest('hex').substring(0, 8);
    return path.join(tempBase, 'phasergun-cache', 'context-summaries', cacheBaseName, 'context-summaries.json');
  }
}
