---
name: configure-llm
description: Configure LLM provider for NanoClaw. Use when setting up Anthropic Claude API or third-party LLM providers (火山引擎/Kimi, OpenRouter, etc.). Ensures config.ts and agent-runner.ts have correct LLM configuration code.
---

# Configure LLM Provider

This skill configures the LLM (Large Language Model) provider for NanoClaw. It works with:
- **Anthropic Claude API** - Official Claude API
- **Third-party LLMs** - 火山引擎/Kimi, OpenRouter, or any Anthropic-compatible API

## Prerequisites

- `.env` file exists (or will be created)
- Project has been built at least once (`npm run build`)

## Workflow

### 1. Check Current Configuration

Read `.env` and check for existing LLM configuration:
- `ANTHROPIC_API_KEY`
- `ANTHROPIC_BASE_URL`
- `MODEL`

Also check if `src/config.ts` exports these values and if `src/agent-runner.ts` uses them.

### 2. Ask User for Provider Type

Use AskUserQuestion:

1. **Anthropic Claude API** — description: "Official Claude API from console.anthropic.com. Requires API key only."
2. **Third-party LLM** — description: "火山引擎/Kimi, OpenRouter, or other Anthropic-compatible APIs. Requires API key, base URL, and model name."

### 3. Collect Credentials

#### For Anthropic Claude API

Ask (plain text, not AskUserQuestion):
> "What is your Anthropic API key? (starts with sk-ant-)"

Wait for the user's response. Then update `.env`:
```bash
ANTHROPIC_API_KEY=<their-key>
```

#### For Third-party LLM

Ask for three pieces of information (plain text, one at a time):

1. "What is the API base URL?" (e.g., `https://ark.cn-beijing.volces.com/api/coding` for 火山引擎)
2. "What is the API key?"
3. "What model name should be used?" (e.g., `kimi-k2.5`)

Wait for each answer before asking the next. Then update `.env` with all three values.

### 4. Ensure config.ts Exports LLM Variables

Check if `src/config.ts` reads and exports the LLM variables. Look for:

```typescript
const envConfig = readEnvFile([
  // ... other keys ...
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_BASE_URL',
  'MODEL',
]);

// ... and exports:
export const ANTHROPIC_API_KEY =
  process.env.ANTHROPIC_API_KEY || envConfig.ANTHROPIC_API_KEY;
export const ANTHROPIC_BASE_URL =
  process.env.ANTHROPIC_BASE_URL || envConfig.ANTHROPIC_BASE_URL;
export const MODEL =
  process.env.MODEL || envConfig.MODEL || 'claude-sonnet-4-5-20250929';
```

**If missing**, add the keys to `readEnvFile()` call and add the exports at the end of the file.

### 5. Ensure agent-runner.ts Uses LLM Config

Check if `src/agent-runner.ts`:

1. Imports `MODEL`, `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL` from config
2. Passes `model: MODEL` in the query options
3. Passes `env` with `ANTHROPIC_API_KEY` and `ANTHROPIC_BASE_URL` to the SDK

**If missing**, make these changes:

1. Update the import:
```typescript
import {
  ANTHROPIC_API_KEY,
  ANTHROPIC_BASE_URL,
  ASSISTANT_NAME,
  DATA_DIR,
  GROUPS_DIR,
  MODEL,
  TIMEZONE,
} from './config.js';
```

2. Build the environment before the query:
```typescript
const sdkEnv: Record<string, string | undefined> = {
  ...process.env,
};
if (ANTHROPIC_API_KEY) {
  sdkEnv.ANTHROPIC_API_KEY = ANTHROPIC_API_KEY;
}
if (ANTHROPIC_BASE_URL) {
  sdkEnv.ANTHROPIC_BASE_URL = ANTHROPIC_BASE_URL;
}
```

3. Add `model` and `env` to the query options:
```typescript
for await (const message of query({
  prompt: stream,
  options: {
    model: MODEL,
    env: sdkEnv,
    // ... rest of options
  },
})) {
```

### 6. Update .env.example

Ensure `.env.example` documents the LLM configuration:

```bash
# LLM Configuration
# For Anthropic Claude: set ANTHROPIC_API_KEY only
# For third-party LLM (火山引擎/Kimi, OpenRouter, etc.): set all three
ANTHROPIC_API_KEY=
ANTHROPIC_BASE_URL=
MODEL=
```

### 7. Build and Verify

Run:
```bash
npm run build
```

If build succeeds, tell the user:
> LLM configuration complete. Your `.env` has been updated with the credentials. Run `npm run dev` or restart the service to test.

## Idempotency

This skill is idempotent:
- Running it multiple times is safe
- If already configured, it will update the values
- If code changes from upstream, it will re-apply the necessary modifications

## Troubleshooting

**Build fails after changes:**
- Check TypeScript errors
- Ensure imports use `.js` extension (ESM style: `'./config.js'`)

**Agent doesn't use the configured model:**
- Verify `.env` has the values
- Check `src/config.ts` exports are correct
- Check `src/agent-runner.ts` passes `model: MODEL` to the SDK
- Restart the service after changes

**Third-party API returns errors:**
- Verify the base URL is correct (no trailing slash)
- Verify the API key is valid
- Verify the model name matches what the provider expects
