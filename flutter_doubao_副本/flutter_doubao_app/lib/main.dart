import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:flutter_doubao_app/src/providers/chat_provider.dart';
import 'package:flutter_doubao_app/src/providers/theme_provider.dart';
import 'package:flutter_doubao_app/src/providers/recording_provider.dart';
import 'package:flutter_doubao_app/src/providers/remote_control/index.dart';
import 'package:flutter_doubao_app/src/screens/chat_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final recordingProvider = RecordingProvider();
  await recordingProvider.init();

  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => ChatProvider()),
        ChangeNotifierProvider(create: (_) => ThemeProvider()),
        ChangeNotifierProvider.value(value: recordingProvider),
        ChangeNotifierProvider(create: (_) => RemoteControlProvider()),
      ],
      child: MyApp(),
    ),
  );
}

class MyApp extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final themeProvider = Provider.of<ThemeProvider>(context);

    return MaterialApp(
      title: '豆包',
      theme: themeProvider.themeData,
      home: ChatScreen(),
      debugShowCheckedModeBanner: false,
    );
  }
}
