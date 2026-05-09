// Copyright 2023 Bytedance Inc. All Rights Reserved.
// Author: chengzihao.ds@bytedance.com (chengzihao.ds)

package com.bytedance.speech.speechdemo.test;

import android.Manifest;
import android.annotation.SuppressLint;
import android.os.Bundle;
import android.text.method.ScrollingMovementMethod;
import android.util.Log;
import android.widget.Button;
import android.widget.TextView;

import com.bytedance.speech.speechdemo.BaseActivity;
import com.bytedance.speech.speechdemo.R;
import com.bytedance.speech.speechdemo.SettingsActivity;
import com.bytedance.speech.speechdemo.settings.Settings;
import com.bytedance.speech.speechdemo.utils.SpeechDemoDefines;
import com.bytedance.speech.speechengine.SpeechEngine;
import com.bytedance.speech.speechengine.SpeechEngineDefines;
import com.bytedance.speech.speechengine.SpeechEngineGenerator;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.util.Arrays;
import java.util.List;

public class TestAsrOfflineRtfActivity extends BaseActivity implements SpeechEngine.SpeechListener {
    // Permissions
    private static final List<String> ASR_PERMISSIONS = Arrays.asList(
            Manifest.permission.WRITE_EXTERNAL_STORAGE,
            Manifest.permission.RECORD_AUDIO
    );

    // Engine
    private SpeechEngine engine = null;
    private boolean mEngineStarted = false;

    // UI
    private TextView mResult;
    private TextView mEngineStatus;
    private Button mInit;
    private Button mUninit;
    private Button mStart;
    private Button mStop;

    // Statistics
    private long mFeedTimestamp = -1;
    private int mAudioLength = 0;

    // Paths
    private String mRecFilePath = "";
    private String mDebugPath = "";

    // Settings
    protected Settings mSettings;

    @SuppressLint({"ClickableViewAccessibility", "InflateParams", "HardwareIds"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        Log.i(SpeechDemoDefines.TAG, "Asr onCreate");
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_test_asr_offline_rtf);
        setTitleBar(R.string.test_asr_offline_rtf_name);
        requestPermission(ASR_PERMISSIONS);

        final String viewId = SpeechDemoDefines.TEST_ASR_OFFLINE_RTF_VIEW;

        mSettings = SettingsActivity.getSettings(viewId);

        mResult = findViewById(R.id.result_text);
        mResult.setMovementMethod(new ScrollingMovementMethod());
        mResult.setText(R.string.asr_input_hint);

        mEngineStatus = findViewById(R.id.engine_status);
        mEngineStatus.setText(R.string.hint_waiting_init);

        Button mConfig = findViewById(R.id.engine_config);
        mConfig.setEnabled(true);
        mConfig.setOnClickListener(v -> goToSettingsActivity(viewId));

        mInit = findViewById(R.id.init_engine_button);
        setButton(mInit, true);
        mInit.setOnClickListener(v -> init());

        mUninit = findViewById(R.id.uninit_engine_button);
        setButton(mUninit, false);
        mUninit.setOnClickListener(v -> uninit());

        mStart = findViewById(R.id.start_engin_button);
        setButton(mStart, false);
        mStart.setOnClickListener(v -> startEngine());

        mStop = findViewById(R.id.stop_button);
        setButton(mStop, false);
        mStop.setOnClickListener(v -> stopEngine());

    }

    @Override
    protected void onDestroy() {
        Log.i(SpeechDemoDefines.TAG, "Asr onDestroy");
        uninitEngine();
        super.onDestroy();
    }

    private void init() {
        if (mEngineStarted) {
            mEngineStatus.setText(R.string.hint_engine_busy);
            return;
        }
        setButton(mStart, false);
        setButton(mStop, false);
        initEngine();
    }

    private void uninit() {
        if (mEngineStarted) {
            mEngineStatus.setText(R.string.hint_engine_busy);
            return;
        }
        uninitEngine();
        mEngineStatus.setText(R.string.hint_waiting_init);
        mResult.setText(R.string.asr_input_hint);

        setButton(mUninit, false);
        setButton(mInit, true);
        setButton(mStart, false);
        setButton(mStop, false);
    }

    private void startEngine() {
        engine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_ASR_AUTO_STOP_BOOL, false);
        engine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_ASR_ENABLE_ITN_BOOL, mSettings.getBoolean(R.string.config_asr_enable_itn));
        engine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_VAD_MAX_SPEECH_DURATION_INT, mSettings.getInt(R.string.config_vad_max_speech_duration));

        int ret = engine.sendDirective(SpeechEngineDefines.DIRECTIVE_START_ENGINE, "");
        if (ret != SpeechEngineDefines.ERR_NO_ERROR) {
            Log.e(SpeechDemoDefines.TAG, "send directive failed, " + ret);
        }
        mResult.setText("");
    }

    private void stopEngine() {
        engine.sendDirective(SpeechEngineDefines.DIRECTIVE_STOP_ENGINE, "");
    }

    private void configAsrParams() {
        // common
        if (mRecFilePath.isEmpty()) {
            mRecFilePath = copyAssetsToFiles("testdata");
        }
        if (mDebugPath.isEmpty()) {
            mDebugPath = getDebugPath();
        }
        Log.d(SpeechDemoDefines.TAG, "Recorder file path: " + mRecFilePath);
        Log.d(SpeechDemoDefines.TAG, "Debug path:" + mDebugPath);

        engine.setOptionString(SpeechEngineDefines.PARAMS_KEY_LOG_LEVEL_STRING, SpeechEngineDefines.LOG_LEVEL_TRACE);
        engine.setOptionString(SpeechEngineDefines.PARAMS_KEY_APP_ID_STRING, mSettings.getString(R.string.config_app_id));
        engine.setOptionString(SpeechEngineDefines.PARAMS_KEY_DEBUG_PATH_STRING, mDebugPath);
        engine.setOptionString(SpeechEngineDefines.PARAMS_KEY_UID_STRING, "388808087185088");
        engine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_SAMPLE_RATE_INT, 16000);
        engine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_RECORDER_PRESET_INT, mSettings.getInt(R.string.config_recorder_preset));

        // Config data source:
        engine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_RECORDER_DISABLE_REUSE_BOOL, mSettings.getBoolean(R.string.config_disable_recorder_reuse));
        engine.setOptionString(SpeechEngineDefines.PARAMS_KEY_RECORDER_TYPE_STRING, SpeechEngineDefines.RECORDER_TYPE_STREAM);

        // asr
        engine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_ASR_WORK_MODE_INT, SpeechEngineDefines.ASR_WORK_MODE_OFFLINE);
        engine.setOptionString(SpeechEngineDefines.PARAMS_KEY_ASR_OFF_RESOURCE_PATH_STRING, mDebugPath + "/models");
        engine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_CHANNEL_NUM_INT, 1);
        engine.setOptionString(SpeechEngineDefines.PARAMS_KEY_ENGINE_NAME_STRING, SpeechEngineDefines.ASR_ENGINE);
        engine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_ASR_SHOW_UTTER_BOOL, true);
        engine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_ASR_SHOW_LANG_BOOL, mSettings.getBoolean(R.string.config_asr_show_lang));
        engine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_ASR_SHOW_VOLUME_BOOL, true);
        engine.setOptionString(SpeechEngineDefines.PARAMS_KEY_ASR_REC_PATH_STRING, "");
        if (mSettings.getBoolean(R.string.config_asr_rec_save)) {
            engine.setOptionString(SpeechEngineDefines.PARAMS_KEY_ASR_REC_PATH_STRING, mDebugPath);
        }
    }

    private void initEngine() {

        if (engine == null) {
            engine = SpeechEngineGenerator.getInstance();
            engine.createEngine();
            engine.setContext(this);
        }
        Log.d(SpeechDemoDefines.TAG, "SDK version: " + engine.getVersion());

        configAsrParams();

        long startInitTimestamp = System.currentTimeMillis();
        int ret = engine.initEngine();
        if (ret != SpeechEngineDefines.ERR_NO_ERROR) {
            String errMessage = "Init Engine Faile: " + ret;
            Log.e(SpeechDemoDefines.TAG, errMessage);
            speechEngineInitFailed(errMessage);
            return;
        }
        long cost = System.currentTimeMillis() - startInitTimestamp;
        engine.setListener(this);
        speechEnginInitOk(cost);
    }

    private void uninitEngine() {
        if (engine != null) {
            engine.destroyEngine();
            engine = null;
            Log.d(SpeechDemoDefines.TAG, "Speech engine uninit Ok!");
        }
    }

    public void speechEnginInitOk(long initCost) {
        Log.i(SpeechDemoDefines.TAG, "Speech engine init OK!");
        this.runOnUiThread(() -> {
            mResult.setText("Cost: " + initCost);
            mEngineStatus.setText(R.string.hint_ready);
            setButton(mInit, false);
            setButton(mUninit, true);
            setButton(mStart, true);
        });
    }

    public void speechEngineInitFailed(String tipText) {
        Log.e(SpeechDemoDefines.TAG, "Speech engine init failed!");
        this.runOnUiThread(() -> {
            mEngineStatus.setText(R.string.hint_setup_failure);
            setButton(mInit, true);
            mResult.setText(tipText);
        });
    }

    public void speechStart(final String data) {
        Log.i(SpeechDemoDefines.TAG, "Start " + data);
        mEngineStarted = true;

        this.runOnUiThread(() -> {
            String test_file_path = mDebugPath + "/asr_rec_file.pcm";
            Log.d(SpeechDemoDefines.TAG, "test file path: " + test_file_path);

            try {
                byte[] bytes = new byte[mSettings.getInt(R.string.config_stream_package_duration) * 16 * 2];
                InputStream is = new FileInputStream(new File(test_file_path));
                mAudioLength = is.read(bytes);
                is.close();
                mFeedTimestamp = System.currentTimeMillis();
                engine.feedAudio(bytes, mAudioLength);
                engine.sendDirective(SpeechEngineDefines.DIRECTIVE_FINISH_TALKING, "");
            } catch (Exception e) {
                mResult.setText("ERROR: File asr_rec_file.pcm not found!");
                stopEngine();
            }

            mEngineStatus.setText(R.string.hint_start_cb);
            setButton(mStart, false);
            setButton(mStop, true);
        });
    }

    public void speechStop(final String data) {
        Log.i(SpeechDemoDefines.TAG, "Stop " + data);
        mEngineStarted = false;
        this.runOnUiThread(() -> {
            mEngineStatus.setText(R.string.hint_stop_cb);
            setButton(mStart, true);
            setButton(mStop, false);
        });
    }

    public void speechAsrResult(final String data, boolean isFinal) {
        long delay = 0;
        if (isFinal && mFeedTimestamp > 0) {
            delay = System.currentTimeMillis() - mFeedTimestamp;
        }
        final long response_delay = delay;

        this.runOnUiThread(() -> {
            try {
                JSONObject reader = new JSONObject(data);
                if (!reader.has("result")) {
                    return;
                }
                String text = "result: " + reader.getJSONArray("result").getJSONObject(0).getString("text").trim();
                if (isFinal) {
                    text += "\nreqid: " + reader.getString("reqid");
                    text += "\naudio_length: " + mAudioLength;
                    text += "\nresponse_delay: " + response_delay;
                    text += "\nrtf: " + (float) response_delay / (mAudioLength / 16 / 2);
                }
                mResult.setText(text);
            } catch (JSONException e) {
                e.printStackTrace();
            }
        });
    }

    public void speechError(final String data) {
        this.runOnUiThread(() -> {
            try {
                JSONObject reader = new JSONObject(data);
                if (!reader.has("err_code") || !reader.has("err_msg")) {
                    return;
                }
                mResult.setText(data);
            } catch (JSONException e) {
                e.printStackTrace();
            }
        });
    }

    @Override
    public void onSpeechMessage(int type, byte[] data, int len) {
        String stdData = new String(data);
        switch (type) {
            case SpeechEngineDefines.MESSAGE_TYPE_ENGINE_START:
                speechStart(stdData);
                break;
            case SpeechEngineDefines.MESSAGE_TYPE_ENGINE_STOP:
                speechStop(stdData);
                break;
            case SpeechEngineDefines.MESSAGE_TYPE_ENGINE_ERROR:
                speechError(stdData);
                break;
            case SpeechEngineDefines.MESSAGE_TYPE_PARTIAL_RESULT:
                speechAsrResult(stdData, false);
                break;
            case SpeechEngineDefines.MESSAGE_TYPE_FINAL_RESULT:
                speechAsrResult(stdData, true);
                break;
            case SpeechEngineDefines.MESSAGE_TYPE_VOLUME_LEVEL:
                Log.i(SpeechDemoDefines.TAG, "volume level: " + stdData);
                break;
            case SpeechEngineDefines.MESSAGE_TYPE_ENGINE_LOG:
                Log.i(SpeechDemoDefines.TAG, "engine log: " + stdData);
                break;
            default:
                break;
        }
    }
}
