https://github.com/volcengine/rtc-aigc-demo
官方demo
STEP 1 配置客户端参数
下方为配置好的 RTC 相关房间信息
您也可以复制代码到源码中
查看位置
{
  AppId: "6993cc3b72a09501747d2a16",
  RoomId: "ChatRoom01",
  UserId: "Huoshan01",
  Token: "0016993cc3b72a09501747d2a16SQCyXXIESjKZacpsomkKAENoYXRSb29tMDEJAEh1b3NoYW4wMQYAAADKbKJpAQDKbKJpAgDKbKJpAwDKbKJpBADKbKJpBQDKbKJpIACYplXu4pJYSEqVUhA/M1VdUPnLpZcOm5vRk7tJkW/xHg==",
},
STEP 2 配置服务端参数
下方为配置好的启动智能体请求示例
您也可以复制代码到源码中
查看位置
注意：调用 OpenAPI 需要鉴权，您可以至API 访问密钥获取AK，SK
查看位置
 并填写到源码中
查看位置
 实现签名
{
  "AppId": "6993cc3b72a09501747d2a16",
  "RoomId": "ChatRoom01",
  "TaskId": "ChatTask01",
  "AgentConfig": {
    "TargetUserId": [
        "Huoshan01"
      ],
    "WelcomeMessage": "你好，我是周超，有什么需要帮忙的吗？",
    "UserId": "ChatBot01",
    "EnableConversationStateCallback": true
  },
  "Config": {
    "ASRConfig": {
      "Provider": "volcano",
      "ProviderParams": {
        "Mode": "bigmodel",
        "AppId": "3937088082",
        "AccessToken": "xp1FeWwmfRpZ19BuHiZBpf9ir2mbyOo-",
        "ApiResourceId": "volc.bigasr.sauc.duration"
      }
    },
    "TTSConfig": {
      "Provider": "volcano",
      "ProviderParams": {
        "app": {
          "appid": "3937088082",
          "cluster": "volcano_tts"
        },
        "audio": {
          "voice_type": "BV002_streaming",
          "speed_ratio": 1,
          "pitch_ratio": 1,
          "volume_ratio": 1
        }
      }
    },
    "LLMConfig": {
      "Mode": "ArkV3",
      "EndPointId": "ep-20260221112614-7gdzn",
      "SystemMessages": [
          "你是周超，产品经理，性格幽默又善解人意。你在表达时需简明扼要，有自己的观点。"
        ],
      "VisionConfig": {
        "Enable": true
      },
      "ThinkingType": "disabled"
    },
    "InterruptMode": 0
  }
}