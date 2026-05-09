import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:flutter_doubao_app/src/services/api_config.dart';
import 'package:flutter_doubao_app/src/services/volc_engine_signer.dart';

class VideoCallApi {
  static const String _baseUrl = 'https://rtc.volcengineapi.com';

  static Map<String, dynamic> _buildVoiceChatConfig() {
    return {
      'AppId': ApiConfig.rtcAppId,
      'RoomId': ApiConfig.rtcRoomId,
      'TaskId': ApiConfig.agentTaskId,
      'AgentConfig': {
        'TargetUserId': [ApiConfig.rtcUserId],
        'WelcomeMessage': ApiConfig.agentWelcomeMessage,
        'UserId': ApiConfig.agentUserId,
        'EnableConversationStateCallback': true,
      },
      'Config': {
        'ASRConfig': {
          'Provider': 'volcano',
          'ProviderParams': {
            'Mode': 'bigmodel',
            'AppId': ApiConfig.appId,
            'AccessToken': ApiConfig.accessToken,
            'ApiResourceId': 'volc.bigasr.sauc.duration',
          },
        },
        'TTSConfig': {
          'Provider': 'volcano',
          'ProviderParams': {
            'app': {
              'appid': ApiConfig.appId,
              'cluster': 'volcano_tts',
            },
            'audio': {
              'voice_type': 'BV008_streaming',
              'speed_ratio': 1,
              'pitch_ratio': 1,
              'volume_ratio': 1,
            },
          },
        },
        'LLMConfig': {
          'Mode': 'ArkV3',
          'EndPointId': ApiConfig.llmEndPointId,
          'SystemMessages': [
            '你是周超，产品经理，性格幽默又善解人意。你在表达时需简明扼要，有自己的观点。'
          ],
          'VisionConfig': {
            'Enable': true,
          },
          'ThinkingType': 'disabled',
        },
        'InterruptMode': 0,
        'EnablePush': true,
      },
    };
  }

  static Future<Map<String, dynamic>?> startVoiceChat() async {
    try {
      final body = _buildVoiceChatConfig();
      final headers = VolcEngineSigner.sign(
        accessKeyId: ApiConfig.accessKeyId,
        secretKey: ApiConfig.secretKey,
        action: 'StartVoiceChat',
        version: '2024-12-01',
        body: body,
      );

      final response = await http.post(
        Uri.parse('$_baseUrl?Action=StartVoiceChat&Version=2024-12-01'),
        headers: headers,
        body: jsonEncode(body),
      );

      print('[VideoCallApi] StartVoiceChat response: ${response.statusCode} ${response.body}');

      if (response.statusCode == 200) {
        return jsonDecode(response.body);
      } else {
        print('[VideoCallApi] StartVoiceChat failed: ${response.statusCode} ${response.body}');
        return null;
      }
    } catch (e) {
      print('[VideoCallApi] StartVoiceChat error: $e');
      return null;
    }
  }

  static Future<Map<String, dynamic>?> stopVoiceChat() async {
    try {
      final body = {
        'AppId': ApiConfig.rtcAppId,
        'RoomId': ApiConfig.rtcRoomId,
        'TaskId': ApiConfig.agentTaskId,
      };

      final headers = VolcEngineSigner.sign(
        accessKeyId: ApiConfig.accessKeyId,
        secretKey: ApiConfig.secretKey,
        action: 'StopVoiceChat',
        version: '2024-12-01',
        body: body,
      );

      final response = await http.post(
        Uri.parse('$_baseUrl?Action=StopVoiceChat&Version=2024-12-01'),
        headers: headers,
        body: jsonEncode(body),
      );

      print('[VideoCallApi] StopVoiceChat response: ${response.statusCode} ${response.body}');

      if (response.statusCode == 200) {
        return jsonDecode(response.body);
      } else {
        print('[VideoCallApi] StopVoiceChat failed: ${response.statusCode} ${response.body}');
        return null;
      }
    } catch (e) {
      print('[VideoCallApi] StopVoiceChat error: $e');
      return null;
    }
  }
}
