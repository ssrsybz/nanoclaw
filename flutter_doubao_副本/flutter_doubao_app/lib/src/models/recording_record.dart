class RecordingRecord {
  final String id;
  final String videoPath;
  final String? thumbnailPath;
  final int durationSeconds;
  final String? summary;
  final DateTime createdAt;
  final String? dialogText;

  RecordingRecord({
    required this.id,
    required this.videoPath,
    this.thumbnailPath,
    required this.durationSeconds,
    this.summary,
    required this.createdAt,
    this.dialogText,
  });

  factory RecordingRecord.fromJson(Map<String, dynamic> json) {
    return RecordingRecord(
      id: json['id'] as String,
      videoPath: json['videoPath'] as String,
      thumbnailPath: json['thumbnailPath'] as String?,
      durationSeconds: json['durationSeconds'] as int,
      summary: json['summary'] as String?,
      createdAt: DateTime.parse(json['createdAt'] as String),
      dialogText: json['dialogText'] as String?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'videoPath': videoPath,
      'thumbnailPath': thumbnailPath,
      'durationSeconds': durationSeconds,
      'summary': summary,
      'createdAt': createdAt.toIso8601String(),
      'dialogText': dialogText,
    };
  }

  RecordingRecord copyWith({
    String? id,
    String? videoPath,
    String? thumbnailPath,
    int? durationSeconds,
    String? summary,
    DateTime? createdAt,
    String? dialogText,
  }) {
    return RecordingRecord(
      id: id ?? this.id,
      videoPath: videoPath ?? this.videoPath,
      thumbnailPath: thumbnailPath ?? this.thumbnailPath,
      durationSeconds: durationSeconds ?? this.durationSeconds,
      summary: summary ?? this.summary,
      createdAt: createdAt ?? this.createdAt,
      dialogText: dialogText ?? this.dialogText,
    );
  }

  String get formattedDuration {
    int hours = durationSeconds ~/ 3600;
    int minutes = (durationSeconds % 3600) ~/ 60;
    int seconds = durationSeconds % 60;
    if (hours > 0) {
      return '${hours.toString().padLeft(2, '0')}:${minutes.toString().padLeft(2, '0')}:${seconds.toString().padLeft(2, '0')}';
    }
    return '${minutes.toString().padLeft(2, '0')}:${seconds.toString().padLeft(2, '0')}';
  }
}
