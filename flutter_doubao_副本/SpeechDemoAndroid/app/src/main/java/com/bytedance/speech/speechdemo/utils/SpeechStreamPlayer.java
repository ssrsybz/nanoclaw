package com.bytedance.speech.speechdemo.utils;

import android.util.Log;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;

import java.util.Arrays;
import java.util.LinkedList;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.locks.Condition;
import java.util.concurrent.locks.Lock;
import java.util.concurrent.locks.ReentrantLock;

public class SpeechStreamPlayer {
    private static int mSampleRate = 24000;
    private BlockingQueue mAudioBuffer = new LinkedBlockingQueue<byte[]>();

    private AudioTrack mPlayer = null;
    private Thread mWorker = null;

    // Player Status
    private boolean mIsPlaying = false;
    private boolean mIsPaused = false;
    private Lock mLock = new ReentrantLock();
    private Condition mWaitStop = mLock.newCondition();
    private Condition mWaitResume = mLock.newCondition();
    private AtomicBoolean mAudioEnd = new AtomicBoolean(true);

    private boolean InitStreamPlayer() {
        final int minBufferSize = AudioTrack.getMinBufferSize(mSampleRate,
                AudioFormat.CHANNEL_OUT_MONO,
                AudioFormat.ENCODING_PCM_16BIT);
        mPlayer = new AudioTrack(AudioManager.STREAM_MUSIC,
                mSampleRate,
                AudioFormat.CHANNEL_OUT_MONO,
                AudioFormat.ENCODING_PCM_16BIT,
                minBufferSize,
                AudioTrack.MODE_STREAM);
        if (mPlayer.getState() != AudioTrack.STATE_INITIALIZED) {
            Log.e(SpeechDemoDefines.TAG, "Failed to initialize stream player.");
            mPlayer.release();
            mPlayer = null;
            return false;
        }
        return true;
    }

    public void SetPlayerSampleRate(int sampleRate) {
        mSampleRate = sampleRate;
    }

    public void WaitPlayerStop() {
        mLock.lock();
        try {
            Log.d(SpeechDemoDefines.TAG, "Demo player is_playing: " + mIsPlaying);
            while (mIsPlaying) {
                mWaitStop.await();
            }
        } catch (InterruptedException e) {
            throw new RuntimeException(e);
        } finally {
            mLock.unlock();
        }
    }

    public boolean Start() {
        if (!InitStreamPlayer()) {
            return false;
        }
        mIsPaused = false;
        if (null != mWorker) {
            if (mWorker.isAlive()) {
                Log.w(SpeechDemoDefines.TAG, "Already start!");
                return true;
            }
            mWorker = null;
        }
        mWorker = new PlayerThread();

        mAudioEnd.set(false);
        mLock.lock();
        try {
            mIsPlaying = true;
        } finally {
            mLock.unlock();
        }
        mWorker.start();

        Log.i(SpeechDemoDefines.TAG, "Stream Player Started.");
        return true;
    }

    public void Stop() {
        if (null == mWorker) {
            Log.w(SpeechDemoDefines.TAG, "Not start yet!");
            return;
        }
        mLock.lock();
        try {
            mIsPaused = false;
            mWaitResume.signal();

            mIsPlaying = false;
            mWaitStop.signal();
        } finally {
            mLock.unlock();
        }

        mWorker.interrupt();

        try {
            mWorker.join();
        } catch (InterruptedException e) {
            e.printStackTrace();
            Thread.currentThread().interrupt();
        }

        mAudioBuffer.clear();
        mWorker = null;
        Log.i(SpeechDemoDefines.TAG, "Stream Player Stopped.");
    }

    public void Feed(byte[] audio, boolean isFinal) {
        if (mPlayer == null || mAudioBuffer == null) {
            return;
        }

        try {
            final int singleBufferMaxSize = mSampleRate / 1000 * 2 * 40; // 40ms
            int start = 0;
            while (audio.length > start) {
                int end = Math.min(start + singleBufferMaxSize, audio.length);
                mAudioBuffer.put(Arrays.copyOfRange(audio, start, end));
                start += (end - start);
            }
        } catch (InterruptedException e) {
            Log.e(SpeechDemoDefines.TAG, "Put audio to block queue failed.");
            e.printStackTrace();
        }
        mAudioEnd.set(isFinal);
    }

    public void Pause() {
        if (mPlayer == null) {
            return;
        }
        Log.i(SpeechDemoDefines.TAG, "Pause Stream Player.");
        mLock.lock();
        try {
            if (!mIsPaused) {
                mPlayer.pause();
                mIsPaused = true;
            }
        } finally {
            mLock.unlock();
        }
    }

    public void Resume() {
        if (mPlayer == null) {
            return;
        }
        mLock.lock();
        try {
            if (mIsPaused) {
                mIsPaused = false;
                mPlayer.play();
                mWaitResume.signal();
            }
        } finally {
            mLock.unlock();
        }
    }

    private final class PlayerThread extends Thread {
        @Override
        public void run() {
            if (mPlayer == null) {
                return;
            }
            mPlayer.play();

            while (!interrupted()) {
                try {
                    if (mAudioEnd.get()) {
                        LinkedList<byte[]> audioBlocks = new LinkedList<>();
                        mAudioBuffer.drainTo(audioBlocks);
                        for (int i = 0; i < audioBlocks.size(); ++i) {
                            byte[] audio = audioBlocks.get(i);
                            writeAudio(audio, i < audioBlocks.size() - 1);
                            if (interrupted()) {
                                break;
                            }
                        }
                        break;
                    } else {
                        writeAudio((byte[]) (mAudioBuffer.take()), false);
                    }
                } catch (InterruptedException e) {
                    break;
                }
            }
            mPlayer.stop();

            mLock.lock();
            try {
                mIsPlaying = false;
                mWaitStop.signalAll();
            } finally {
                mLock.unlock();
            }
        }
    }

    private void writeAudio(byte[] audio, boolean isFinal) {
        if (audio.length <= 0) {
            Log.w(SpeechDemoDefines.TAG, "Audio block length is invalid.");
        }
        int playedBytes = mPlayer.write(audio, 0, audio.length);
        Log.d(SpeechDemoDefines.TAG, "Audio block size: " + audio.length + ", played size: " + playedBytes);
        if (playedBytes < audio.length) {
            mLock.lock();
            try {
                while (mIsPaused) {
                    mWaitResume.await();
                }
                mPlayer.write(audio, playedBytes, audio.length - playedBytes);
            } catch (InterruptedException e) {
                e.printStackTrace();
                return;
            } finally {
                mLock.unlock();
            }
        }
    }
}
