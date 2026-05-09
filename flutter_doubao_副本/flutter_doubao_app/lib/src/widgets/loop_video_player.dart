import 'dart:async';
import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';

class LoopVideoPlayer extends StatefulWidget {
  final String assetPath;
  final double? width;
  final double? height;
  final BoxFit fit;
  final BorderRadius? borderRadius;

  const LoopVideoPlayer({
    Key? key,
    required this.assetPath,
    this.width,
    this.height,
    this.fit = BoxFit.cover,
    this.borderRadius,
  }) : super(key: key);

  @override
  State<LoopVideoPlayer> createState() => _LoopVideoPlayerState();
}

class _LoopVideoPlayerState extends State<LoopVideoPlayer> {
  VideoPlayerController? _controller;
  bool _isInitialized = false;
  bool _hasError = false;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _initializeVideo();
  }

  void _videoListener() {
    if (_controller == null) return;
    
    final position = _controller!.value.position;
    final duration = _controller!.value.duration;
    
    if (position >= duration && duration > Duration.zero) {
      print('[LoopVideoPlayer] 视频播放完成，重新播放');
      _controller!.seekTo(Duration.zero);
      _controller!.play();
    }
  }

  Future<void> _initializeVideo() async {
    try {
      print('[LoopVideoPlayer] 开始初始化视频: ${widget.assetPath}');
      
      _controller = VideoPlayerController.asset(widget.assetPath);
      
      await _controller!.initialize();
      
      print('[LoopVideoPlayer] 视频初始化成功, duration: ${_controller!.value.duration}');
      
      _controller!.setLooping(true);
      _controller!.setVolume(0.0);
      _controller!.addListener(_videoListener);
      
      await _controller!.play();
      
      print('[LoopVideoPlayer] 视频开始播放');
      
      if (mounted) {
        setState(() {
          _isInitialized = true;
        });
      }
    } catch (e, stackTrace) {
      print('[LoopVideoPlayer] 视频初始化失败: $e');
      print('[LoopVideoPlayer] 堆栈: $stackTrace');
      if (mounted) {
        setState(() {
          _hasError = true;
          _errorMessage = e.toString();
        });
      }
    }
  }

  @override
  void dispose() {
    _controller?.removeListener(_videoListener);
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_hasError) {
      return _buildErrorWidget();
    }

    if (!_isInitialized || _controller == null) {
      return _buildLoadingWidget();
    }

    return SizedBox(
      width: widget.width,
      height: widget.height,
      child: FittedBox(
        fit: widget.fit,
        child: SizedBox(
          width: _controller!.value.size.width,
          height: _controller!.value.size.height,
          child: VideoPlayer(_controller!),
        ),
      ),
    );
  }

  Widget _buildLoadingWidget() {
    return Container(
      width: widget.width,
      height: widget.height,
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.3),
        borderRadius: widget.borderRadius,
      ),
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            CircularProgressIndicator(
              color: Colors.white.withOpacity(0.7),
              strokeWidth: 2,
            ),
            SizedBox(height: 8),
            Text(
              '加载视频中...',
              style: TextStyle(
                color: Colors.white.withOpacity(0.7),
                fontSize: 12,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildErrorWidget() {
    return Container(
      width: widget.width,
      height: widget.height,
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.3),
        borderRadius: widget.borderRadius,
      ),
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.person,
              size: 60,
              color: Colors.white.withOpacity(0.7),
            ),
            if (_errorMessage != null) ...[
              SizedBox(height: 8),
              Padding(
                padding: EdgeInsets.symmetric(horizontal: 16),
                child: Text(
                  '视频加载失败',
                  style: TextStyle(
                    color: Colors.white.withOpacity(0.5),
                    fontSize: 10,
                  ),
                  textAlign: TextAlign.center,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
