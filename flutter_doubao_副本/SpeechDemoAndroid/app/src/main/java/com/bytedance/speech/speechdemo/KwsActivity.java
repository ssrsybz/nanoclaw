// Copyright 2020 Bytedance Inc. All Rights Reserved.
// Author: fengkai.0518@bytedance.com (fengkai.0518)

package com.bytedance.speech.speechdemo;

import android.Manifest;
import android.annotation.SuppressLint;
import android.os.Bundle;
import android.text.method.ScrollingMovementMethod;
import android.util.Log;
import android.widget.Button;
import android.widget.TextView;

import com.bytedance.speech.speechdemo.settings.Settings;
import com.bytedance.speech.speechdemo.utils.SpeechDemoDefines;
import com.bytedance.speech.speechdemo.utils.SpeechStreamRecorder;
import com.bytedance.speech.speechengine.SpeechEngine;
import com.bytedance.speech.speechengine.SpeechEngineDefines;
import com.bytedance.speech.speechengine.SpeechEngineGenerator;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.lang.ref.WeakReference;
import java.util.Arrays;
import java.util.List;

public class KwsActivity extends BaseActivity implements SpeechEngine.SpeechListener {
    // Permissions
    private static final List<String> KWS_PERMISSIONS = Arrays.asList(
            Manifest.permission.WRITE_EXTERNAL_STORAGE,
            Manifest.permission.RECORD_AUDIO
    );

    // StreamRecorder
    private SpeechStreamRecorder mStreamRecorder;

    // Engine
    private SpeechEngine mSpeechEngine = null;
    private boolean mEngineStarted = false;

    // UI
    private TextView mKwsResult;
    private TextView mEngineStatus;
    private Button mInit;
    private Button mUninit;
    private Button mStart;
    private Button mStop;

    // Paths
    private String mRecFilePath = "";
    private String mDebugPath = "";
    private String mKwsRootPath = "";

    // Settings
    protected Settings mSettings;

    @SuppressLint({"ClickableViewAccessibility", "InflateParams", "HardwareIds"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        Log.i(SpeechDemoDefines.TAG, "Kws onCreate");
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_kws);
        setTitleBar(R.string.kws_name);
        requestPermission(KWS_PERMISSIONS);

        final String viewId = SpeechDemoDefines.KWS_VIEW;
        mSettings = SettingsActivity.getSettings(viewId);
        mStreamRecorder = MainActivity.getStreamRecorder();

        mKwsResult = findViewById(R.id.kws_result_text);

        mEngineStatus = findViewById(R.id.engine_status);
        mEngineStatus.setText(R.string.hint_waiting_init);

        Button mConfig = findViewById(R.id.engine_config);
        mConfig.setEnabled(true);
        mConfig.setOnClickListener(v -> goToSettingsActivity(viewId));

        mInit = findViewById(R.id.init_engine_button);
        SetButton(mInit, true);
        mInit.setOnClickListener(v -> init());

        mUninit = findViewById(R.id.uninit_engine_button);
        SetButton(mUninit, false);
        mUninit.setOnClickListener(v -> uninit());

        mStart = findViewById(R.id.start_engin_button);
        SetButton(mStart, false);
        mStart.setOnClickListener(v -> startEngine());

        mStop = findViewById(R.id.stop_button);
        SetButton(mStop, false);
        mStop.setOnClickListener(v -> stopEngine());

    }

    @Override
    protected void onDestroy() {
        Log.i(SpeechDemoDefines.TAG, "Kws onDestroy");
        if (mEngineStarted) {
            stopEngine();
        }
        super.onDestroy();
    }

    @Override
    public void onStart() {
        Log.i(SpeechDemoDefines.TAG, "Kws onStart");
        updateWakeupWords();
        super.onStart();
    }

    private void init() {
        if (mEngineStarted) {
            mEngineStatus.setText(R.string.hint_engine_busy);
            return;
        }
        SetButton(mStart, false);
        SetButton(mStop, false);
        initEngine();
    }

    private void uninit() {
        uninitEngine();
        mEngineStatus.setText(R.string.hint_waiting_init);
        mKwsResult.setText(R.string.kws_input_hint);

        SetButton(mUninit, false);
        SetButton(mInit, true);
        SetButton(mStart, false);
        SetButton(mStop, false);
    }

    private void startEngine() {
        updateWakeupWords();
        if (mSettings.getOptionsValue(R.string.config_recorder_type, this).equals(SpeechEngineDefines.RECORDER_TYPE_STREAM)) {
            mSpeechEngine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_CUSTOM_SAMPLE_RATE_INT, mStreamRecorder.GetStreamSampleRate());
            mSpeechEngine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_CUSTOM_CHANNEL_INT, mStreamRecorder.GetStreamChannel());
            if (!mStreamRecorder.Start()) {
                requestPermission(KWS_PERMISSIONS);
                return;
            }
        } else if (mSettings.getOptionsValue(R.string.config_recorder_type, this).equals(SpeechEngineDefines.RECORDER_TYPE_FILE)) {
            String test_file_path = mDebugPath + "/kws_rec_file.pcm";
            Log.d(SpeechDemoDefines.TAG, "test file path: " + test_file_path);
            mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_RECORDER_FILE_STRING, test_file_path);
        }

        mSpeechEngine.sendDirective(SpeechEngineDefines.DIRECTIVE_SYNC_STOP_ENGINE, "");
        int ret = mSpeechEngine.sendDirective(SpeechEngineDefines.DIRECTIVE_START_ENGINE, "");
        if (ret == SpeechEngineDefines.ERR_REC_CHECK_ENVIRONMENT_FAILED) {
            mEngineStatus.setText(R.string.check_rec_permission);
            requestPermission(KWS_PERMISSIONS);
        } else if (ret != SpeechEngineDefines.ERR_NO_ERROR) {
            Log.e(SpeechDemoDefines.TAG, "send directive failed, " + ret);
        }
        clearResultText();
    }

    private void stopEngine() {
        mSpeechEngine.sendDirective(SpeechEngineDefines.DIRECTIVE_STOP_ENGINE, "");
    }

    public void speechEnginInitOk(long initCost) {
        Log.i(SpeechDemoDefines.TAG, "Speech engine init OK!");
        mStreamRecorder.SetSpeechEngine(SpeechDemoDefines.KWS_VIEW, mSpeechEngine);
        this.runOnUiThread(() -> {
            setResultText("Cost: " + initCost);
            mEngineStatus.setText(R.string.hint_ready);
            SetButton(mInit, false);
            SetButton(mUninit, true);
            SetButton(mStart, true);
        });
    }

    public void speechEngineInitFailed(String tipText) {
        Log.e(SpeechDemoDefines.TAG, "Speech engine init failed!");
        this.runOnUiThread(() -> {
            mEngineStatus.setText(R.string.hint_setup_failure);
            SetButton(mInit, true);
            setResultText(tipText);
        });
    }

    public void speechStart(final String data) {
        Log.i(SpeechDemoDefines.TAG, "Start " + data);
        mEngineStarted = true;
        this.runOnUiThread(() -> {
            mEngineStatus.setText(R.string.hint_start_cb);
            SetButton(mStart, false);
            SetButton(mStop, true);
        });
    }

    public void speechStop(final String data) {
        Log.i(SpeechDemoDefines.TAG, "Stop " + data);
        mEngineStarted = false;
        this.runOnUiThread(() -> {
            mStreamRecorder.Stop();
            mEngineStatus.setText(R.string.hint_stop_cb);
            SetButton(mStart, true);
            SetButton(mStop, false);
        });
    }

    public void speechError(final String data) {
        this.runOnUiThread(() -> {
            try {
                JSONObject reader = new JSONObject(data);
                if (!reader.has("err_code") || !reader.has("err_msg")) {
                    return;
                }
                setResultText(data);
            } catch (JSONException e) {
                e.printStackTrace();
            }
        });
    }

    public void setResultText(final String text) {
        this.runOnUiThread(() -> {
            mKwsResult.setText(text);
        });
    }

    public void clearResultText() {
        this.runOnUiThread(() -> {
            mKwsResult.setText("");
        });
    }

    private void updateWakeupWords() {
        if (mSpeechEngine == null) {
            return;
        }
        String customsWrods = mSettings.getString(R.string.config_kws_custom_words);
        if (customsWrods.isEmpty()) {
            return;
        }
        mSpeechEngine.sendDirective(SpeechEngineDefines.DIRECTIVE_UPDATE_WAKEUP_WORDS_PARAMS, customsWrods);
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
            case SpeechEngineDefines.MESSAGE_TYPE_WAKEUP_RESULT:
                setResultText(stdData);
                break;
            case SpeechEngineDefines.MESSAGE_TYPE_VAD_BEGIN:
            case SpeechEngineDefines.MESSAGE_TYPE_VAD_END:
                Log.d(SpeechDemoDefines.TAG, "Vad result: " + stdData);
                break;
            default:
                break;
        }
    }

    private void configKwsParams() {
        // common
        if (mRecFilePath.isEmpty()) {
            mRecFilePath = copyAssetsToFiles("testdata");
        }
        if (mDebugPath.isEmpty()) {
            mDebugPath = getDebugPath();
        }
        Log.d(SpeechDemoDefines.TAG, "Recorder file path: " + mRecFilePath);
        Log.d(SpeechDemoDefines.TAG, "Debug path:" + mDebugPath);

        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_ENGINE_NAME_STRING, SpeechEngineDefines.KWS_ENGINE);
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_LOG_LEVEL_STRING, SpeechEngineDefines.LOG_LEVEL_TRACE);
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_APP_ID_STRING, mSettings.getString(R.string.config_app_id));
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_DEBUG_PATH_STRING, mDebugPath);
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_UID_STRING, "388808087185088");
        mSpeechEngine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_SAMPLE_RATE_INT, 16000);
        mSpeechEngine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_RECORDER_PRESET_INT, mSettings.getInt(R.string.config_recorder_preset));

        // Config data source:
        mSpeechEngine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_RECORDER_DISABLE_REUSE_BOOL, mSettings.getBoolean(R.string.config_disable_recorder_reuse));
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_RECORDER_TYPE_STRING, mSettings.getOptionsValue(R.string.config_recorder_type, this));

        if (mSettings.getOptionsValue(R.string.config_recorder_type, this).equals(SpeechEngineDefines.RECORDER_TYPE_STREAM)) {
            if (mStreamRecorder.GetStreamSampleRate() != 16000) {
                mSpeechEngine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_ENABLE_RESAMPLER_BOOL, true);
            }
        }

        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_REC_PATH_STRING, mSettings.getBoolean(R.string.config_rec_save) ? mDebugPath : "");
        mSpeechEngine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_REC_FILE_TYPE_INT, mSettings.getOptions(R.string.config_rec_file_type).chooseIdx);

        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_KWS_USER_PARAM_STRING, "{\"array_type\": 0,\"radius\":0.0,\"total_channels\":1,\"mic_offset\":0,\"mic_num\":1,\"ref_offset\":0,\"ref_num\":0}");
        mSpeechEngine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_KWS_ENABLE_VAD_BOOL, false);

        if (mKwsRootPath.isEmpty()) {
            mKwsRootPath = copyAssetsToFiles("kws/common");
        }
        Log.d(SpeechDemoDefines.TAG, "Kws root path:" + mKwsRootPath);
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_KWS_ROOT_PATH_STRING, mKwsRootPath);

    }

    private void initEngine() {
        if (mSpeechEngine == null) {
            mSpeechEngine = SpeechEngineGenerator.getInstance();
            mSpeechEngine.createEngine();
        }
        Log.d(SpeechDemoDefines.TAG, "SDK version: " + mSpeechEngine.getVersion());

        configKwsParams();

        long startInitTimestamp = System.currentTimeMillis();
        int ret = mSpeechEngine.initEngine();
        if (ret != SpeechEngineDefines.ERR_NO_ERROR) {
            String errMessage = "Init Engine Faile: " + ret;
            Log.e(SpeechDemoDefines.TAG, errMessage);
            speechEngineInitFailed(errMessage);
            return;
        }
        long cost = System.currentTimeMillis() - startInitTimestamp;
        Log.d(SpeechDemoDefines.TAG, String.format("Engine init cost: %d", cost));
        mSpeechEngine.setListener(this);
        speechEnginInitOk(cost);
    }

    private void uninitEngine() {
        if (mSpeechEngine != null) {
            mSpeechEngine.destroyEngine();
            mSpeechEngine = null;
            Log.d(SpeechDemoDefines.TAG, "Speech engine uninit Ok!");
        }
    }

    private void SetButton(Button btn, boolean isActive) {
        if (isActive) {
            btn.setBackground(getResources().getDrawable(R.drawable.btn_active_background));
            btn.setEnabled(true);
        } else {
            btn.setBackground(getResources().getDrawable(R.drawable.btn_negative_background));
            btn.setEnabled(false);
        }
    }

}
