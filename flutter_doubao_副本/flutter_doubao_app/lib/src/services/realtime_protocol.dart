import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

class MessageType {
  static const int fullClientRequest = 0x01;
  static const int fullServerResponse = 0x09;
  static const int audioOnlyRequest = 0x02;
  static const int audioOnlyResponse = 0x0B;
  static const int errorInfo = 0x0F;
}

class RealtimeEvent {
  static const int startConnection = 1;
  static const int finishConnection = 2;
  static const int startSession = 100;
  static const int finishSession = 102;
  static const int taskRequest = 200;
  static const int sayHello = 300;
  static const int chatTTSText = 500;
  static const int chatTextQuery = 501;
  static const int connectionStarted = 50;
  static const int connectionFailed = 51;
  static const int sessionStarted = 150;
  static const int sessionFailed = 153;
  static const int ttsResponse = 352;
  static const int ttsSentenceStart = 350;
  static const int ttsEnded = 359;
  static const int asrResponse = 451;
  static const int asrEnded = 459;
  static const int chatResponse = 550;
  static const int chatEnded = 559;
}

class RealtimeProtocol {
  static Uint8List _generateHeader({
    int messageType = 0x01,
    int flags = 0x04,
    int serialization = 0x01,
    int compression = 0x01,
  }) {
    return Uint8List.fromList([
      0x11,
      (messageType << 4) | flags,
      (serialization << 4) | compression,
      0x00,
    ]);
  }

  static Uint8List createStartConnectionFrame() {
    final header = _generateHeader();
    final eventId = _intToBytes(1, 4);
    final payload = gzip.encode(utf8.encode('{}'));
    final payloadSize = _intToBytes(payload.length, 4);
    
    return Uint8List.fromList([
      ...header,
      ...eventId,
      ...payloadSize,
      ...payload,
    ]);
  }

  static Uint8List createStartSessionFrame({
    String? sessionId,
    String? botName,
    String model = '1.2.1.0',
  }) {
    final header = _generateHeader();
    final eventId = _intToBytes(100, 4);
    
    final sessionConfig = <String, dynamic>{
      'dialog': <String, dynamic>{
        if (botName != null) 'bot_name': botName,
        'extra': <String, dynamic>{
          'model': model,
        },
      },
      'tts': <String, dynamic>{
        'audio_config': <String, dynamic>{
          'channel': 1,
          'format': 'pcm_s16le',
          'sample_rate': 24000,
        },
      },
    };
    
    final sid = sessionId ?? '';
    final sidBytes = utf8.encode(sid);
    final sidLen = _intToBytes(sidBytes.length, 4);
    
    final payload = gzip.encode(utf8.encode(json.encode(sessionConfig)));
    final payloadSize = _intToBytes(payload.length, 4);
    
    return Uint8List.fromList([
      ...header,
      ...eventId,
      ...sidLen,
      ...sidBytes,
      ...payloadSize,
      ...payload,
    ]);
  }

  static Uint8List createFinishSessionFrame({String? sessionId}) {
    final header = _generateHeader();
    final eventId = _intToBytes(102, 4);
    
    final sid = sessionId ?? '';
    final sidBytes = utf8.encode(sid);
    final sidLen = _intToBytes(sidBytes.length, 4);
    
    final payload = gzip.encode(utf8.encode('{}'));
    final payloadSize = _intToBytes(payload.length, 4);
    
    return Uint8List.fromList([
      ...header,
      ...eventId,
      ...sidLen,
      ...sidBytes,
      ...payloadSize,
      ...payload,
    ]);
  }

  static Uint8List createFinishConnectionFrame() {
    final header = _generateHeader();
    final eventId = _intToBytes(2, 4);
    final payload = gzip.encode(utf8.encode('{}'));
    final payloadSize = _intToBytes(payload.length, 4);
    
    return Uint8List.fromList([
      ...header,
      ...eventId,
      ...payloadSize,
      ...payload,
    ]);
  }

  static Uint8List createAudioFrame(Uint8List audioData, {String? sessionId}) {
    final header = _generateHeader(
      messageType: 0x02,
      flags: 0x04,
      serialization: 0x00,
      compression: 0x01,
    );
    final eventId = _intToBytes(200, 4);
    
    final sid = sessionId ?? '';
    final sidBytes = utf8.encode(sid);
    final sidLen = _intToBytes(sidBytes.length, 4);
    
    final payload = gzip.encode(audioData);
    final payloadSize = _intToBytes(payload.length, 4);
    
    return Uint8List.fromList([
      ...header,
      ...eventId,
      ...sidLen,
      ...sidBytes,
      ...payloadSize,
      ...payload,
    ]);
  }

  static List<int> _intToBytes(int value, int byteCount) {
    final bytes = <int>[];
    for (int i = byteCount - 1; i >= 0; i--) {
      bytes.add((value >> (i * 8)) & 0xFF);
    }
    return bytes;
  }
}

class ProtocolFrame {
  final int messageType;
  final int? event;
  final int? errorCode;
  final Uint8List? payload;

  ProtocolFrame({
    required this.messageType,
    this.event,
    this.errorCode,
    this.payload,
  });

  static ProtocolFrame? parse(Uint8List data) {
    if (data.length < 4) return null;

    int byte1 = data[1];
    int byte2 = data[2];

    int messageTypeValue = (byte1 >> 4) & 0x0F;
    int flags = byte1 & 0x0F;
    int serialization = (byte2 >> 4) & 0x0F;
    int compression = byte2 & 0x0F;

    int messageType;
    switch (messageTypeValue) {
      case 0x01:
        messageType = MessageType.fullClientRequest;
        break;
      case 0x09:
        messageType = MessageType.fullServerResponse;
        break;
      case 0x02:
        messageType = MessageType.audioOnlyRequest;
        break;
      case 0x0B:
        messageType = MessageType.audioOnlyResponse;
        break;
      case 0x0F:
        messageType = MessageType.errorInfo;
        break;
      default:
        messageType = MessageType.fullServerResponse;
    }

    int offset = 4;

    int? event;
    int? errorCode;
    Uint8List? framePayload;
    
    if (messageType == MessageType.errorInfo) {
      if (offset + 4 <= data.length) {
        errorCode = _bytesToInt(data, offset, 4);
        offset += 4;
      }
      if (offset + 4 <= data.length) {
        int payloadSize = _bytesToInt(data, offset, 4);
        offset += 4;
        if (payloadSize > 0 && offset + payloadSize <= data.length) {
          framePayload = data.sublist(offset, offset + payloadSize);
        }
      }
      return ProtocolFrame(
        messageType: messageType,
        event: null,
        errorCode: errorCode,
        payload: framePayload,
      );
    }

    if ((flags & 0x04) != 0 && offset + 4 <= data.length) {
      event = _bytesToInt(data, offset, 4);
      offset += 4;
    }

    if (offset + 4 <= data.length) {
      int sessionIdLen = _bytesToInt(data, offset, 4);
      offset += 4;
      if (sessionIdLen > 0 && offset + sessionIdLen <= data.length) {
        offset += sessionIdLen;
      }
    }

    if (offset + 4 <= data.length) {
      int payloadSize = _bytesToInt(data, offset, 4);
      offset += 4;
      if (payloadSize > 0 && offset + payloadSize <= data.length) {
        framePayload = data.sublist(offset, offset + payloadSize);
        if (compression == 0x01 && framePayload != null) {
          try {
            framePayload = Uint8List.fromList(gzip.decode(framePayload));
          } catch (_) {}
        }
      }
    }

    return ProtocolFrame(
      messageType: messageType,
      event: event,
      errorCode: null,
      payload: framePayload,
    );
  }

  static int _bytesToInt(Uint8List data, int offset, int length) {
    int value = 0;
    for (int i = 0; i < length; i++) {
      value = (value << 8) | data[offset + i];
    }
    return value;
  }
}
