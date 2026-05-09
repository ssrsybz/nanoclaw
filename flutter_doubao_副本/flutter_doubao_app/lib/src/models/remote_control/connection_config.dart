/// 远程控制连接配置
class ConnectionConfig {
  final String type;
  final String version;
  final String cloudRelayUrl;
  final String terminalServiceUrl;

  ConnectionConfig({
    required this.type,
    required this.version,
    required this.cloudRelayUrl,
    required this.terminalServiceUrl,
  });

  factory ConnectionConfig.fromJson(Map<String, dynamic> json) {
    return ConnectionConfig(
      type: json['type'] ?? 'claude-remote-control',
      version: json['version'] ?? '1.0',
      cloudRelayUrl: json['cloudRelayUrl'] ?? '',
      terminalServiceUrl: json['terminalServiceUrl'] ?? '',
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'type': type,
      'version': version,
      'cloudRelayUrl': cloudRelayUrl,
      'terminalServiceUrl': terminalServiceUrl,
    };
  }
}
