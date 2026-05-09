/// 远程控制消息类型
enum RemoteMessageType {
  user,
  assistant,
  streamEvent,
  result,
  controlRequest,
  controlResponse,
}

/// 远程控制消息
class RemoteMessage {
  final String type;
  final String? uuid;
  final String? sessionId;
  final dynamic content;
  final Map<String, dynamic>? metadata;

  RemoteMessage({
    required this.type,
    this.uuid,
    this.sessionId,
    this.content,
    this.metadata,
  });

  factory RemoteMessage.fromJson(Map<String, dynamic> json) {
    return RemoteMessage(
      type: json['type'] ?? '',
      uuid: json['uuid'],
      sessionId: json['session_id'],
      content: json['content'],
      metadata: json['metadata'] ?? json['message'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'type': type,
      if (uuid != null) 'uuid': uuid,
      if (sessionId != null) 'session_id': sessionId,
      if (content != null) 'content': content,
    };
  }
}

/// 流式事件
class StreamEvent {
  final String type;
  final int? index;
  final dynamic delta;

  StreamEvent({
    required this.type,
    this.index,
    this.delta,
  });

  factory StreamEvent.fromJson(Map<String, dynamic> json) {
    return StreamEvent(
      type: json['type'] ?? '',
      index: json['index'],
      delta: json['delta'],
    );
  }

  String? get text {
    if (delta is Map && delta['type'] == 'text_delta') {
      return delta['text'];
    }
    return null;
  }
}
