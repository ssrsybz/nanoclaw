import 'dart:async';
import 'dart:io';
import 'package:camera/camera.dart';
import 'package:flutter_doubao_app/src/services/call_status.dart';
import 'package:flutter_doubao_app/src/services/api_config.dart';
import 'package:flutter_doubao_app/src/services/video_call_api.dart';
import 'package:volc_engine_rtc/volc_engine_rtc.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:path_provider/path_provider.dart';
import 'package:uuid/uuid.dart';
import 'package:gal/gal.dart';

class VideoRecordingService {
  RTCEngine? _engine;
  RTCRoom? _room;
  CameraController? _cameraController;
  
  CallStatus _callStatus = CallStatus.idle;
  bool _isRecording = false;
  bool _isCameraOn = false;
  bool _isMicrophoneOn = true;
  bool _isFrontCamera = true;
  bool _isVideoReady = false;
  
  String? _remoteUserId;
  String? _currentRecordingPath;
  String _dialogText = '';
  
  final Uuid _uuid = const Uuid();
  
  Function(CallStatus)? _onCallStatusChanged;
  Function(String)? _onError;
  Function(String)? _onMessageReceived;
  Function(String?)? _onRemoteUserJoined;
  Function(String?)? _onRemoteUserLeft;
  Function()? _onVideoReady;
  Function(bool)? _onRecordingStateChanged;
  Function(int)? _onCallDurationUpdated;
  Function(String)? _onDialogTextChanged;
  
  Timer? _callTimer;
  Timer? _autoSaveTimer;
  int _callDuration = 0;

  void _log(String message) {
    print('[VideoRecordingService] $message');
  }

  Future<bool> _requestPermissions() async {
    _log('请求摄像头和麦克风权限...');
    
    final cameraStatus = await Permission.camera.status;
    final microphoneStatus = await Permission.microphone.status;
    
    _log('摄像头权限状态: $cameraStatus');
    _log('麦克风权限状态: $microphoneStatus');
    
    if (!cameraStatus.isGranted) {
      final result = await Permission.camera.request();
      _log('请求摄像头权限结果: $result');
      if (!result.isGranted) {
        _onError?.call('需要摄像头权限才能进行视频录制');
        return false;
      }
    }
    
    if (!microphoneStatus.isGranted) {
      final result = await Permission.microphone.request();
      _log('请求麦克风权限结果: $result');
      if (!result.isGranted) {
        _onError?.call('需要麦克风权限才能进行视频录制');
        return false;
      }
    }
    
    _log('权限已获取');
    return true;
  }

  Future<void> initializeCall({
    required String userId,
    required String userName,
    required Function(CallStatus) onCallStatusChanged,
    required Function(String) onError,
    required Function(String) onMessageReceived,
    required Function(int) onCallDurationUpdated,
    Function(String?)? onRemoteUserJoined,
    Function(String?)? onRemoteUserLeft,
    Function()? onVideoReady,
    Function(bool)? onRecordingStateChanged,
    Function(String)? onDialogTextChanged,
  }) async {
    _onCallStatusChanged = onCallStatusChanged;
    _onError = onError;
    _onMessageReceived = onMessageReceived;
    _onCallDurationUpdated = onCallDurationUpdated;
    _onRemoteUserJoined = onRemoteUserJoined;
    _onRemoteUserLeft = onRemoteUserLeft;
    _onVideoReady = onVideoReady;
    _onRecordingStateChanged = onRecordingStateChanged;
    _onDialogTextChanged = onDialogTextChanged;

    try {
      _updateCallStatus(CallStatus.connecting);
      _log('开始初始化...');

      final hasPermissions = await _requestPermissions();
      if (!hasPermissions) {
        _updateCallStatus(CallStatus.failed);
        return;
      }

      await _initCamera();
      await _initRTC(userId, userName);

      _updateCallStatus(CallStatus.active);
      _startCallTimer();
      
      _log('启动 AI Agent...');
      final result = await VideoCallApi.startVoiceChat();
      _log('AI Agent 启动结果: $result');
      
      _onMessageReceived?.call('视频录制已准备就绪');

    } catch (e) {
      _log('初始化失败: $e');
      _updateCallStatus(CallStatus.failed);
      _onError?.call('连接失败: ${e.toString()}');
    }
  }

  Future<void> _initCamera() async {
    _log('初始化摄像头...');
    final cameras = await availableCameras();
    final frontCamera = cameras.firstWhere(
      (camera) => camera.lensDirection == CameraLensDirection.front,
      orElse: () => cameras.first,
    );
    
    _cameraController = CameraController(
      frontCamera,
      ResolutionPreset.high,
      enableAudio: true,
      imageFormatGroup: ImageFormatGroup.jpeg,
    );
    
    await _cameraController!.initialize();
    _isCameraOn = true;
    _isVideoReady = true;
    _log('摄像头初始化完成');
    _onVideoReady?.call();
  }

  Future<void> _initRTC(String userId, String userName) async {
    _log('初始化 RTC 引擎...');

    final context = RTCVideoContext(
      appId: ApiConfig.rtcAppId,
      eventHandler: IRTCEngineEventHandler(
        onError: (ErrorCode code) {
          _log('RTC Error: $code');
          _onError?.call('RTC错误: $code');
        },
        onWarning: (WarningCode code) {
          _log('RTC Warning: $code');
        },
      ),
    );

    _engine = await RTCEngine.createRTCEngine(context);
    _log('RTC 引擎创建成功');

    _log('开始加入房间: ${ApiConfig.rtcRoomId}, userId: ${ApiConfig.rtcUserId}');
    
    _room = await _engine!.createRTCRoom(ApiConfig.rtcRoomId);
    
    if (_room == null) {
      throw Exception('创建房间失败');
    }

    _room!.setRTCRoomEventHandler(IRTCRoomEventHandler(
      onUserJoined: (UserInfo userInfo) {
        _log('用户加入房间: ${userInfo.userId}');
        if (userInfo.userId != ApiConfig.rtcUserId) {
          _remoteUserId = userInfo.userId;
          _onRemoteUserJoined?.call(userInfo.userId);
          _onMessageReceived?.call('AI Agent 已加入');
        }
      },
      onUserLeave: (String uid, int reason) {
        _log('用户离开房间: $uid, reason: $reason');
        if (uid == _remoteUserId) {
          _remoteUserId = null;
          _onRemoteUserLeft?.call(uid);
        }
      },
      onUserPublishStreamAudio: (String streamId, StreamInfo streamInfo, bool isPublish) {
        _log('用户发布音频流: ${streamInfo.userId}, isPublish: $isPublish');
        if (isPublish && streamInfo.userId != ApiConfig.rtcUserId) {
          _remoteUserId = streamInfo.userId;
          _onRemoteUserJoined?.call(streamInfo.userId);
        }
      },
      onRoomStateChanged: (String roomId, String uid, int state, String extraInfo) {
        _log('房间状态变化: roomId=$roomId, userId=$uid, state=$state');
      },
      onLeaveRoom: (RTCRoomStats stats) {
        _log('离开房间');
      },
    ));

    await _room!.joinRoom(
      token: ApiConfig.rtcToken,
      userInfo: UserInfo(
        userId: ApiConfig.rtcUserId,
        extraInfo: '{}',
      ),
      userVisibility: true,
      roomConfig: RoomConfig(
        profile: RoomProfile.communication,
        isPublishAudio: true,
        isPublishVideo: false,
        isAutoSubscribeAudio: true,
        isAutoSubscribeVideo: false,
      ),
    );
    
    _log('加入房间成功');
    
    await _engine?.startAudioCapture();
    _isMicrophoneOn = true;
  }

  Future<void> startRecording() async {
    if (_isRecording || _cameraController == null) {
      _log('无法开始录制: _isRecording=$_isRecording, controller=${_cameraController != null}');
      return;
    }

    try {
      _log('开始录制...');
      
      final directory = await getTemporaryDirectory();
      final recordingId = _uuid.v4();
      _currentRecordingPath = '${directory.path}/$recordingId.mp4';
      
      _log('录制路径: $_currentRecordingPath');
      
      await _cameraController!.startVideoRecording();
      
      _isRecording = true;
      _onRecordingStateChanged?.call(true);
      _onMessageReceived?.call('正在录制...');
      
      _startAutoSave();
      
      _log('录制已开始');
    } catch (e) {
      _log('开始录制失败: $e');
      _onError?.call('开始录制失败: $e');
    }
  }

  Future<String?> stopRecording() async {
    if (!_isRecording || _cameraController == null) {
      _log('无法停止录制: _isRecording=$_isRecording');
      return null;
    }

    try {
      _log('停止录制...');
      
      _stopAutoSave();
      
      final file = await _cameraController!.stopVideoRecording();
      _log('录制文件: ${file.path}');
      
      _isRecording = false;
      _onRecordingStateChanged?.call(false);
      _onMessageReceived?.call('录制已停止');
      
      return file.path;
    } catch (e) {
      _log('停止录制失败: $e');
      _onError?.call('停止录制失败: $e');
      _isRecording = false;
      _onRecordingStateChanged?.call(false);
      return null;
    }
  }

  Future<String?> saveToGallery(String videoPath) async {
    try {
      _log('保存到相册: $videoPath');
      
      final file = File(videoPath);
      if (!await file.exists()) {
        _log('视频文件不存在');
        _onError?.call('视频文件不存在');
        return null;
      }
      
      await Gal.putVideo(videoPath, album: '豆包录制');
      _log('保存成功');
      
      _onMessageReceived?.call('已保存到相册');
      return videoPath;
    } on GalException catch (e) {
      _log('保存到相册失败: ${e.type}');
      _onError?.call('保存到相册失败: ${e.type}');
      return null;
    } catch (e) {
      _log('保存到相册失败: $e');
      _onError?.call('保存到相册失败: $e');
      return null;
    }
  }

  void _startAutoSave() {
    _autoSaveTimer = Timer.periodic(Duration(seconds: 30), (timer) {
      _log('自动保存检查点...');
    });
  }

  void _stopAutoSave() {
    _autoSaveTimer?.cancel();
    _autoSaveTimer = null;
  }

  void addDialogText(String text) {
    _dialogText += text;
    _onDialogTextChanged?.call(_dialogText);
  }

  String get dialogText => _dialogText;

  Future<void> toggleCameraOnOff() async {
    _log('切换摄像头开关: $_isCameraOn -> ${!_isCameraOn}');
    if (_isCameraOn) {
      await _cameraController?.pausePreview();
      _isCameraOn = false;
    } else {
      await _cameraController?.resumePreview();
      _isCameraOn = true;
    }
  }

  Future<void> switchCamera() async {
    _log('切换前后摄像头');
    if (_cameraController != null) {
      final cameras = await availableCameras();
      final targetCamera = _isFrontCamera
          ? cameras.firstWhere(
              (camera) => camera.lensDirection == CameraLensDirection.back,
              orElse: () => cameras.first,
            )
          : cameras.firstWhere(
              (camera) => camera.lensDirection == CameraLensDirection.front,
              orElse: () => cameras.first,
            );
      
      await _cameraController!.dispose();
      _cameraController = CameraController(
        targetCamera,
        ResolutionPreset.high,
        enableAudio: true,
        imageFormatGroup: ImageFormatGroup.jpeg,
      );
      await _cameraController!.initialize();
      _isFrontCamera = !_isFrontCamera;
      _log('摄像头切换完成: ${_isFrontCamera ? "前置" : "后置"}');
    }
  }

  Future<void> toggleMicrophone() async {
    _log('切换麦克风: $_isMicrophoneOn -> ${!_isMicrophoneOn}');
    if (_isMicrophoneOn) {
      await _engine?.stopAudioCapture();
      _isMicrophoneOn = false;
    } else {
      await _engine?.startAudioCapture();
      _isMicrophoneOn = true;
    }
  }

  Future<void> endCall() async {
    _log('结束通话...');
    _stopCallTimer();
    _stopAutoSave();
    
    if (_isRecording) {
      await stopRecording();
    }

    try {
      _log('停止 AI Agent...');
      await VideoCallApi.stopVoiceChat();
    } catch (e) {
      _log('停止 AI Agent 失败: $e');
    }

    try {
      if (_room != null) {
        _log('离开房间...');
        await _room!.leaveRoom();
        _room = null;
      }
      
      if (_engine != null) {
        _log('销毁 RTC 引擎...');
        _engine!.destroy();
        _engine = null;
      }
      
      if (_cameraController != null) {
        _log('释放摄像头...');
        await _cameraController!.dispose();
        _cameraController = null;
      }
    } catch (e) {
      _log('清理资源失败: $e');
    }

    _remoteUserId = null;
    _isVideoReady = false;
    _isCameraOn = false;
    _callDuration = 0;
    _log('通话已结束');
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
  bool get isCameraOn => _isCameraOn;
  bool get isMicrophoneOn => _isMicrophoneOn;
  bool get isFrontCamera => _isFrontCamera;
  bool get isVideoReady => _isVideoReady;
  bool get isRecording => _isRecording;
  int get callDuration => _callDuration;
  String? get remoteUserId => _remoteUserId;
  CameraController? get cameraController => _cameraController;
  String? get currentRecordingPath => _currentRecordingPath;

  void dispose() {
    _stopCallTimer();
    _stopAutoSave();
    endCall();
  }
}
