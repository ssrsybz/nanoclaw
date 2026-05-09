import 'dart:convert';
import '../../models/remote_control/connection_config.dart';

/// 二维码扫描服务
class QRScannerService {
  /// 解析二维码内容
  static ConnectionConfig? parseQrCode(String data) {
    try {
      final json = jsonDecode(data);

      if (json['type'] == 'claude-remote-control') {
        return ConnectionConfig.fromJson(json);
      }

      return null;
    } catch (e) {
      // 尝试作为 URL 解析
      if (data.startsWith('http')) {
        return ConnectionConfig(
          type: 'claude-remote-control',
          version: '1.0',
          cloudRelayUrl: data,
          terminalServiceUrl: data,
        );
      }

      return null;
    }
  }

  /// 验证配置是否有效
  static bool isValidConfig(ConnectionConfig? config) {
    if (config == null) return false;

    return config.cloudRelayUrl.isNotEmpty &&
        config.terminalServiceUrl.isNotEmpty;
  }
}
