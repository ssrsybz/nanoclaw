import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/services.dart';

class StreamAudioPlayer {
  static const MethodChannel _channel = MethodChannel('com.example.flutter_doubao_app/audio_stream');
  
  bool _isPlaying = false;
  bool _isInitialized = false;
  
  Function()? onPlaybackCompleted;
  Function(String)? onError;

  Future<bool> start({int sampleRate = 24000}) async {
    if (_isPlaying) {
      print('[StreamAudioPlayer] 播放器已在运行');
      return true;
    }
    
    try {
      final result = await _channel.invokeMethod<bool>('startPlayer', {
        'sampleRate': sampleRate,
      });
      
      if (result == true) {
        _isPlaying = true;
        _isInitialized = true;
        print('[StreamAudioPlayer] 播放器已启动, sampleRate=$sampleRate');
        return true;
      }
      return false;
    } catch (e) {
      print('[StreamAudioPlayer] 启动播放器失败: $e');
      onError?.call('启动播放器失败: $e');
      return false;
    }
  }

  Future<void> feed(Uint8List audioData, {bool isFinal = false}) async {
    if (!_isInitialized) {
      print('[StreamAudioPlayer] 播放器未初始化，无法喂入音频');
      return;
    }
    
    try {
      await _channel.invokeMethod<bool>('feedAudio', {
        'audioData': audioData,
        'isFinal': isFinal,
      });
    } catch (e) {
      print('[StreamAudioPlayer] 喂入音频失败: $e');
      onError?.call('喂入音频失败: $e');
    }
  }

  Future<void> stop() async {
    if (!_isInitialized) return;
    
    try {
      await _channel.invokeMethod<bool>('stopPlayer');
      _isPlaying = false;
      print('[StreamAudioPlayer] 播放器已停止');
    } catch (e) {
      print('[StreamAudioPlayer] 停止播放器失败: $e');
    }
  }

  Future<void> pause() async {
    if (!_isInitialized) return;
    
    try {
      await _channel.invokeMethod<bool>('pausePlayer');
      print('[StreamAudioPlayer] 播放器已暂停');
    } catch (e) {
      print('[StreamAudioPlayer] 暂停播放器失败: $e');
    }
  }

  Future<void> resume() async {
    if (!_isInitialized) return;
    
    try {
      await _channel.invokeMethod<bool>('resumePlayer');
      print('[StreamAudioPlayer] 播放器已恢复');
    } catch (e) {
      print('[StreamAudioPlayer] 恢复播放器失败: $e');
    }
  }

  Future<bool> isPlaying() async {
    if (!_isInitialized) return false;
    
    try {
      final result = await _channel.invokeMethod<bool>('isPlaying');
      return result ?? false;
    } catch (e) {
      print('[StreamAudioPlayer] 获取播放状态失败: $e');
      return false;
    }
  }

  Future<void> waitPlayerStop() async {
    if (!_isInitialized) return;
    
    try {
      await _channel.invokeMethod<bool>('waitPlayerStop');
      _isPlaying = false;
      print('[StreamAudioPlayer] 播放完成');
      onPlaybackCompleted?.call();
    } catch (e) {
      print('[StreamAudioPlayer] 等待播放完成失败: $e');
    }
  }

  bool get isPlayingSync => _isPlaying;
  bool get isInitialized => _isInitialized;

  Future<void> dispose() async {
    await stop();
    _isInitialized = false;
  }
}
