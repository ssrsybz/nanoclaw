package com.example.flutter_doubao_app

import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.util.Log
import java.util.Arrays
import java.util.LinkedList
import java.util.concurrent.BlockingQueue
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.locks.Condition
import java.util.concurrent.locks.Lock
import java.util.concurrent.locks.ReentrantLock

class SpeechStreamPlayer {
    private var mSampleRate: Int = 24000
    private var mAudioBuffer: BlockingQueue<ByteArray> = LinkedBlockingQueue()

    private var mPlayer: AudioTrack? = null
    private var mWorker: Thread? = null

    private var mIsPlaying: Boolean = false
    private var mIsPaused: Boolean = false
    private var mLock: Lock = ReentrantLock()
    private var mWaitStop: Condition = mLock.newCondition()
    private var mWaitResume: Condition = mLock.newCondition()
    private var mAudioEnd: AtomicBoolean = AtomicBoolean(true)

    private fun initStreamPlayer(): Boolean {
        val minBufferSize = AudioTrack.getMinBufferSize(
            mSampleRate,
            AudioFormat.CHANNEL_OUT_MONO,
            AudioFormat.ENCODING_PCM_16BIT
        )
        
        mPlayer = AudioTrack(
            AudioManager.STREAM_MUSIC,
            mSampleRate,
            AudioFormat.CHANNEL_OUT_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
            minBufferSize,
            AudioTrack.MODE_STREAM
        )
        
        if (mPlayer?.state != AudioTrack.STATE_INITIALIZED) {
            Log.e(TAG, "Failed to initialize stream player.")
            mPlayer?.release()
            mPlayer = null
            return false
        }
        return true
    }

    fun setPlayerSampleRate(sampleRate: Int) {
        mSampleRate = sampleRate
    }

    fun waitPlayerStop() {
        mLock.lock()
        try {
            Log.d(TAG, "Demo player is_playing: $mIsPlaying")
            while (mIsPlaying) {
                mWaitStop.await()
            }
        } catch (e: InterruptedException) {
            throw RuntimeException(e)
        } finally {
            mLock.unlock()
        }
    }

    fun start(): Boolean {
        if (!initStreamPlayer()) {
            return false
        }
        mIsPaused = false
        if (mWorker != null) {
            if (mWorker!!.isAlive) {
                Log.w(TAG, "Already start!")
                return true
            }
            mWorker = null
        }
        mWorker = PlayerThread()

        mAudioEnd.set(false)
        mLock.lock()
        try {
            mIsPlaying = true
        } finally {
            mLock.unlock()
        }
        mWorker?.start()

        Log.i(TAG, "Stream Player Started.")
        return true
    }

    fun stop() {
        if (mWorker == null) {
            Log.w(TAG, "Not start yet!")
            return
        }
        mLock.lock()
        try {
            mIsPaused = false
            mWaitResume.signal()

            mIsPlaying = false
            mWaitStop.signal()
        } finally {
            mLock.unlock()
        }

        mWorker?.interrupt()

        try {
            mWorker?.join()
        } catch (e: InterruptedException) {
            e.printStackTrace()
            Thread.currentThread().interrupt()
        }

        mAudioBuffer.clear()
        mWorker = null
        Log.i(TAG, "Stream Player Stopped.")
    }

    fun feed(audio: ByteArray, isFinal: Boolean) {
        if (mPlayer == null || mAudioBuffer == null) {
            return
        }

        try {
            val singleBufferMaxSize = mSampleRate / 1000 * 2 * 40
            var start = 0
            while (audio.size > start) {
                val end = Math.min(start + singleBufferMaxSize, audio.size)
                mAudioBuffer.put(Arrays.copyOfRange(audio, start, end))
                start += (end - start)
            }
        } catch (e: InterruptedException) {
            Log.e(TAG, "Put audio to block queue failed.")
            e.printStackTrace()
        }
        mAudioEnd.set(isFinal)
    }

    fun pause() {
        if (mPlayer == null) {
            return
        }
        Log.i(TAG, "Pause Stream Player.")
        mLock.lock()
        try {
            if (!mIsPaused) {
                mPlayer?.pause()
                mIsPaused = true
            }
        } finally {
            mLock.unlock()
        }
    }

    fun resume() {
        if (mPlayer == null) {
            return
        }
        mLock.lock()
        try {
            if (mIsPaused) {
                mIsPaused = false
                mPlayer?.play()
                mWaitResume.signal()
            }
        } finally {
            mLock.unlock()
        }
    }

    private inner class PlayerThread : Thread() {
        override fun run() {
            if (mPlayer == null) {
                return
            }
            mPlayer?.play()

            while (!interrupted()) {
                try {
                    if (mAudioEnd.get()) {
                        val audioBlocks = LinkedList<ByteArray>()
                        mAudioBuffer.drainTo(audioBlocks)
                        for (i in 0 until audioBlocks.size) {
                            val audio = audioBlocks[i]
                            writeAudio(audio, i < audioBlocks.size - 1)
                            if (interrupted()) {
                                break
                            }
                        }
                        break
                    } else {
                        writeAudio(mAudioBuffer.take(), false)
                    }
                } catch (e: InterruptedException) {
                    break
                }
            }
            mPlayer?.stop()

            mLock.lock()
            try {
                mIsPlaying = false
                mWaitStop.signalAll()
            } finally {
                mLock.unlock()
            }
        }
    }

    private fun writeAudio(audio: ByteArray, isFinal: Boolean) {
        if (audio.isEmpty()) {
            Log.w(TAG, "Audio block length is invalid.")
            return
        }
        val playedBytes = mPlayer?.write(audio, 0, audio.size) ?: 0
        Log.d(TAG, "Audio block size: ${audio.size}, played size: $playedBytes")
        if (playedBytes < audio.size) {
            mLock.lock()
            try {
                while (mIsPaused) {
                    mWaitResume.await()
                }
                mPlayer?.write(audio, playedBytes, audio.size - playedBytes)
            } catch (e: InterruptedException) {
                e.printStackTrace()
                return
            } finally {
                mLock.unlock()
            }
        }
    }

    fun isPlaying(): Boolean {
        return mIsPlaying
    }

    fun release() {
        stop()
        mPlayer?.release()
        mPlayer = null
    }

    companion object {
        private const val TAG = "SpeechStreamPlayer"
    }
}
