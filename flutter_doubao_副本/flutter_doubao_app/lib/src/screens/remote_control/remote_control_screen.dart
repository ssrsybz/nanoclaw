import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/remote_control/index.dart';
import '../../models/remote_control/index.dart';
import '../../widgets/remote_control/message_bubble.dart';
import '../../widgets/remote_control/permission_dialog.dart';
import 'qr_scanner_screen.dart';

/// 远程控制会话页面
class RemoteControlScreen extends StatefulWidget {
  const RemoteControlScreen({super.key});

  @override
  State<RemoteControlScreen> createState() => _RemoteControlScreenState();
}

class _RemoteControlScreenState extends State<RemoteControlScreen> {
  final TextEditingController _messageController = TextEditingController();
  final ScrollController _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _checkConnection();
    });
  }

  void _checkConnection() {
    final provider = context.read<RemoteControlProvider>();
    if (!provider.isConnected) {
      _showQRScanner();
    }
  }

  Future<void> _showQRScanner() async {
    final result = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => const QRScannerScreen()),
    );

    if (result != true && mounted) {
      Navigator.of(context).pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('远程控制'),
        actions: [
          Consumer<RemoteControlProvider>(
            builder: (context, provider, _) {
              return Row(
                children: [
                  _buildStatusIndicator(provider.status),
                  IconButton(
                    icon: const Icon(Icons.qr_code_scanner),
                    onPressed: _showQRScanner,
                    tooltip: '扫描二维码',
                  ),
                  PopupMenuButton<String>(
                    onSelected: (value) => _handleMenu(value),
                    itemBuilder: (context) => [
                      const PopupMenuItem(
                        value: 'disconnect',
                        child: Text('断开连接'),
                      ),
                    ],
                  ),
                ],
              );
            },
          ),
        ],
      ),
      body: Consumer<RemoteControlProvider>(
        builder: (context, provider, _) {
          // 显示权限对话框
          if (provider.pendingPermission != null) {
            WidgetsBinding.instance.addPostFrameCallback((_) {
              _showPermissionDialog(provider);
            });
          }

          return Column(
            children: [
              // 连接状态条
              _buildConnectionBar(provider),

              // 消息列表
              Expanded(
                child: provider.messages.isEmpty
                    ? _buildEmptyState()
                    : _buildMessageList(provider),
              ),

              // 输入区域
              _buildInputArea(provider),
            ],
          );
        },
      ),
    );
  }

  Widget _buildStatusIndicator(ConnectionStatus status) {
    Color color;
    String tooltip;

    switch (status) {
      case ConnectionStatus.connected:
        color = Colors.green;
        tooltip = '已连接';
        break;
      case ConnectionStatus.connecting:
        color = Colors.orange;
        tooltip = '连接中';
        break;
      case ConnectionStatus.error:
        color = Colors.red;
        tooltip = '连接错误';
        break;
      case ConnectionStatus.disconnected:
        color = Colors.grey;
        tooltip = '未连接';
        break;
    }

    return Tooltip(
      message: tooltip,
      child: Container(
        width: 10,
        height: 10,
        margin: const EdgeInsets.only(right: 8),
        decoration: BoxDecoration(
          color: color,
          shape: BoxShape.circle,
        ),
      ),
    );
  }

  Widget _buildConnectionBar(RemoteControlProvider provider) {
    if (provider.isConnected) return const SizedBox.shrink();

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(8),
      color: Colors.orange.shade100,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.warning_amber, size: 16),
          const SizedBox(width: 8),
          Text(
            provider.status == ConnectionStatus.connecting
                ? '正在连接...'
                : '未连接到电脑',
            style: const TextStyle(fontSize: 14),
          ),
          if (provider.status == ConnectionStatus.disconnected) ...[
            const SizedBox(width: 8),
            TextButton(
              onPressed: _showQRScanner,
              child: const Text('扫描连接'),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildEmptyState() {
    return const Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.phone_android, size: 64, color: Colors.grey),
          SizedBox(height: 16),
          Text(
            '远程控制',
            style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
          ),
          SizedBox(height: 8),
          Text(
            '扫描二维码连接电脑后\n即可查看对话并发送消息',
            textAlign: TextAlign.center,
            style: TextStyle(color: Colors.grey),
          ),
        ],
      ),
    );
  }

  Widget _buildMessageList(RemoteControlProvider provider) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });

    return ListView.builder(
      controller: _scrollController,
      padding: const EdgeInsets.all(16),
      itemCount: provider.messages.length,
      itemBuilder: (context, index) {
        final message = provider.messages[index];
        return MessageBubble(message: message);
      },
    );
  }

  Widget _buildInputArea(RemoteControlProvider provider) {
    return Container(
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        color: Colors.grey.shade100,
        border: Border(top: BorderSide(color: Colors.grey.shade300)),
      ),
      child: Row(
        children: [
          Expanded(
            child: TextField(
              controller: _messageController,
              decoration: const InputDecoration(
                hintText: '输入消息...',
                border: OutlineInputBorder(),
                contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              ),
              enabled: provider.isConnected,
              onSubmitted: (_) => _sendMessage(provider),
            ),
          ),
          const SizedBox(width: 8),
          IconButton(
            icon: const Icon(Icons.send),
            onPressed: provider.isConnected ? () => _sendMessage(provider) : null,
            style: IconButton.styleFrom(
              backgroundColor: Theme.of(context).primaryColor,
              foregroundColor: Colors.white,
            ),
          ),
        ],
      ),
    );
  }

  void _sendMessage(RemoteControlProvider provider) {
    final text = _messageController.text.trim();
    if (text.isEmpty) return;

    provider.sendMessage(text);
    _messageController.clear();
  }

  void _showPermissionDialog(RemoteControlProvider provider) {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => PermissionDialog(
        permission: provider.pendingPermission!,
        onAllow: () {
          provider.respondToPermission(true);
          Navigator.of(context).pop();
        },
        onDeny: () {
          provider.respondToPermission(false);
          Navigator.of(context).pop();
        },
      ),
    );
  }

  void _handleMenu(String value) {
    final provider = context.read<RemoteControlProvider>();
    switch (value) {
      case 'disconnect':
        provider.disconnect();
        Navigator.of(context).pop();
        break;
    }
  }

  @override
  void dispose() {
    _messageController.dispose();
    _scrollController.dispose();
    super.dispose();
  }
}
