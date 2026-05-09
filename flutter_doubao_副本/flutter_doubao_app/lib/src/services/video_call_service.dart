import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:volc_engine_rtc/volc_engine_rtc.dart';
import 'package:flutter_doubao_app/src/services/call_status.dart';
import 'package:flutter_doubao_app/src/services/api_config.dart';
import 'package:flutter_doubao_app/src/services/video_call_api.dart';
import 'package:permission_handler/permission_handler.dart';

class VideoCallService {
  RTCEngine? _engine;
  RTCRoom? _room;
  
  CallStatus _callStatus = CallStatus.idle;
  bool _isCameraOn = false;
  bool _isMicrophoneOn = true;
  bool _isSpeakerOn = false;
  bool _isFrontCamera = true;
  int _videoQuality = 2;
  bool _isVideoReady = false;
  
  String? _remoteUserId;
  
  Function(CallStatus)? _onCallStatusChanged;
  Function(String)? _onError;
  Function(String)? _onMessageReceived;
  Function(String?)? _onRemoteUserJoined;
  Function(String?)? _onRemoteUserLeft;
  Function()? _onVideoReady;
  
  Timer? _callTimer;
  int _callDuration = 0;
  Function(int)? _onCallDurationUpdated;

  void _log(String message) {
    print('[VideoCallService] $message');
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
        _onError?.call('需要摄像头权限才能进行视频通话');
        return false;
      }
    }
    
    if (!microphoneStatus.isGranted) {
      final result = await Permission.microphone.request();
      _log('请求麦克风权限结果: $result');
      if (!result.isGranted) {
        _onError?.call('需要麦克风权限才能进行视频通话');
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
  }) async {
    _onCallStatusChanged = onCallStatusChanged;
    _onError = onError;
    _onMessageReceived = onMessageReceived;
    _onCallDurationUpdated = onCallDurationUpdated;
    _onRemoteUserJoined = onRemoteUserJoined;
    _onRemoteUserLeft = onRemoteUserLeft;
    _onVideoReady = onVideoReady;

    try {
      _updateCallStatus(CallStatus.connecting);
      _log('开始初始化 RTC 引擎...');

      final hasPermissions = await _requestPermissions();
      if (!hasPermissions) {
        _updateCallStatus(CallStatus.failed);
        return;
      }

      final context = RTCVideoContext(
        appId: ApiConfig.rtcAppId,
        eventHandler: IRTCEngineEventHandler(
          onError: (ErrorCode code) {
            _log('RTC Error: $code');
            _onError?.call('RTC错误: $code');
          },
          onAudioDeviceStateChanged: (String deviceId, AudioDeviceType deviceType, MediaDeviceState deviceState, MediaDeviceError deviceError) {
            _log('音频设备状态变化: $deviceId, $deviceType, $deviceState, $deviceError');
          },
          onVideoDeviceStateChanged: (String deviceId, VideoDeviceType deviceType, MediaDeviceState deviceState, MediaDeviceError deviceError) {
            _log('视频设备状态变化: $deviceId, $deviceType, $deviceState, $deviceError');
          },
          onWarning: (WarningCode code) {
            _log('RTC Warning: $code');
          },
        ),
      );

      _engine = await RTCEngine.createRTCEngine(context);
      _log('RTC 引擎创建成功');

      _log('设置视频编码配置...');
      await _engine?.setVideoEncoderConfig(
        VideoEncoderConfig(
          width: 640,
          height: 480,
          frameRate: 15,
          maxBitrate: 800,
          minBitrate: 200,
          encoderPreference: VideoEncoderPreference.maintain_framerate,
        ),
      );

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
        onUserPublishStreamVideo: (String streamId, StreamInfo streamInfo, bool isPublish) {
          _log('用户发布视频流: ${streamInfo.userId}, isPublish: $isPublish');
          if (isPublish && streamInfo.userId != ApiConfig.rtcUserId) {
            _remoteUserId = streamInfo.userId;
            _onRemoteUserJoined?.call(streamInfo.userId);
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
        onRoomStats: (RTCRoomStats stats) {
          _log('房间统计: duration=${stats.duration}');
        },
      ));

      await _room!.joinRoom(
        token: ApiConfig.rtcToken,
        userInfo: UserInfo(
          userId: ApiConfig.rtcUserId,
          extraInfo: jsonEncode({
            'call_scene': 'RTC-AIGC',
            'user_name': userName,
            'user_id': userId,
          }),
        ),
        userVisibility: true,
        roomConfig: RoomConfig(
          profile: RoomProfile.communication,
          isPublishAudio: true,
          isPublishVideo: true,
          isAutoSubscribeAudio: true,
          isAutoSubscribeVideo: true,
        ),
      );
      
      _log('加入房间成功');
      
      await _startVideoCapture();
      await _startAudioCapture();
      
      _updateCallStatus(CallStatus.active);
      _startCallTimer();
      
      _log('启动 AI Agent...');
      final result = await VideoCallApi.startVoiceChat();
      _log('AI Agent 启动结果: $result');
      
      _onMessageReceived?.call('视频通话已连接');

    } catch (e) {
      _log('初始化失败: $e');
      _updateCallStatus(CallStatus.failed);
      _onError?.call('连接失败: ${e.toString()}');
    }
  }

  Future<void> _startVideoCapture() async {
    try {
      _log('启动视频采集...');
      await _engine?.startVideoCapture();
      _isCameraOn = true;
      _isVideoReady = true;
      _log('视频采集已启动');
      _onVideoReady?.call();
    } catch (e) {
      _log('启动视频采集失败: $e');
      _onError?.call('启动摄像头失败: $e');
    }
  }

  Future<void> _stopVideoCapture() async {
    try {
      _log('停止视频采集...');
      await _engine?.stopVideoCapture();
      _isCameraOn = false;
      _isVideoReady = false;
      _log('视频采集已停止');
    } catch (e) {
      _log('停止视频采集失败: $e');
    }
  }

  Future<void> _startAudioCapture() async {
    try {
      _log('启动音频采集...');
      await _engine?.startAudioCapture();
      _isMicrophoneOn = true;
      _log('音频采集已启动');
    } catch (e) {
      _log('启动音频采集失败: $e');
      _onError?.call('启动麦克风失败: $e');
    }
  }

  Future<void> _stopAudioCapture() async {
    try {
      _log('停止音频采集...');
      await _engine?.stopAudioCapture();
      _isMicrophoneOn = false;
      _log('音频采集已停止');
    } catch (e) {
      _log('停止音频采集失败: $e');
    }
  }

  Future<void> answerCall() async {
    _log('接听通话');
    _updateCallStatus(CallStatus.active);
    _startCallTimer();
  }

  Future<void> endCall() async {
    _log('结束通话...');
    _stopCallTimer();
    
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
    } catch (e) {
      _log('清理资源失败: $e');
    }

    _remoteUserId = null;
    _isVideoReady = false;
    _isCameraOn = false;
    _callDuration = 0;
    _log('通话已结束');
  }

  Future<void> toggleCameraOnOff() async {
    _log('切换摄像头开关: $_isCameraOn -> ${!_isCameraOn}');
    if (_isCameraOn) {
      await _stopVideoCapture();
    } else {
      await _startVideoCapture();
    }
  }

  Future<void> switchCamera() async {
    _log('切换前后摄像头: $_isFrontCamera -> ${!_isFrontCamera}');
    _isFrontCamera = !_isFrontCamera;
    final cameraId = _isFrontCamera ? CameraId.front : CameraId.back;
    await _engine?.switchCamera(cameraId);
    _log('摄像头切换完成: ${_isFrontCamera ? "前置" : "后置"}');
  }

  Future<void> toggleMicrophone() async {
    _log('切换麦克风: $_isMicrophoneOn -> ${!_isMicrophoneOn}');
    if (_isMicrophoneOn) {
      await _stopAudioCapture();
    } else {
      await _startAudioCapture();
    }
  }

  Future<void> toggleSpeaker() async {
    _isSpeakerOn = !_isSpeakerOn;
    _log('切换扬声器: $_isSpeakerOn');
  }

  Future<void> setVideoQuality(int quality) async {
    if (quality >= 1 && quality <= 3) {
      _videoQuality = quality;
      _log('设置视频质量: $quality');
    }
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
  bool get isSpeakerOn => _isSpeakerOn;
  bool get isFrontCamera => _isFrontCamera;
  bool get isVideoReady => _isVideoReady;
  int get videoQuality => _videoQuality;
  int get callDuration => _callDuration;
  String? get remoteUserId => _remoteUserId;
  RTCEngine? get engine => _engine;

  void dispose() {
    _stopCallTimer();
    endCall();
  }
}
