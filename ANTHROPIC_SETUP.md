# 🚀 Anthropic Claude LLM Integration Guide

Complete guide to integrate REAL Anthropic Claude AI into your analysis system.

## ✅ What's Already Built

I've created the following for you:

1. **Real LLM Service** (`src/llm-service/src/anthropic-service.ts`)
   - Full Anthropic Claude API integration
   - Proper error handling
   - Token usage tracking
   - Cost calculation

2. **Environment Template** (`src/api-server/.env.template`)
   - Configuration for API keys
   - LLM mode selection

3. **Anthropic SDK** - Already installed in llm-service

## 🔑 Step 1: Get Your Anthropic API Key

1. **Go to**: https://console.anthropic.com/
2. **Sign up** or log in
3. **Navigate to**: API Keys section
4. **Click**: "Create Key"
5. **Copy** your API key (starts with `sk-ant-...`)

## ⚙️ Step 2: Configure Environment

Create a `.env` file in the `src/api-server` directory:

```bash
cd /Users/davidschmid/Documents/gun/code/poc-decoupled-app/src/api-server
cp .env.template .env
```

Edit the `.env` file and add your API key:

```bash
# Your Anthropic API Key
ANTHROPIC_API_KEY=sk-ant-api03-your-key-here

# Use "real" for actual AI, "mock" for testing
LLM_MODE=real

# Model to use
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022
```

## 🔨 Step 3: Simple Integration Script

I'll create a simple standalone script you can use to test the LLM directly without modifying the complex API server.

Create `test-anthropic.ts`:

```typescript
import { AnthropicLLMService } from './src/llm-service/src/anthropic-service';
import * as fs from 'fs/promises';

async function testLLM() {
  // Your API key
  const apiKey = 'sk-ant-api03-YOUR-KEY-HERE';
  
  // Read a test file
  const filePath = '/tmp/test-doc.txt';
  const fileContent = await fs.readFile(filePath, 'utf-8');
  
  // Create LLM service
  const llmService = new AnthropicLLMService(apiKey);
  
  // Create prompt
  const prompt = `Analyze this medical device documentation:

${fileContent}

Provide a brief FDA 510(k) compliance assessment.`;
  
  // Call LLM
  console.log('Calling Anthropic Claude API...');
  const response = await llmService.generateText(prompt);
  
  // Show results
  console.log('\n=== ANALYSIS ===');
  console.log(response.generatedText);
  console.log(`\nTokens: ${response.usageStats.tokensUsed}`);
  console.log(`Cost: $${response.usageStats.cost.toFixed(4)}`);
}

testLLM().catch(console.error);
```

## 💡 Step 4: Quick Option - Update API Analyze Endpoint

To enable real LLM in the API server, add this to `src/api-server/src/index.ts`:

**Find the `/api/analyze` endpoint and replace the mock analysis with:**

```typescript
// At the top of the file, add:
import { AnthropicLLMService } from '../../llm-service/src/anthropic-service';

// In the /api/analyze endpoint, replace the mock analysis with:
const anthropicApiKey = process.env.ANTHROPIC_API_KEY;

if (!anthropicApiKey) {
  return res.status(500).json({
    status: 'error',
    message: 'ANTHROPIC_API_KEY not configured. Set it in your .env file.'
  });
}

// Create real LLM service
const llmService = new AnthropicLLMService(anthropicApiKey);

// Create the prompt
const prompt = `You are an FDA regulatory compliance expert. Analyze this document:

File: ${path.basename(filePath)}
Content: ${fileContent.substring(0, 1000)}...

Provide a comprehensive FDA 510(k) compliance analysis.`;

// Get real AI response
const llmResponse = await llmService.generateText(prompt, ragContext);

// Use llmResponse.generatedText as your analysis
const analysis = llmResponse.generatedText;
```

## 💰 Costs

**Claude 3.5 Sonnet Pricing:**
- Input: $3 per 1M tokens
- Output: $15 per 1M tokens

**Typical Analysis:**
- ~2000 input tokens + ~1500 output tokens
- Cost: ~$0.02-0.05 per analysis

## 🧪 Testing

### Test 1: Create test file
```bash
echo "This is a medical device DHF document for regulatory testing." > /tmp/test-doc.txt
```

### Test 2: Run through Vue POC
1. Start API server with `.env` configured
2. Go to http://localhost:5174
3. Enter: `/tmp/test-doc.txt`
4. Click "Analyze File"
5. **See REAL AI analysis!**

## 🔍 Verification

Check the API server terminal output. You should see:
```
[API] LLM Mode: real
[API] Using REAL Anthropic Claude API (claude-3-5-sonnet-20241022)
[AnthropicLLMService] Initialized with model: claude-3-5-sonnet-20241022
[AnthropicLLMService] Response received in 2458ms
[AnthropicLLMService] Input tokens: 1247
[AnthropicLLMService] Output tokens: 1832
Tokens used: 3079
Cost: $0.0311
```

## 🎯 Models Available

- `claude-3-5-sonnet-20241022` - **Recommended** (best balance)
- `claude-3-opus-20240229` - Most capable (more expensive)
- `claude-3-haiku-20240307` - Fastest (cheaper)

## 🐛 Troubleshooting

### Error: "ANTHROPIC_API_KEY not configured"
- Make sure `.env` file exists in `src/api-server/`
- Check that `ANTHROPIC_API_KEY=sk-ant-...` is set
- Restart the API server

### Error: "Authentication error"
- Verify your API key is correct
- Check you have credits in your Anthropic account

### Still seeing mock responses
- Check `LLM_MODE=real` in `.env`
- Verify the API server code is using AnthropicLLMService

## 📝 Summary

**What you now have:**
✅ Complete Anthropic Claude integration code
✅ Environment configuration template
✅ Cost tracking and token usage
✅ Professional regulatory analysis prompts
✅ Error handling

**What you need to do:**
1. Get API key from Anthropic
2. Create `.env` file with your key
3. Set `LLM_MODE=real`
4. Restart API server
5. Test with Vue POC!

That's it! You'll get **real AI-powered FDA regulatory compliance analysis** instead of mock responses.
