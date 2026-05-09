import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:camera/camera.dart';
import 'package:wakelock_plus/wakelock_plus.dart';
import 'package:flutter_doubao_app/src/services/call_status.dart';
import 'package:flutter_doubao_app/src/services/video_recording_service.dart';
import 'package:flutter_doubao_app/src/services/llm_service.dart';
import 'package:flutter_doubao_app/src/providers/recording_provider.dart';
import 'package:flutter_doubao_app/src/models/recording_record.dart';
import 'package:flutter_doubao_app/src/screens/recording_list_screen.dart';
import 'package:uuid/uuid.dart';

class VideoRecordingScreen extends StatefulWidget {
  @override
  _VideoRecordingScreenState createState() => _VideoRecordingScreenState();
}

class _VideoRecordingScreenState extends State<VideoRecordingScreen> with WidgetsBindingObserver {
  final VideoRecordingService _recordingService = VideoRecordingService();
  final Uuid _uuid = const Uuid();
  
  CallStatus _callStatus = CallStatus.idle;
  String _callDuration = '00:00:00';
  bool _isRecording = false;
  bool _isMicrophoneOn = true;
  bool _isEndingCall = false;
  String? _remoteUserId;
  String _statusMessage = '正在连接...';
  String _dialogText = '';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    WakelockPlus.enable();
    _initializeCall();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused && _isRecording) {
      _handleInterruption();
    }
  }

  Future<void> _handleInterruption() async {
    if (_isRecording) {
      final videoPath = await _recordingService.stopRecording();
      if (videoPath != null) {
        await _recordingService.saveToGallery(videoPath);
      }
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    WakelockPlus.disable();
    _recordingService.dispose();
    super.dispose();
  }

  Future<void> _initializeCall() async {
    await _recordingService.initializeCall(
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
              _statusMessage = '已连接';
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
        print('Recording error: $error');
        if (mounted) {
          setState(() {
            _statusMessage = '错误: $error';
          });
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('错误: $error')),
          );
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
          setState(() {});
        }
      },
      onRecordingStateChanged: (isRecording) {
        if (mounted) {
          setState(() {
            _isRecording = isRecording;
          });
        }
      },
      onDialogTextChanged: (text) {
        if (mounted) {
          setState(() {
            _dialogText = text;
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

  Future<void> _toggleRecording() async {
    if (_isRecording) {
      final videoPath = await _recordingService.stopRecording();
      if (videoPath != null) {
        await _saveRecording(videoPath);
      }
    } else {
      await _recordingService.startRecording();
    }
  }

  Future<void> _saveRecording(String videoPath) async {
    try {
      final savedPath = await _recordingService.saveToGallery(videoPath);
      if (savedPath != null && mounted) {
        final recordingProvider = Provider.of<RecordingProvider>(context, listen: false);
        
        String? summary;
        if (_dialogText.isNotEmpty) {
          setState(() {
            _statusMessage = '正在生成总结...';
          });
          summary = await LlmService.generateSummary(_dialogText);
        }
        
        final record = RecordingRecord(
          id: _uuid.v4(),
          videoPath: savedPath,
          durationSeconds: _recordingService.callDuration,
          createdAt: DateTime.now(),
          dialogText: _dialogText,
          summary: summary,
        );
        await recordingProvider.addRecord(record);
        
        setState(() {
          _statusMessage = '已保存';
        });
        
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('视频已保存到相册')),
        );
      }
    } catch (e) {
      print('保存录制失败: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('保存失败: $e')),
        );
      }
    }
  }

  Future<void> _toggleMicrophone() async {
    await _recordingService.toggleMicrophone();
    setState(() {
      _isMicrophoneOn = _recordingService.isMicrophoneOn;
    });
  }

  Future<void> _endCall() async {
    if (_isEndingCall) return;
    _isEndingCall = true;

    if (_isRecording) {
      final videoPath = await _recordingService.stopRecording();
      if (videoPath != null) {
        await _saveRecording(videoPath);
      }
    }

    await _recordingService.endCall();

    if (mounted) {
      Navigator.of(context).pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: Stack(
          children: [
            Positioned.fill(
              child: _buildCameraPreview(),
            ),
            Positioned(
              top: 0,
              left: 0,
              right: 0,
              child: _buildTopBar(),
            ),
            Positioned(
              bottom: 0,
              left: 0,
              right: 0,
              child: _buildBottomControls(),
            ),
            if (_remoteUserId != null)
              Positioned(
                top: 80,
                right: 16,
                child: _buildAIIndicator(),
              ),
            if (_isRecording)
              Positioned(
                top: 80,
                left: 16,
                child: _buildRecordingIndicator(),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildCameraPreview() {
    final controller = _recordingService.cameraController;
    
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

    if (controller != null && controller.value.isInitialized) {
      return ClipRect(
        child: Transform.scale(
          scale: 1.0,
          child: Center(
            child: AspectRatio(
              aspectRatio: controller.value.aspectRatio,
              child: CameraPreview(controller),
            ),
          ),
        ),
      );
    }

    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.videocam_off, size: 64, color: Colors.white54),
          SizedBox(height: 16),
          Text(
            '摄像头未就绪',
            style: TextStyle(color: Colors.white54),
          ),
        ],
      ),
    );
  }

  Widget _buildTopBar() {
    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Colors.black54, Colors.transparent],
        ),
      ),
      padding: EdgeInsets.symmetric(horizontal: 16, vertical: 12),
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
                '视频录制',
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
          IconButton(
            onPressed: () {
              Navigator.push(
                context,
                MaterialPageRoute(builder: (context) => RecordingListScreen()),
              );
            },
            icon: Icon(Icons.video_library, color: Colors.white),
            tooltip: '录制记录',
          ),
        ],
      ),
    );
  }

  Widget _buildBottomControls() {
    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.bottomCenter,
          end: Alignment.topCenter,
          colors: [Colors.black54, Colors.transparent],
        ),
      ),
      padding: EdgeInsets.symmetric(horizontal: 32, vertical: 24),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: [
          IconButton(
            onPressed: _toggleMicrophone,
            icon: Icon(
              _isMicrophoneOn ? Icons.mic : Icons.mic_off,
              color: Colors.white,
              size: 32,
            ),
          ),
          GestureDetector(
            onTap: _toggleRecording,
            child: Container(
              width: 72,
              height: 72,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: _isRecording ? Colors.red : Colors.white,
                border: _isRecording
                    ? null
                    : Border.all(color: Colors.red, width: 4),
              ),
              child: Icon(
                _isRecording ? Icons.stop : Icons.fiber_manual_record,
                color: _isRecording ? Colors.white : Colors.red,
                size: _isRecording ? 36 : 48,
              ),
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
        ],
      ),
    );
  }

  Widget _buildAIIndicator() {
    return Container(
      padding: EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.black54,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 8,
            height: 8,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: Colors.green,
            ),
          ),
          SizedBox(width: 8),
          Text(
            'AI听众在线',
            style: TextStyle(color: Colors.white, fontSize: 12),
          ),
        ],
      ),
    );
  }

  Widget _buildRecordingIndicator() {
    return Container(
      padding: EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.red.withOpacity(0.8),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 8,
            height: 8,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: Colors.white,
            ),
          ),
          SizedBox(width: 8),
          Text(
            '录制中 $_callDuration',
            style: TextStyle(color: Colors.white, fontSize: 12),
          ),
        ],
      ),
    );
  }
}
