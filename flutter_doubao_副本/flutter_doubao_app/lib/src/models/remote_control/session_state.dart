/// 会话状态
class SessionState {
  final String sessionId;
  final String status; // idle, active, busy
  final Map<String, dynamic>? metadata;

  SessionState({
    required this.sessionId,
    required this.status,
    this.metadata,
  });

  factory SessionState.fromJson(Map<String, dynamic> json) {
    return SessionState(
      sessionId: json['session_id'] ?? json['id'] ?? '',
      status: json['status'] ?? 'idle',
      metadata: json['metadata'],
    );
  }
}

/// 连接状态
enum ConnectionStatus {
  disconnected,
  connecting,
  connected,
  error,
}

/// 权限请求
class PermissionRequest {
  final String requestId;
  final String subtype;
  final String? toolName;
  final Map<String, dynamic>? input;
  final String? title;
  final String? description;

  PermissionRequest({
    required this.requestId,
    required this.subtype,
    this.toolName,
    this.input,
    this.title,
    this.description,
  });

  factory PermissionRequest.fromJson(Map<String, dynamic> json) {
    return PermissionRequest(
      requestId: json['request_id'] ?? '',
      subtype: json['subtype'] ?? '',
      toolName: json['tool_name'],
      input: json['input'],
      title: json['title'],
      description: json['description'],
    );
  }
}
