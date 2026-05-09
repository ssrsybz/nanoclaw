// Copyright 2023 Bytedance Inc. All Rights Reserved.
// Author: chengzihao.ds@bytedance.com (chengzihao.ds)

package com.bytedance.speech.speechdemo;

import android.Manifest;
import android.annotation.SuppressLint;
import android.os.Bundle;
import android.os.Handler;
import android.text.method.ScrollingMovementMethod;
import android.util.Log;
import android.view.MotionEvent;
import android.widget.Button;
import android.widget.TextView;

import com.bytedance.speech.speechdemo.settings.Settings;
import com.bytedance.speech.speechdemo.utils.SensitiveDefines;
import com.bytedance.speech.speechdemo.utils.SpeechDemoDefines;
import com.bytedance.speech.speechdemo.utils.SpeechStreamRecorder;
import com.bytedance.speech.speechengine.SpeechEngine;
import com.bytedance.speech.speechengine.SpeechEngineDefines;
import com.bytedance.speech.speechengine.SpeechEngineGenerator;
import com.bytedance.speech.speechengine.SpeechResourceManager;
import com.bytedance.speech.speechengine.SpeechResourceManagerGenerator;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

public class AsrOfflineActivity extends BaseActivity implements SpeechEngine.SpeechListener {
    // Permissions
    private static final List<String> ASR_PERMISSIONS = Collections.singletonList(
            Manifest.permission.RECORD_AUDIO
    );


    // StreamRecorder
    private SpeechStreamRecorder mStreamRecorder;

    // Engine
    private SpeechEngine engine = null;
    private boolean mEngineStarted = false;

    // AsrTouch
    private Handler longPressHandler = null;
    private Runnable longPressRunnable = null;
    private boolean longPressIsRunning = false;

    // UI
    private TextView mResult;
    private TextView mEngineStatus;
    private Button mInit;
    private Button mUninit;
    private Button mStart;
    private Button mStop;
    private Button mLongPress;

    // Statistics
    private long mFinishTalkingTimestamp = -1;

    // Paths
    private String mRecFilePath = "";
    private String mDebugPath = "";

    // Authentications
    private final String[] mAuthenticationTypeArray = {
            SpeechEngineDefines.AUTHENTICATE_TYPE_PRE_BIND,
            SpeechEngineDefines.AUTHENTICATE_TYPE_LATE_BIND
    };

    // Settings
    protected Settings mSettings;

    @SuppressLint({"ClickableViewAccessibility", "InflateParams", "HardwareIds"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        Log.i(SpeechDemoDefines.TAG, "Asr onCreate");
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_asr);
        setTitleBar(R.string.asr_offline_name);

        final String viewId = SpeechDemoDefines.ASR_OFFLINE_VIEW;


        mSettings = SettingsActivity.getSettings(viewId);
        mStreamRecorder = MainActivity.getStreamRecorder();

        if (mDebugPath.isEmpty()) {
            mDebugPath = getDebugPath();
        }
        Log.i(SpeechDemoDefines.TAG, "当前调试路径：" + mDebugPath);

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

        mLongPress = findViewById(R.id.long_press);
        setButton(mLongPress, false);

        mLongPress.setOnTouchListener((v, event) -> {
            if (event.getAction() == MotionEvent.ACTION_DOWN) {
                Log.i(SpeechDemoDefines.TAG, "AsrTouch: Action down");
                mLongPress.setBackground(getResources().getDrawable(R.drawable.btn_negative_background));
                touchDown();
                return true;
            } else if (event.getAction() == MotionEvent.ACTION_UP) {
                Log.i(SpeechDemoDefines.TAG, "AsrTouch: Action up");
                mLongPress.setBackground(getResources().getDrawable(R.drawable.btn_active_background));
                touchUp();
                return true;
            } else if (event.getAction() == MotionEvent.ACTION_CANCEL) {
                Log.i(SpeechDemoDefines.TAG, "AsrTouch: Action cancel");
                mLongPress.setBackground(getResources().getDrawable(R.drawable.btn_active_background));
                touchUp();
                return true;
            }
            return false;
        });
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
        setButton(mLongPress, false);
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
        setButton(mLongPress, false);
    }

    private void startEngine() {
        engine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_ASR_AUTO_STOP_BOOL, true);
        engine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_ASR_ENABLE_ITN_BOOL, mSettings.getBoolean(R.string.config_asr_enable_itn));
        engine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_VAD_MAX_SPEECH_DURATION_INT, mSettings.getInt(R.string.config_vad_max_speech_duration));

        if (mSettings.getOptionsValue(R.string.config_recorder_type, this).equals(SpeechEngineDefines.RECORDER_TYPE_STREAM)) {
            engine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_CUSTOM_SAMPLE_RATE_INT, mStreamRecorder.GetStreamSampleRate());
            engine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_CUSTOM_CHANNEL_INT, mStreamRecorder.GetStreamChannel());
            if (!mStreamRecorder.Start()) {
                requestPermission(ASR_PERMISSIONS);
            }
        } else if (mSettings.getOptionsValue(R.string.config_recorder_type, this).equals(SpeechEngineDefines.RECORDER_TYPE_FILE)) {
            String test_file_path = mDebugPath + "/asr_rec_file.pcm";
            Log.d(SpeechDemoDefines.TAG, "test file path: " + test_file_path);
            engine.setOptionString(SpeechEngineDefines.PARAMS_KEY_RECORDER_FILE_STRING, test_file_path);
        }

        int ret = engine.sendDirective(SpeechEngineDefines.DIRECTIVE_START_ENGINE, "");
        if (ret == SpeechEngineDefines.ERR_REC_CHECK_ENVIRONMENT_FAILED) {
            mEngineStatus.setText(R.string.check_rec_permission);
            requestPermission(ASR_PERMISSIONS);
        } else if (ret != SpeechEngineDefines.ERR_NO_ERROR) {
            Log.e(SpeechDemoDefines.TAG, "send directive start failed, " + ret);
            mEngineStatus.setText("send directive start failed, " + ret);
        }
        mResult.setText("");
    }

    private void stopEngine() {
        engine.sendDirective(SpeechEngineDefines.DIRECTIVE_STOP_ENGINE, "");
    }

    private void touchDown() {
        longPressIsRunning = false;
        longPressHandler = new Handler();
        longPressRunnable = () -> {
            Log.i(SpeechDemoDefines.TAG, "AsrTouch: Running");
            longPressIsRunning = true;
            engine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_ASR_AUTO_STOP_BOOL, false);
            engine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_ASR_ENABLE_ITN_BOOL, mSettings.getBoolean(R.string.config_asr_enable_itn));
            engine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_VAD_MAX_SPEECH_DURATION_INT, 150000);

            if (mSettings.getOptionsValue(R.string.config_recorder_type, this).equals(SpeechEngineDefines.RECORDER_TYPE_STREAM)) {
                engine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_CUSTOM_SAMPLE_RATE_INT, mStreamRecorder.GetStreamSampleRate());
                engine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_CUSTOM_CHANNEL_INT, mStreamRecorder.GetStreamChannel());
                if (!mStreamRecorder.Start()) {
                    Log.e(SpeechDemoDefines.TAG, "Stream recorder start failed");
                    return;
                }
            } else if (mSettings.getOptionsValue(R.string.config_recorder_type, this).equals(SpeechEngineDefines.RECORDER_TYPE_FILE)) {
                String test_file_path = mDebugPath + "/asr_rec_file.pcm";
                Log.d(SpeechDemoDefines.TAG, "test file path: " + test_file_path);
                engine.setOptionString(SpeechEngineDefines.PARAMS_KEY_RECORDER_FILE_STRING, test_file_path);
            }

            int ret = engine.sendDirective(SpeechEngineDefines.DIRECTIVE_START_ENGINE, "");
            if (ret == SpeechEngineDefines.ERR_REC_CHECK_ENVIRONMENT_FAILED) {
                mEngineStatus.setText(R.string.check_rec_permission);
                requestPermission(ASR_PERMISSIONS);
            } else if (ret != SpeechEngineDefines.ERR_NO_ERROR) {
                Log.e(SpeechDemoDefines.TAG, "send directive start failed, " + ret);
                mEngineStatus.setText("send directive start failed, " + ret);
            }
            mResult.setText("");
        };
        longPressHandler.postDelayed(longPressRunnable, 500);
    }

    private void touchUp() {
        if (longPressIsRunning) {
            longPressIsRunning = false;
            Log.i(SpeechDemoDefines.TAG, "AsrTouch: Finish");
            mFinishTalkingTimestamp = System.currentTimeMillis();
            engine.sendDirective(SpeechEngineDefines.DIRECTIVE_FINISH_TALKING, "");
            mStreamRecorder.Stop();
        } else if (longPressRunnable != null) {
            Log.i(SpeechDemoDefines.TAG, "AsrTouch: Cancel");
            longPressHandler.removeCallbacks(longPressRunnable);
            longPressRunnable = null;
        }
    }

    private void configAsrParams() {
        // common
        if (mRecFilePath.isEmpty()) {
            mRecFilePath = copyAssetsToFiles("testdata");
        }

        String modelPath = mDebugPath + "/models";
        if (mSettings.getBoolean(R.string.config_asr_enable_resource_download)) {
            // Use download path if resource manager enabled.
            modelPath = SpeechResourceManagerGenerator.getInstance().getResourcePath(getAsrModelName());
        }
        Log.d(SpeechDemoDefines.TAG, "Recorder file path: " + mRecFilePath);
        Log.d(SpeechDemoDefines.TAG, "Debug path:" + mDebugPath);
        Log.d(SpeechDemoDefines.TAG, "Asr resource path:" + modelPath);

        engine.setOptionString(SpeechEngineDefines.PARAMS_KEY_LOG_LEVEL_STRING, SpeechEngineDefines.LOG_LEVEL_TRACE);
        engine.setOptionString(SpeechEngineDefines.PARAMS_KEY_APP_ID_STRING, mSettings.getString(R.string.config_app_id));
        engine.setOptionString(SpeechEngineDefines.PARAMS_KEY_DEBUG_PATH_STRING, mDebugPath);
        engine.setOptionString(SpeechEngineDefines.PARAMS_KEY_UID_STRING, "388808087185088");
        engine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_SAMPLE_RATE_INT, 16000);
        engine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_RECORDER_PRESET_INT, mSettings.getInt(R.string.config_recorder_preset));

        // Config data source:
        engine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_RECORDER_DISABLE_REUSE_BOOL, mSettings.getBoolean(R.string.config_disable_recorder_reuse));
        engine.setOptionString(SpeechEngineDefines.PARAMS_KEY_RECORDER_TYPE_STRING, mSettings.getOptionsValue(R.string.config_recorder_type, this));

        // asr
        engine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_ASR_WORK_MODE_INT, SpeechEngineDefines.ASR_WORK_MODE_OFFLINE);
        engine.setOptionString(SpeechEngineDefines.PARAMS_KEY_ASR_OFF_RESOURCE_PATH_STRING, modelPath);
        engine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_CHANNEL_NUM_INT, 1);
        engine.setOptionString(SpeechEngineDefines.PARAMS_KEY_ENGINE_NAME_STRING, SpeechEngineDefines.ASR_ENGINE);
        engine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_ASR_SHOW_UTTER_BOOL, true);
        engine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_ASR_SHOW_LANG_BOOL, mSettings.getBoolean(R.string.config_asr_show_lang));
        engine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_ASR_SHOW_VOLUME_BOOL, true);
        engine.setOptionString(SpeechEngineDefines.PARAMS_KEY_ASR_REC_PATH_STRING, "");
        if (mSettings.getBoolean(R.string.config_asr_rec_save)) {
            engine.setOptionString(SpeechEngineDefines.PARAMS_KEY_ASR_REC_PATH_STRING, mDebugPath);
        }

        if (mSettings.getOptionsValue(R.string.config_recorder_type, this).equals(SpeechEngineDefines.RECORDER_TYPE_STREAM)) {
            if (mStreamRecorder.GetStreamSampleRate() != 16000) {
                engine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_ENABLE_RESAMPLER_BOOL, true);
            }
        }

        // Authenticate
        String curAuthenticateType = mAuthenticationTypeArray[mSettings.getOptions(R.string.config_authenticate_type).chooseIdx];
        engine.setOptionString(SpeechEngineDefines.PARAMS_KEY_AUTHENTICATE_TYPE_STRING, curAuthenticateType);
        if (curAuthenticateType.equals(SpeechEngineDefines.AUTHENTICATE_TYPE_PRE_BIND)) {
            String asrLicenseName = mSettings.getString(R.string.config_license_name);
            String asrLicenseBusiId = mSettings.getString(R.string.config_license_busi_id);
            if (!asrLicenseName.isEmpty() && !asrLicenseBusiId.isEmpty()) {
                engine.setOptionString(SpeechEngineDefines.PARAMS_KEY_LICENSE_NAME_STRING, asrLicenseName);
                engine.setOptionString(SpeechEngineDefines.PARAMS_KEY_LICENSE_BUSI_ID_STRING, asrLicenseBusiId);
            }
        } else if (curAuthenticateType.equals(SpeechEngineDefines.AUTHENTICATE_TYPE_LATE_BIND)) {
            String authenticateCredential = mSettings.getString(R.string.config_authenticate_credential);
            String businessKey = mSettings.getString(R.string.config_business_key);
            String authenticateSecret = mSettings.getString(R.string.config_authenticate_secret);
            engine.setOptionString(SpeechEngineDefines.PARAMS_KEY_AUTHENTICATE_ADDRESS_STRING, SensitiveDefines.AUTHENTICATE_ADDRESS);
            engine.setOptionString(SpeechEngineDefines.PARAMS_KEY_AUTHENTICATE_URI_STRING, SensitiveDefines.AUTHENTICATE_URI);
            engine.setOptionString(SpeechEngineDefines.PARAMS_KEY_AUTHENTICATE_CREDENTIAL, authenticateCredential);
            engine.setOptionString(SpeechEngineDefines.PARAMS_KEY_BUSINESS_KEY_STRING, businessKey);
            engine.setOptionString(SpeechEngineDefines.PARAMS_KEY_AUTHENTICATE_SECRET_STRING, authenticateSecret);
        }
        engine.setOptionString(SpeechEngineDefines.PARAMS_KEY_LICENSE_DIRECTORY_STRING, mDebugPath);
    }

    private void initEngine() {
        if (!mSettings.getBoolean(R.string.config_asr_enable_resource_download)) {
            initEngineInternal();
        } else {
            // 初始化模型下发
            SpeechResourceManager resourceManager = SpeechResourceManagerGenerator.getInstance();
            resourceManager.setDeviceId("0");
            resourceManager.setAppId(SensitiveDefines.APPID);
            resourceManager.setAppVersion(SensitiveDefines.APP_VERSION);
        resourceManager.setUseOnlineModel(true);
            resourceManager.initResourceManager(getApplicationContext(), mDebugPath);
            if (!resourceManager.checkResourceDownload(getAsrModelName())) {
                // 模型未下载，先下载模型
                fetchAsrResource();
            } else {
                // 模型已下载，检查是否需要更新
                resourceManager.checkResourceUpdate(getAsrModelName(), needUpdate -> {
                    if (needUpdate) {
                        fetchAsrResource();
                    } else {
                        initEngineInternal();
                    }
                });
            }
        }
    }

    private void fetchAsrResource() {
        SpeechResourceManager resourceManager = SpeechResourceManagerGenerator.getInstance();
        resourceManager.fetchResourceByName(getAsrModelName(), new SpeechResourceManager.FetchResourceListener() {
            @Override
            public void onSuccess() {
                initEngineInternal();
            }

            @Override
            public void onFailed(String errorMsg) {
                mResult.setText("Fail to fetch asr resource: " + errorMsg);
            }
        });
    }

    private void initEngineInternal() {
        if (engine == null) {
            engine = SpeechEngineGenerator.getInstance();
            engine.createEngine();
            engine.setContext(getApplicationContext());
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
        mStreamRecorder.SetSpeechEngine(SpeechDemoDefines.ASR_OFFLINE_VIEW, engine);
        this.runOnUiThread(() -> {
            setResultText("Cost: " + initCost);
            mEngineStatus.setText(R.string.hint_ready);
            setButton(mInit, false);
            setButton(mUninit, true);
            setButton(mStart, true);
            setButton(mLongPress, true);
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
            mEngineStatus.setText(R.string.hint_start_cb);
            setButton(mStart, false);
            setButton(mStop, true);
        });
    }

    public void speechStop(final String data) {
        Log.i(SpeechDemoDefines.TAG, "Stop " + data);
        mEngineStarted = false;
        this.runOnUiThread(() -> {
            mStreamRecorder.Stop();
            mEngineStatus.setText(R.string.hint_stop_cb);
            setButton(mStart, true);
            setButton(mStop, false);
        });
    }

    public void speechAsrResult(final String data, boolean isFinal) {
        long delay = 0;
        if (isFinal && mFinishTalkingTimestamp > 0) {
            delay = System.currentTimeMillis() - mFinishTalkingTimestamp;
            mFinishTalkingTimestamp = 0;
        }
        final long response_delay = delay;

        this.runOnUiThread(() -> {
            String text = "result: " + data;
            if (isFinal) {
                text += "\nresponse_delay: " + response_delay;
            }
            mResult.setText(text);
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

    private void setResultText(final String text) {
        mResult.setText("");
        mResult.append("\n" + text);
    }

    private String getAsrModelName() {
        return mSettings.getString(R.string.config_asr_model_name);
    }
}
