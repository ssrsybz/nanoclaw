import 'package:flutter/material.dart';
import '../../models/remote_control/index.dart';

/// 消息气泡组件
class MessageBubble extends StatelessWidget {
  final RemoteMessage message;

  const MessageBubble({super.key, required this.message});

  @override
  Widget build(BuildContext context) {
    final isUser = message.type == 'user';
    final isAssistant = message.type == 'assistant';
    final isStreamEvent = message.type == 'stream_event';

    // 流式事件特殊处理
    if (isStreamEvent) {
      return _buildStreamEvent(context);
    }

    return Align(
      alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 4),
        padding: const EdgeInsets.all(12),
        constraints: const BoxConstraints(maxWidth: 300),
        decoration: BoxDecoration(
          color: isUser ? Colors.blue.shade100 : Colors.grey.shade100,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // 角色标签
            Text(
              isUser ? '你' : 'Claude',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.bold,
                color: isUser ? Colors.blue.shade700 : Colors.grey.shade700,
              ),
            ),
            const SizedBox(height: 4),
            // 消息内容
            Text(
              _getContentText(),
              style: const TextStyle(fontSize: 14),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStreamEvent(BuildContext context) {
    final text = _getStreamText();
    if (text == null || text.isEmpty) return const SizedBox.shrink();

    return Align(
      alignment: Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 2),
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(
          color: Colors.grey.shade50,
          borderRadius: BorderRadius.circular(8),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(
              width: 12,
              height: 12,
              child: CircularProgressIndicator(strokeWidth: 1.5),
            ),
            const SizedBox(width: 8),
            Flexible(
              child: Text(
                text,
                style: const TextStyle(fontSize: 14),
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _getContentText() {
    if (message.content is String) {
      return message.content as String;
    }
    if (message.content is List) {
      final parts = message.content as List;
      final texts = parts
          .where((p) => p is Map && p['type'] == 'text')
          .map((p) => p['text'] as String? ?? '')
          .join('\n');
      return texts;
    }
    return '';
  }

  String? _getStreamText() {
    // 从流式事件中提取文本
    return null;
  }
}
