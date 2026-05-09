import 'dart:async';
import 'dart:io';
import 'dart:typed_data';
import 'package:record/record.dart';
import 'package:audioplayers/audioplayers.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:path_provider/path_provider.dart';

class AudioService {
  final AudioRecorder _audioRecorder = AudioRecorder();
  final AudioPlayer _audioPlayer = AudioPlayer();
  
  bool _isRecording = false;
  bool _isPlaying = false;
  String? _recordingPath;
  Completer<void>? _playCompleter;
  
  Function(Uint8List)? onAudioData;
  Function()? onRecordingStarted;
  Function()? onRecordingStopped;
  Function()? onPlaybackCompleted;
  Function(String)? onError;

  AudioService() {
    _audioPlayer.onPlayerComplete.listen((_) {
      print('[AudioService] onPlayerComplete 触发');
      _isPlaying = false;
      if (_playCompleter != null && !_playCompleter!.isCompleted) {
        _playCompleter!.complete();
      }
      onPlaybackCompleted?.call();
    });
    
    _audioPlayer.onLog.listen((msg) {
      print('[AudioService] Player log: $msg');
    });
    
    _audioPlayer.onPlayerStateChanged.listen((state) {
      print('[AudioService] Player state changed: $state');
    });
  }

  Future<bool> requestPermissions() async {
    final microphoneStatus = await Permission.microphone.request();
    return microphoneStatus.isGranted;
  }

  Future<bool> hasPermission() async {
    return await _audioRecorder.hasPermission();
  }

  Future<void> startRecording() async {
    if (_isRecording) return;
    
    try {
      final hasPermission = await requestPermissions();
      if (!hasPermission) {
        onError?.call('麦克风权限未授予');
        return;
      }
      
      final directory = await getTemporaryDirectory();
      _recordingPath = '${directory.path}/voice_call_${DateTime.now().millisecondsSinceEpoch}.wav';
      
      await _audioRecorder.start(
        const RecordConfig(
          encoder: AudioEncoder.wav,
          sampleRate: 16000,
          numChannels: 1,
        ),
        path: _recordingPath!,
      );
      
      _isRecording = true;
      onRecordingStarted?.call();
      
    } catch (e) {
      onError?.call('启动录音失败: $e');
    }
  }

  Future<Uint8List?> stopRecording() async {
    if (!_isRecording) return null;
    
    try {
      final path = await _audioRecorder.stop();
      _isRecording = false;
      onRecordingStopped?.call();
      
      if (path != null && File(path).existsSync()) {
        return await File(path).readAsBytes();
      }
      return null;
    } catch (e) {
      onError?.call('停止录音失败: $e');
      return null;
    }
  }

  Future<void> playAudio(Uint8List audioData) async {
    if (_isPlaying) {
      await _audioPlayer.stop();
      if (_playCompleter != null && !_playCompleter!.isCompleted) {
        _playCompleter!.complete();
      }
    }
    
    try {
      _isPlaying = true;
      _playCompleter = Completer<void>();
      
      final tempDir = await getTemporaryDirectory();
      final tempFile = File('${tempDir.path}/playback_${DateTime.now().millisecondsSinceEpoch}.ogg');
      await tempFile.writeAsBytes(audioData);
      
      await _audioPlayer.play(DeviceFileSource(tempFile.path));
      
      await _playCompleter!.future;
      
      if (tempFile.existsSync()) {
        tempFile.deleteSync();
      }
    } catch (e) {
      _isPlaying = false;
      onError?.call('播放音频失败: $e');
    }
  }

  Future<void> stopPlayback() async {
    if (_isPlaying) {
      await _audioPlayer.stop();
      _isPlaying = false;
      if (_playCompleter != null && !_playCompleter!.isCompleted) {
        _playCompleter!.complete();
      }
    }
  }

  Future<void> playPcmAudio(Uint8List pcmData, {int sampleRate = 24000, int channels = 1, int bitsPerSample = 16}) async {
    if (_isPlaying) {
      await _audioPlayer.stop();
      if (_playCompleter != null && !_playCompleter!.isCompleted) {
        _playCompleter!.complete();
      }
    }
    
    try {
      _isPlaying = true;
      _playCompleter = Completer<void>();
      
      final wavData = _createWavHeader(pcmData.length, sampleRate, channels, bitsPerSample);
      wavData.addAll(pcmData);
      
      final tempDir = await getTemporaryDirectory();
      final tempFile = File('${tempDir.path}/playback_${DateTime.now().millisecondsSinceEpoch}.wav');
      await tempFile.writeAsBytes(wavData);
      
      final durationMs = (pcmData.length * 1000) ~/ (sampleRate * channels * (bitsPerSample ~/ 8));
      print('[AudioService] 开始播放 WAV 文件: ${tempFile.path}, 大小: ${wavData.length} 字节, 预计时长: ${durationMs}ms');
      
      await _audioPlayer.setReleaseMode(ReleaseMode.stop);
      await _audioPlayer.play(DeviceFileSource(tempFile.path));
      
      print('[AudioService] 等待播放完成...');
      
      await Future.any([
        _playCompleter!.future,
        Future.delayed(Duration(milliseconds: durationMs + 500), () {
          print('[AudioService] 基于时长等待完成');
        }),
      ]).timeout(Duration(seconds: 30), onTimeout: () {
        print('[AudioService] 播放超时');
      });
      
      print('[AudioService] 播放完成');
      _isPlaying = false;
      
      if (tempFile.existsSync()) {
        tempFile.deleteSync();
      }
    } catch (e) {
      _isPlaying = false;
      print('[AudioService] 播放错误: $e');
      onError?.call('播放音频失败: $e');
    }
  }
  
  List<int> _createWavHeader(int dataLength, int sampleRate, int channels, int bitsPerSample) {
    final byteRate = sampleRate * channels * bitsPerSample ~/ 8;
    final blockAlign = channels * bitsPerSample ~/ 8;
    final totalLength = dataLength + 36;
    
    return [
      0x52, 0x49, 0x46, 0x46,
      totalLength & 0xFF, (totalLength >> 8) & 0xFF, (totalLength >> 16) & 0xFF, (totalLength >> 24) & 0xFF,
      0x57, 0x41, 0x56, 0x45,
      0x66, 0x6D, 0x74, 0x20,
      0x10, 0x00, 0x00, 0x00,
      0x01, 0x00,
      channels & 0xFF, (channels >> 8) & 0xFF,
      sampleRate & 0xFF, (sampleRate >> 8) & 0xFF, (sampleRate >> 16) & 0xFF, (sampleRate >> 24) & 0xFF,
      byteRate & 0xFF, (byteRate >> 8) & 0xFF, (byteRate >> 16) & 0xFF, (byteRate >> 24) & 0xFF,
      blockAlign & 0xFF, (blockAlign >> 8) & 0xFF,
      bitsPerSample & 0xFF, (bitsPerSample >> 8) & 0xFF,
      0x64, 0x61, 0x74, 0x61,
      dataLength & 0xFF, (dataLength >> 8) & 0xFF, (dataLength >> 16) & 0xFF, (dataLength >> 24) & 0xFF,
    ];
  }

  Future<void> playOggOpusAudio(Uint8List oggData) async {
    await playAudio(oggData);
  }

  bool get isRecording => _isRecording;
  bool get isPlaying => _isPlaying;

  Future<void> dispose() async {
    await stopRecording();
    await stopPlayback();
    await _audioRecorder.dispose();
    await _audioPlayer.dispose();
  }
}

class PcmRecorder {
  static const int sampleRate = 16000;
  static const int channels = 1;
  static const int frameDurationMs = 20;
  static const int bytesPerFrame = sampleRate * channels * 2 * frameDurationMs ~/ 1000;
  
  final AudioRecorder _recorder = AudioRecorder();
  bool _isRecording = false;
  bool _streamActive = false;
  
  Function(Uint8List)? onAudioFrame;
  Function(String)? onError;
  Function()? onRecordingStopped;
  
  StreamSubscription<RecordState>? _stateSubscription;
  StreamSubscription<Uint8List>? _audioStreamSubscription;
  int _bytesReceived = 0;
  int _frameCount = 0;

  Future<bool> requestPermission() async {
    final status = await Permission.microphone.request();
    return status.isGranted;
  }

  Future<void> start() async {
    print('[PcmRecorder] start() 被调用, 当前状态: _isRecording=$_isRecording, _streamActive=$_streamActive');
    
    if (_isRecording && _streamActive) {
      print('[PcmRecorder] 录音已在进行中且流活跃，跳过启动');
      return;
    }
    
    if (_isRecording && !_streamActive) {
      print('[PcmRecorder] 录音标志为true但流不活跃，强制重置');
      await _forceReset();
    }
    
    try {
      final hasPermission = await requestPermission();
      if (!hasPermission) {
        onError?.call('麦克风权限未授予');
        return;
      }
      
      _isRecording = true;
      _streamActive = false;
      _bytesReceived = 0;
      _frameCount = 0;
      
      print('[PcmRecorder] 开始创建录音流...');
      final stream = await _recorder.startStream(
        const RecordConfig(
          encoder: AudioEncoder.pcm16bits,
          sampleRate: sampleRate,
          numChannels: channels,
          echoCancel: true,
          noiseSuppress: true,
          autoGain: true,
        ),
      );
      
      _streamActive = true;
      print('[PcmRecorder] 流式录音已启动 (PCM16格式, 16kHz, mono, AEC启用)');
      
      _audioStreamSubscription = stream.listen((data) {
        if (!_isRecording || !_streamActive) {
          print('[PcmRecorder] 收到数据但录音已停止，忽略');
          return;
        }
        
        _bytesReceived += data.length;
        _frameCount++;
        if (data.isNotEmpty) {
          onAudioFrame?.call(data);
        }
        
        if (_frameCount % 50 == 0) {
          print('[PcmRecorder] 已处理 $_frameCount 帧, $_bytesReceived 字节');
        }
      }, onError: (error) {
        print('[PcmRecorder] 流错误: $error');
        final wasActive = _isRecording && _streamActive;
        _isRecording = false;
        _streamActive = false;
        if (wasActive) {
          onRecordingStopped?.call();
        }
        onError?.call('录音流错误: $error');
      }, onDone: () {
        print('[PcmRecorder] 流结束, 总共接收: $_bytesReceived 字节, $_frameCount 帧');
        final wasActive = _isRecording && _streamActive;
        _isRecording = false;
        _streamActive = false;
        if (wasActive) {
          onRecordingStopped?.call();
        }
      });
      
      print('[PcmRecorder] 录音启动成功');
      
    } catch (e) {
      _isRecording = false;
      _streamActive = false;
      print('[PcmRecorder] 启动录音失败: $e');
      onError?.call('启动录音失败: $e');
    }
  }
  
  Future<void> _forceReset() async {
    print('[PcmRecorder] 强制重置录音状态');
    try {
      await _audioStreamSubscription?.cancel();
    } catch (e) {
      print('[PcmRecorder] 取消订阅失败: $e');
    }
    _audioStreamSubscription = null;
    
    try {
      await _recorder.stop();
    } catch (e) {
      print('[PcmRecorder] 停止录音器失败: $e');
    }
    
    _isRecording = false;
    _streamActive = false;
  }

  Future<void> stop() async {
    print('[PcmRecorder] stop() 被调用, 当前状态: _isRecording=$_isRecording, _streamActive=$_streamActive');
    
    if (!_isRecording && !_streamActive) {
      print('[PcmRecorder] 录音已停止，跳过');
      return;
    }
    
    try {
      await _audioStreamSubscription?.cancel();
      _audioStreamSubscription = null;
      await _recorder.stop();
      _isRecording = false;
      _streamActive = false;
      print('[PcmRecorder] 录音已停止');
    } catch (e) {
      print('[PcmRecorder] 停止录音失败: $e');
      _isRecording = false;
      _streamActive = false;
      onError?.call('停止录音失败: $e');
    }
  }

  bool get isRecording => _isRecording && _streamActive;
  bool get isStreamActive => _streamActive;

  Future<void> dispose() async {
    await stop();
    await _recorder.dispose();
  }
}
