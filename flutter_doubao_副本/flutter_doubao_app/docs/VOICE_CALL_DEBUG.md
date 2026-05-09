# 豆包端到端语音通话调试记录

## 调试日期
2026-02-18

## 项目环境
- Flutter: 3.38.9
- Dart: 3.10.8
- 目标设备: ZTE 7531N (Android 11)

---

## 当前状态

### ✅ 已完成功能
1. **WebSocket连接** - 成功建立连接
2. **二进制协议** - 正确实现帧格式（GZIP压缩）
3. **Session管理** - 正确生成和使用Session ID
4. **音频录制** - PCM格式，16kHz，单声道
5. **音频播放** - PCM格式，24kHz，16bit，单声道
6. **屏幕常亮** - 使用 wakelock_plus

### ⚠️ 已知问题
1. **回声抑制** - 当前实现简单：播放时暂停发送音频
2. **ASR空闲超时** - 用户不说话时会触发超时

---

## API配置
```
App ID: 3937088082
Access Token: xp1FeWwmfRpZ19BuHiZBpf9ir2mbyOo-
Secret Key: Ihyh04tFLWfkNaqUtSs0Gc0xQbATrkFw
API URL: wss://openspeech.bytedance.com/api/v3/realtime/dialogue
```

---

## 协议实现

### 帧格式
```
| 字节 | 内容 |
|------|------|
| 0 | 0x11 (version=1, header_size=1) |
| 1 | (message_type << 4) | flags |
| 2 | (serialization << 4) | compression |
| 3 | 0x00 (reserved) |
| 4-7 | Event ID (大端序) |
| 8-11 | Session ID Length (大端序) |
| ... | Session ID |
| ... | Payload Size (大端序) |
| ... | Payload (GZIP压缩) |
```

### 事件类型
| 事件ID | 名称 | 方向 |
|--------|------|------|
| 1 | StartConnection | 客户端→服务器 |
| 2 | FinishConnection | 客户端→服务器 |
| 50 | ConnectionStarted | 服务器→客户端 |
| 51 | ConnectionFailed | 服务器→客户端 |
| 100 | StartSession | 客户端→服务器 |
| 102 | FinishSession | 客户端→服务器 |
| 150 | SessionStarted | 服务器→客户端 |
| 200 | TaskRequest | 客户端→服务器 |
| 352 | TTSResponse | 服务器→客户端 |
| 359 | TTSEnded | 服务器→客户端 |
| 451 | ASRResponse | 服务器→客户端 |
| 459 | ASREnded | 服务器→客户端 |
| 550 | ChatResponse | 服务器→客户端 |

---

## 文件清单

| 文件 | 说明 |
|------|------|
| `lib/src/services/realtime_protocol.dart` | 二进制协议编解码 |
| `lib/src/services/voice_call_service.dart` | WebSocket连接和事件处理 |
| `lib/src/services/audio_service.dart` | 音频录制和播放 |
| `lib/src/services/api_config.dart` | API配置 |
| `lib/src/screens/chat_screen.dart` | 语音通话UI |

---

## 参考文档

- [端到端实时语音大模型API接入文档](https://www.volcengine.com/docs/6561/1594356)
- [Dialog语音对话SDK集成指南(Android)](https://www.volcengine.com/docs/6561/1597643)
- [火山引擎控制台](https://console.volcengine.com)
