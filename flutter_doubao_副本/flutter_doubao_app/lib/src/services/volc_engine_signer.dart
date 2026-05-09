import 'dart:convert';
import 'package:crypto/crypto.dart';

class VolcEngineSigner {
  static const String _region = 'cn-north-1';
  static const String _service = 'rtc';
  static const String _host = 'rtc.volcengineapi.com';

  static Map<String, String> sign({
    required String accessKeyId,
    required String secretKey,
    required String action,
    required String version,
    required Map<String, dynamic> body,
  }) {
    final now = DateTime.now().toUtc();
    final dateStr = _formatDate(now);
    final datetimeStr = _formatDateTime(now);

    final bodyStr = jsonEncode(body);
    final bodyHash = sha256.convert(utf8.encode(bodyStr)).toString();

    final canonicalRequest = _buildCanonicalRequest(
      method: 'POST',
      uri: '/',
      query: 'Action=$action&Version=$version',
      headers: {
        'Host': _host,
        'Content-Type': 'application/json',
        'X-Date': datetimeStr,
        'X-Content-Sha256': bodyHash,
      },
      bodyHash: bodyHash,
    );

    final credentialScope = '$dateStr/$_region/$_service/request';
    final canonicalRequestHash = sha256.convert(utf8.encode(canonicalRequest)).toString();

    final stringToSign = 'HMAC-SHA256\n$datetimeStr\n$credentialScope\n$canonicalRequestHash';

    final kDate = _hmacSha256(utf8.encode(secretKey), dateStr);
    final kRegion = _hmacSha256(kDate, _region);
    final kService = _hmacSha256(kRegion, _service);
    final kSigning = _hmacSha256(kService, 'request');
    final signature = _hmacSha256Hex(kSigning, stringToSign);

    final authorization = 'HMAC-SHA256 Credential=$accessKeyId/$credentialScope, SignedHeaders=content-type;host;x-content-sha256;x-date, Signature=$signature';

    return {
      'Host': _host,
      'Content-Type': 'application/json',
      'X-Date': datetimeStr,
      'X-Content-Sha256': bodyHash,
      'Authorization': authorization,
    };
  }

  static String _buildCanonicalRequest({
    required String method,
    required String uri,
    required String query,
    required Map<String, String> headers,
    required String bodyHash,
  }) {
    final sortedHeaders = headers.entries.toList()
      ..sort((a, b) => a.key.toLowerCase().compareTo(b.key.toLowerCase()));

    final canonicalHeaders = sortedHeaders
        .map((e) => '${e.key.toLowerCase()}:${e.value.trim()}')
        .join('\n');

    final signedHeaders = sortedHeaders
        .map((e) => e.key.toLowerCase())
        .join(';');

    return '$method\n$uri\n$query\n$canonicalHeaders\n\n$signedHeaders\n$bodyHash';
  }

  static List<int> _hmacSha256(List<int> key, String message) {
    final hmac = Hmac(sha256, key);
    return hmac.convert(utf8.encode(message)).bytes;
  }

  static String _hmacSha256Hex(List<int> key, String message) {
    final hmac = Hmac(sha256, key);
    return hmac.convert(utf8.encode(message)).toString();
  }

  static String _formatDate(DateTime dt) {
    return '${dt.year}${dt.month.toString().padLeft(2, '0')}${dt.day.toString().padLeft(2, '0')}';
  }

  static String _formatDateTime(DateTime dt) {
    return '${_formatDate(dt)}T${dt.hour.toString().padLeft(2, '0')}${dt.minute.toString().padLeft(2, '0')}${dt.second.toString().padLeft(2, '0')}Z';
  }
}
