# 多轮对话音频播放问题排查指南

## 问题识别特征

当遇到以下现象时，请参考本文档进行排查：

### 现象1：音频播放卡顿/断续
- 每个字之间有静音或丢失片段
- 音频听起来不连贯
- 播放有明显间隙

### 现象2：多轮对话后录音中断
- 录音流启动后立即结束（"流结束, 总共接收: 0 字节"）
- 不断循环尝试恢复录音
- 服务器报错 `DialogAudioIdleTimeoutError`

### 现象3：无法打断AI回复
- 用户说话时AI继续播放
- 打断功能不生效

## 排查步骤

### 步骤1：确认是否使用了流式播放

**检查点：** 音频播放是否使用 `AudioTrack.MODE_STREAM` 模式？

❌ **错误方式：**
```dart
// 每次播放创建临时文件，非流式
await audioPlayer.play(DeviceFileSource(tempFilePath));
```

✅ **正确方式：**
```kotlin
// Android 原生流式播放
mPlayer = AudioTrack(
    AudioManager.STREAM_MUSIC,
    mSampleRate,
    AudioFormat.CHANNEL_OUT_MONO,
    AudioFormat.ENCODING_PCM_16BIT,
    minBufferSize,
    AudioTrack.MODE_STREAM  // 关键：流式模式
)
```

### 步骤2：检查是否有官方 Demo

**重要：** 遇到音频相关问题时，**首先查找官方 Demo 的实现方式**！

```
查找路径：
1. 项目目录下是否有 Android/iOS 原生 Demo
2. SDK 提供方是否有示例代码
3. 官方文档中的最佳实践
```

### 步骤3：检查打断机制

**检查点：** 用户开始说话时，是否停止了播放器？

```dart
// 关键代码模式
onAsrText: (text) {
  if (_isPlaying && _streamPlayerStarted) {
    _streamPlayer.stop();  // 立即停止播放
    _streamPlayerStarted = false;
    _isPlaying = false;
  }
  // ... 其他处理
},
```

### 步骤4：检查并发调用

**检查点：** 是否有多个回调同时触发同一操作？

使用日志追踪：
```
grep -E "(准备第|ttsEnded|chatEnded)" logcat.log
```

如果看到同一时间多次调用，需要添加状态锁或重新设计回调逻辑。

## 关键代码模式

### 模式1：Android 流式音频播放器

**核心结构：**
```kotlin
class SpeechStreamPlayer {
    private var mPlayer: AudioTrack? = null
    private var mAudioBuffer: BlockingQueue<ByteArray> = LinkedBlockingQueue()
    private var mWorker: Thread? = null
    
    fun start(): Boolean {
        // 1. 初始化 AudioTrack (MODE_STREAM)
        // 2. 启动播放线程
        // 3. 开始播放
    }
    
    fun feed(audio: ByteArray, isFinal: Boolean) {
        // 将音频数据分块放入队列
        mAudioBuffer.put(audioChunk)
    }
    
    fun stop() {
        // 停止播放线程和 AudioTrack
    }
}
```

### 模式2：Flutter 平台通道

**Android 端：**
```kotlin
MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL)
    .setMethodCallHandler { call, result ->
        when (call.method) {
            "startPlayer" -> { /* ... */ }
            "feedAudio" -> { /* ... */ }
            "stopPlayer" -> { /* ... */ }
        }
    }
```

**Flutter 端：**
```dart
class StreamAudioPlayer {
  static const MethodChannel _channel = MethodChannel('channel_name');
  
  Future<bool> start({int sampleRate = 24000}) async {
    return await _channel.invokeMethod('startPlayer', {'sampleRate': sampleRate});
  }
  
  Future<void> feed(Uint8List audioData, {bool isFinal = false}) async {
    await _channel.invokeMethod('feedAudio', {'audioData': audioData, 'isFinal': isFinal});
  }
}
```

### 模式3：打断机制

```dart
// 在 ASR 回调中检查并停止播放
onAsrText: (text) {
  if (_isPlaying) {
    _streamPlayer.stop();
    _isPlaying = false;
  }
},
```

## 常见陷阱

### 陷阱1：使用高级音频库而非原生 API

**问题：** `audioplayers`、`just_audio` 等库适合播放完整音频文件，不适合流式播放。

**解决：** 对于实时语音对话，使用平台通道调用原生 `AudioTrack` (Android) 或 `AVAudioEngine` (iOS)。

### 陷阱2：忽略音频焦点管理

**问题：** 录音和播放同时进行时，可能发生音频焦点冲突。

**解决：** 
- Android：使用 `AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK`
- 或参考 SDK 是否提供内置播放器

### 陷阱3：回调并发问题

**问题：** `onTtsEnded` 和 `onPlaybackCompleted` 可能同时触发。

**解决：** 
- 方案A：添加状态锁防止并发
- 方案B：只在一个回调中处理下一轮准备

### 陷阱4：忘记实现打断机制

**问题：** 用户说话时 AI 继续播放，体验差。

**解决：** 在 ASR 回调中停止播放器。

## 快速诊断命令

```bash
# 查看音频播放日志
adb logcat -s flutter:V SpeechStreamPlayer:V AudioTrack:V AudioRecord:V

# 检查是否有并发调用
adb logcat -d | grep -E "(准备第|ttsEnded|chatEnded)" | tail -30

# 检查录音流状态
adb logcat -d | grep -E "流结束.*接收.*字节" | tail -20

# 检查服务器错误
adb logcat -d | grep -E "DialogAudioIdleTimeoutError|error" | tail -20
```

## 文件参考

| 文件 | 用途 |
|------|------|
| `SpeechStreamPlayer.kt` | Android 流式播放器实现 |
| `MainActivity.kt` | 平台通道接口 |
| `stream_audio_player.dart` | Flutter 播放器封装 |
| `chat_screen.dart` | 打断机制实现 |

## 总结

1. **先找官方 Demo** - 不要自己发散实现
2. **使用流式播放** - `AudioTrack.MODE_STREAM`
3. **实现打断机制** - ASR 事件触发停止
4. **注意并发问题** - 多回调场景需谨慎
5. **使用原生 API** - 性能敏感场景首选
