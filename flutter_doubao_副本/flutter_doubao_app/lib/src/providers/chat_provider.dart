import 'dart:math';
import 'package:flutter/material.dart';
import 'package:flutter_doubao_app/src/models/message.dart';

class ChatProvider extends ChangeNotifier {
  List<Message> _messages = [];
  bool _isLoading = false;

  List<Message> get messages => _messages;
  bool get isLoading => _isLoading;

  void sendMessage(String text, {String? imageUrl}) {
    final message = Message(
      id: Random().nextInt(10000).toString(),
      text: text,
      imageUrl: imageUrl,
      isUser: true,
      timestamp: DateTime.now(),
      status: MessageStatus.sending,
    );

    _messages.add(message);
    notifyListeners();

    // 模拟发送成功
    Future.delayed(Duration(seconds: 1), () {
      final index = _messages.indexOf(message);
      if (index != -1) {
        _messages[index] = message.copyWith(status: MessageStatus.sent);
        notifyListeners();

        // 模拟AI回复
        generateAIResponse();
      }
    });
  }

  void generateAIResponse() {
    _isLoading = true;
    notifyListeners();

    Future.delayed(Duration(seconds: 2), () {
      final responseMessage = Message(
        id: Random().nextInt(10000).toString(),
        text: '这是一个AI回复示例。我可以帮助你解决问题，回答问题，或者只是聊聊天。你有什么想知道的吗？',
        isUser: false,
        timestamp: DateTime.now(),
      );

      _messages.add(responseMessage);
      _isLoading = false;
      notifyListeners();
    });
  }

  void clearMessages() {
    _messages.clear();
    notifyListeners();
  }

  void updateMessageStatus(String messageId, MessageStatus status) {
    final index = _messages.indexWhere((msg) => msg.id == messageId);
    if (index != -1) {
      _messages[index] = _messages[index].copyWith(status: status);
      notifyListeners();
    }
  }
}
