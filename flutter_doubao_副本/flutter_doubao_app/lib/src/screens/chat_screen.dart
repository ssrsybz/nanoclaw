import 'dart:async';
import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:flutter_doubao_app/src/providers/chat_provider.dart';
import 'package:flutter_doubao_app/src/providers/theme_provider.dart';
import 'package:flutter_doubao_app/src/providers/remote_control/index.dart';
import 'package:flutter_doubao_app/src/services/call_status.dart';
import 'package:flutter_doubao_app/src/services/voice_call_service.dart';
import 'package:flutter_doubao_app/src/services/video_call_service.dart';
import 'package:flutter_doubao_app/src/services/audio_service.dart';
import 'package:flutter_doubao_app/src/services/stream_audio_player.dart';
import 'package:flutter_doubao_app/src/services/api_config.dart';
import 'package:flutter_doubao_app/src/widgets/message_bubble.dart';
import 'package:flutter_doubao_app/src/widgets/message_input.dart';
import 'package:flutter_doubao_app/src/widgets/loop_video_player.dart';
import 'package:flutter_doubao_app/src/widgets/blur_video_player.dart';
import 'package:flutter_doubao_app/src/screens/video_recording_screen.dart';
import 'package:flutter_doubao_app/src/screens/remote_control/remote_control_screen.dart';
import 'package:wakelock_plus/wakelock_plus.dart';
import 'package:volc_engine_rtc/volc_engine_rtc.dart';

class ChatScreen extends StatefulWidget {
  @override
  _ChatScreenState createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final ScrollController _scrollController = ScrollController();

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  void _scrollToBottom() {
    if (_scrollController.hasClients) {
      _scrollController.animateTo(
        _scrollController.position.maxScrollExtent,
        duration: Duration(milliseconds: 300),
        curve: Curves.easeOut,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final chatProvider = Provider.of<ChatProvider>(context);
    final themeProvider = Provider.of<ThemeProvider>(context);

    WidgetsBinding.instance.addPostFrameCallback((_) {
      _scrollToBottom();
    });

    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: Theme.of(context).primaryColor,
              ),
              child: Center(
                child: Text(
                  '豆包',
                  style: TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
            ),
            SizedBox(width: 12),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('豆包', style: TextStyle(fontSize: 18)),
                Text('在线', style: TextStyle(fontSize: 12, color: Colors.green)),
              ],
            ),
          ],
        ),
        actions: [
          IconButton(
            onPressed: () {
              Navigator.push(
                context,
                MaterialPageRoute(builder: (context) => VoiceCallScreen()),
              );
            },
            icon: Icon(Icons.call),
          ),
          IconButton(
            onPressed: () {
              Navigator.push(
                context,
                MaterialPageRoute(builder: (context) => VideoCallScreen()),
              );
            },
            icon: Icon(Icons.video_call),
          ),
          IconButton(
            onPressed: () {
              Navigator.push(
                context,
                MaterialPageRoute(builder: (context) => const RemoteControlScreen()),
              );
            },
            icon: const Icon(Icons.phonelink),
            tooltip: '远程控制',
          ),
          IconButton(
            onPressed: themeProvider.toggleTheme,
            icon: Icon(
              themeProvider.isDarkMode ? Icons.light_mode : Icons.dark_mode,
            ),
          ),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: chatProvider.messages.isEmpty
                ? Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Container(
                          width: 80,
                          height: 80,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: Theme.of(
                              context,
                            ).primaryColor.withOpacity(0.1),
                          ),
                          child: Center(
                            child: Icon(
                              Icons.chat_bubble_outline,
                              size: 40,
                              color: Theme.of(context).primaryColor,
                            ),
                          ),
                        ),
                        SizedBox(height: 16),
                        Text(
                          '开始与豆包聊天吧',
                          style: TextStyle(
                            fontSize: 18,
                            color: Theme.of(context).textTheme.bodyLarge?.color,
                          ),
                        ),
                        SizedBox(height: 8),
                        Text(
                          '我是你的智能助手，可以帮你解决问题',
                          style: TextStyle(
                            fontSize: 14,
                            color: Theme.of(
                              context,
                            ).textTheme.bodyMedium?.color?.withOpacity(0.6),
                          ),
                        ),
                      ],
                    ),
                  )
                : ListView.builder(
                    controller: _scrollController,
                    itemCount: chatProvider.messages.length,
                    itemBuilder: (context, index) {
                      final message = chatProvider.messages[index];
                      return MessageBubble(message: message);
                    },
                  ),
          ),
          if (chatProvider.isLoading)
            Container(
              padding: EdgeInsets.symmetric(vertical: 8, horizontal: 16),
              alignment: Alignment.centerLeft,
              child: Row(
                children: [
                  Container(
                    width: 32,
                    height: 32,
                    margin: EdgeInsets.only(right: 8),
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: Theme.of(context).primaryColor,
                    ),
                  ),
                  Container(
                    padding: EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Theme.of(context).cardColor,
                      borderRadius: BorderRadius.only(
                        topLeft: Radius.circular(16),
                        topRight: Radius.circular(16),
                        bottomRight: Radius.circular(16),
                      ),
                    ),
                    child: Row(
                      children: [
                        SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        ),
                        SizedBox(width: 8),
                        Text('正在输入...'),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          Container(
            padding: EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Row(
              children: [
                GestureDetector(
                  onTap: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                          builder: (context) => VideoRecordingScreen()),
                    );
                  },
                  child: Container(
                    padding: EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    decoration: BoxDecoration(
                      color: Theme.of(context).primaryColor.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(
                        color: Theme.of(context).primaryColor.withOpacity(0.3),
                      ),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          Icons.videocam,
                          size: 18,
                          color: Theme.of(context).primaryColor,
                        ),
                        SizedBox(width: 6),
                        Text(
                          '视频录制',
                          style: TextStyle(
                            color: Theme.of(context).primaryColor,
                            fontSize: 14,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
          MessageInput(),
        ],
      ),
    );
  }
}

class VoiceCallScreen extends StatefulWidget {
  @override
  _VoiceCallScreenState createState() => _VoiceCallScreenState();
}

class _VoiceCallScreenState extends State<VoiceCallScreen> {
  final VoiceCallService _callService = VoiceCallService();
  final PcmRecorder _recorder = PcmRecorder();
  final StreamAudioPlayer _streamPlayer = StreamAudioPlayer();

  CallStatus _callStatus = CallStatus.idle;
  String _callDuration = '00:00:00';
  bool _isSpeakerOn = false;
  bool _isMicrophoneOn = true;
  String _statusMessage = '正在连接...';
  String _asrText = '';
  String _chatText = '';
  bool _isPlaying = false;
  bool _isRecordingActive = false;
  int _roundCount = 0;
  bool _streamPlayerStarted = false;

  @override
  void initState() {
    super.initState();
    WakelockPlus.enable();
    _setupRecorder();
    _setupStreamPlayer();
    _initializeCall();
  }

  @override
  void dispose() {
    WakelockPlus.disable();
    _recorder.dispose();
    _streamPlayer.dispose();
    _callService.dispose();
    super.dispose();
  }

  void _setupRecorder() {
    _recorder.onAudioFrame = (frame) {
      if (_isRecordingActive && _isMicrophoneOn && _callService.isConnected) {
        _callService.sendAudioData(frame);
      }
    };
    _recorder.onError = (error) {
      print('[VoiceCallScreen] 录音错误: $error');
      _handleRecordingError(error);
    };
    _recorder.onRecordingStopped = () {
      print('[VoiceCallScreen] 录音流意外停止');
      _handleRecordingStreamStopped();
    };
  }

  void _handleRecordingError(String error) {
    if (_callStatus == CallStatus.active) {
      print('[VoiceCallScreen] 录音错误，尝试恢复: $error');
      Future.delayed(Duration(milliseconds: 200), () {
        _restartRecording();
      });
    }
  }

  void _handleRecordingStreamStopped() {
    print(
      '[VoiceCallScreen] 录音流停止，状态: _isRecordingActive=$_isRecordingActive, _isPlaying=$_isPlaying, _callStatus=$_callStatus',
    );
    if (_callStatus == CallStatus.active && _isRecordingActive && !_isPlaying) {
      print('[VoiceCallScreen] 意外停止，尝试恢复录音...');
      Future.delayed(Duration(milliseconds: 100), () {
        _restartRecording();
      });
    }
  }

  Future<void> _restartRecording() async {
    if (_callStatus != CallStatus.active) {
      print('[VoiceCallScreen] 通话未激活，不恢复录音');
      return;
    }

    if (!_callService.isConnected) {
      print('[VoiceCallScreen] WebSocket未连接，不恢复录音');
      return;
    }

    if (_isPlaying) {
      print('[VoiceCallScreen] 正在播放，稍后恢复录音');
      return;
    }

    print('[VoiceCallScreen] 重启录音...');
    _isRecordingActive = false;

    try {
      await _recorder.stop();
    } catch (e) {
      print('[VoiceCallScreen] 停止旧录音失败: $e');
    }

    await Future.delayed(Duration(milliseconds: 50));

    try {
      await _recorder.start();
      _isRecordingActive = true;
      print('[VoiceCallScreen] 录音重启成功, isRecording=${_recorder.isRecording}');
    } catch (e) {
      print('[VoiceCallScreen] 重启录音失败: $e');
      Future.delayed(Duration(milliseconds: 500), () {
        _restartRecording();
      });
    }
  }

  void _setupStreamPlayer() {
    _streamPlayer.onPlaybackCompleted = () {
      print('[VoiceCallScreen] 流式播放完成');
      if (mounted) {
        setState(() {
          _isPlaying = false;
        });
      }
      _streamPlayerStarted = false;
    };
    _streamPlayer.onError = (error) {
      print('[VoiceCallScreen] Stream player error: $error');
      if (mounted) {
        setState(() {
          _isPlaying = false;
        });
      }
      _streamPlayerStarted = false;
      _prepareNextRound();
    };
  }

  void _prepareNextRound() {
    _roundCount++;
    print('[VoiceCallScreen] 准备第 $_roundCount 轮对话');
    setState(() {
      _asrText = '';
      _chatText = '';
    });
    _restartRecording();
  }

  Future<void> _initializeCall() async {
    await _callService.initializeCall(
      userId: 'user123',
      userName: '用户',
      onCallStatusChanged: (status) {
        if (!mounted) return;
        setState(() {
          _callStatus = status;
          switch (status) {
            case CallStatus.connecting:
              _statusMessage = '正在连接...';
              break;
            case CallStatus.active:
              _statusMessage = '通话中';
              _startRecording();
              break;
            case CallStatus.failed:
              _statusMessage = '连接失败';
              break;
            case CallStatus.ended:
              _statusMessage = '通话结束';
              break;
            default:
              _statusMessage = '空闲';
          }
        });
      },
      onError: (error) {
        print('Call error: $error');
        setState(() {
          _statusMessage = '错误: $error';
        });
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('通话错误: $error')));
      },
      onMessageReceived: (message) {
        print('Received message: $message');
        setState(() {
          _statusMessage = message;
        });
      },
      onCallDurationUpdated: (seconds) {
        setState(() {
          _callDuration = _formatDuration(seconds);
        });
      },
      onAsrText: (text) {
        print('[VoiceCallScreen] 收到ASR文本: $text, 当前播放状态: $_isPlaying');
        if (_isPlaying && _streamPlayerStarted) {
          print('[VoiceCallScreen] 用户开始说话，打断AI播放');
          _streamPlayer.stop();
          _streamPlayerStarted = false;
          setState(() {
            _isPlaying = false;
          });
        }
        setState(() {
          _asrText = text;
        });
      },
      onChatText: (text) {
        setState(() {
          _chatText = text;
        });
      },
      onAudioReceived: (audioData) {
        _playAudioData(audioData);
      },
      onChatEnded: () {
        print('[VoiceCallScreen] 收到chatEnded事件，一轮对话结束');
      },
      onTtsEnded: () async {
        print('[VoiceCallScreen] 收到ttsEnded事件，TTS播放结束');
        if (_streamPlayerStarted) {
          print('[VoiceCallScreen] 发送音频结束信号并等待播放完成...');
          await _streamPlayer.feed(Uint8List(0), isFinal: true);
          await _streamPlayer.waitPlayerStop();
          print('[VoiceCallScreen] 流式播放器已停止');
          _streamPlayerStarted = false;
        }
        _prepareNextRound();
      },
    );
  }

  Future<void> _startRecording() async {
    try {
      print('[VoiceCallScreen] 启动录音器...');
      await _recorder.start();
      _isRecordingActive = true;
      print(
        '[VoiceCallScreen] 录音器已启动, isRecording=${_recorder.isRecording}, _isRecordingActive=$_isRecordingActive',
      );
    } catch (e) {
      print('[VoiceCallScreen] 启动录音失败: $e');
      _isRecordingActive = false;
    }
  }

  Future<void> _stopRecording() async {
    try {
      _isRecordingActive = false;
      await _recorder.stop();
      print('[VoiceCallScreen] Recording stopped');
    } catch (e) {
      print('[VoiceCallScreen] Failed to stop recording: $e');
    }
  }

  void _playAudioData(Uint8List audioData) async {
    print('[VoiceCallScreen] 收到音频数据: ${audioData.length} 字节');

    if (mounted) {
      setState(() {
        _isPlaying = true;
      });
    }

    if (!_streamPlayerStarted) {
      print('[VoiceCallScreen] 启动流式播放器...');
      final success = await _streamPlayer.start(sampleRate: 24000);
      if (!success) {
        print('[VoiceCallScreen] 启动流式播放器失败');
        if (mounted) {
          setState(() {
            _isPlaying = false;
          });
        }
        _prepareNextRound();
        return;
      }
      _streamPlayerStarted = true;
    }

    await _streamPlayer.feed(audioData, isFinal: false);
    print('[VoiceCallScreen] 已喂入音频数据到流式播放器');
  }

  String _formatDuration(int seconds) {
    int hours = seconds ~/ 3600;
    int minutes = (seconds % 3600) ~/ 60;
    int secs = seconds % 60;
    return '${hours.toString().padLeft(2, '0')}:${minutes.toString().padLeft(2, '0')}:${secs.toString().padLeft(2, '0')}';
  }

  Future<void> _toggleSpeaker() async {
    await _callService.toggleSpeaker();
    setState(() {
      _isSpeakerOn = !_isSpeakerOn;
    });
  }

  Future<void> _toggleMicrophone() async {
    await _callService.toggleMicrophone();
    setState(() {
      _isMicrophoneOn = !_isMicrophoneOn;
    });
  }

  Future<void> _endCall() async {
    await _stopRecording();
    await _callService.endCall();
    Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              Theme.of(context).primaryColor,
              Theme.of(context).primaryColor.withOpacity(0.8),
            ],
          ),
        ),
        child: SafeArea(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Padding(
                padding: EdgeInsets.symmetric(horizontal: 16, vertical: 24),
                child: Row(
                  children: [
                    IconButton(
                      onPressed: () => Navigator.pop(context),
                      icon: Icon(Icons.arrow_back, color: Colors.white),
                    ),
                    Spacer(),
                    Text(
                      '语音通话',
                      style: TextStyle(color: Colors.white, fontSize: 18),
                    ),
                    Spacer(),
                    SizedBox(width: 48),
                  ],
                ),
              ),
              Expanded(
                child: SingleChildScrollView(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Container(
                        width: 200,
                        height: 200,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: Colors.white.withOpacity(0.3),
                            width: 3,
                          ),
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black.withOpacity(0.3),
                              blurRadius: 20,
                              spreadRadius: 5,
                            ),
                          ],
                        ),
                        child: ClipOval(
                          child: LoopVideoPlayer(
                            assetPath: 'assets/videos/avatar.mp4',
                            fit: BoxFit.cover,
                          ),
                        ),
                      ),
                      SizedBox(height: 24),
                      Text(
                        '豆包',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 24,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      SizedBox(height: 8),
                      Text(
                        '$_statusMessage ${_callStatus == CallStatus.active ? _callDuration : ''}',
                        style: TextStyle(
                          color: Colors.white.withOpacity(0.8),
                          fontSize: 16,
                        ),
                      ),
                      if (_asrText.isNotEmpty) ...[
                        SizedBox(height: 16),
                        Container(
                          margin: EdgeInsets.symmetric(horizontal: 24),
                          padding: EdgeInsets.symmetric(
                            horizontal: 16,
                            vertical: 12,
                          ),
                          decoration: BoxDecoration(
                            color: Colors.white.withOpacity(0.15),
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(
                              color: Colors.white.withOpacity(0.2),
                              width: 1,
                            ),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(
                                    Icons.mic,
                                    color: Colors.white70,
                                    size: 14,
                                  ),
                                  SizedBox(width: 4),
                                  Text(
                                    '你说:',
                                    style: TextStyle(
                                      color: Colors.white70,
                                      fontSize: 12,
                                    ),
                                  ),
                                ],
                              ),
                              SizedBox(height: 4),
                              Text(
                                _asrText,
                                style: TextStyle(
                                  color: Colors.white,
                                  fontSize: 15,
                                ),
                                softWrap: true,
                                maxLines: null,
                              ),
                            ],
                          ),
                        ),
                      ],
                      if (_chatText.isNotEmpty) ...[
                        SizedBox(height: 8),
                        Container(
                          margin: EdgeInsets.symmetric(horizontal: 24),
                          padding: EdgeInsets.symmetric(
                            horizontal: 16,
                            vertical: 12,
                          ),
                          decoration: BoxDecoration(
                            color: Colors.white.withOpacity(0.15),
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(
                              color: Colors.white.withOpacity(0.2),
                              width: 1,
                            ),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(
                                    Icons.smart_toy,
                                    color: Colors.white70,
                                    size: 14,
                                  ),
                                  SizedBox(width: 4),
                                  Text(
                                    '豆包:',
                                    style: TextStyle(
                                      color: Colors.white70,
                                      fontSize: 12,
                                    ),
                                  ),
                                ],
                              ),
                              SizedBox(height: 4),
                              Text(
                                _chatText,
                                style: TextStyle(
                                  color: Colors.white,
                                  fontSize: 15,
                                ),
                                softWrap: true,
                                maxLines: null,
                              ),
                            ],
                          ),
                        ),
                      ],
                      if (_isPlaying) ...[
                        SizedBox(height: 16),
                        Container(
                          padding: EdgeInsets.symmetric(
                            horizontal: 16,
                            vertical: 8,
                          ),
                          decoration: BoxDecoration(
                            color: Colors.white.withOpacity(0.1),
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              SizedBox(
                                width: 16,
                                height: 16,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Colors.white,
                                ),
                              ),
                              SizedBox(width: 8),
                              Text(
                                '正在播放...',
                                style: TextStyle(color: Colors.white70),
                              ),
                            ],
                          ),
                        ),
                      ],
                      SizedBox(height: 24),
                    ],
                  ),
                ),
              ),
              Padding(
                padding: EdgeInsets.symmetric(horizontal: 48, vertical: 32),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceAround,
                  children: [
                    IconButton(
                      onPressed: _toggleSpeaker,
                      icon: Icon(
                        _isSpeakerOn ? Icons.volume_off : Icons.volume_up,
                        color: Colors.white,
                        size: 32,
                      ),
                    ),
                    Container(
                      width: 64,
                      height: 64,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: Colors.red,
                      ),
                      child: IconButton(
                        onPressed: _endCall,
                        icon: Icon(
                          Icons.call_end,
                          color: Colors.white,
                          size: 32,
                        ),
                      ),
                    ),
                    IconButton(
                      onPressed: _toggleMicrophone,
                      icon: Icon(
                        _isMicrophoneOn ? Icons.mic : Icons.mic_off,
                        color: Colors.white,
                        size: 32,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class VideoCallScreen extends StatefulWidget {
  @override
  _VideoCallScreenState createState() => _VideoCallScreenState();
}

class _VideoCallScreenState extends State<VideoCallScreen> {
  final VideoCallService _callService = VideoCallService();
  CallStatus _callStatus = CallStatus.idle;
  String _callDuration = '00:00:00';
  bool _isCameraOn = false;
  bool _isMicrophoneOn = true;
  bool _isSpeakerOn = false;
  bool _isFrontCamera = true;
  String? _remoteUserId;
  String _statusMessage = '正在连接...';
  bool _isEndingCall = false;

  @override
  void initState() {
    super.initState();
    WakelockPlus.enable();
    _initializeCall();
  }

  Future<void> _initializeCall() async {
    await _callService.initializeCall(
      userId: 'user123',
      userName: '用户',
      onCallStatusChanged: (status) {
        if (!mounted) return;
        setState(() {
          _callStatus = status;
          switch (status) {
            case CallStatus.connecting:
              _statusMessage = '正在连接...';
              break;
            case CallStatus.active:
              _statusMessage = '通话中';
              break;
            case CallStatus.failed:
              _statusMessage = '连接失败';
              break;
            case CallStatus.ended:
              _statusMessage = '通话结束';
              break;
            default:
              _statusMessage = '空闲';
          }
        });
      },
      onError: (error) {
        print('Call error: $error');
        if (mounted) {
          setState(() {
            _statusMessage = '错误: $error';
          });
          ScaffoldMessenger.of(
            context,
          ).showSnackBar(SnackBar(content: Text('通话错误: $error')));
        }
      },
      onMessageReceived: (message) {
        print('Received message: $message');
        if (mounted) {
          setState(() {
            _statusMessage = message;
          });
        }
      },
      onCallDurationUpdated: (seconds) {
        if (mounted) {
          setState(() {
            _callDuration = _formatDuration(seconds);
          });
        }
      },
      onRemoteUserJoined: (userId) {
        print('Remote user joined: $userId');
        if (mounted) {
          setState(() {
            _remoteUserId = userId;
          });
        }
      },
      onRemoteUserLeft: (userId) {
        print('Remote user left: $userId');
        if (mounted) {
          setState(() {
            _remoteUserId = null;
          });
        }
      },
      onVideoReady: () {
        print('Video ready callback');
        if (mounted) {
          setState(() {
            _isCameraOn = true;
          });
        }
      },
    );
  }

  String _formatDuration(int seconds) {
    int hours = seconds ~/ 3600;
    int minutes = (seconds % 3600) ~/ 60;
    int secs = seconds % 60;
    return '${hours.toString().padLeft(2, '0')}:${minutes.toString().padLeft(2, '0')}:${secs.toString().padLeft(2, '0')}';
  }

  Future<void> _toggleCameraOnOff() async {
    await _callService.toggleCameraOnOff();
    setState(() {
      _isCameraOn = _callService.isCameraOn;
    });
  }

  Future<void> _switchCamera() async {
    await _callService.switchCamera();
    setState(() {
      _isFrontCamera = _callService.isFrontCamera;
    });
  }

  Future<void> _toggleMicrophone() async {
    await _callService.toggleMicrophone();
    setState(() {
      _isMicrophoneOn = _callService.isMicrophoneOn;
    });
  }

  Future<void> _toggleSpeaker() async {
    await _callService.toggleSpeaker();
    setState(() {
      _isSpeakerOn = _callService.isSpeakerOn;
    });
  }

  Future<void> _endCall() async {
    if (_isEndingCall) return;
    _isEndingCall = true;

    await _callService.endCall();

    if (mounted) {
      Navigator.of(context).pop();
    }
  }

  @override
  void dispose() {
    WakelockPlus.disable();
    _callService.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        color: Colors.black,
        child: SafeArea(
          child: Stack(
            children: [
              Positioned.fill(
                child: BlurVideoPlayer(
                  assetPath: 'assets/videos/zhouchao.mp4',
                  heightFactor: 1.0,
                  blurSigma: 5.0,
                ),
              ),
              Positioned.fill(
                child: Container(
                  width: double.infinity,
                  height: double.infinity,
                  child: _buildRemoteVideo(),
                ),
              ),
              Positioned(
                top: 16,
                right: 16,
                child: Container(
                  width: 120,
                  height: 180,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Colors.white, width: 2),
                  ),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(6),
                    child: _buildLocalVideo(),
                  ),
                ),
              ),
              Positioned(
                top: 0,
                left: 0,
                right: 0,
                child: Padding(
                  padding: EdgeInsets.symmetric(horizontal: 16, vertical: 16),
                  child: Row(
                    children: [
                      IconButton(
                        onPressed: () => Navigator.pop(context),
                        icon: Icon(Icons.arrow_back, color: Colors.white),
                      ),
                      Spacer(),
                      Column(
                        children: [
                          Text(
                            '豆包',
                            style: TextStyle(color: Colors.white, fontSize: 18),
                          ),
                          Text(
                            _callStatus == CallStatus.active
                                ? '$_statusMessage $_callDuration'
                                : _statusMessage,
                            style: TextStyle(
                              color: Colors.white.withOpacity(0.8),
                              fontSize: 14,
                            ),
                          ),
                        ],
                      ),
                      Spacer(),
                      SizedBox(width: 48),
                    ],
                  ),
                ),
              ),
              Positioned(
                bottom: 0,
                left: 0,
                right: 0,
                child: Padding(
                  padding: EdgeInsets.symmetric(horizontal: 48, vertical: 32),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceAround,
                    children: [
                      IconButton(
                        onPressed: _toggleCameraOnOff,
                        icon: Icon(
                          _isCameraOn ? Icons.videocam : Icons.videocam_off,
                          color: Colors.white,
                          size: 32,
                        ),
                      ),
                      IconButton(
                        onPressed: _toggleMicrophone,
                        icon: Icon(
                          _isMicrophoneOn ? Icons.mic : Icons.mic_off,
                          color: Colors.white,
                          size: 32,
                        ),
                      ),
                      Container(
                        width: 64,
                        height: 64,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: Colors.red,
                        ),
                        child: IconButton(
                          onPressed: _endCall,
                          icon: Icon(
                            Icons.call_end,
                            color: Colors.white,
                            size: 32,
                          ),
                        ),
                      ),
                      IconButton(
                        onPressed: _toggleSpeaker,
                        icon: Icon(
                          _isSpeakerOn ? Icons.volume_off : Icons.volume_up,
                          color: Colors.white,
                          size: 32,
                        ),
                      ),
                      IconButton(
                        onPressed: _switchCamera,
                        icon: Icon(
                          Icons.switch_camera,
                          color: Colors.white,
                          size: 32,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildRemoteVideo() {
    if (_callStatus == CallStatus.connecting) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            CircularProgressIndicator(color: Colors.white),
            SizedBox(height: 16),
            Text('正在连接...', style: TextStyle(color: Colors.white)),
          ],
        ),
      );
    }

    if (_remoteUserId != null) {
      return SizedBox.shrink();
    }

    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            width: 80,
            height: 80,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: Colors.white.withOpacity(0.1),
            ),
            child: Icon(
              Icons.person,
              size: 40,
              color: Colors.white.withOpacity(0.5),
            ),
          ),
          SizedBox(height: 8),
          Text(
            _callStatus == CallStatus.active
                ? '等待 AI Agent...'
                : _statusMessage,
            style: TextStyle(
              color: Colors.white.withOpacity(0.8),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildLocalVideo() {
    if (!_isCameraOn) {
      return Container(
        color: Colors.black,
        child: Center(
          child: Icon(
            Icons.videocam_off,
            size: 40,
            color: Colors.white.withOpacity(0.5),
          ),
        ),
      );
    }

    return RTCSurfaceView(
      context: RTCViewContext.localContext(userId: ApiConfig.rtcUserId),
      renderMode: VideoRenderMode.fit,
    );
  }
}
