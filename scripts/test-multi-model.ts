/**
 * Multi-Model Pipeline Smoke Test
 * ================================
 * Exercises ModelRouter (DRAFT → optional AUDIT) without needing a real
 * project folder or RAG context.  Useful for confirming API keys, model
 * assignments, and Azure Foundry routing are correct before running a
 * full generation request.
 *
 * ── Quick Start ──────────────────────────────────────────────────────────────
 *
 * Direct OpenAI:
 *   export OPENAI_API_KEY=sk-...
 *   export PROVIDER_MODE=direct
 *   npm run test:multi-model
 *
 * Direct Anthropic (Sonnet as DRAFTER):
 *   export ANTHROPIC_API_KEY=sk-ant-...
 *   export PROVIDER_MODE=direct
 *   export MODEL_DRAFTER=claude-sonnet-4-20250514
 *   npm run test:multi-model
 *
 * Azure AI Foundry:
 *   export PROVIDER_MODE=azure_foundry
 *   export AZURE_ENDPOINT=https://YOUR-HUB-NAME.openai.azure.com
 *   export AZURE_API_KEY=...
 *   export AZURE_DEPLOYMENT_PREFIX=phaser-
 *   npm run test:multi-model
 *
 * Skip the audit step:
 *   export ENABLE_AUDIT_STEP=false
 *   npm run test:multi-model
 *
 * Or point at an existing .env file:
 *   cp src/api-server/.env .env  # then run:
 *   npm run test:multi-model
 *   (the script auto-loads .env from the repo root if present)
 *
 * ── Optional env vars ────────────────────────────────────────────────────────
 *   MODEL_DRAFTER=gpt-4.1            override DRAFTER model
 *   MODEL_AUDITOR=o3-mini            override AUDITOR model
 *   ENABLE_AUDIT_STEP=false          skip audit (default: true)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import * as path from 'path';

// Auto-load .env from repo root if it exists (silent if missing)
try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch {
  // dotenv optional — env vars may already be set in the shell
}

import { buildProviderConfigFromEnv, createModelRouter, ModelRole, ProviderMode } from '@phaser/llm-service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Mask an API key, showing only the last 4 characters. */
function maskKey(value: string | undefined): string {
  if (!value) return '(not set)';
  if (value.length <= 4) return '****';
  return '*'.repeat(value.length - 4) + value.slice(-4);
}

/** Right-align a label in a fixed-width column for tidy log output. */
function label(text: string): string {
  return text.padStart(22);
}

/** Format a token count and cost as a short summary string. */
function usageSummary(tokens: number, cost: number): string {
  return `${tokens.toLocaleString()} tokens  ($${cost.toFixed(4)})`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  Phaser Multi-Model Pipeline — Smoke Test');
  console.log('═══════════════════════════════════════════════════════\n');

  // ── 1. Resolve and log provider config ──────────────────────────────────
  const config = buildProviderConfigFromEnv();

  console.log('── Provider Config ─────────────────────────────────────');
  console.log(`${label('mode:')} ${config.mode}`);

  if (config.mode === ProviderMode.DIRECT) {
    console.log(`${label('openaiApiKey:')} ${maskKey(config.openaiApiKey)}`);
    console.log(`${label('anthropicApiKey:')} ${maskKey(config.anthropicApiKey)}`);
  } else {
    console.log(`${label('azureEndpoint:')} ${config.azureEndpoint ?? '(not set)'}`);
    console.log(`${label('azureApiKey:')} ${maskKey(config.azureApiKey)}`);
    console.log(`${label('azureApiVersion:')} ${config.azureApiVersion ?? '(not set)'}`);
    console.log(`${label('deploymentPrefix:')} ${config.azureDeploymentPrefix ?? '(none)'}`);
  }

  console.log('\n── Model Role Assignments ──────────────────────────────');
  for (const role of [ModelRole.INGESTION, ModelRole.DRAFTER, ModelRole.AUDITOR, ModelRole.REVISER, ModelRole.EMBEDDINGS]) {
    const a = config.roleAssignments[role];
    const temp = a.temperature !== undefined ? `, temp=${a.temperature}` : ' (no temperature)';
    console.log(`${label(role + ':')} ${a.modelId}  [maxTokens=${a.maxTokens}${temp}]`);
  }

  // ── 2. Instantiate ModelRouter ───────────────────────────────────────────
  console.log('\n── Instantiating ModelRouter ───────────────────────────');
  let modelRouter: ReturnType<typeof createModelRouter>;
  try {
    modelRouter = createModelRouter();
    console.log('  ✓ ModelRouter ready');
  } catch (err) {
    console.error('  ✗ Failed to create ModelRouter:', err instanceof Error ? err.message : err);
    process.exit(1);
  }

  // ── 3. DRAFT ─────────────────────────────────────────────────────────────
  const TEST_PROMPT =
    'Draft a one-paragraph Design Input for a Class II pulse oximeter ' +
    'per 21 CFR 820.30. No sources available.';

  console.log('\n── Step 2: DRAFT ───────────────────────────────────────');
  console.log(`  model:  ${config.roleAssignments[ModelRole.DRAFTER].modelId}`);
  console.log(`  prompt: ${TEST_PROMPT}\n`);

  let draftText = '';
  const t2start = Date.now();
  try {
    const draftResult = await modelRouter.generateDraft(TEST_PROMPT);
    const draftMs = Date.now() - t2start;

    draftText = draftResult.generatedText ?? '';
    const draftTokens = draftResult.usageStats?.tokensUsed ?? 0;
    const draftCost   = draftResult.usageStats?.cost ?? 0;

    console.log(`  ✓ Draft received in ${draftMs}ms  |  ${usageSummary(draftTokens, draftCost)}`);
    console.log('\n  ── Draft content ───────────────────────────────────');
    console.log(draftText.split('\n').map(l => `  ${l}`).join('\n'));
  } catch (err) {
    console.error('  ✗ DRAFT step failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  }

  // ── 4. AUDIT (optional) ──────────────────────────────────────────────────
  const enableAudit = process.env.ENABLE_AUDIT_STEP !== 'false';

  if (!enableAudit) {
    console.log('\n── Step 3: AUDIT ── skipped (ENABLE_AUDIT_STEP=false)');
  } else {
    console.log('\n── Step 3: AUDIT ───────────────────────────────────────');
    console.log(`  model:  ${config.roleAssignments[ModelRole.AUDITOR].modelId}`);

    const AUDIT_PROMPT =
      `=== DRAFT DOCUMENT ===\n${draftText}\n\n` +
      `=== APPLICABLE REGULATORY STANDARDS ===\n` +
      `- ISO 14971 (Risk Management for Medical Devices)\n` +
      `- FDA 21 CFR 820.30 (Design Controls)\n\n` +
      `Return your findings as a numbered list. ` +
      `If there are no gaps or issues, respond with exactly "No findings."`;

    const t3start = Date.now();
    try {
      const auditResult = await modelRouter.generateAuditFindings(AUDIT_PROMPT);
      const auditMs = Date.now() - t3start;

      const auditText   = auditResult.generatedText ?? '';
      const auditTokens = auditResult.usageStats?.tokensUsed ?? 0;
      const auditCost   = auditResult.usageStats?.cost ?? 0;

      console.log(`  ✓ Audit received in ${auditMs}ms  |  ${usageSummary(auditTokens, auditCost)}`);
      console.log('\n  ── Audit findings ──────────────────────────────────');
      console.log(auditText.split('\n').map(l => `  ${l}`).join('\n'));
    } catch (err) {
      console.error('  ✗ AUDIT step failed:', err instanceof Error ? err.message : err);
      process.exit(1);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  Smoke test complete.');
  console.log('═══════════════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('\n[test-multi-model] Unhandled error:', err);
  process.exit(1);
});
