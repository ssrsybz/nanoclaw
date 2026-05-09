import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:flutter_doubao_app/src/providers/chat_provider.dart';
import 'package:provider/provider.dart';

class MessageInput extends StatefulWidget {
  const MessageInput({Key? key}) : super(key: key);

  @override
  _MessageInputState createState() => _MessageInputState();
}

class _MessageInputState extends State<MessageInput> {
  final TextEditingController _textController = TextEditingController();
  final ImagePicker _picker = ImagePicker();
  bool _isComposing = false;

  @override
  void initState() {
    super.initState();
    _textController.addListener(() {
      setState(() {
        _isComposing = _textController.text.isNotEmpty;
      });
    });
  }

  @override
  void dispose() {
    _textController.dispose();
    super.dispose();
  }

  void _sendMessage() {
    if (_isComposing) {
      final chatProvider = Provider.of<ChatProvider>(context, listen: false);
      chatProvider.sendMessage(_textController.text);
      _textController.clear();
    }
  }

  Future<void> _pickImage() async {
    final XFile? image = await _picker.pickImage(source: ImageSource.gallery);
    if (image != null) {
      final chatProvider = Provider.of<ChatProvider>(context, listen: false);
      // 这里应该上传图片到服务器，然后获取URL
      // 现在使用模拟URL
      chatProvider.sendMessage('分享了一张图片', imageUrl: 'https://picsum.photos/400/600');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      decoration: BoxDecoration(
        color: Theme.of(context).cardColor,
        border: Border(
          top: BorderSide(
            color: Theme.of(context).colorScheme.surface.withOpacity(0.3),
            width: 1,
          ),
        ),
      ),
      child: Row(
        children: [
          IconButton(
            onPressed: _pickImage,
            icon: Icon(Icons.image, color: Theme.of(context).primaryColor),
            splashColor: Colors.transparent,
            highlightColor: Colors.transparent,
          ),
          Expanded(
            child: Container(
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.surface,
                borderRadius: BorderRadius.circular(24),
              ),
              child: TextField(
                controller: _textController,
                decoration: InputDecoration(
                  hintText: '输入消息...',
                  border: InputBorder.none,
                  contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                  hintStyle: TextStyle(
                    color: Theme.of(context).textTheme.bodyMedium?.color?.withOpacity(0.5),
                  ),
                ),
                style: TextStyle(
                  color: Theme.of(context).textTheme.bodyLarge?.color,
                ),
                onSubmitted: (_) => _sendMessage(),
              ),
            ),
          ),
          SizedBox(width: 8),
          Container(
            width: 44,
            height: 44,
            child: ElevatedButton(
              onPressed: _isComposing ? _sendMessage : null,
              style: ElevatedButton.styleFrom(
                shape: CircleBorder(),
                backgroundColor: _isComposing ? Theme.of(context).primaryColor : Theme.of(context).colorScheme.surface,
                foregroundColor: _isComposing ? Colors.white : Theme.of(context).textTheme.bodyMedium?.color,
                padding: EdgeInsets.all(0),
                elevation: 0,
              ),
              child: Icon(Icons.send),
            ),
          ),
        ],
      ),
    );
  }
}
