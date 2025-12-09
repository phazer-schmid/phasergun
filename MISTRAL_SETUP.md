# Mistral AI Setup Guide

## Overview
Mistral AI is now integrated as a cost-effective alternative to Anthropic Claude and Ollama. Mistral Small is **the most cost-effective option** for FDA compliance analysis.

## Cost Comparison

| Model | Input (per 1M tokens) | Output (per 1M tokens) | Est. Cost/File |
|-------|----------------------|------------------------|----------------|
| **Mistral Small** ⭐ | **$0.20** | **$0.60** | **~$0.0015** |
| Claude Haiku | $0.25 | $1.25 | ~$0.003 |
| Claude Sonnet | $3.00 | $15.00 | ~$0.0585 |

**Mistral Small Savings:**
- 50% cheaper than Claude Haiku
- 97% cheaper than Claude Sonnet
- For 1,000 files: ~$1.50 vs $3.00 (Haiku) vs $58.50 (Sonnet)

## Getting Started

### 1. Get Your Mistral API Key

1. Visit [https://console.mistral.ai/](https://console.mistral.ai/)
2. Sign up or log in to your account
3. Navigate to "API Keys" section
4. Create a new API key
5. Copy your API key (starts with a random string)

### 2. Configure Environment Variables

Edit `src/api-server/.env`:

```bash
# Set LLM mode to Mistral
LLM_MODE=mistral

# Add your Mistral API key
MISTRAL_API_KEY=your_actual_api_key_here

# Choose model (optional - defaults to mistral-small-latest)
MISTRAL_MODEL=mistral-small-latest
```

### 3. Restart the API Server

```bash
cd src/api-server
npm run dev
```

You should see:
```
[API] LLM Mode: MISTRAL
[API] Using Mistral AI API (mistral-small-latest)
```

## Available Models

### Mistral Small (Recommended)
- **Model ID**: `mistral-small-latest`
- **Pricing**: $0.20 input / $0.60 output per 1M tokens
- **Context**: 32K tokens
- **Best for**: Compliance analysis, structured outputs, recommendations
- **Speed**: Fast
- **Quality**: Excellent for focused tasks

### Mistral Medium
- **Model ID**: `mistral-medium-latest`
- **Pricing**: $2.50 input / $7.50 output per 1M tokens
- **Context**: 32K tokens
- **Best for**: Complex reasoning, detailed analysis
- **Speed**: Moderate
- **Quality**: Higher quality for complex tasks

## Testing Your Setup

### Quick Test

Analyze a sample file:

```bash
curl -X POST http://localhost:3001/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"filePath": "/path/to/your/document.txt"}'
```

### Expected Output

You should see in the server logs:
```
[MistralLLMService] Initialized with model: mistral-small-latest
[MistralLLMService] Generating text with prompt length: 2847
[MistralLLMService] Response received in 1234ms
[MistralLLMService] Input tokens: 2103
[MistralLLMService] Output tokens: 487
[MistralLLMService] Cost: $0.0007 (Small pricing)
```

## Features

### ✅ What Works
- Full integration with existing analysis pipeline
- Automatic cost calculation and logging
- Same prompt format as Claude
- Support for validation criteria
- RAG context integration
- Token usage tracking

### 🎯 Optimized For
- FDA compliance analysis
- Structured recommendations
- Critical gap identification
- Document assessment
- Regulatory requirement mapping

### 💰 Cost Management
- Costs automatically tracked per request
- Detailed token usage in logs
- Cost shown in response metadata
- Monitor usage at [console.mistral.ai](https://console.mistral.ai/)

## Switching Between Models

You can easily switch between different LLM providers by changing `LLM_MODE`:

```bash
# Use Mistral (cheapest, fast, good quality)
LLM_MODE=mistral

# Use Claude Haiku (more expensive, excellent quality)
LLM_MODE=anthropic
ANTHROPIC_MODEL=claude-3-haiku-20240307

# Use Claude Sonnet (most expensive, best quality)
LLM_MODE=anthropic
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022

# Use local Ollama (free, requires local setup)
LLM_MODE=ollama

# Use mock (for testing, no API calls)
LLM_MODE=mock
```

## Best Practices

### For Maximum Cost Savings
1. Use `mistral-small-latest` for routine analysis
2. Keep max tokens at 1500 (current setting)
3. Monitor your usage dashboard regularly
4. Use mock mode during development/testing

### For Quality Balance
1. Use Mistral Small for initial passes (cheap)
2. Use Claude Sonnet for critical documents (targeted spending)
3. Implement two-tier analysis workflow
4. Review high-value documents manually

## Troubleshooting

### Error: "Mistral API error"
- Check your API key is correct in `.env`
- Verify you have credits in your Mistral account
- Check [status.mistral.ai](https://status.mistral.ai/) for outages

### Error: "Cannot find module 'mistral-service.js'"
- Run `cd src/llm-service && npm run build`
- Restart the API server

### Empty or Truncated Responses
- Check if max_tokens (1500) is sufficient
- Review server logs for token usage
- Increase max_tokens if needed in `mistral-service.ts`

### High Costs
- Verify you're using `mistral-small-latest` not `mistral-medium`
- Check token usage in logs
- Consider reducing input prompt length
- Use mock mode for development

## API Rate Limits

Mistral AI has generous rate limits:
- **Mistral Small**: High throughput
- **Requests**: Typically 60+ requests per minute
- **Tokens**: Millions of tokens per month

Check your specific limits at [console.mistral.ai](https://console.mistral.ai/)

## Comparison with Other Providers

### Mistral Small vs Claude Haiku
| Feature | Mistral Small | Claude Haiku |
|---------|---------------|--------------|
| Cost | **$0.0015/file** ✅ | $0.003/file |
| Speed | Fast | Very Fast |
| Quality | Excellent | Excellent |
| Context | 32K tokens | 200K tokens |
| Best for | Compliance | Any task |

**Verdict**: Mistral Small is the best value for FDA compliance analysis!

### Mistral Small vs Claude Sonnet
| Feature | Mistral Small | Claude Sonnet |
|---------|---------------|---------------|
| Cost | **$0.0015/file** ✅ | $0.0585/file |
| Speed | Fast | Moderate |
| Quality | Excellent | Premium |
| Context | 32K tokens | 200K tokens |
| Best for | Focused tasks | Complex reasoning |

**Verdict**: Mistral Small provides 97% cost savings with great quality!

## Support and Resources

- **Mistral Documentation**: [docs.mistral.ai](https://docs.mistral.ai/)
- **API Reference**: [docs.mistral.ai/api](https://docs.mistral.ai/api)
- **Console**: [console.mistral.ai](https://console.mistral.ai/)
- **Pricing**: [mistral.ai/pricing](https://mistral.ai/pricing)

## Example Configuration

Complete `.env` file for Mistral:

```bash
# API Server
PORT=3001

# LLM Configuration
LLM_MODE=mistral

# Mistral AI
MISTRAL_API_KEY=your_actual_mistral_api_key
MISTRAL_MODEL=mistral-small-latest
```

That's it! You're now using the most cost-effective LLM for FDA compliance analysis. 🎉

---

**Last Updated**: December 9, 2024  
**Status**: ✅ Production Ready  
**Cost Savings**: 97% vs Sonnet, 50% vs Haiku
