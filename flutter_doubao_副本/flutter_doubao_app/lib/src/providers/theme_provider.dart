import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

class ThemeProvider extends ChangeNotifier {
  bool _isDarkMode = false;

  bool get isDarkMode => _isDarkMode;

  ThemeData get themeData => _isDarkMode ? _darkTheme : _lightTheme;

  ThemeProvider() {
    _loadTheme();
  }

  Future<void> _loadTheme() async {
    final prefs = await SharedPreferences.getInstance();
    _isDarkMode = prefs.getBool('isDarkMode') ?? false;
    notifyListeners();
  }

  Future<void> toggleTheme() async {
    _isDarkMode = !_isDarkMode;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('isDarkMode', _isDarkMode);
    notifyListeners();
  }

  static final ThemeData _lightTheme = ThemeData(
    brightness: Brightness.light,
    primaryColor: Color(0xFF4F46E5),
    secondaryHeaderColor: Color(0xFFEC4899),
    scaffoldBackgroundColor: Color(0xFFF9FAFB),
    cardColor: Color(0xFFFFFFFF),
    textTheme: TextTheme(
      bodyLarge: TextStyle(color: Color(0xFF111827)),
      bodyMedium: TextStyle(color: Color(0xFF4B5563)),
    ),
    colorScheme: ColorScheme.light(
      primary: Color(0xFF4F46E5),
      secondary: Color(0xFFEC4899),
      background: Color(0xFFF9FAFB),
      surface: Color(0xFFFFFFFF),
      error: Color(0xFFEF4444),
      onPrimary: Colors.white,
      onSecondary: Colors.white,
      onBackground: Color(0xFF111827),
      onSurface: Color(0xFF111827),
      onError: Colors.white,
    ),
  );

  static final ThemeData _darkTheme = ThemeData(
    brightness: Brightness.dark,
    primaryColor: Color(0xFF6366F1),
    secondaryHeaderColor: Color(0xFFF472B6),
    scaffoldBackgroundColor: Color(0xFF111827),
    cardColor: Color(0xFF1F2937),
    textTheme: TextTheme(
      bodyLarge: TextStyle(color: Color(0xFFF9FAFB)),
      bodyMedium: TextStyle(color: Color(0xFFD1D5DB)),
    ),
    colorScheme: ColorScheme.dark(
      primary: Color(0xFF6366F1),
      secondary: Color(0xFFF472B6),
      background: Color(0xFF111827),
      surface: Color(0xFF1F2937),
      error: Color(0xFFF87171),
      onPrimary: Colors.white,
      onSecondary: Colors.white,
      onBackground: Color(0xFFF9FAFB),
      onSurface: Color(0xFFF9FAFB),
      onError: Colors.white,
    ),
  );
}
