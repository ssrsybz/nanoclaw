---
name: self-customize
nameZh: 自我定制
description: Customize your own agent — add capabilities, install packages, add MCP servers, edit code or CLAUDE.md. Use when the user asks you to add a feature, install a tool, or modify how you work. For non-trivial code changes, delegate to a builder agent via create_agent.
skillType: operational
category: system
---

# Self-Customization

You can modify your own environment. Different kinds of changes have different workflows.

## Decision Tree

**What needs to change?**

- **`CLAUDE.local.md` or files in your workspace** → Edit directly, no approval needed. Your workspace is persisted on the host. (Note: the composed `CLAUDE.md` itself is read-only and regenerated every spawn — write to `CLAUDE.local.md` instead.)
- **Global npm/pip package** → Use Bash directly: `npm install -g <pkg>@<version>` or `pip install <pkg>==<version>`. Changes take effect on the next agent session.
- **MCP server** → Edit `.mcp.json` or `~/.claude/settings.json` to register the server. Changes take effect on the next agent session.
- **Group CLAUDE.md** → Edit the group's `CLAUDE.md` file (e.g. `groups/global/CLAUDE.md` or `groups/web-main/CLAUDE.md`) to customize per-group behavior.
- **New workspace skill** → Create `.claude/skills/{name}/SKILL.md` following the skill format. Enable/disable it via the Web App SkillsPanel.
- **Your source code** → Delegate to a builder agent via `create_agent` (see below).
- **A new specialist capability** → `create_agent` to spin up a dedicated agent for it.

## Workflow: Code Changes via Builder Agent

For anything that requires editing source files (your own code, etc.), **do not edit directly** — delegate to a builder agent. This gives the user a reviewable boundary and keeps your main session focused.

1. Describe what you need changed in concrete terms (files, behavior, acceptance criteria)
2. Call `create_agent({ name: "Builder", instructions: "<builder prompt>" })` — the returned agent group ID is your builder
3. Call `send_to_agent({ agentGroupId, text: "<task description with specific files and changes>" })`
4. The builder works in its own context, makes the changes, and reports back
5. You review the builder's summary and confirm with the user. Source-code edits are picked up automatically on the next agent session — no rebuild step needed.

### Builder Agent Instructions (use as CLAUDE.md when creating)

```
You are a builder agent. Your job is to make precise, minimal code changes to OKClaw source files when the main agent requests it.

## Rules

- **Minimal scope.** Only change what was requested. Do not refactor surrounding code, "improve" unrelated files, or add features not asked for.
- **Diff size limits.** Reject any change that exceeds 200 new lines or 150 modified lines in a single task. If the change is larger, push back and ask for it to be split into smaller tasks.
- **Read before writing.** Always read the target file fully before editing. Understand the existing patterns.
- **Test if possible.** If there are relevant tests, run them after your change.
- **Report back.** When done, use send_to_agent to tell the requesting agent: (a) what files you changed, (b) a summary of the changes, (c) any follow-up needed (tests, migrations).
- **No silent failures.** If you can't complete the task, explain why — don't produce partial work without flagging it.

## Safety

- Never edit files outside the requested scope
- Never commit or push anything
- Never modify secrets, credentials, or .env files
- If a change would break existing tests, stop and report
```

## Diff Size Limits — Why

A 50-line focused change is reviewable. A 500-line sweep is not. Hard limits force the agent to decompose work into reviewable chunks, which:

- Makes review meaningful (you can actually read 150 lines)
- Catches runaway edits early (if the first task hits the limit, the scope was wrong)
- Forces clear acceptance criteria per task

The limits are **per builder task**, not per session. A 500-line feature is fine as 4 sequential builder tasks of ~125 lines each, each with its own scope.

## Installing Packages

### npm (global)

```bash
npm install -g <pkg>@<version>
```

Use global install when the tool should be available across all agent sessions. For project-local dependencies, use `npm install <pkg>@<version>` within the project directory.

### pip

```bash
pip install <pkg>==<version>
```

After installing packages, the changes take effect on the next agent session. If the tool is needed immediately in the current session, it may work right away since OKClaw runs directly on the host (no container isolation).

## Adding MCP Servers

MCP servers are registered by editing configuration files. There are two approaches:

### Method 1: Project-level `.mcp.json`

Create or edit `.mcp.json` in the project root:

```json
{
  "mcpServers": {
    "server-name": {
      "command": "npx",
      "args": ["some-mcp-server"],
      "env": {}
    }
  }
}
```

### Method 2: User-level `~/.claude/settings.json`

Add the server to the `mcpServers` block in `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "server-name": {
      "command": "npx",
      "args": ["some-mcp-server"],
      "env": {}
    }
  }
}
```

After adding an MCP server, the changes take effect on the next agent session.

## Modifying Group CLAUDE.md

Each agent group has its own `CLAUDE.md` that defines personality, preferences, and behavior. Edit the group's file directly:

- **Global group**: `groups/global/CLAUDE.md`
- **Web-main group**: `groups/web-main/CLAUDE.md`
- **Custom groups**: `groups/<group-name>/CLAUDE.md`

These files are loaded every time an agent session starts for that group, so changes are picked up automatically.

## Adding Workspace Skills

To add a new skill that the agent can use:

1. Create the skill directory: `mkdir -p .claude/skills/{skill-name}/`
2. Write a `SKILL.md` file with the skill definition:

```markdown
---
name: skill-name
nameZh: 技能中文名
description: What this skill does
skillType: operational
category: system
allowed-tools:
  - Read
  - Bash
---

# Skill Title

Instructions for the skill...
```

3. Use the Web App SkillsPanel to enable or disable the skill for specific groups

## Using the Web App SkillsPanel

The OKClaw Web App includes a SkillsPanel that lets you:

- **View** all available skills (both built-in and workspace skills)
- **Enable/disable** skills per group
- **Configure** skill parameters if applicable

Access it from the Web App sidebar. Changes take effect immediately for new agent sessions.

## Example: Adding a New MCP Server

User: "Can you add a tool for reading RSS feeds?"

1. Check [mcp.so](https://mcp.so) for an existing RSS MCP server
2. If one exists → edit `.mcp.json` or `~/.claude/settings.json` to add the server entry → changes take effect on next agent session → done
3. If nothing suitable exists → delegate to a builder agent:
   - `create_agent({ name: "RSS Tool Builder", instructions: "<builder prompt from above>" })`
   - `send_to_agent({ agentGroupId, text: "Add an MCP tool 'read_rss' to src/mcp-server.ts. It should fetch an RSS URL and return the latest N items. Target: <200 new lines." })`
   - Wait for builder's report — new tool code is picked up on the next agent session

## Example: Installing a System Tool

User: "Can you transcribe audio?"

1. Check what's available — `which ffmpeg`
2. Decide approach: `@xenova/transformers` (npm) or `whisper.cpp` (compile)
3. For a global tool: `npm install -g @xenova/transformers` or install ffmpeg via the system package manager
4. Test the new capability — it should work immediately since OKClaw runs directly on the host

## When NOT to Self-Customize

- **The change is for a one-off task** — just do it in your workspace, don't modify the system
- **The request is ambiguous** — ask the user what they actually need before spinning up builders or installing packages
- **You don't know if it will work** — prototype in your workspace first, then promote to system-level install if it proves useful
