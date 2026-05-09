// Copyright 2020 Bytedance Inc. All Rights Reserved.
// Author: fengkai.0518@bytedance.com (fengkai.0518)

package com.bytedance.speech.speechdemo;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.Intent;
import android.os.Bundle;
import android.text.method.ScrollingMovementMethod;
import android.util.Log;
import android.widget.Button;
import android.widget.TextView;

import com.bytedance.speech.speechdemo.settings.Settings;
import com.bytedance.speech.speechdemo.utils.SensitiveDefines;
import com.bytedance.speech.speechdemo.utils.SpeechDemoDefines;
import com.bytedance.speech.speechdemo.utils.SpeechStreamRecorder;
import com.bytedance.speech.speechengine.SpeechEngine;
import com.bytedance.speech.speechengine.SpeechEngineDefines;
import com.bytedance.speech.speechengine.SpeechEngineGenerator;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.Collections;
import java.util.List;

public class FulllinkActivity extends BaseActivity implements SpeechEngine.SpeechListener {
    // Permissions
    private static final List<String> FULLLINK_PERMISSIONS = Collections.singletonList(
            Manifest.permission.RECORD_AUDIO
    );

    // StreamRecorder
    private SpeechStreamRecorder mStreamRecorder;

    // Engine
    private SpeechEngine mSpeechEngine = null;
    private boolean mEngineInited = false;
    private boolean mSignalDisabled = false;
    private boolean mEngineStarted = false;

    // UI
    private TextView mResult;
    private TextView mEngineStatus;
    private Button mEngineSwitch;
    private Button mStart;
    private Button mStop;
    private Button mForceWakeup;
    private Button mUploadRawData;
    private Button mCancelDialog;
    private Button mStartPlay;

    // Paths
    private String mRecFilePath = "";
    private String mDebugPath = "";
    private String mKwsRootPath = "";
    private String mSignalRootPath = "";

    // Settings
    protected Settings mSettings;
    private String mDevice = "";

    private final String[] mFulllinkEngineTypeArray = {
            SpeechEngineDefines.FULLLINK_ENGINE,
            SpeechEngineDefines.FULLLINK_LITE_ENGINE};
    private final String[] mWakeupModeArray = {
            SpeechEngineDefines.WAKEUP_MODE_NORMAL,
            SpeechEngineDefines.WAKEUP_MODE_DISABLED,
            SpeechEngineDefines.WAKEUP_MODE_NIGHT};

    @SuppressLint({"ClickableViewAccessibility", "InflateParams", "HardwareIds"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        Log.i(SpeechDemoDefines.TAG, "Fulllink onCreate");
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_fulllink);
        setTitleBar(R.string.fulllink_name);

        final String viewId = SpeechDemoDefines.FULLLINK_VIEW;
        mSettings = SettingsActivity.getSettings(viewId);
        mStreamRecorder = MainActivity.getStreamRecorder();

        mResult = findViewById(R.id.result_text);
        mResult.setMovementMethod(new ScrollingMovementMethod());
        mEngineStatus = findViewById(R.id.engine_status);

        Button mConfig = findViewById(R.id.engine_config);
        mConfig.setEnabled(true);
        mConfig.setOnClickListener(v -> goToSettingsActivity(viewId));

        mEngineSwitch = findViewById(R.id.engine_switch);
        mEngineSwitch.setEnabled(true);
        mEngineSwitch.setOnClickListener(v -> switchEngine());

        mStart = findViewById(R.id.start_engin_button);
        SetButton(mStart, false);
        mStart.setOnClickListener(v -> startEngine());

        mStop = findViewById(R.id.stop_button);
        SetButton(mStop, false);
        mStop.setOnClickListener(v -> stopEngine());

        mForceWakeup = findViewById(R.id.force_wakeup);
        SetButton(mForceWakeup, false);
        mForceWakeup.setOnClickListener(v -> forceWakeup());

        mUploadRawData = findViewById(R.id.upload_rawdata);
        SetButton(mUploadRawData, false);
        mUploadRawData.setOnClickListener(v -> uploadRawData());

        mCancelDialog = findViewById(R.id.cancel_dialog);
        SetButton(mCancelDialog, false);
        mCancelDialog.setOnClickListener(v -> cancelDialog());

        mStartPlay = findViewById(R.id.start_play);
        SetButton(mStartPlay, true);
        mStartPlay.setOnClickListener(v -> startPlay());

    }

    @Override
    protected void onDestroy() {
        Log.i(SpeechDemoDefines.TAG, "Fulllink onDestroy");
        uninitEngine();
        super.onDestroy();
    }

    public void changeWakeupMode() {
        int ret = mSpeechEngine.sendDirective(SpeechEngineDefines.DIRECTIVE_CHANGE_WAKEUP_MODE, getWakeupMode());
        Log.d(SpeechDemoDefines.TAG, "Change wakeup mode: " + getWakeupMode() + ", ret: " + ret);
    }

    public void updateWakeupWordsParams() {
        if (mDevice.equals("pico")) {
            return;
        }
        String params;
        Log.d(SpeechDemoDefines.TAG, "Wakeup words index: " + mSettings.getOptions(R.string.config_wakeup_words).chooseIdx);
        if (mSettings.getOptions(R.string.config_wakeup_words).chooseIdx == 0) {
            params = "{\n" +
                    "\"word_list\":[\n" +
                    "        {\"name\":\"大力大力\",\"keyword_type\":1},\n" +
                    "        {\"name\":\"大力同学\",\"keyword_type\":-1}\n" +
                    "]\n" +
                    "}";
        } else if (mSettings.getOptions(R.string.config_wakeup_words).chooseIdx == 1) {
            params = "{\n" +
                    "\"word_list\":[\n" +
                    "        {\"name\":\"大力大力\",\"keyword_type\":1},\n" +
                    "        {\"name\":\"大力同学\",\"keyword_type\":0}\n" +
                    "]\n" +
                    "}";
        } else if (mSettings.getOptions(R.string.config_wakeup_words).chooseIdx == 2) {
            params = "{\n" +
                    "\"word_list\":[\n" +
                    "        {\"name\":\"大力大力\",\"keyword_type\":0},\n" +
                    "        {\"name\":\"大力同学\",\"keyword_type\":1}\n" +
                    "]\n" +
                    "}";
        } else if (mSettings.getOptions(R.string.config_wakeup_words).chooseIdx == 3) {
            params = "{\n" +
                    "\"word_list\":[\n" +
                    "        {\"name\":\"大力大力\",\"keyword_type\":-1},\n" +
                    "        {\"name\":\"大力同学\",\"keyword_type\":1}\n" +
                    "]\n" +
                    "}";
        } else {
            Log.e(SpeechDemoDefines.TAG, "Unsupported wakeup words!");
            return;
        }

        int ret = mSpeechEngine.sendDirective(SpeechEngineDefines.DIRECTIVE_UPDATE_WAKEUP_WORDS_PARAMS, params);
        Log.d(SpeechDemoDefines.TAG, "Update wakeup words params: " + params + ", ret: " + ret);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        if (mSpeechEngine == null) {
            return;
        }

        changeWakeupMode();
        updateWakeupWordsParams();
    }

    private void switchEngine() {
        if (mEngineStarted) {
            mEngineStatus.setText(R.string.hint_engine_busy);
            return;
        }
        if (mEngineInited) {
            uninitEngine();
            mEngineStatus.setText(R.string.hint_waiting_init);
            SetButton(mStart, false);
            SetButton(mStop, false);
            SetButton(mForceWakeup, false);
            SetButton(mUploadRawData, false);
            SetButton(mCancelDialog, false);
            mEngineSwitch.setEnabled(true);
            mEngineSwitch.setText(R.string.init_engine_title);
            mEngineInited = false;
        } else {
            SetButton(mStart, false);
            SetButton(mStop, false);
            SetButton(mForceWakeup, false);
            SetButton(mUploadRawData, false);
            SetButton(mCancelDialog, false);
            initEngine();
        }
    }

    private void startEngine() {
        mSpeechEngine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_ENABLE_CHECK_RECORD_PERMISSION_BOOL, !mSettings.getBoolean(R.string.config_disable_check_record_permission));
        mSpeechEngine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_ENABLE_GET_VOLUME_BOOL, mSettings.getBoolean(R.string.config_get_volume));
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_UID_STRING, SensitiveDefines.UID);
        mSpeechEngine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_SIGNAL_THREAD_PRIORITY_INT, mSettings.getInt(R.string.signal_thread_priority_title));
        mSpeechEngine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_FULLLINK_DISABLE_TTS_BOOL, mSettings.getBoolean(R.string.config_disable_tts));
        mSpeechEngine.setOptionInt("compression_rate", mSettings.getInt(R.string.compression_rate));
        mSpeechEngine.setOptionInt("complexity", mSettings.getInt(R.string.complexity));
        mSpeechEngine.setOptionInt("vbr", mSettings.getBoolean(R.string.config_no_variable_bitrate) ? 0 : 1);
        mSpeechEngine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_FULLLINK_ASR_ONLY_BOOL, mSettings.getBoolean(R.string.config_only_asr));
        mSpeechEngine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_FULLLINK_ASR_AUTO_STOP_BOOL, mSettings.getBoolean(R.string.config_asr_auto_stop));
        mSpeechEngine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_FULLLINK_DISABLE_SEMANTIC_VAD_BOOL, mSettings.getBoolean(R.string.config_disable_semantic_vad));
        mSpeechEngine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_FULLLINK_VAD_HEAD_WAIT_TIME_INT, mSettings.getInt(R.string.config_vad_head_wait_time));
        mSpeechEngine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_FULLLINK_MAX_VALID_SPEECH_DURATION_INT, mSettings.getInt(R.string.config_max_valid_speech_duration));
        if (mSettings.getBoolean(R.string.config_enable_ppe_env)) {
            mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_FULLLINK_PPE_ENV_STRING, "ppe_sa_di");
        }

        if (mFulllinkEngineTypeArray[mSettings.getInt(R.string.config_fulllink_engine_type)].equals(SpeechEngineDefines.FULLLINK_LITE_ENGINE)) {
            mSpeechEngine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_FULLLINK_ASR_AUTO_STOP_BOOL, true);
        }

        switch (mSettings.getOptionsValue(R.string.config_recorder_type, this)) {
            case SpeechEngineDefines.RECORDER_TYPE_STREAM:
                mSpeechEngine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_CUSTOM_SAMPLE_RATE_INT, mStreamRecorder.GetStreamSampleRate());
                if (!mStreamRecorder.Start()) {
                    requestPermission(FULLLINK_PERMISSIONS);
                    return;
                }
                break;
            case SpeechEngineDefines.RECORDER_TYPE_FILE: {
                String name = mSettings.getString(R.string.config_file_or_directory_name);
                if (name.isEmpty()) {
                    name = "recorder.pcm";
                }
                String test_path = mDebugPath + "/" + name;
                Log.d(SpeechDemoDefines.TAG, "test file path: " + test_path);
                mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_RECORDER_FILE_STRING, test_path);
                break;
            }
        }

        int ret = mSpeechEngine.sendDirective(SpeechEngineDefines.DIRECTIVE_START_ENGINE, "");
        if (ret == SpeechEngineDefines.ERR_REC_CHECK_ENVIRONMENT_FAILED) {
            mEngineStatus.setText(R.string.check_rec_permission);
            requestPermission(FULLLINK_PERMISSIONS);
        } else if (ret != SpeechEngineDefines.ERR_NO_ERROR) {
            Log.e(SpeechDemoDefines.TAG, "send directive failed, " + ret);
        }
        clearResultText();
    }

    private void stopEngine() {
        mSpeechEngine.sendDirective(SpeechEngineDefines.DIRECTIVE_STOP_ENGINE, "");
    }

    private void cancelDialog() {
        mSpeechEngine.sendDirective(SpeechEngineDefines.DIRECTIVE_CANCEL_CURRENT_DIALOG, "");
    }

    private void forceWakeup() {
        String fulllink_engine_name = getFullinkEngineType();
        if (fulllink_engine_name.equals(SpeechEngineDefines.FULLLINK_ENGINE)) {
            mSpeechEngine.sendDirective(SpeechEngineDefines.DIRECTIVE_TRIGGER_WAKEUP, "");
        }
    }

    private void startPlay() {
        mSpeechEngine.sendDirective(SpeechEngineDefines.DIRECTIVE_PLAYING_DECISION, mSettings.getBoolean(R.string.config_disable_tts) ? "false" : "true");
    }

    private void uploadRawData() {
        mSpeechEngine.sendDirective(SpeechEngineDefines.DIRECTIVE_TRIGGER_WAKEUP_FOR_RAW_DATA, "");
    }

    public void networkUnreachable() {
        Log.e(SpeechDemoDefines.TAG, "Network unreachable!");
        this.runOnUiThread(() -> {
            mEngineStatus.setText(R.string.hint_network_failure);
            mEngineInited = false;
            mEngineSwitch.setEnabled(true);
            mEngineSwitch.setText(R.string.init_engine_title);
        });
    }

    public void speechEnginInitOk(long initCost) {
        Log.i(SpeechDemoDefines.TAG, "Speech engine init OK!");
        mStreamRecorder.SetSpeechEngine(SpeechDemoDefines.CAPT_VIEW, mSpeechEngine);
        changeWakeupMode();
        updateWakeupWordsParams();
        this.runOnUiThread(() -> {
            mEngineStatus.setText(R.string.hint_ready);
            setResultText("Init cost: " + initCost);
            mEngineInited = true;
            mEngineSwitch.setEnabled(true);
            mEngineSwitch.setText(R.string.uninit_engine_title);
            SetButton(mStart, true);
        });
    }

    public void speechEngineInitFailed(String tipText) {
        Log.e(SpeechDemoDefines.TAG, "Speech engine init failed!");
        this.runOnUiThread(() -> {
            mEngineStatus.setText(R.string.hint_setup_failure);
            setResultText(tipText);
            mEngineInited = false;
            mEngineSwitch.setEnabled(true);
            mEngineSwitch.setText(R.string.init_engine_title);
        });
    }

    public void speechStart(final String data) {
        Log.i(SpeechDemoDefines.TAG, "Start " + data);
        mEngineStarted = true;
        this.runOnUiThread(() -> {
            mEngineStatus.setText(R.string.hint_start_cb);
            SetButton(mStart, false);
            SetButton(mStop, true);
            SetButton(mForceWakeup, true);
            SetButton(mUploadRawData, true);
            SetButton(mCancelDialog, true);
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
            SetButton(mForceWakeup, false);
            SetButton(mUploadRawData, false);
            SetButton(mCancelDialog, false);
        });
    }

    public void speechWakeupResult(final String data) {
        this.runOnUiThread(() -> {
            clearResultText();
            setResultText(data);
        });
    }

    public void speechAsrResult(final String data) {
        this.runOnUiThread(() -> {
            try {
                JSONObject reader = new JSONObject(data);
                if (!reader.has("messageData")) {
                    return;
                }
                String text_ori = reader.getJSONObject("messageData").getJSONObject("inputText").getString("text");
                Log.d(SpeechDemoDefines.TAG, "text_ori: " + text_ori);
                String text = reader.getJSONObject("messageData").getJSONObject("inputText").getString("text").trim();
                Log.d(SpeechDemoDefines.TAG, "text: " + text);
                if (!text.isEmpty()) {
                    setResultText(text);
                }
            } catch (JSONException e) {
                e.printStackTrace();
            }
        });
    }

    public void speechNlpResult(final String data) {
        this.runOnUiThread(() -> {
            try {
                JSONObject reader = new JSONObject(data);
                if (!reader.has("messageData")) {
                    return;
                }

                String text = reader.getJSONObject("messageData").getString("inputText").trim();
                text += "\n";
                if (mDevice.equals("pico")) {
                    JSONObject skillResult = reader.getJSONObject("messageData");
                    text += skillResult.toString().trim();
                } else {
                    text += reader.getJSONObject("messageData").getString("outputText").trim();
                }
                setResultText(text);
            } catch (JSONException e) {
                e.printStackTrace();
            }
        });
        if (!mSettings.getBoolean(R.string.config_disable_auto_play)) {
            mSpeechEngine.sendDirective(SpeechEngineDefines.DIRECTIVE_PLAYING_DECISION, mSettings.getBoolean(R.string.config_disable_tts) ? "false" : "true");
        }
    }

    public void speechMicDetectInfo(final String data) {
        this.runOnUiThread(() -> {
            try {
                JSONObject reader = new JSONObject(data);
                if (reader.has("all_zeros")) {
                    String text = reader.getJSONObject("all_zeros").toString().trim();
                    Log.e(SpeechDemoDefines.TAG, "mic detect info, all_zeros: " + text);
                    return;
                }
                if (reader.has("inconsist")) {
                    String text = reader.getJSONObject("inconsist").toString().trim();
                    Log.e(SpeechDemoDefines.TAG, "mic detect info, inconsist: " + text);
                    return;
                }
                if (reader.has("near_zeros")) {
                    String text = reader.getJSONObject("near_zeros").toString().trim();
                    Log.e(SpeechDemoDefines.TAG, "mic detect info, near_zeros: " + text);
                }
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
                setResultText(data);
                int code = reader.getInt("err_code");
                if (code == SpeechEngineDefines.CODE_REC_RECEIVE_DATA_TIMEOUT) {
                    stopEngine();
                }
            } catch (JSONException e) {
                e.printStackTrace();
            }
        });
    }

    public void setResultText(final String text) {
        mResult.setText("");
        mResult.append("\n" + text);
    }

    public void clearResultText() {
        this.runOnUiThread(() -> mResult.setText(""));
    }

    @Override
    public void onSpeechMessage(int type, byte[] data, int len) {
        String stdData = new String(data);

        switch (type) {
            case SpeechEngineDefines.MESSAGE_TYPE_ENGINE_START:
                Log.d(SpeechDemoDefines.TAG, "Engine start");
                speechStart(stdData);
                break;
            case SpeechEngineDefines.MESSAGE_TYPE_ENGINE_STOP:
                Log.d(SpeechDemoDefines.TAG, "Engine stop");
                speechStop(stdData);
                break;
            case SpeechEngineDefines.MESSAGE_TYPE_ENGINE_ERROR:
                Log.d(SpeechDemoDefines.TAG, "Engine error");
                speechError(stdData);
                break;
            case SpeechEngineDefines.MESSAGE_TYPE_WAKEUP_RESULT:
                Log.d(SpeechDemoDefines.TAG, "Wakeup trigger, " + stdData);
                speechWakeupResult(stdData);
                break;
            case SpeechEngineDefines.MESSAGE_TYPE_PARTIAL_RESULT:
            case SpeechEngineDefines.MESSAGE_TYPE_FINAL_RESULT:
                speechAsrResult(stdData);
                break;
            case SpeechEngineDefines.MESSAGE_TYPE_NLU_RESULT:
                speechNlpResult(stdData);
                break;
            case SpeechEngineDefines.MESSAGE_TYPE_TTS_START_PLAYING:
                Log.d(SpeechDemoDefines.TAG, "TTS start playing: " + stdData);
                break;
            case SpeechEngineDefines.MESSAGE_TYPE_TTS_FINISH_PLAYING:
                Log.d(SpeechDemoDefines.TAG, "TTS finish playing: " + stdData);
                break;
            case SpeechEngineDefines.MESSAGE_TYPE_RECORDER_BEGIN:
                Log.d(SpeechDemoDefines.TAG, "Recorder begin");
                break;
            case SpeechEngineDefines.MESSAGE_TYPE_RECORDER_END:
                Log.d(SpeechDemoDefines.TAG, "Recorder end");
                break;
            case SpeechEngineDefines.MESSAGE_TYPE_VAD_BEGIN:
                Log.d(SpeechDemoDefines.TAG, "Vad begin: " + stdData);
                break;
            case SpeechEngineDefines.MESSAGE_TYPE_VAD_END:
                Log.d(SpeechDemoDefines.TAG, "Vad end: " + stdData);
                break;
            case SpeechEngineDefines.MESSAGE_TYPE_VAD_REAL_END:
                Log.d(SpeechDemoDefines.TAG, "Vad real end: " + stdData);
                break;
            case SpeechEngineDefines.MESSAGE_TYPE_VOLUME_LEVEL:
                Log.d(SpeechDemoDefines.TAG, "volume level: " + stdData);
                break;
            case SpeechEngineDefines.MESSAGE_TYPE_MIC_DETECT_INFO:
                speechMicDetectInfo(stdData);
                break;
            case SpeechEngineDefines.MESSAGE_TYPE_ENGINE_LOG:
                Log.i(SpeechDemoDefines.TAG, "engine log: " + stdData);
                break;
            default:
                break;
        }
    }

    private void configFulllinkParams() {
        // common
        if (mRecFilePath.isEmpty()) {
            mRecFilePath = copyAssetsToFiles("testdata");
        }
        if (mDebugPath.isEmpty()) {
            mDebugPath = getDebugPath();
        }
        Log.d(SpeechDemoDefines.TAG, "Recorder file path: " + mRecFilePath);
        Log.d(SpeechDemoDefines.TAG, "Debug path:" + mDebugPath);
        mSpeechEngine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_USE_ALOG_BOOL, false);
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_LOG_LEVEL_STRING, SpeechEngineDefines.LOG_LEVEL_TRACE);
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_DEBUG_PATH_STRING, mDebugPath);
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_APP_ID_STRING, mSettings.getString(R.string.config_app_id));
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_APP_VERSION_STRING, SensitiveDefines.APP_VERSION);
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_UID_STRING, SensitiveDefines.UID);
        mSpeechEngine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_SIGNAL_THREAD_PRIORITY_INT, mSettings.getInt(R.string.signal_thread_priority_title));
        mSpeechEngine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_ENABLE_CHECK_RECORD_PERMISSION_BOOL, !mSettings.getBoolean(R.string.config_disable_check_record_permission));
        mSpeechEngine.setOptionInt("compression_rate", mSettings.getInt(R.string.config_compression_rate));
        mSpeechEngine.setOptionInt("complexity", mSettings.getInt(R.string.config_complexity));
        mSpeechEngine.setOptionInt("vbr", mSettings.getBoolean(R.string.config_no_variable_bitrate) ? 0 : 1);
        mSpeechEngine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_TTS_ENABLE_PLAYER_BOOL, true);

        // Config data source:
        mSpeechEngine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_ENABLE_GET_VOLUME_BOOL, mSettings.getBoolean(R.string.config_get_volume));
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_RECORDER_TYPE_STRING, mSettings.getOptionsValue(R.string.config_recorder_type, this));
        if (mSettings.getOptionsValue(R.string.config_recorder_type, this).equals(SpeechEngineDefines.RECORDER_TYPE_FILE)) {
            mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_RECORDER_FILE_STRING, mDebugPath + "/recorder_file.pcm");
        }
        mSpeechEngine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_RECORDER_DISABLE_REUSE_BOOL, true);

        if (mKwsRootPath.isEmpty()) {
            mKwsRootPath = copyAssetsToFiles("kws");
        }
        Log.d(SpeechDemoDefines.TAG, "Kws root path:" + mKwsRootPath);
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_KWS_ROOT_PATH_STRING, mKwsRootPath);
        if (mSignalRootPath.isEmpty()) {
            mSignalRootPath = copyAssetsToFiles("signal");
        }
        Log.d(SpeechDemoDefines.TAG, "Signal root path:" + mSignalRootPath);
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_SIGNAL_ROOT_PATH_STRING, mSignalRootPath);

        // device type
        mDevice = mSettings.getOptionsValue(R.string.config_device_type, this);

        // fulllink
        String config_address = mSettings.getString(R.string.config_address);
        String config_uri = mSettings.getString(R.string.config_uri);
        String defaultAddress = SensitiveDefines.DEFAULT_ADDRESS;
        String defaultUri = SensitiveDefines.FULLLINK_DEFAULT_URI;
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_FULLLINK_ADDRESS_STRING, (config_address.isEmpty() ? defaultAddress : config_address));
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_FULLLINK_URI_STRING, (config_uri.isEmpty() ? defaultUri : config_uri));
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_FULLLINK_CLUSTER_STRING, mSettings.getString(R.string.config_cluster));
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_FULLLINK_SCENE_ID_STRING, mSettings.getString(R.string.config_scene_id));
        mSpeechEngine.setOptionBoolean("fulllink_disable_upload_client_vad", mSettings.getBoolean(R.string.config_disable_upload_client_vad));
        mSpeechEngine.setOptionBoolean("disable_send_asr_info_to_signal", mSettings.getBoolean(R.string.config_disable_send_asr_info_to_signal));
        mSpeechEngine.setOptionInt("kws_worker_num", mSettings.getInt(R.string.config_kws_worker_num));
        mSpeechEngine.setOptionBoolean("fulllink_traffic_for_test", mSettings.getBoolean(R.string.config_traffic_for_test));

        configUserParams();

        if (mFulllinkEngineTypeArray[mSettings.getInt(R.string.config_fulllink_engine_type)].equals(SpeechEngineDefines.FULLLINK_LITE_ENGINE)) {
            mSignalDisabled = true;
        }


        Log.i(SpeechDemoDefines.TAG, "Choose fulllink engine type: " + getFullinkEngineType());
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_ENGINE_NAME_STRING, getFullinkEngineType());
        mSpeechEngine.setOptionBoolean("enable_dump", mSettings.getBoolean(R.string.config_rec_dump));
        mSpeechEngine.setOptionBoolean("kws_enable_dump", mSettings.getBoolean(R.string.config_kws_dump));
        mSpeechEngine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_FULLLINK_DISABLE_TTS_BOOL, mSettings.getBoolean(R.string.config_disable_tts));
        if (mSettings.getOptionsValue(R.string.config_recorder_type, this).equals(SpeechEngineDefines.RECORDER_TYPE_STREAM)) {
            if (mStreamRecorder.GetStreamSampleRate() != 16000) {
                mSpeechEngine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_ENABLE_RESAMPLER_BOOL, true);
            }
        }
        if (mSettings.getOptionsValue(R.string.config_recorder_type, this).equals("Directory")) {
            String fileOrDirectoryName = mSettings.getString(R.string.config_file_or_directory_name);
            if (fileOrDirectoryName.isEmpty()) {
                fileOrDirectoryName = "test";
            }
            String test_directory_path = mDebugPath + "/" + fileOrDirectoryName;
            Log.d(SpeechDemoDefines.TAG, "test directory path: " + test_directory_path);
            mSpeechEngine.setOptionString("recorder_directory", test_directory_path);
        }
    }

    private void initEngine() {
        Log.d(SpeechDemoDefines.TAG, "device: " + android.os.Build.DEVICE);
        Log.d(SpeechDemoDefines.TAG, "product: " + android.os.Build.PRODUCT);
        Log.d(SpeechDemoDefines.TAG, "brand: " + android.os.Build.BRAND);
        Log.d(SpeechDemoDefines.TAG, "model: " + android.os.Build.MODEL);

        if (mSpeechEngine == null) {
            mSpeechEngine = SpeechEngineGenerator.getInstance();
            mSpeechEngine.createEngine();
            mSpeechEngine.setContext(getApplicationContext());
        }
        Log.d(SpeechDemoDefines.TAG, "SDK version: " + mSpeechEngine.getVersion());

        configFulllinkParams();

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
        }
    }

    private void configUserParams() {
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

    private String getFullinkEngineType() {
        int fulllinkEngineType = mSettings.getOptions(R.string.config_fulllink_engine_type).chooseIdx;
        return mFulllinkEngineTypeArray[fulllinkEngineType];
    }

    private String getWakeupMode() {
        int wakeupMode = mSettings.getOptions(R.string.config_wakeup_mode).chooseIdx;
        return mWakeupModeArray[wakeupMode];
    }
}