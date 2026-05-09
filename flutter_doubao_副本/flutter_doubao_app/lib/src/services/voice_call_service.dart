import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:flutter_doubao_app/src/services/call_status.dart';
import 'package:flutter_doubao_app/src/services/api_config.dart';
import 'package:flutter_doubao_app/src/services/realtime_protocol.dart';
import 'package:uuid/uuid.dart';

class VoiceCallService {
  CallStatus _callStatus = CallStatus.idle;
  bool _isSpeakerOn = false;
  bool _isMicrophoneOn = true;
  
  WebSocket? _socket;
  String? _dialogId;
  String? _sessionId;
  
  final Uuid _uuid = const Uuid();
  
  Function(CallStatus)? _onCallStatusChanged;
  Function(String)? _onError;
  Function(String)? _onMessageReceived;
  Function(String)? _onAsrText;
  Function(String)? _onChatText;
  Function(Uint8List)? _onAudioReceived;
  Function()? _onChatEnded;
  Function()? _onTtsEnded;
  
  Timer? _callTimer;
  int _callDuration = 0;
  Function(int)? _onCallDurationUpdated;

  void _log(String message) {
    print('[VoiceCallService] $message');
  }

  Future<void> initializeCall({
    required String userId,
    required String userName,
    required Function(CallStatus) onCallStatusChanged,
    required Function(String) onError,
    required Function(String) onMessageReceived,
    required Function(int) onCallDurationUpdated,
    Function(String)? onAsrText,
    Function(String)? onChatText,
    Function(Uint8List)? onAudioReceived,
    Function()? onChatEnded,
    Function()? onTtsEnded,
  }) async {
    _onCallStatusChanged = onCallStatusChanged;
    _onError = onError;
    _onMessageReceived = onMessageReceived;
    _onCallDurationUpdated = onCallDurationUpdated;
    _onAsrText = onAsrText;
    _onChatText = onChatText;
    _onAudioReceived = onAudioReceived;
    _onChatEnded = onChatEnded;
    _onTtsEnded = onTtsEnded;

    try {
      _updateCallStatus(CallStatus.connecting);
      _log('开始连接 WebSocket: ${ApiConfig.apiUrl}');
      
      final headers = {
        'X-Api-App-ID': ApiConfig.appId,
        'X-Api-Access-Key': ApiConfig.accessToken,
        'X-Api-Resource-Id': 'volc.speech.dialog',
        'X-Api-App-Key': 'PlgvMymc7f3tQnJ6',
      };
      
      _log('请求头: $headers');
      
      _socket = await WebSocket.connect(
        ApiConfig.apiUrl,
        headers: headers,
      );
      
      _log('WebSocket 连接成功');
      
      _socket?.listen(
        (data) => _handleWebSocketMessage(data),
        onError: (error) => _handleWebSocketError(error),
        onDone: () => _handleWebSocketDone(),
      );
      
      _startConnection();
      
    } catch (e) {
      _log('连接异常: $e');
      _updateCallStatus(CallStatus.failed);
      _onError?.call('连接失败: ${e.toString()}');
    }
  }

  void _startConnection() {
    _log('发送 StartConnection 事件');
    final frame = RealtimeProtocol.createStartConnectionFrame();
    _log('StartConnection 帧: ${frame.map((b) => b.toRadixString(16).padLeft(2, '0')).join(' ')}');
    _socket?.add(frame);
  }

  void _startSession() {
    _sessionId = _uuid.v4();
    _log('发送 StartSession 事件, sessionId: $_sessionId');
    final frame = RealtimeProtocol.createStartSessionFrame(
      sessionId: _sessionId,
      botName: '豆包',
      model: '1.2.1.0',
    );
    _log('StartSession 帧: ${frame.map((b) => b.toRadixString(16).padLeft(2, '0')).join(' ')}');
    _socket?.add(frame);
  }

  void _handleWebSocketMessage(dynamic data) {
    try {
      Uint8List bytes;
      if (data is List<int>) {
        bytes = Uint8List.fromList(data);
      } else if (data is String) {
        _log('收到文本消息: $data');
        return;
      } else {
        return;
      }
      
      _log('收到二进制数据: ${bytes.length} 字节, hex: ${bytes.take(20).map((b) => b.toRadixString(16).padLeft(2, '0')).join(' ')}');
      
      final frame = ProtocolFrame.parse(bytes);
      if (frame == null) {
        _log('无法解析帧');
        return;
      }
      
      String? payloadStr;
      if (frame.payload != null && frame.messageType != MessageType.audioOnlyResponse) {
        try {
          payloadStr = utf8.decode(frame.payload!);
        } catch (_) {
          payloadStr = '<binary data: ${frame.payload!.length} bytes>';
        }
      } else if (frame.payload != null) {
        payloadStr = '<binary audio: ${frame.payload!.length} bytes>';
      }
      _log('解析帧: messageType=${frame.messageType}, event=${frame.event}, payload=$payloadStr');
      
      _handleFrame(frame);
      
    } catch (e) {
      _log('消息处理错误: $e');
      _onError?.call('消息处理错误: ${e.toString()}');
    }
  }

  void _handleFrame(ProtocolFrame frame) {
    _log('处理帧: event=${frame.event}, messageType=${frame.messageType}');
    
    switch (frame.event) {
      case RealtimeEvent.connectionStarted:
        _log('连接已建立');
        _onMessageReceived?.call('连接已建立');
        _startSession();
        break;
        
      case RealtimeEvent.connectionFailed:
        _log('连接失败');
        if (frame.payload != null) {
          final payloadStr = utf8.decode(frame.payload!);
          _log('错误详情: $payloadStr');
          _onError?.call('连接失败: $payloadStr');
        }
        _updateCallStatus(CallStatus.failed);
        break;
        
      case RealtimeEvent.sessionStarted:
        _log('会话已开始');
        _updateCallStatus(CallStatus.active);
        _startCallTimer();
        _onMessageReceived?.call('会话已开始，可以开始说话了');
        if (frame.payload != null) {
          try {
            final json = jsonDecode(utf8.decode(frame.payload!));
            _dialogId = json['dialog_id'];
          } catch (_) {}
        }
        break;
        
      case RealtimeEvent.sessionFailed:
        _log('会话启动失败');
        if (frame.payload != null) {
          final payloadStr = utf8.decode(frame.payload!);
          _log('错误详情: $payloadStr');
          _onError?.call('会话启动失败: $payloadStr');
        }
        _updateCallStatus(CallStatus.failed);
        break;
        
      case RealtimeEvent.asrResponse:
        if (frame.payload != null) {
          try {
            final json = jsonDecode(utf8.decode(frame.payload!));
            final results = json['results'] as List?;
            if (results != null && results.isNotEmpty) {
              final text = results.map((r) => r['text'] as String?).join('');
              _onAsrText?.call(text);
            }
          } catch (_) {}
        }
        break;
        
      case RealtimeEvent.asrEnded:
        _log('语音识别结束');
        break;
        
      case RealtimeEvent.ttsSentenceStart:
        if (frame.payload != null) {
          try {
            final json = jsonDecode(utf8.decode(frame.payload!));
            final text = json['text'] as String?;
            if (text != null) {
              _onChatText?.call(text);
            }
          } catch (_) {}
        }
        break;
        
      case RealtimeEvent.chatResponse:
        if (frame.payload != null) {
          try {
            final json = jsonDecode(utf8.decode(frame.payload!));
            final content = json['content'] as String?;
            if (content != null) {
              _onChatText?.call(content);
            }
          } catch (_) {}
        }
        break;
        
      case RealtimeEvent.ttsResponse:
        if (frame.payload != null) {
          _log('收到TTS音频: ${frame.payload!.length} 字节');
          _onAudioReceived?.call(frame.payload!);
        }
        break;
        
      case RealtimeEvent.ttsEnded:
        _log('TTS播放结束');
        _onTtsEnded?.call();
        break;
        
      case RealtimeEvent.chatEnded:
        _log('一轮对话结束，准备下一轮');
        _onChatEnded?.call();
        break;
        
      default:
        if (frame.messageType == MessageType.errorInfo) {
          String errorMsg = '未知错误';
          if (frame.payload != null) {
            try {
              final payloadStr = utf8.decode(frame.payload!);
              _log('错误帧 payload: $payloadStr');
              final json = jsonDecode(payloadStr);
              errorMsg = json['error'] ?? payloadStr;
            } catch (_) {}
          }
          _log('服务器错误: code=${frame.errorCode}, message=$errorMsg');
          _onError?.call('服务器错误 [${frame.errorCode}]: $errorMsg');
        } else if (frame.messageType == MessageType.audioOnlyResponse && frame.payload != null) {
          _log('收到音频数据: ${frame.payload!.length} 字节');
          _onAudioReceived?.call(frame.payload!);
        } else {
          _log('未处理的事件: ${frame.event}, messageType: ${frame.messageType}');
        }
    }
  }

  void _handleWebSocketError(dynamic error) {
    _log('WebSocket错误: $error');
    _updateCallStatus(CallStatus.failed);
    _onError?.call('WebSocket错误: ${error.toString()}');
  }

  void _handleWebSocketDone() {
    _log('WebSocket连接关闭');
    if (_callStatus == CallStatus.active) {
      _updateCallStatus(CallStatus.ended);
      _stopCallTimer();
    }
  }

  void sendAudioData(Uint8List audioData) {
    if (_socket != null && _socket!.readyState == WebSocket.open && _sessionId != null) {
      final frame = RealtimeProtocol.createAudioFrame(audioData, sessionId: _sessionId);
      _socket?.add(frame);
    } else {
      _log('无法发送音频数据: socket=${_socket != null}, readyState=${_socket?.readyState}, sessionId=$_sessionId');
    }
  }

  Future<void> endCall() async {
    _stopCallTimer();
    
    if (_socket != null && _socket!.readyState == WebSocket.open) {
      if (_sessionId != null) {
        final finishSessionFrame = RealtimeProtocol.createFinishSessionFrame(sessionId: _sessionId);
        _socket?.add(finishSessionFrame);
      }
      
      await Future.delayed(Duration(milliseconds: 100));
      _socket?.close();
    }
    
    _socket = null;
    _dialogId = null;
    _sessionId = null;
    _updateCallStatus(CallStatus.ended);
    _callDuration = 0;
  }

  Future<void> toggleSpeaker() async {
    _isSpeakerOn = !_isSpeakerOn;
  }

  Future<void> toggleMicrophone() async {
    _isMicrophoneOn = !_isMicrophoneOn;
  }

  void _startCallTimer() {
    _callTimer = Timer.periodic(Duration(seconds: 1), (timer) {
      _callDuration++;
      _onCallDurationUpdated?.call(_callDuration);
    });
  }

  void _stopCallTimer() {
    _callTimer?.cancel();
    _callTimer = null;
  }

  void _updateCallStatus(CallStatus status) {
    _callStatus = status;
    _onCallStatusChanged?.call(status);
  }

  CallStatus get callStatus => _callStatus;
  bool get isSpeakerOn => _isSpeakerOn;
  bool get isMicrophoneOn => _isMicrophoneOn;
  int get callDuration => _callDuration;
  bool get isConnected => _socket != null && _socket!.readyState == WebSocket.open;

  void dispose() {
    _stopCallTimer();
    _socket?.close();
    _socket = null;
  }
}
