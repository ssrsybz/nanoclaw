import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:flutter_doubao_app/src/services/api_config.dart';

class LlmService {
  static Future<String?> generateSummary(String dialogText) async {
    if (dialogText.isEmpty) {
      return null;
    }

    try {
      final response = await http.post(
        Uri.parse('https://ark.cn-beijing.volces.com/api/v3/chat/completions'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ${ApiConfig.accessToken}',
        },
        body: jsonEncode({
          'model': ApiConfig.llmEndPointId,
          'messages': [
            {
              'role': 'system',
              'content': '你是一个视频内容总结助手。请根据用户的对话内容，生成一个简洁的总结（不超过50个字），描述这个视频的主要内容。只输出总结内容，不要输出其他内容。',
            },
            {
              'role': 'user',
              'content': '请总结以下对话内容：\n\n$dialogText',
            },
          ],
          'max_tokens': 100,
          'temperature': 0.7,
        }),
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        final content = data['choices']?[0]?['message']?['content'] as String?;
        return content?.trim();
      } else {
        print('LLM API error: ${response.statusCode} - ${response.body}');
        return null;
      }
    } catch (e) {
      print('生成总结失败: $e');
      return null;
    }
  }
}
