import 'dart:convert';
import 'dart:io';
import 'package:flutter_doubao_app/src/services/api_config.dart';

class VoiceService {
  WebSocket? _socket;
  Function(String)? _onMessageReceived;
  Function(String)? _onError;
  Function()? _onConnected;
  Function()? _onDisconnected;

  Future<void> connect({
    required Function(String) onMessageReceived,
    required Function(String) onError,
    required Function() onConnected,
    required Function() onDisconnected,
  }) async {
    _onMessageReceived = onMessageReceived;
    _onError = onError;
    _onConnected = onConnected;
    _onDisconnected = onDisconnected;

    try {
      _socket = await WebSocket.connect(ApiConfig.apiUrl);
      _socket?.listen(
        (data) {
          if (_onMessageReceived != null) {
            _onMessageReceived!(data);
          }
        },
        onError: (error) {
          if (_onError != null) {
            _onError!(error.toString());
          }
        },
        onDone: () {
          if (_onDisconnected != null) {
            _onDisconnected!();
          }
        },
      );

      // 发送初始化请求
      await _sendInitRequest();
      
      if (_onConnected != null) {
        _onConnected!();
      }
    } catch (e) {
      if (_onError != null) {
        _onError!(e.toString());
      }
    }
  }

  Future<void> _sendInitRequest() async {
    final initRequest = {
      "Config": {
        "S2SConfig": {
          "Provider": ApiConfig.provider,
          "OutputMode": 0,
          "ProviderParams": {
            "app": {
              "appid": ApiConfig.appId,
              "token": ApiConfig.accessToken
            },
            "dialog": {
              "extra": {
                "model": "1.2.1.0"
              }
            }
          }
        },
        "SubtitleConfig": {
          "SubtitleMode": 1
        }
      }
    };

    _socket?.add(json.encode(initRequest));
  }

  void sendVoiceData(List<int> audioData) {
    // 发送语音数据
    _socket?.add(audioData);
  }

  void sendTextMessage(String text) {
    final textRequest = {
      "Input": {
        "Text": text
      }
    };
    _socket?.add(json.encode(textRequest));
  }

  void close() {
    _socket?.close();
    _socket = null;
  }

  bool isConnected() {
    return _socket != null && _socket!.readyState == WebSocket.open;
  }
}
