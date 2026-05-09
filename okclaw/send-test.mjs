import WebSocket from 'ws';

const ws = new WebSocket('ws://localhost:3100');

ws.on('open', () => {
  console.log('Connected to WebSocket');

  // Send a test message
  ws.send(JSON.stringify({
    type: 'message',
    conversationId: '645a1fa1-354d-401a-a71e-74fba93e0633',
    workspaceId: '645a1fa1-354d-401a-a71e-74fba93e0633',
    content: 'Hello! 你好！',
  }));

  console.log('Message sent');
});

ws.on('message', (data) => {
  console.log('Received:', data.toString().slice(0, 200));
});

ws.on('error', (err) => {
  console.error('WebSocket error:', err.message);
});

setTimeout(() => {
  ws.close();
  process.exit(0);
}, 10000);
