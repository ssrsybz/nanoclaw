package com.example.flutter_doubao_app

import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    private val CHANNEL = "com.example.flutter_doubao_app/audio_stream"
    private var streamPlayer: SpeechStreamPlayer? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL).setMethodCallHandler { call, result ->
            when (call.method) {
                "startPlayer" -> {
                    val sampleRate = call.argument<Int>("sampleRate") ?: 24000
                    val success = startPlayer(sampleRate)
                    result.success(success)
                }
                "feedAudio" -> {
                    val audioData = call.argument<ByteArray>("audioData")
                    val isFinal = call.argument<Boolean>("isFinal") ?: false
                    if (audioData != null) {
                        feedAudio(audioData, isFinal)
                        result.success(true)
                    } else {
                        result.error("INVALID_ARGUMENT", "audioData is null", null)
                    }
                }
                "stopPlayer" -> {
                    stopPlayer()
                    result.success(true)
                }
                "pausePlayer" -> {
                    pausePlayer()
                    result.success(true)
                }
                "resumePlayer" -> {
                    resumePlayer()
                    result.success(true)
                }
                "isPlaying" -> {
                    result.success(isPlaying())
                }
                "waitPlayerStop" -> {
                    Thread {
                        waitPlayerStop()
                        runOnUiThread {
                            result.success(true)
                        }
                    }.start()
                }
                else -> {
                    result.notImplemented()
                }
            }
        }
    }

    private fun startPlayer(sampleRate: Int): Boolean {
        if (streamPlayer == null) {
            streamPlayer = SpeechStreamPlayer()
        }
        streamPlayer?.setPlayerSampleRate(sampleRate)
        return streamPlayer?.start() ?: false
    }

    private fun feedAudio(audioData: ByteArray, isFinal: Boolean) {
        streamPlayer?.feed(audioData, isFinal)
    }

    private fun stopPlayer() {
        streamPlayer?.stop()
    }

    private fun pausePlayer() {
        streamPlayer?.pause()
    }

    private fun resumePlayer() {
        streamPlayer?.resume()
    }

    private fun isPlaying(): Boolean {
        return streamPlayer?.isPlaying() ?: false
    }

    private fun waitPlayerStop() {
        streamPlayer?.waitPlayerStop()
    }

    override fun onDestroy() {
        streamPlayer?.release()
        streamPlayer = null
        super.onDestroy()
    }
}
