---
name: add-wechat
description: Add WeChat (Wechaty) channel integration to NanoClaw. Uses personal WeChat account via Wechaty - no public URL required, but has account ban risk. For enterprise use, consider add-wechat-work instead.
---

# Add WeChat Channel (Wechaty)

This skill adds WeChat support via Wechaty (personal WeChat account). It walks through interactive setup.

> ⚠️ **Warning**: Wechaty uses the WeChat web protocol which may be detected and result in account bans. Use a test account, not your primary account. For enterprise use without ban risk, consider the Enterprise WeChat channel instead.

## Phase 1: Pre-flight

### Check if already applied

Check if `src/channels/wechat.ts` exists. If it does, skip to Phase 3 (Setup). The code changes are already in place.

### Ask the user

Use `AskUserQuestion` to confirm:

AskUserQuestion: Wechaty uses personal WeChat and has ban risk. Do you want to proceed? (Recommended: Use a test account only)

If they decline, suggest Enterprise WeChat instead.

## Phase 2: Apply Code Changes

### Ensure channel remote

```bash
git remote -v
```

If `wechat` is missing, add it:

```bash
git remote add wechat https://github.com/qwibitai/nanoclaw-wechat.git
```

### Merge the skill branch

```bash
git fetch wechat main
git merge wechat/main || {
  git checkout --theirs package-lock.json
  git add package-lock.json
  git merge --continue
}
```

This merges in:
- `src/channels/wechat.ts` (WechatyChannel class with self-registration via `registerChannel`)
- `src/channels/wechat.test.ts` (unit tests)
- `import './wechat.js'` appended to the channel barrel file `src/channels/index.ts`
- `wechaty` and `wechaty-puppet-wechat4u` npm dependencies in `package.json`

If the merge reports conflicts, resolve them by reading the conflicted files and understanding the intent of both sides.

### Validate code changes

```bash
npm install
npm run build
npx vitest run src/channels/wechat.test.ts
```

All tests must pass (including the new Wechaty tests) and build must be clean before proceeding.

## Phase 3: Setup

### First-time Login

Tell the user:

> Wechaty requires scanning a QR code to log in:
>
> 1. Start NanoClaw: `npm run dev`
> 2. Watch the console for a QR code
> 3. Open WeChat on your phone and scan the QR code
> 4. After successful login, the session will be cached for future use

### Session Persistence

The bot uses `MemoryCard` to persist the login session. After the first scan, you won't need to scan again unless:
- You log out from WeChat
- The session expires
- You switch to a different machine

### Build and restart

```bash
npm run build
launchctl kickstart -k gui/$(id -u)/com.nanoclaw
```

## Phase 4: Registration

### Get Chat ID

Tell the user:

> To get the chat ID for registration:
>
> **For Private Chat:**
> 1. Send a message to your bot (the WeChat account you logged in with)
> 2. Check the logs: `tail -f logs/nanoclaw.log`
> 3. Look for the chat JID like `wc:user:xxx`
>
> **For Group Chat:**
> 1. Add the bot to a group
> 2. Send a message in the group
> 3. Check the logs for the chat JID like `wc:room:xxx`

Wait for the user to provide the chat ID.

### Register the channel

The chat ID, name, and folder name are needed. Use `npx tsx setup/index.ts --step register` with the appropriate flags.

For a main channel (responds to all messages):

```bash
npx tsx setup/index.ts --step register -- --jid "wc:user:<user_id>" --name "<contact-name>" --folder "wechat_main" --trigger "@${ASSISTANT_NAME}" --channel wechat --no-trigger-required --is-main
```

For group chats (trigger-only):

```bash
npx tsx setup/index.ts --step register -- --jid "wc:room:<room_id>" --name "<group-name>" --folder "wechat_<group-name>" --trigger "@${ASSISTANT_NAME}" --channel wechat
```

## Phase 5: Verify

### Test the connection

Tell the user:

> Send a message to your registered WeChat chat:
> - For main chat: Any message works
> - For non-main: @mention the bot name
>
> The bot should respond within a few seconds.

### Check logs if needed

```bash
tail -f logs/nanoclaw.log
```

## Troubleshooting

### QR code not appearing

1. Make sure you're running in a terminal that supports QR codes
2. Check that `wechaty-puppet-wechat4u` is installed
3. Try running with `npm run dev` to see verbose output

### Login failed / Session expired

1. Delete the session cache: `rm -rf .wechaty/`
2. Restart NanoClaw
3. Scan the QR code again

### Bot not responding

1. Check the bot is logged in: Look for "Wechaty bot started" in logs
2. Check chat is registered: `sqlite3 store/messages.db "SELECT * FROM registered_groups WHERE jid LIKE 'wc:%'"`
3. For non-main chats: message must include trigger pattern
4. Service is running: `launchctl list | grep nanoclaw`

### Account banned

If your account is restricted:
1. Wechaty has been detected by WeChat
2. Use a test account instead of your primary account
3. Consider using Enterprise WeChat instead

### Message not received in groups

1. Make sure the bot is still in the group
2. Check if you were removed from the group
3. Verify the room_id matches

## Risk Mitigation

To reduce ban risk:
- ✅ Use a test account, not your primary account
- ✅ Avoid sending too many messages in a short time
- ✅ Avoid using sensitive keywords
- ✅ Don't use for commercial purposes
- ❌ Don't send the same message to many users

## After Setup

The WeChat bot supports:
- Private chat (1:1)
- Group chat (rooms)
- Text messages
- Message splitting for long responses
- Session persistence (no need to scan QR every time)

## Why Wechaty?

Wechaty is ideal for NanoClaw local development:
- ✅ No public URL required
- ✅ No need for ngrok or reverse proxy
- ✅ Works behind NAT/firewall
- ✅ No enterprise registration needed

But has trade-offs:
- ⚠️ Account ban risk
- ⚠️ Web protocol may be blocked
- ⚠️ Not officially supported by WeChat

## JID Format

| WeChat Scenario | JID Format | Example |
|-----------------|------------|---------|
| Private chat | `wc:user:{user_id}` | `wc:user:wxid_xxx` |
| Group chat | `wc:room:{room_id}` | `wc:room:xxx@chatroom` |

## Alternative: Enterprise WeChat

For enterprise users who need stability:
- Use Enterprise WeChat (WeChat Work)
- Requires public callback URL (ngrok for local dev)
- No ban risk
- Official API support

See `/add-wechat-work` skill for enterprise setup.
