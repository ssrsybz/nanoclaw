import WebSocket from 'ws';

const WS_URL = 'ws://localhost:3100';
const WORKSPACE_ID = '21b28304-941a-4919-8dae-eb90e0aa6e21';
const CONVERSATION_ID = '94e47c72-cef3-4e7a-a291-92ab58653c94';

const ws = new WebSocket(WS_URL);
let streamStarted = false;
let streamEnded = false;
let partTypes = [];
let stateChangedSeen = [];

ws.on('open', () => {
  console.log('[connected]');
  ws.send(JSON.stringify({ type: 'switch_conversation', workspaceId: WORKSPACE_ID, conversationId: CONVERSATION_ID }));
  ws.send(JSON.stringify({ type: 'resume', conversationId: CONVERSATION_ID, lastReceivedIndex: 0 }));
  // 发一条简短消息触发 Agent
  setTimeout(() => {
    console.log('[sending message]');
    ws.send(JSON.stringify({
      type: 'message',
      workspaceId: WORKSPACE_ID,
      conversationId: CONVERSATION_ID,
      content: '请只回复"测试OK"这四个字,不要调用任何工具,不要思考。',
    }));
  }, 500);
});

ws.on('message', (raw) => {
  const data = JSON.parse(raw.toString());
  const t = data.type;
  if (t === 'stream_start') { streamStarted = true; console.log('  [stream_start]'); }
  else if (t === 'stream_end') {
    streamEnded = true;
    console.log('  [stream_end] model=', data.model, 'apiCalls?', !!data.apiCalls);
  }
  else if (t === 'agent_state_changed') {
    stateChangedSeen.push(data);
    console.log('  [agent_state_changed]', data.conversationId, data.status);
  }
  else if (['assistant','thinking','tool_use','tool_result'].includes(t)) {
    partTypes.push(t);
  }
  else if (t === 'typing') { /* ignore */ }
  else { console.log('  [msg]', t); }
});

// 等 stream_end 后再退出,留时间给后端落库
ws.on('close', () => console.log('[closed]'));

setTimeout(() => {
  console.log('\n=== 验证结果 ===');
  console.log('stream_start 收到:', streamStarted);
  console.log('stream_end 收到:', streamEnded);
  console.log('流式 parts:', partTypes);
  console.log('agent_state_changed 事件数:', stateChangedSeen.length, stateChangedSeen.map(s=>s.status));
  ws.close();
  process.exit(0);
}, 60000);
