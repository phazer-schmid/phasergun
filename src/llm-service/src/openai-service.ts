import OpenAI from 'openai';
import { LLMResponse, KnowledgeContext } from '@phasergun/shared-types';
import { LLMService } from './index';
import { ProviderConfig, ProviderMode, ModelRole, ModelAssignment } from './provider-config';

/**
 * OpenAI LLM Service
 *
 * Implements {@link LLMService} for both direct OpenAI API calls and
 * Azure AI Foundry deployments. The routing mode and per-role model
 * assignment are driven entirely by the supplied {@link ProviderConfig}
 * — no code changes are needed when switching between the two modes.
 *
 * System / user message split follows the same convention as
 * {@link AnthropicLLMService}: everything before `=== TASK ===` in the
 * assembled prompt string becomes the system message; everything from
 * `=== TASK ===` onward becomes the user message.
 */
export class OpenAILLMService implements LLMService {
  private client: OpenAI;
  private assignment: ModelAssignment;
  private role: ModelRole;

  /**
   * @param config - Provider configuration (mode, credentials, role assignments).
   * @param role   - The {@link ModelRole} this instance is responsible for.
   *                 The matching {@link ModelAssignment} is read from
   *                 `config.roleAssignments[role]`.
   */
  constructor(config: ProviderConfig, role: ModelRole) {
    this.role = role;
    this.assignment = config.roleAssignments[role];

    if (config.mode === ProviderMode.AZURE_FOUNDRY) {
      if (!config.azureEndpoint || !config.azureApiKey) {
        throw new Error(
          '[OpenAILLMService] AZURE_FOUNDRY mode requires azureEndpoint and azureApiKey'
        );
      }

      const deploymentName =
        (config.azureDeploymentPrefix ?? '') + this.assignment.modelId;

      this.client = new OpenAI({
        // Azure AI Foundry routes per-deployment, so we bake the deployment
        // name into the baseURL and let the SDK append /chat/completions.
        baseURL: `${config.azureEndpoint}/openai/deployments/${deploymentName}`,
        defaultQuery: { 'api-version': config.azureApiVersion ?? '2024-12-01-preview' },
        defaultHeaders: { 'api-key': config.azureApiKey },
        // Suppress the standard Authorization header — Azure uses api-key instead.
        apiKey: 'not-used-for-azure',
      });

      console.log(
        `[OpenAILLMService] Initialized — mode: azure_foundry, role: ${role}, ` +
        `deployment: ${deploymentName}, endpoint: ${config.azureEndpoint}`
      );
    } else {
      if (!config.openaiApiKey) {
        throw new Error(
          '[OpenAILLMService] DIRECT mode requires openaiApiKey'
        );
      }

      this.client = new OpenAI({ apiKey: config.openaiApiKey });

      console.log(
        `[OpenAILLMService] Initialized — mode: direct, role: ${role}, ` +
        `model: ${this.assignment.modelId}, maxTokens: ${this.assignment.maxTokens}`
      );
    }
  }

  /** @inheritdoc */
  async generateText(prompt: string, context?: KnowledgeContext): Promise<LLMResponse> {
    console.log(
      `[OpenAILLMService:${this.role}] Generating text — prompt length: ${prompt.length}`
    );

    if (context) {
      console.log(
        `[OpenAILLMService:${this.role}] Knowledge context: ` +
        `${context.metadata.sources.length} source(s)`
      );
    }

    const assembled = this.prependContext(prompt, context);
    return this.generateWithRetry(assembled);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Optionally prepend a RAG context block to the prompt, matching the
   * pattern used by {@link AnthropicLLMService.constructPromptWithContext}.
   */
  private prependContext(prompt: string, context?: KnowledgeContext): string {
    if (!context?.ragContext) return prompt;

    return (
      `REGULATORY KNOWLEDGE BASE CONTEXT:\n` +
      `The following regulatory information has been retrieved from the knowledge base:\n\n` +
      `${context.ragContext}\n\n` +
      `SOURCE DOCUMENTS:\n` +
      `${context.metadata.sources.map(s => `- ${s}`).join('\n')}\n\n` +
      `---\n\n` +
      prompt
    );
  }

  /**
   * Split the assembled prompt on the `=== TASK ===` marker.
   *
   * - Text **before** the marker → OpenAI system message (role instructions +
   *   reference materials treated as persistent context).
   * - Text **from** the marker onward → OpenAI user message (the task itself).
   *
   * If the marker is absent the entire string becomes the user message and the
   * system message is empty, preserving backward compatibility with callers
   * that do not use the marker convention.
   */
  private splitPrompt(assembled: string): { system: string; user: string } {
    const TASK_MARKER = '=== TASK ===';
    const idx = assembled.indexOf(TASK_MARKER);

    if (idx === -1) {
      return { system: '', user: assembled };
    }

    return {
      system: assembled.substring(0, idx).trim(),
      user: assembled.substring(idx).trim(),
    };
  }

  /**
   * Returns per-million-token USD rates for a given model ID.
   * Prices as of early 2026 — update if OpenAI revises rates.
   * Unknown models return 0 so cost shows $0 rather than crashing.
   */
  private getModelPricing(modelId: string): { inputPerM: number; outputPerM: number } {
    if (modelId.startsWith('o3-mini'))      return { inputPerM: 1.10,  outputPerM: 4.40  };
    if (modelId.startsWith('o3'))           return { inputPerM: 10.00, outputPerM: 40.00 };
    if (modelId.startsWith('o1-mini'))      return { inputPerM: 3.00,  outputPerM: 12.00 };
    if (modelId.startsWith('o1'))           return { inputPerM: 15.00, outputPerM: 60.00 };
    if (modelId.startsWith('gpt-4o-mini'))  return { inputPerM: 0.15,  outputPerM: 0.60  };
    if (modelId.startsWith('gpt-4.1-mini')) return { inputPerM: 0.40,  outputPerM: 1.60  };
    if (modelId.startsWith('gpt-4.1-nano')) return { inputPerM: 0.10,  outputPerM: 0.40  };
    if (modelId.startsWith('gpt-4.1'))      return { inputPerM: 2.00,  outputPerM: 8.00  };
    if (modelId.startsWith('gpt-4o'))       return { inputPerM: 2.50,  outputPerM: 10.00 };
    return { inputPerM: 0, outputPerM: 0 };
  }

  /**
   * Returns true for model families that do not accept a `temperature`
   * parameter (OpenAI o1 and o3 reasoning models).
   */
  private isReasoningModel(modelId: string): boolean {
    return modelId.startsWith('o1') || modelId.startsWith('o3');
  }

  /**
   * Execute the OpenAI chat completion with exponential-backoff retry on
   * rate-limit errors (HTTP 429), matching the retry strategy in
   * {@link AnthropicLLMService}.
   */
  private async generateWithRetry(
    assembled: string,
    retryCount: number = 0,
    maxRetries: number = 5
  ): Promise<LLMResponse> {
    try {
      const { system, user } = this.splitPrompt(assembled);
      const { modelId, maxTokens } = this.assignment;
      const reasoning = this.isReasoningModel(modelId);

      // Split the system message into its STATIC prefix (role + rules, identical
      // across all calls for the same project) and DYNAMIC suffix (reference
      // materials that vary per request). OpenAI automatically caches prompt
      // prefixes longer than 1,024 tokens at ~10% input token cost when the
      // prefix is identical — no explicit annotation is required.
      const STATIC_SECTION_END = '=== REFERENCE MATERIALS ===';
      const refMaterialsIndex = system.indexOf(STATIC_SECTION_END);
      let staticPrefix: string;
      let dynamicSuffix: string;
      if (refMaterialsIndex !== -1) {
        staticPrefix = system.substring(0, refMaterialsIndex).trim();
        dynamicSuffix = system.substring(refMaterialsIndex).trim();
      } else {
        staticPrefix = system;
        dynamicSuffix = '';
      }
      console.log(
        `[OpenAIService] Static prefix: ${staticPrefix.length} chars, ` +
        `dynamic context: ${dynamicSuffix.length} chars`
      );

      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

      if (system.length > 0) {
        messages.push({ role: 'system', content: system });
      }
      messages.push({ role: 'user', content: user });

      // Reasoning models (o1/o3) use max_completion_tokens; standard models use max_tokens.
      const requestParams: any = {
        model: modelId,
        messages,
        ...(reasoning
          ? { max_completion_tokens: maxTokens }
          : { max_tokens: maxTokens }),
      };

      // Do NOT include temperature for o1/o3 reasoning models.
      if (!reasoning && this.assignment.temperature !== undefined) {
        requestParams.temperature = this.assignment.temperature;
      }

      const startTime = Date.now();
      const response = await this.client.chat.completions.create(requestParams);
      const duration = Date.now() - startTime;

      const generatedText = response.choices
        .map(c => c.message?.content ?? '')
        .join('\n')
        .trim();

      const inputTokens  = response.usage?.prompt_tokens     ?? 0;
      const outputTokens = response.usage?.completion_tokens ?? 0;
      const tokensUsed   = inputTokens + outputTokens;

      const { inputPerM, outputPerM } = this.getModelPricing(modelId);
      const cost =
        (inputTokens  / 1_000_000) * inputPerM +
        (outputTokens / 1_000_000) * outputPerM;

      console.log(`[OpenAILLMService:${this.role}] Response in ${duration}ms`);
      console.log(`[OpenAILLMService:${this.role}] System: ${system.length} chars`);
      console.log(`[OpenAILLMService:${this.role}] User: ${user.length} chars`);
      console.log(`[OpenAILLMService:${this.role}] Tokens — in: ${inputTokens}, out: ${outputTokens}`);
      console.log(`[OpenAILLMService:${this.role}] Cost: $${cost.toFixed(4)} (${modelId} pricing)`);

      return {
        generatedText,
        usageStats: { tokensUsed, cost },
      };
    } catch (error: any) {
      const isRateLimit =
        error?.status === 429 ||
        error?.error?.code === 'rate_limit_exceeded' ||
        (error?.message && (error.message as string).includes('rate_limit'));

      if (isRateLimit && retryCount < maxRetries) {
        const delaySeconds = Math.pow(2, retryCount + 1);
        console.warn(
          `[OpenAILLMService:${this.role}] ⚠️  Rate limit hit. ` +
          `Retry ${retryCount + 1}/${maxRetries} after ${delaySeconds}s`
        );
        await new Promise(resolve => setTimeout(resolve, delaySeconds * 1000));
        return this.generateWithRetry(assembled, retryCount + 1, maxRetries);
      }

      if (isRateLimit) {
        console.error(
          `[OpenAILLMService:${this.role}] ❌ Rate limit exceeded after ${maxRetries} retries`
        );
        throw new Error('Rate limit exceeded. Please wait a moment and try again.');
      }

      console.error(`[OpenAILLMService:${this.role}] Error calling OpenAI API:`, error);
      throw new Error(
        `OpenAI API error: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
