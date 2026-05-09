package com.bytedance.speech.speechdemo.utils;

import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.util.Log;

import com.bytedance.speech.speechdemo.R;
import com.bytedance.speech.speechdemo.SettingsActivity;
import com.bytedance.speech.speechengine.SpeechEngine;

import java.io.ByteArrayOutputStream;

public class SpeechStreamRecorder {

    private static final int SAMPLE_RATE = 44100;
    private static final int CHANNEL_NUM = 2;
    private static final int BYTES_PER_SAMPLE = 2;
    private static final float BUFFER_SIZE_IN_SECONDS = 0.08f;
    private static final int DEFAULT_PACKAGE_DURATION = 100;

    private AudioRecord mRecorder;
    private Thread mWorker = null;
    private int mBufferSize = 0;
    private int mPackageDuration = DEFAULT_PACKAGE_DURATION;

    private String mViewId = "";
    private SpeechEngine mSpeechEngine = null;

    public int GetStreamSampleRate() {
        return SAMPLE_RATE;
    }

    public int GetStreamChannel() {
        return CHANNEL_NUM;
    }

    public void SetSpeechEngine(String viewId, SpeechEngine speechEngine) {
        mViewId = viewId;
        mSpeechEngine = speechEngine;
    }

    public boolean Start() {
        if (!InitStreamRecorder()) {
            return false;
        }
        if (null != mWorker) {
            if (mWorker.isAlive()) {
                Log.w(SpeechDemoDefines.TAG, "Already start!");
                return true;
            }
            mWorker = null;
        }
        mPackageDuration = SettingsActivity.getSettings(mViewId).getInt(R.string.config_stream_package_duration, DEFAULT_PACKAGE_DURATION);

        mWorker = new RecorderThread();
        mWorker.start();
        Log.i(SpeechDemoDefines.TAG, "Stream Recorder Started.");
        return true;
    }

    public void Stop() {
        if (null == mWorker) {
            Log.w(SpeechDemoDefines.TAG, "Not start yet!");
            return;
        }
        mWorker.interrupt();

        try {
            mWorker.join();
        } catch (InterruptedException e) {
            e.printStackTrace();
            Thread.currentThread().interrupt();
        }

        mWorker = null;
        Log.i(SpeechDemoDefines.TAG, "Stream Recorder Stopped.");
    }

    private final class RecorderThread extends Thread {
        @Override
        public void run() {
            if (mRecorder == null) {
                return;
            }
            mRecorder.startRecording();

            ByteArrayOutputStream bos = new ByteArrayOutputStream();

            int nread = 0;
            long totalPackageSize = (long)SAMPLE_RATE * CHANNEL_NUM * BYTES_PER_SAMPLE * mPackageDuration / 1000;
            while (!isInterrupted() && nread >= 0) {
                byte[] buffer = new byte[mBufferSize];
                bos.reset();
                long curPackageSize = 0;
                while (!isInterrupted() && nread >= 0 && curPackageSize < totalPackageSize) {
                    nread = mRecorder.read(buffer, 0, mBufferSize);
                    if (nread > 0) {
                        Log.i(SpeechDemoDefines.TAG, "Current package size: " + curPackageSize + ", total package size: " + totalPackageSize);
                        curPackageSize += nread;
                        bos.write(buffer, 0, nread);
                    } else if (nread < 0) {
                        Log.e(SpeechDemoDefines.TAG, "Recorder error.");
                    }
                }
                if (!isInterrupted()) {
                    buffer = bos.toByteArray();
                    int ret = mSpeechEngine.feedAudio(buffer, buffer.length);
                    if (ret != 0) {
                        Log.e(SpeechDemoDefines.TAG, "Feed audio failed.");
                        break;
                    }
                }
            }
            mRecorder.stop();
        }
    }

    private boolean InitStreamRecorder() {
        if (mRecorder != null) {
            return true;
        }

        mBufferSize = Math.round(SAMPLE_RATE * BUFFER_SIZE_IN_SECONDS * BYTES_PER_SAMPLE * CHANNEL_NUM);
        int minBufferSize = AudioRecord.getMinBufferSize(SAMPLE_RATE,
                CHANNEL_NUM == 1 ? AudioFormat.CHANNEL_IN_MONO : AudioFormat.CHANNEL_IN_STEREO,
                AudioFormat.ENCODING_PCM_16BIT);
        minBufferSize = Math.max(minBufferSize, mBufferSize);

        mRecorder = new AudioRecord(
                MediaRecorder.AudioSource.MIC, SAMPLE_RATE,
                CHANNEL_NUM == 1 ? AudioFormat.CHANNEL_IN_MONO : AudioFormat.CHANNEL_IN_STEREO,
                AudioFormat.ENCODING_PCM_16BIT, minBufferSize * 10);

        if (mRecorder.getState() == AudioRecord.STATE_UNINITIALIZED) {
            Log.e(SpeechDemoDefines.TAG, "Failed to initialize stream recorder.");
            mRecorder.release();
            mRecorder = null;
            return false;
        }
        return true;
    }
}
