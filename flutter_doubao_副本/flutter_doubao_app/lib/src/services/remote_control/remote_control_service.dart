import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;
import '../../models/remote_control/index.dart';

/// 远程控制服务
/// 处理与云服务器和终端服务的通信
class RemoteControlService {
  final String cloudRelayUrl;
  final String terminalServiceUrl;

  http.Client _httpClient = http.Client();
  StreamSubscription<String>? _sseSubscription;
  String? _sessionUrl;
  String? _workerJwt;
  int? _workerEpoch;
  String? _sessionId;

  final _messageController = StreamController<RemoteMessage>.broadcast();
  final _permissionController = StreamController<PermissionRequest>.broadcast();
  final _connectionController = StreamController<ConnectionStatus>.broadcast();

  Stream<RemoteMessage> get messages => _messageController.stream;
  Stream<PermissionRequest> get permissions => _permissionController.stream;
  Stream<ConnectionStatus> get connectionStatus => _connectionController.stream;

  ConnectionStatus _status = ConnectionStatus.disconnected;
  ConnectionStatus get status => _status;

  RemoteControlService({
    required this.cloudRelayUrl,
    required this.terminalServiceUrl,
  });

  /// 扫描二维码后初始化连接
  static Future<RemoteControlService> fromConfig(ConnectionConfig config) async {
    final service = RemoteControlService(
      cloudRelayUrl: config.cloudRelayUrl,
      terminalServiceUrl: config.terminalServiceUrl,
    );
    return service;
  }

  /// 连接到服务器
  Future<bool> connect() async {
    _setStatus(ConnectionStatus.connecting);

    try {
      // 1. 创建会话
      final sessionCreated = await _createSession();
      if (!sessionCreated) {
        _setStatus(ConnectionStatus.error);
        return false;
      }

      // 2. 获取 Worker JWT
      final jwtObtained = await _getWorkerJwt();
      if (!jwtObtained) {
        _setStatus(ConnectionStatus.error);
        return false;
      }

      // 3. 建立 SSE 连接
      await _connectSSE();

      _setStatus(ConnectionStatus.connected);
      return true;
    } catch (e) {
      print('连接错误: $e');
      _setStatus(ConnectionStatus.error);
      return false;
    }
  }

  /// 创建会话
  Future<bool> _createSession() async {
    try {
      final response = await _httpClient.post(
        Uri.parse('$cloudRelayUrl/v1/code/sessions'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'title': '远程控制会话',
          'organization_uuid': 'local',
        }),
      );

      if (response.statusCode == 200 || response.statusCode == 201) {
        final data = jsonDecode(response.body);
        _sessionId = data['id'];
        _sessionUrl = data['url'];
        return true;
      }
      return false;
    } catch (e) {
      print('创建会话失败: $e');
      return false;
    }
  }

  /// 获取 Worker JWT
  Future<bool> _getWorkerJwt() async {
    if (_sessionUrl == null) return false;

    try {
      final response = await _httpClient.post(
        Uri.parse('$_sessionUrl/bridge'),
        headers: {'Content-Type': 'application/json'},
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        _workerJwt = data['worker_jwt'];
        _workerEpoch = data['worker_epoch'];
        return true;
      }
      return false;
    } catch (e) {
      print('获取 JWT 失败: $e');
      return false;
    }
  }

  /// 建立 SSE 连接
  Future<void> _connectSSE() async {
    if (_sessionUrl == null) return;

    final sseUrl = '$_sessionUrl/worker/events/stream';

    try {
      final request = http.Request('GET', Uri.parse(sseUrl));
      request.headers['Accept'] = 'text/event-stream';
      request.headers['Cache-Control'] = 'no-cache';

      final response = await _httpClient.send(request);

      _sseSubscription = response.stream
          .transform(utf8.decoder)
          .listen(
            (data) => _handleSSEData(data),
            onError: (error) => _handleError(error),
            onDone: () => _handleDisconnect(),
          );
    } catch (e) {
      print('SSE 连接失败: $e');
      _handleError(e);
    }
  }

  /// 处理 SSE 数据
  void _handleSSEData(String data) {
    // SSE 格式: "data: {...}\n\n" 或 ":heartbeat\n\n"
    final lines = data.split('\n');
    for (final line in lines) {
      if (line.startsWith('data: ')) {
        final jsonStr = line.substring(6);
        try {
          final json = jsonDecode(jsonStr);
          _handleMessage(json);
        } catch (e) {
          print('解析 SSE 数据失败: $e');
        }
      }
    }
  }

  /// 处理接收到的消息
  void _handleMessage(Map<String, dynamic> json) {
    try {
      // 权限请求
      if (json['type'] == 'control_request' && json['subtype'] == 'can_use_tool') {
        _permissionController.add(PermissionRequest.fromJson(json));
        return;
      }

      // 普通消息
      _messageController.add(RemoteMessage.fromJson(json));
    } catch (e) {
      print('解析消息失败: $e');
    }
  }

  /// 发送用户消息
  Future<void> sendMessage(String content) async {
    if (_status != ConnectionStatus.connected || _sessionUrl == null) return;

    final message = {
      'type': 'user',
      'uuid': _generateUuid(),
      'session_id': _sessionId,
      'content': content,
    };

    try {
      await _httpClient.post(
        Uri.parse('$_sessionUrl/worker/events'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $_workerJwt',
        },
        body: jsonEncode(message),
      );
    } catch (e) {
      print('发送消息失败: $e');
    }
  }

  /// 响应权限请求
  Future<void> respondToPermission(String requestId, bool allow) async {
    if (_status != ConnectionStatus.connected || _sessionUrl == null) return;

    final response = {
      'type': 'control_response',
      'response': {
        'subtype': 'success',
        'request_id': requestId,
        'response': {
          'behavior': allow ? 'allow' : 'deny',
        },
      },
    };

    try {
      await _httpClient.post(
        Uri.parse('$_sessionUrl/worker/events'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $_workerJwt',
        },
        body: jsonEncode(response),
      );
    } catch (e) {
      print('响应权限请求失败: $e');
    }
  }

  /// 发送心跳
  Future<void> sendHeartbeat() async {
    if (_sessionUrl == null || _workerEpoch == null) return;

    try {
      await _httpClient.post(
        Uri.parse('$_sessionUrl/worker/heartbeat'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $_workerJwt',
        },
        body: jsonEncode({'worker_epoch': _workerEpoch}),
      );
    } catch (e) {
      print('心跳发送失败: $e');
    }
  }

  /// 断开连接
  void disconnect() {
    _sseSubscription?.cancel();
    _sseSubscription = null;
    _sessionId = null;
    _sessionUrl = null;
    _workerJwt = null;
    _workerEpoch = null;
    _setStatus(ConnectionStatus.disconnected);
  }

  void _setStatus(ConnectionStatus status) {
    _status = status;
    _connectionController.add(status);
  }

  void _handleError(dynamic error) {
    print('SSE 错误: $error');
    _setStatus(ConnectionStatus.error);
  }

  void _handleDisconnect() {
    _setStatus(ConnectionStatus.disconnected);
  }

  String _generateUuid() {
    return '${DateTime.now().millisecondsSinceEpoch}-${_randomHex(8)}';
  }

  String _randomHex(int length) {
    final random = StringBuffer();
    for (int i = 0; i < length; i++) {
      random.write((DateTime.now().microsecondsSinceEpoch % 16).toRadixString(16));
    }
    return random.toString();
  }

  void dispose() {
    disconnect();
    _httpClient.close();
    _messageController.close();
    _permissionController.close();
    _connectionController.close();
  }
}
