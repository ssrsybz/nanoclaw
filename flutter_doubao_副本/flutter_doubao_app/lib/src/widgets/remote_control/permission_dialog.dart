import 'package:flutter/material.dart';
import '../../models/remote_control/index.dart';

/// 权限请求对话框
class PermissionDialog extends StatelessWidget {
  final PermissionRequest permission;
  final VoidCallback onAllow;
  final VoidCallback onDeny;

  const PermissionDialog({
    super.key,
    required this.permission,
    required this.onAllow,
    required this.onDeny,
  });

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Row(
        children: [
          const Icon(Icons.security, color: Colors.orange),
          const SizedBox(width: 8),
          const Text('权限请求'),
        ],
      ),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            permission.title ?? _getDefaultTitle(),
            style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
          ),
          const SizedBox(height: 12),
          Text(
            permission.description ?? _getDefaultDescription(),
            style: const TextStyle(color: Colors.grey),
          ),
          if (permission.input != null) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: Colors.grey.shade100,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                '工具: ${permission.toolName ?? "未知"}',
                style: const TextStyle(fontSize: 12, fontFamily: 'monospace'),
              ),
            ),
          ],
        ],
      ),
      actions: [
        TextButton(
          onPressed: onDeny,
          child: const Text('拒绝'),
        ),
        ElevatedButton(
          onPressed: onAllow,
          style: ElevatedButton.styleFrom(
            backgroundColor: Colors.blue,
            foregroundColor: Colors.white,
          ),
          child: const Text('允许'),
        ),
      ],
    );
  }

  String _getDefaultTitle() {
    switch (permission.subtype) {
      case 'can_use_tool':
        return '执行工具操作';
      default:
        return '权限请求';
    }
  }

  String _getDefaultDescription() {
    final toolName = permission.toolName ?? '工具';
    return 'Claude 想要使用 $toolName 工具。是否允许？';
  }
}
