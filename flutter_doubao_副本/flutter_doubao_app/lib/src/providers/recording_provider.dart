import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:flutter_doubao_app/src/models/recording_record.dart';

class RecordingProvider extends ChangeNotifier {
  static const String _storageKey = 'recording_records';
  List<RecordingRecord> _records = [];
  SharedPreferences? _prefs;

  List<RecordingRecord> get records => List.unmodifiable(_records);
  
  int get count => _records.length;

  Future<void> init() async {
    _prefs = await SharedPreferences.getInstance();
    await _loadRecords();
  }

  Future<void> _loadRecords() async {
    final String? data = _prefs?.getString(_storageKey);
    if (data != null) {
      try {
        final List<dynamic> jsonList = jsonDecode(data);
        _records = jsonList
            .map((json) => RecordingRecord.fromJson(json as Map<String, dynamic>))
            .toList();
        _records.sort((a, b) => b.createdAt.compareTo(a.createdAt));
        notifyListeners();
      } catch (e) {
        debugPrint('加载录制记录失败: $e');
        _records = [];
      }
    }
  }

  Future<void> _saveRecords() async {
    final String data = jsonEncode(_records.map((r) => r.toJson()).toList());
    await _prefs?.setString(_storageKey, data);
  }

  Future<void> addRecord(RecordingRecord record) async {
    _records.insert(0, record);
    await _saveRecords();
    notifyListeners();
  }

  Future<void> updateRecord(RecordingRecord record) async {
    final index = _records.indexWhere((r) => r.id == record.id);
    if (index != -1) {
      _records[index] = record;
      await _saveRecords();
      notifyListeners();
    }
  }

  Future<void> deleteRecord(String id) async {
    _records.removeWhere((r) => r.id == id);
    await _saveRecords();
    notifyListeners();
  }

  RecordingRecord? getRecord(String id) {
    try {
      return _records.firstWhere((r) => r.id == id);
    } catch (_) {
      return null;
    }
  }

  Future<void> updateSummary(String id, String summary) async {
    final index = _records.indexWhere((r) => r.id == id);
    if (index != -1) {
      _records[index] = _records[index].copyWith(summary: summary);
      await _saveRecords();
      notifyListeners();
    }
  }
}
