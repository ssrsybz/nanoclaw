<p align="center">
  <img src="assets/okclaw-logo.png" alt="OKClaw" width="400">
</p>

<p align="center">
  Your personal AI assistant. Lightweight, customizable, small enough to fully understand.
</p>

<p align="center">
  <a href="README_zh.md">中文</a>&nbsp; • &nbsp;
  <a href="README_ja.md">日本語</a>&nbsp; • &nbsp;
  <a href="https://okclaw.dev">okclaw.dev</a>&nbsp; • &nbsp;
  <a href="https://discord.gg/VDdww8qS42"><img src="https://img.shields.io/discord/1470188214710046894?label=Discord&logo=discord&v=2" alt="Discord" valign="middle"></a>&nbsp; • &nbsp;
  <a href="repo-tokens"><img src="repo-tokens/badge.svg" alt="34.9k tokens, 17% of context window" valign="middle"></a>
</p>

---

## Why OKClaw

[OpenClaw](https://github.com/openclaw/openclaw) is a great project, but I can't trust complex software I don't understand to fully integrate into my life. OpenClaw has nearly 500k lines of code, 53 config files, and 70+ dependencies. Its security is application-level (whitelists, pairing codes), not true OS-level isolation. Everything runs in a single Node process with shared memory.

OKClaw delivers the same core functionality in a codebase small enough to fully understand: one process, a handful of files. The Claude Agent runs directly in the main process — no containers needed.

## Quick Start

### Option 1: Quick Start Script

```bash
./start.sh start    # Start in background
./start.sh stop     # Stop service
./start.sh restart  # Restart service
./start.sh status   # Check status
./start.sh logs     # View real-time logs
./start.sh dev      # Foreground dev mode (hot reload)
```

### Option 2: Manual Start

```bash
gh repo fork qwibitai/okclaw --clone
cd okclaw
npm install
npm run build
npm run dev
```

<details>
<summary>Don't have GitHub CLI?</summary>

1. Fork [qwibitai/okclaw](https://github.com/qwibitai/okclaw) on GitHub
2. `git clone https://github.com/<your-username>/okclaw.git`
3. `cd okclaw`
4. `npm install && npm run build && npm run dev`

</details>

Then open your browser at `http://localhost:3100` and start chatting.

Alternatively, run `/setup` and Claude Code will handle everything: dependency installation, authentication, and service configuration.

> **Note:** Commands starting with `/` (like `/setup`, `/add-whatsapp`) are [Claude Code skills](https://code.claude.com/docs/en/skills). Enter them at the `claude` CLI prompt, not in a regular terminal. Get Claude Code at [claude.com/product/claude-code](https://claude.com/product/claude-code).

## Design Philosophy

**Small enough to understand.** One process, a few source files, no microservices. Want to understand the entire OKClaw codebase? Just ask Claude Code to walk you through it.

**Built for individuals.** OKClaw isn't a bloated framework — it's software that fits each user's needs. Fork it and let Claude Code modify it to your specifications.

**Customization = code changes.** No config bloat. Want different behavior? Change the code. The codebase is small enough that this is safe.

**AI-native.**
- No setup wizards — Claude Code guides you through setup.
- No monitoring dashboards — ask Claude what's happening.
- No debugging tools — describe the problem and Claude fixes it.

**Skills over features.** Instead of adding features (like Telegram support) into the core codebase, [Claude Code skills](https://code.claude.com/docs/en/skills) like `/add-telegram` transform your fork. You end up with clean code that does only what you need.

## Features

- **Multi-channel messaging** — Chat with your assistant via Web IM, WhatsApp, Telegram, Discord, Slack, or Gmail. Add channels with skills like `/add-whatsapp`, `/add-telegram`, etc. Run multiple simultaneously.
- **Web frontend** — Built-in browser chat interface with multi-workspace support, conversation management, file upload (Word/Excel/PDF), and real-time streaming output.
- **File attachments** — Upload .docx, .xlsx, and .pdf files. Text content is automatically extracted for the agent to analyze.
- **Isolated group contexts** — Each group has its own `CLAUDE.md` memory and independent file system.
- **Master channel** — Your private chat channel (self-chat) for management control; other groups are fully isolated.
- **Scheduled tasks** — Recurring Claude jobs that can proactively send you messages.
- **Web access** — Search and fetch web content.
- **Agent collaboration** — Launch teams of specialized agents to collaborate on complex tasks.

## Usage

Chat with your assistant using a trigger word (default: `@Andy`):

```
@Andy send me a sales pipeline summary every weekday at 9am
@Andy every Friday review the past week's git history and update the README if it's drifted
@Andy every Monday at 8am compile AI news from Hacker News and TechCrunch and send me a briefing
```

Manage groups and tasks in the master channel (your self-chat):
```
@Andy list all scheduled tasks across groups
@Andy pause the Monday briefing task
@Andy join the family chat group
```

## Customization

OKClaw doesn't use config files. Just tell Claude Code what you want:

- "Change the trigger word to @Bob"
- "Make responses shorter and more direct from now on"
- "Add a custom greeting when I say good morning"
- "Store conversation summaries weekly"

Or run `/customize` for guided modifications.

The codebase is small enough that Claude can safely modify it.

## Contributing

**Don't add features. Add skills.**

If you want to add Telegram support, don't create a PR that adds Telegram to the core codebase. Instead, fork OKClaw, make the code changes on a branch, and open a PR. We'll create a `skill/telegram` branch from your PR that other users can merge into their forks.

Users then run `/add-telegram` on their fork and get clean code that does only what they need — not a bloated system trying to support every use case.

### Request for Skills (RFS)

Skills we'd love to see:

**Communication channels**
- `/add-signal` — Add Signal channel

## System Requirements

- macOS, Linux, or Windows (via WSL2)
- Node.js 20+
- [Claude Code](https://claude.ai/download)

## Architecture

```
Channels --> SQLite --> Message polling --> Agent (Claude Agent SDK) --> Response
```

Single Node.js process. Channels are added via skills and auto-register at startup — the orchestrator connects to all channels with credentials. The agent executes directly in the main process via the Claude Agent SDK. Per-group message queues with global concurrency control. File-system-based IPC.

See the [docs site](https://docs.okclaw.dev/concepts/architecture) for full architecture details.

Key files:
- `src/index.ts` — Orchestrator: state, message loop, agent invocation
- `src/agent-runner.ts` — Claude Agent SDK direct invocation
- `src/channels/registry.ts` — Channel registry (auto-registers at startup)
- `src/ipc.ts` — IPC listener and task processing
- `src/router.ts` — Message formatting and outbound routing
- `src/group-queue.ts` — Per-group queue + global concurrency limit
- `src/task-scheduler.ts` — Scheduled task execution
- `src/db.ts` — SQLite operations (messages, groups, sessions, state)
- `src/file-parser.ts` — File parsing (.docx, .xlsx, .pdf)
- `web/src/` — React web frontend
- `groups/*/CLAUDE.md` — Per-group memory

## FAQ

**Does it work on Linux or Windows?**

Yes. OKClaw is pure Node.js and runs on macOS, Linux, and Windows (WSL2). Just run `/setup`.

**Is it secure?**

The agent runs directly in the main process with full tool permissions. Recommended for trusted environments only. The codebase is small enough that you can audit every line. See the [security docs](https://docs.okclaw.dev/concepts/security) for details.

**Why no config files?**

We don't want config bloat. Each user should customize their OKClaw to make the code do what they want, rather than configuring a generic system. If you prefer config files, you can have Claude add them.

**Can I use third-party or open-source models?**

Yes. Set the following in the `env` block of `~/.claude/settings.json`:

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://your-api-endpoint.com",
    "ANTHROPIC_API_KEY": "your-key-here",
    "ANTHROPIC_MODEL": "model-name"
  }
}
```

Supported options:
- Local models via [Ollama](https://ollama.ai) (with an API proxy)
- Open-source models hosted on [Together AI](https://together.ai), [Fireworks](https://fireworks.ai), etc.
- Any custom deployment compatible with the Anthropic API format

**How do I debug issues?**

Ask Claude Code. "Why isn't the scheduled task running?" "What do the recent logs say?" "Why didn't this message get a response?" That's the AI-native way.

**What changes are accepted?**

Only security fixes, bug fixes, and clear improvements to the base code.

Everything else (new features, system compatibility, hardware support, enhancements) should be contributed as skills.

This keeps the base system minimal and lets each user customize their install without inheriting features they don't want.

## Community

Questions or ideas? [Join Discord](https://discord.gg/VDdww8qS42).

## Changelog

See [CHANGELOG.md](CHANGELOG.md) or the [full release history](https://docs.okclaw.dev/changelog) on the docs site.

## License

MIT
