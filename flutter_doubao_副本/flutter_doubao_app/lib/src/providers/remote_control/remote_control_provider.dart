import 'dart:async';
import 'package:flutter/foundation.dart';
import '../../models/remote_control/index.dart';
import '../../services/remote_control/index.dart';

/// 远程控制状态管理
class RemoteControlProvider extends ChangeNotifier {
  RemoteControlService? _service;
  ConnectionConfig? _config;
  ConnectionStatus _status = ConnectionStatus.disconnected;
  SessionState? _session;
  List<RemoteMessage> _messages = [];
  PermissionRequest? _pendingPermission;

  ConnectionStatus get status => _status;
  ConnectionConfig? get config => _config;
  SessionState? get session => _session;
  List<RemoteMessage> get messages => List.unmodifiable(_messages);
  PermissionRequest? get pendingPermission => _pendingPermission;
  bool get isConnected => _status == ConnectionStatus.connected;

  StreamSubscription? _messageSubscription;
  StreamSubscription? _permissionSubscription;
  StreamSubscription? _connectionSubscription;

  /// 扫描并解析二维码
  Future<bool> scanAndConnect(String qrData) async {
    final config = QRScannerService.parseQrCode(qrData);
    if (!QRScannerService.isValidConfig(config)) {
      return false;
    }

    _config = config;
    _service = await RemoteControlService.fromConfig(_config!);

    // 监听消息
    _messageSubscription = _service!.messages.listen((message) {
      _messages.add(message);
      notifyListeners();
    });

    // 监听权限请求
    _permissionSubscription = _service!.permissions.listen((permission) {
      _pendingPermission = permission;
      notifyListeners();
    });

    // 监听连接状态
    _connectionSubscription = _service!.connectionStatus.listen((status) {
      _status = status;
      notifyListeners();
    });

    // 开始连接
    final connected = await _service!.connect();
    if (connected) {
      _status = ConnectionStatus.connected;
      notifyListeners();
    }

    return connected;
  }

  /// 发送消息
  Future<void> sendMessage(String content) async {
    if (_service == null || !isConnected) return;
    await _service!.sendMessage(content);
  }

  /// 响应权限请求
  Future<void> respondToPermission(bool allow) async {
    if (_service == null || _pendingPermission == null) return;
    await _service!.respondToPermission(_pendingPermission!.requestId, allow);
    _pendingPermission = null;
    notifyListeners();
  }

  /// 断开连接
  void disconnect() {
    _messageSubscription?.cancel();
    _permissionSubscription?.cancel();
    _connectionSubscription?.cancel();
    _service?.disconnect();
    _service = null;
    _status = ConnectionStatus.disconnected;
    _messages.clear();
    _pendingPermission = null;
    notifyListeners();
  }

  @override
  void dispose() {
    disconnect();
    super.dispose();
  }
}
