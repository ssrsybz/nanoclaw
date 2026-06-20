import WebSocket from 'ws';

const WS_URL = 'ws://localhost:3100';
const WORKSPACE_ID = '21b28304-941a-4919-8dae-eb90e0aa6e21';
const CONVERSATION_ID = 'ed513963-6a00-4942-83bd-405d280e48a8';

const ws = new WebSocket(WS_URL);
let streamEnded = false;
let partTypes = [];
let stateChanges = [];
let lastStreamEnd = null;

ws.on('open', () => {
  console.log('[connected]');
  ws.send(JSON.stringify({ type: 'switch_conversation', workspaceId: WORKSPACE_ID, conversationId: CONVERSATION_ID }));
  setTimeout(() => {
    console.log('[sending message]');
    ws.send(JSON.stringify({
      type: 'message',
      workspaceId: WORKSPACE_ID,
      conversationId: CONVERSATION_ID,
      content: '请只回复"测试成功"四个字,不要调用任何工具,不要思考过程。',
    }));
  }, 400);
});

ws.on('message', (raw) => {
  const data = JSON.parse(raw.toString());
  const t = data.type;
  if (t === 'stream_end') {
    streamEnded = true;
    lastStreamEnd = data;
    console.log('  [stream_end] model=', data.model, 'apiCalls?', !!data.apiCalls);
  } else if (t === 'agent_state_changed') {
    stateChanges.push(data.status);
    console.log('  [agent_state_changed]', data.status);
  } else if (['assistant','thinking','tool_use','tool_result'].includes(t)) {
    partTypes.push(t);
  } else if (t !== 'typing' && t !== 'connected' && t !== 'agent_state') {
    console.log('  [msg]', t);
  }
});

ws.on('close', () => console.log('[closed]'));

// 等 stream_end
let waited = 0;
const iv = setInterval(() => {
  waited += 2;
  if (streamEnded || waited > 90) {
    clearInterval(iv);
    console.log('\n=== WS侧结果 ===');
    console.log('stream_end:', streamEnded, '| model:', lastStreamEnd?.model || 'NONE');
    console.log('流式 parts:', partTypes);
    console.log('agent_state_changed:', stateChanges);
    ws.close();
    setTimeout(() => process.exit(0), 500);
  }
}, 2000);
