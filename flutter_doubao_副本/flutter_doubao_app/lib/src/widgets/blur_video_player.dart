import 'dart:async';
import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';

class BlurVideoPlayer extends StatefulWidget {
  final String assetPath;
  final double heightFactor;
  final double blurSigma;

  const BlurVideoPlayer({
    Key? key,
    required this.assetPath,
    this.heightFactor = 0.8,
    this.blurSigma = 15.0,
  }) : super(key: key);

  @override
  State<BlurVideoPlayer> createState() => _BlurVideoPlayerState();
}

class _BlurVideoPlayerState extends State<BlurVideoPlayer> {
  VideoPlayerController? _controller;
  bool _isInitialized = false;
  bool _hasError = false;

  @override
  void initState() {
    super.initState();
    _initializeVideo();
  }

  Future<void> _initializeVideo() async {
    try {
      print('[BlurVideoPlayer] 开始初始化视频: ${widget.assetPath}');

      _controller = VideoPlayerController.asset(widget.assetPath);

      await _controller!.initialize();

      print('[BlurVideoPlayer] 视频初始化成功, duration: ${_controller!.value.duration}, size: ${_controller!.value.size}');

      _controller!.setLooping(true);
      _controller!.setVolume(0.0);

      await _controller!.play();

      print('[BlurVideoPlayer] 视频开始播放');

      if (mounted) {
        setState(() {
          _isInitialized = true;
        });
      }
    } catch (e, stackTrace) {
      print('[BlurVideoPlayer] 视频初始化失败: $e');
      print('[BlurVideoPlayer] 堆栈: $stackTrace');
      if (mounted) {
        setState(() {
          _hasError = true;
        });
      }
    }
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final screenHeight = MediaQuery.of(context).size.height;
    final screenWidth = MediaQuery.of(context).size.width;
    final videoHeight = screenHeight * widget.heightFactor;

    if (_hasError) {
      return _buildErrorWidget(videoHeight, screenWidth);
    }

    if (!_isInitialized || _controller == null) {
      return _buildLoadingWidget(videoHeight, screenWidth);
    }

    return Container(
      width: screenWidth,
      height: videoHeight,
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            Color.fromARGB(255, 212, 212, 168),
            Color.fromARGB(255, 220, 192, 95),
          ],
        ),
      ),
      child: Stack(
        alignment: Alignment.center,
        children: [
          Positioned.fill(
            child: BackdropFilter(
              filter: ImageFilter.blur(
                sigmaX: widget.blurSigma,
                sigmaY: widget.blurSigma,
              ),
              child: Container(
                color: Colors.transparent,
              ),
            ),
          ),
          Positioned.fill(
            child: FittedBox(
              fit: BoxFit.cover,
              child: SizedBox(
                width: _controller!.value.size.width,
                height: _controller!.value.size.height,
                child: VideoPlayer(_controller!),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildLoadingWidget(double height, double width) {
    return Container(
      height: height,
      width: width,
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            Color.fromARGB(255, 212, 212, 168),
            Color.fromARGB(255, 220, 192, 95),
          ],
        ),
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

  Widget _buildErrorWidget(double height, double width) {
    return Container(
      height: height,
      width: width,
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            Color.fromARGB(255, 212, 212, 168),
            Color.fromARGB(255, 220, 192, 95),
          ],
        ),
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
            SizedBox(height: 8),
            Text(
              '视频加载失败',
              style: TextStyle(
                color: Colors.white.withOpacity(0.5),
                fontSize: 12,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
