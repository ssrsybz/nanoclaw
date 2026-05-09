// Copyright 2021 Bytedance Inc. All Rights Reserved.
// Author: chengzihao.ds@bytedance.com (chengzihao.ds)

package com.bytedance.speech.speechdemo;

import android.Manifest;
import android.annotation.SuppressLint;
import android.os.Bundle;
import android.text.method.ArrowKeyMovementMethod;
import android.util.Log;
import android.view.View;
import android.widget.Button;
import android.widget.TextView;

import com.bytedance.speech.speechdemo.settings.SettingItem;
import com.bytedance.speech.speechdemo.settings.Settings;
import com.bytedance.speech.speechdemo.utils.SensitiveDefines;
import com.bytedance.speech.speechdemo.utils.SpeechDemoDefines;
import com.bytedance.speech.speechdemo.utils.SpeechStreamRecorder;
import com.bytedance.speech.speechengine.SpeechEngine;
import com.bytedance.speech.speechengine.SpeechEngineDefines;
import com.bytedance.speech.speechengine.SpeechEngineGenerator;

import java.io.File;
import java.util.Collections;
import java.util.List;

public class VoiceConvActivity extends BaseActivity implements View.OnClickListener, SpeechEngine.SpeechListener {
    private enum ActivityStatus {
        // activity status sequence from first(BEFORE_INIT) to last(AFTER_SUBMIT)
        BEFORE_INIT,
        INITING,
        BEFORE_START,
        RECORDING,
        WAITING_RESULT,
    }

    // Permissions
    private static final List<String> VOICECONV_PERMISSIONS = Collections.singletonList(
            Manifest.permission.RECORD_AUDIO
    );

    // Engine
    private SpeechEngine mSpeechEngine = null;
    private boolean mEngineInited = false;
    private boolean mEngineStarted = false;

    // UI
    private TextView mResultText;
    private TextView mEngineStatus;
    private Button mEngineSwitchBtn;
    private Button mStartEngineBtn;
    private Button mFinishTalkingBtn;

    // Statistics
    private long mStartEngineTimestamp = -1;

    // Recorder
    private SpeechStreamRecorder mStreamRecorder;
    private String mCurRecType = "";
    private String mRecFilePath = "";
    private long mRecFileLength = 0;
    private long mCurResultLength = 0;

    // Settings
    protected Settings mSettings;

    @SuppressLint({"ClickableViewAccessibility", "InflateParams", "HardwareIds"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        Log.i(SpeechDemoDefines.TAG, "VoiceConv onCreate");
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_voiceconv);
        setTitleBar(R.string.voiceconv_name);

        final String viewId = SpeechDemoDefines.VOICECONV_VIEW;
        mSettings = SettingsActivity.getSettings(viewId);

        initView();

        switchStatus(ActivityStatus.BEFORE_INIT);
        mRecFilePath = getDebugPath() + "/voiceconv_rec_file.pcm";
    }

    private void initView() {
        mResultText = findViewById(R.id.result_text);
        mResultText.setMovementMethod(new ArrowKeyMovementMethod());
        mEngineStatus = findViewById(R.id.engine_status);

        mEngineSwitchBtn = findViewById(R.id.switch_engine_button);
        mEngineSwitchBtn.setOnClickListener(this);

        mStartEngineBtn = findViewById(R.id.start_button);
        mStartEngineBtn.setOnClickListener(this);

        mFinishTalkingBtn = findViewById(R.id.finish_talking_btn);
        mFinishTalkingBtn.setOnClickListener(this);

        findViewById(R.id.setting_button).setOnClickListener(this);
    }

    @Override
    protected void onDestroy() {
        Log.i(SpeechDemoDefines.TAG, "VoiceConv onDestroy");
        uninitEngine();
        super.onDestroy();
    }

    @Override
    public void onClick(View view) {
        int id = view.getId();
        if (id == R.id.switch_engine_button) {
            switchEngine();
        } else if (id == R.id.setting_button) {
            goToSettingsActivity(SpeechDemoDefines.VOICECONV_VIEW);
        } else if (id == R.id.start_button) {
            startEngine();
        } else if (id == R.id.finish_talking_btn) {
            finishTalking();
        }
    }

    private void switchEngine() {
        if (mEngineStarted) {
            mEngineStatus.setText(R.string.hint_engine_busy);
            return;
        }
        if (mEngineInited) {
            uninitEngine();
        } else {
            initEngine();
        }
    }

    private void startEngine() {
        if (mCurRecType.equals(SpeechEngineDefines.RECORDER_TYPE_STREAM)) {
            mSpeechEngine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_CUSTOM_SAMPLE_RATE_INT, mStreamRecorder.GetStreamSampleRate());
            mSpeechEngine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_CUSTOM_CHANNEL_INT, mStreamRecorder.GetStreamChannel());
            mStreamRecorder.Start();
        } else if (mCurRecType.equals(SpeechEngineDefines.RECORDER_TYPE_FILE)) {
            mCurResultLength = 0;
            // get record file length
            File recordFile = new File(mRecFilePath);
            mRecFileLength = recordFile.length();
            Log.i(SpeechDemoDefines.TAG, "Open record file: " + mRecFilePath + ", length: " + mRecFileLength);
            mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_RECORDER_FILE_STRING, mRecFilePath);
        }

        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_UID_STRING, SensitiveDefines.UID);
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_VOICECONV_VOICE_STRING, mSettings.getString(R.string.config_voice));
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_VOICECONV_VOICE_TYPE_STRING, mSettings.getString(R.string.config_voice_type));
        mSpeechEngine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_VOICECONV_RESULT_SAMPLE_RATE_INT, mSettings.getInt(R.string.config_voiceconv_result_sample_rate));
        mSpeechEngine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_VOICECONV_REQUEST_INTERVAL_INT, mSettings.getInt(R.string.config_voiceconv_request_interval));

        mStartEngineTimestamp = System.currentTimeMillis();
        int ret = mSpeechEngine.sendDirective(SpeechEngineDefines.DIRECTIVE_START_ENGINE, "");
        if (ret == SpeechEngineDefines.ERR_NO_ERROR) {
            switchStatus(ActivityStatus.RECORDING);
        } else if (ret == SpeechEngineDefines.ERR_REC_CHECK_ENVIRONMENT_FAILED) {
            mEngineStatus.setText(R.string.check_rec_permission);
            requestPermission(VOICECONV_PERMISSIONS);
        } else {
            setTextOnUiThread(mResultText, "Start engine failed! ret: " + ret);
        }
    }

    private void stopEngine() {
        if (mSpeechEngine != null) {
            mSpeechEngine.sendDirective(SpeechEngineDefines.DIRECTIVE_STOP_ENGINE, "");
            if (mCurRecType.equals(SpeechEngineDefines.RECORDER_TYPE_STREAM)) {
                mStreamRecorder.Stop();
            }
            switchStatus(ActivityStatus.BEFORE_START);
        }
    }

    private void finishTalking() {
        mSpeechEngine.sendDirective(SpeechEngineDefines.DIRECTIVE_FINISH_TALKING, "");
        if (mCurRecType.equals(SpeechEngineDefines.RECORDER_TYPE_STREAM)) {
            mStreamRecorder.Stop();
        }
        switchStatus(ActivityStatus.WAITING_RESULT);
    }

    @Override
    public void onSpeechMessage(int type, byte[] data, int len) {
        String stdData = new String(data);
        Log.i(SpeechDemoDefines.TAG, "Message type: " + type + " data: " + stdData);
        switch (type) {
            case SpeechEngineDefines.MESSAGE_TYPE_ENGINE_START:
                onMsgStart(stdData);
                break;
            case SpeechEngineDefines.MESSAGE_TYPE_ENGINE_STOP:
                onMsgStop(stdData);
                break;
            case SpeechEngineDefines.MESSAGE_TYPE_ENGINE_ERROR:
                onMsgError(stdData);
                break;
            case SpeechEngineDefines.MESSAGE_TYPE_VOICECONV_RESULT_AUDIO:
                onMsgResultAudio(stdData);
            default:
                break;
        }
    }

    private void onMsgStart(String stdData) {
        mEngineStarted = true;
        Log.i(SpeechDemoDefines.TAG, "Engine Started");
        setTextOnUiThread(mResultText, "Engine Start");
    }

    private void onMsgStop(String stdData) {
        mEngineStarted = false;
        Log.i(SpeechDemoDefines.TAG, "Engine Stopped");
        long delay = System.currentTimeMillis() - mStartEngineTimestamp;

        String sessionId = stdData;
        String audioFilePath = "voiceconv_" + sessionId + ".wav";
        setTextOnUiThread(mResultText, "Engine Stopped, cost: " + delay
                + "\nResult File: " + audioFilePath, true);
        if (mCurRecType.equals(SpeechEngineDefines.RECORDER_TYPE_STREAM)) {
            mStreamRecorder.Stop();
        }

        switchStatus(ActivityStatus.BEFORE_START);
    }

    private void onMsgError(String stdData) {
        Log.i(SpeechDemoDefines.TAG, "Engine Error");
        setTextOnUiThread(mResultText, stdData);
    }

    private void onMsgResultAudio(String stdData) {
        Log.i(SpeechDemoDefines.TAG, "Get audio data, size: " + stdData.length());
        setTextOnUiThread(mResultText, "Get audio data, size: " + stdData.length());

        // calculate progress
        if (mCurRecType.equals(SpeechEngineDefines.RECORDER_TYPE_FILE) && mRecFileLength != 0) {
            mCurResultLength += stdData.length();

            long inputSampleRate = 16000;
            long outputSampleRate = mSettings.getInt(R.string.config_voiceconv_result_sample_rate);
            double progress = (double) mCurResultLength / mRecFileLength * inputSampleRate / outputSampleRate;
            setTextOnUiThread(mResultText, "Current result length: " + mCurResultLength + ", total file length: " + mRecFileLength + ", progress: " + progress, true);
        }
    }

    private void initEngine() {
        switchStatus(ActivityStatus.INITING);

        // create engine
        if (mSpeechEngine == null) {
            mSpeechEngine = SpeechEngineGenerator.getInstance();
            mSpeechEngine.createEngine();
            mSpeechEngine.setContext(getApplicationContext());
        }
        Log.d(SpeechDemoDefines.TAG, "SDK version: " + mSpeechEngine.getVersion());
        Log.d(SpeechDemoDefines.TAG, "Debug path:" + getDebugPath());

        // Get Recorder Type
        SettingItem.Options options = mSettings.getOptions(R.string.config_recorder_type);
        mCurRecType = getResources().getStringArray(options.arrayId)[options.chooseIdx];

        // Common Options
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_LOG_LEVEL_STRING, SpeechEngineDefines.LOG_LEVEL_TRACE);
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_DEBUG_PATH_STRING, getDebugPath());
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_APP_ID_STRING, SensitiveDefines.APPID);
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_RECORDER_TYPE_STRING, mCurRecType);
        mSpeechEngine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_SAMPLE_RATE_INT, 16000);
        mSpeechEngine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_CHANNEL_NUM_INT, 1);
        mSpeechEngine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_RECORDER_PRESET_INT, mSettings.getInt(R.string.config_recorder_preset));
        if (mCurRecType.equals(SpeechEngineDefines.RECORDER_TYPE_STREAM)) {
            mStreamRecorder = new SpeechStreamRecorder();
            mStreamRecorder.SetSpeechEngine(SpeechDemoDefines.VOICECONV_VIEW, mSpeechEngine);
            if (mStreamRecorder.GetStreamSampleRate() != 16000) {
                mSpeechEngine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_ENABLE_RESAMPLER_BOOL, true);
            }
        }

        // VoiceConv Options
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_ENGINE_NAME_STRING, SpeechEngineDefines.VOICECONV_ENGINE);
        mSpeechEngine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_VOICECONV_ENABLE_RECORD_DUMP_BOOL, mSettings.getBoolean(R.string.config_voiceconv_enable_record_dump));
        mSpeechEngine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_VOICECONV_ENABLE_RESULT_DUMP_BOOL, mSettings.getBoolean(R.string.config_voiceconv_enable_result_dump));
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_VOICECONV_AUDIO_PATH_STRING, getDebugPath());
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_VOICECONV_ADDRESS_STRING, SensitiveDefines.DEFAULT_ADDRESS);
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_VOICECONV_URI_STRING, SensitiveDefines.VOICECONV_DEFAULT_URI);
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_VOICECONV_CLUSTER_STRING, SensitiveDefines.VOICECONV_DEFAULT_CLUSTER);

        // init engine
        long startInitTimestamp = System.currentTimeMillis();
        int ret = mSpeechEngine.initEngine();
        long cost = System.currentTimeMillis() - startInitTimestamp;

        // init succ or not
        if (ret != SpeechEngineDefines.ERR_NO_ERROR) {
            String errMessage = "Init Engine Failed: " + ret;
            speechEngineInitFailed(errMessage);
        } else {
            mSpeechEngine.setListener(this);
            speechEngineInitOk(cost);
        }
    }

    private void uninitEngine() {
        if (mSpeechEngine != null) {
            mSpeechEngine.destroyEngine();
            mSpeechEngine = null;
        }
        mEngineInited = false;
        setTextOnUiThread(mEngineStatus, R.string.hint_waiting_init);
        switchStatus(ActivityStatus.BEFORE_INIT);
    }

    private void speechEngineInitOk(long initCost) {
        Log.i(SpeechDemoDefines.TAG, "Speech engine init OK!");
        Log.d(SpeechDemoDefines.TAG, String.format("Engine init cost: %d", initCost));
        setTextOnUiThread(mEngineStatus, R.string.hint_ready);
        setTextOnUiThread(mResultText, "Init cost: " + initCost);
        mEngineInited = true;
        switchStatus(ActivityStatus.BEFORE_START);
    }

    private void speechEngineInitFailed(String tipText) {
        Log.e(SpeechDemoDefines.TAG, "Speech engine init failed!\n" + tipText);
        mEngineInited = false;
        setTextOnUiThread(mEngineStatus, R.string.hint_setup_failure);
        setTextOnUiThread(mResultText, tipText);
        switchStatus(ActivityStatus.BEFORE_INIT);
    }

    private void switchStatus(VoiceConvActivity.ActivityStatus status) {
        runOnUiThread(() -> {
            switch (status) {
                case BEFORE_INIT:
                    mEngineSwitchBtn.setText(R.string.init_engine_title);
                    setButton(mEngineSwitchBtn, true);
                    setButton(mStartEngineBtn, false);
                    setButton(mFinishTalkingBtn, false);
                    break;
                case INITING:
                    mEngineSwitchBtn.setText(R.string.init_engine_title);
                    setButton(mEngineSwitchBtn, false);
                    setButton(mStartEngineBtn, false);
                    setButton(mFinishTalkingBtn, false);
                    break;
                case BEFORE_START:
                    mEngineSwitchBtn.setText(R.string.uninit_engine_title);
                    setButton(mEngineSwitchBtn, true);
                    setButton(mStartEngineBtn, true);
                    setButton(mFinishTalkingBtn, false);
                    break;
                case RECORDING:
                    mEngineSwitchBtn.setText(R.string.uninit_engine_title);
                    setButton(mEngineSwitchBtn, true);
                    setButton(mStartEngineBtn, false);
                    setButton(mFinishTalkingBtn, true);
                    break;
                case WAITING_RESULT:
                    mEngineSwitchBtn.setText(R.string.uninit_engine_title);
                    setButton(mEngineSwitchBtn, true);
                    setButton(mStartEngineBtn, false);
                    setButton(mFinishTalkingBtn, false);
                    break;
                default:
                    break;
            }
        });
    }
}
