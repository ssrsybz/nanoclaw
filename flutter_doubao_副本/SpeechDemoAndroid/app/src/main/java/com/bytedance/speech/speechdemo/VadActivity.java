// Copyright 2023 Bytedance Inc. All Rights Reserved.
// Author: tianlei.richard@bytedance.com (tianlei.richard)

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

import java.util.Collections;
import java.util.List;

public class VadActivity extends BaseActivity implements SpeechEngine.SpeechListener {
    // Permissions
    private static final List<String> VAD_PERMISSIONS = Collections.singletonList(
            Manifest.permission.RECORD_AUDIO
    );

    // StreamRecorder
    private SpeechStreamRecorder mStreamRecorder;

    // Engine
    private SpeechEngine mSpeechEngine = null;
    private boolean mEngineStarted = false;

    // VadTouch
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

    private Integer mVadEngineSampleRate = 16000;
    private final String[] mRecorderTypeArray = {
            SpeechEngineDefines.RECORDER_TYPE_RECORDER,
            SpeechEngineDefines.RECORDER_TYPE_FILE,
            SpeechEngineDefines.RECORDER_TYPE_STREAM};
    private int mRecorderTypeIndex = 0;
    private String mRecorderType = SpeechEngineDefines.RECORDER_TYPE_RECORDER;
    private boolean mEnableVadAudioSave = false;
    private String mCurBusinessKey = SensitiveDefines.BUSINESS_KEY;
    private String mCurAuthenticateSecret = SensitiveDefines.SECRET;

    // Statistics
    private long mFinishTalkingTimestamp = -1;
    private long mVadDuration = 0;
    private double mVadBeginPosition = 0;
    private double mVadEndPosition = 0;

    // Paths
    private String mRecFilePath = "";
    private String mDebugPath = "";

    // Settings
    protected Settings mSettings;

    @SuppressLint({"ClickableViewAccessibility", "InflateParams", "HardwareIds"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        Log.i(SpeechDemoDefines.TAG, "Vad onCreate");
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_vad);
        setTitleBar(R.string.vad_name);

        final String viewId = SpeechDemoDefines.VAD_VIEW;

        mSettings = SettingsActivity.getSettings(viewId);
        mStreamRecorder = MainActivity.getStreamRecorder();

        mResult = findViewById(R.id.result_text);
        mResult.setMovementMethod(new ScrollingMovementMethod());
        mResult.setText(R.string.vad_input_hint);

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

        mLongPress = findViewById(R.id.long_press);
        SetButton(mLongPress, false);

        mLongPress.setOnTouchListener((v, event) -> {
            if (event.getAction() == MotionEvent.ACTION_DOWN) {
                Log.i(SpeechDemoDefines.TAG, "VadTouch: Action down");
                mLongPress.setBackground(getResources().getDrawable(R.drawable.btn_negative_background));
                touchDown();
                return true;
            } else if (event.getAction() == MotionEvent.ACTION_UP) {
                Log.i(SpeechDemoDefines.TAG, "VadTouch: Action up");
                mLongPress.setBackground(getResources().getDrawable(R.drawable.btn_active_background));
                touchUp();
                return true;
            } else if (event.getAction() == MotionEvent.ACTION_CANCEL) {
                Log.i(SpeechDemoDefines.TAG, "VadTouch: Action cancel");
                mLongPress.setBackground(getResources().getDrawable(R.drawable.btn_active_background));
                touchUp();
                return true;
            }
            return false;
        });
    }

    @Override
    protected void onDestroy() {
        Log.i(SpeechDemoDefines.TAG, "Vad onDestroy");
        uninitEngine();
        super.onDestroy();
    }

    private void init() {
        if (mEngineStarted) {
            mEngineStatus.setText(R.string.hint_engine_busy);
            return;
        }
        SetButton(mStart, false);
        SetButton(mStop, false);
        SetButton(mLongPress, false);

        if (mDebugPath.isEmpty()) {
            mDebugPath = getDebugPath();
        }
        initEngine();
    }

    private void uninit() {
        if (mEngineStarted) {
            mEngineStatus.setText(R.string.hint_engine_busy);
            return;
        }
        uninitEngine();
        mEngineStatus.setText(R.string.hint_waiting_init);
        mResult.setText(R.string.vad_input_hint);

        SetButton(mUninit, false);
        SetButton(mInit, true);
        SetButton(mStart, false);
        SetButton(mStop, false);
        SetButton(mLongPress, false);
    }

    private void startEngine() {
        Log.i(SpeechDemoDefines.TAG, "Invoke startEngine.");
        if (mRecorderType.equals(SpeechEngineDefines.RECORDER_TYPE_STREAM)) {
            mSpeechEngine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_CUSTOM_SAMPLE_RATE_INT, mStreamRecorder.GetStreamSampleRate());
            mSpeechEngine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_CUSTOM_CHANNEL_INT, mStreamRecorder.GetStreamChannel());
            if (!mStreamRecorder.Start()) {
                requestPermission(VAD_PERMISSIONS);
                return;
            }
        } else if (mRecorderType.equals(SpeechEngineDefines.RECORDER_TYPE_FILE)) {
            String test_file_path = mDebugPath + "/vad_rec_file.pcm";
            Log.d(SpeechDemoDefines.TAG, "test file path: " + test_file_path);
            mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_RECORDER_FILE_STRING, test_file_path);
        }

        int ret = mSpeechEngine.sendDirective(SpeechEngineDefines.DIRECTIVE_START_ENGINE, "");
        if (ret == SpeechEngineDefines.ERR_REC_CHECK_ENVIRONMENT_FAILED) {
            mEngineStatus.setText(R.string.check_rec_permission);
            requestPermission(VAD_PERMISSIONS);
        } else if (ret != SpeechEngineDefines.ERR_NO_ERROR) {
            Log.e(SpeechDemoDefines.TAG, "send directive failed, " + ret);
        }
        clearResultText();
    }

    private void stopEngine() {
        mSpeechEngine.sendDirective(SpeechEngineDefines.DIRECTIVE_STOP_ENGINE, "");
    }

    private void touchDown() {
        longPressIsRunning = false;
        longPressHandler = new Handler();
        longPressRunnable = () -> {
            Log.i(SpeechDemoDefines.TAG, "VadTouch: Running");
            longPressIsRunning = true;

            if (mRecorderType.equals(SpeechEngineDefines.RECORDER_TYPE_STREAM)) {
                mSpeechEngine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_CUSTOM_SAMPLE_RATE_INT, mStreamRecorder.GetStreamSampleRate());
                mSpeechEngine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_CUSTOM_CHANNEL_INT, mStreamRecorder.GetStreamChannel());
                if (!mStreamRecorder.Start()) {
                    requestPermission(VAD_PERMISSIONS);
                    return;
                }
            } else if (mRecorderType.equals(SpeechEngineDefines.RECORDER_TYPE_FILE)) {
                String test_file_path = mDebugPath + "/vad_rec_file.pcm";
                Log.d(SpeechDemoDefines.TAG, "test file path: " + test_file_path);
                mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_RECORDER_FILE_STRING, test_file_path);
            }

            int ret = mSpeechEngine.sendDirective(SpeechEngineDefines.DIRECTIVE_START_ENGINE, "");
            if (ret == SpeechEngineDefines.ERR_REC_CHECK_ENVIRONMENT_FAILED) {
                mEngineStatus.setText(R.string.check_rec_permission);
                requestPermission(VAD_PERMISSIONS);
            } else if (ret != SpeechEngineDefines.ERR_NO_ERROR) {
                Log.e(SpeechDemoDefines.TAG, "send directive failed, " + ret);
            }
            clearResultText();
        };
        longPressHandler.postDelayed(longPressRunnable, 500);
    }

    private void touchUp() {
        if (longPressIsRunning) {
            longPressIsRunning = false;
            Log.i(SpeechDemoDefines.TAG, "VadTouch: Finish");
            mFinishTalkingTimestamp = System.currentTimeMillis();
            mSpeechEngine.sendDirective(SpeechEngineDefines.DIRECTIVE_FINISH_TALKING, "");
            mStreamRecorder.Stop();
        } else if (longPressRunnable != null) {
            Log.i(SpeechDemoDefines.TAG, "VadTouch: Cancel");
            longPressHandler.removeCallbacks(longPressRunnable);
            longPressRunnable = null;
        }
    }

    public void speechEnginInitOk(long initCost) {
        Log.i(SpeechDemoDefines.TAG, "Speech engine init OK!");
        mStreamRecorder.SetSpeechEngine(SpeechDemoDefines.VAD_VIEW, mSpeechEngine);
        this.runOnUiThread(() -> {
            setResultText("Init Cost: " + initCost);
            mEngineStatus.setText(R.string.hint_ready);
            SetButton(mInit, false);
            SetButton(mUninit, true);
            SetButton(mStart, true);
            SetButton(mLongPress, true);
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
        mVadDuration = 0;
        mVadBeginPosition = 0;
        mVadEndPosition = 0;
        this.runOnUiThread(() -> {
            mEngineStatus.setText(R.string.hint_start_cb);
            SetButton(mStart, false);
            SetButton(mStop, true);
            SetButton(mLongPress, false);
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
            SetButton(mLongPress, true);
        });
    }

    private void messageVadBegin(final String data) {
        try {
            JSONObject reader = new JSONObject(data);
            if (reader.has("start")) {
                mVadBeginPosition = reader.getDouble("start");
            }
        } catch (JSONException e) {
            e.printStackTrace();
        }
        this.runOnUiThread(() -> {
            setResultText("Vad begin, bos: " + mVadBeginPosition);
        });
    }

    private void messasgeVadSpeech(String data) {
        try {
            JSONObject reader = new JSONObject(data);
            if (reader.has("end")) {
                double currentSegEnd = reader.getDouble("end");
                if (currentSegEnd > mVadEndPosition) {
                    mVadEndPosition = currentSegEnd;
                }
            }
        } catch (JSONException e) {
            e.printStackTrace();
        }
    }

    private void messageVadEnd(final String data) {
        this.runOnUiThread(() -> {
            setResultText("Vad end, eos: " + mVadEndPosition + ", speech duration: " + mVadDuration/(2 * mVadEngineSampleRate / 1000) + "ms.");
            stopEngine();
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
                stopEngine();
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
                speechStart(stdData);
                break;
            case SpeechEngineDefines.MESSAGE_TYPE_ENGINE_STOP:
                speechStop(stdData);
                break;
            case SpeechEngineDefines.MESSAGE_TYPE_ENGINE_ERROR:
                speechError(stdData);
                break;
            case SpeechEngineDefines.MESSAGE_TYPE_SILENCE:
                break;
            case SpeechEngineDefines.MESSAGE_TYPE_SIL2SPEECH:
                messageVadBegin(stdData);
                break;
            case SpeechEngineDefines.MESSAGE_TYPE_SPEECH:
                messasgeVadSpeech(stdData);
                break;
            case SpeechEngineDefines.MESSAGE_TYPE_SPEECH2SIL:
                messageVadEnd(stdData);
                break;
            case SpeechEngineDefines.MESSAGE_TYPE_VAD_AUDIO_DATA:
                mVadDuration += len;
                break;
            default:
                break;
        }
    }

    private void initEngine() {
        // Init resource manager
        SpeechResourceManagerGenerator.getInstance().initResourceManager(getApplicationContext(), "0", String.valueOf(SensitiveDefines.APPID), SensitiveDefines.APP_VERSION, false, mDebugPath);
        // Check model downloaded or not
        if (SpeechResourceManagerGenerator.getInstance().checkResourceDownload("aispeech_aed")) {
            Log.i(SpeechDemoDefines.TAG, "Resource manager vad resource has downloaded.");
            // Check model need update or not
            SpeechResourceManagerGenerator.getInstance().checkResourceUpdate("aispeech_aed", new SpeechResourceManager.CheckResouceUpdateListener() {
                @Override
                public void onCheckResult(boolean needUpdate) {
                    Log.i(SpeechDemoDefines.TAG, "Check resource update: " + needUpdate);
                    if (needUpdate) {
                        fetchvadResource();
                    } else {
                        initEngineInternal();
                    }
                }
            });
        } else {
            Log.e(SpeechDemoDefines.TAG, "Resource manager vad resource has not downloaded.");
            fetchvadResource();
        }
        initEngineInternal();
    }

    private void fetchvadResource() {
        SpeechResourceManagerGenerator.getInstance().fetchResourceByName("aispeech_aed", new SpeechResourceManager.FetchResourceListener() {
            @Override
            public void onSuccess() {
                Log.i(SpeechDemoDefines.TAG, "Download model succeed.");
                initEngineInternal();
            }

            @Override
            public void onFailed(String errorMsg) {
                Log.e(SpeechDemoDefines.TAG, "Failed to download model: " + errorMsg);
                speechEngineInitFailed("Download vad resource failed.");
            }
        });
    }

    private void initEngineInternal() {
        if (mSpeechEngine == null) {
            mSpeechEngine = SpeechEngineGenerator.getInstance();
            mSpeechEngine.createEngine();
        }

        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_ENGINE_NAME_STRING, SpeechEngineDefines.VAD_ENGINE);
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_LOG_LEVEL_STRING, SpeechEngineDefines.LOG_LEVEL_TRACE);
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_DEBUG_PATH_STRING, mDebugPath);

        mSpeechEngine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_CUSTOM_SAMPLE_RATE_INT, mVadEngineSampleRate);
        mSpeechEngine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_CUSTOM_CHANNEL_INT, mStreamRecorder.GetStreamChannel());
        if (mEnableVadAudioSave) {
            mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_VAD_REC_PATH_STRING, mDebugPath);
        }
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_RECORDER_TYPE_STRING, mRecorderType);

        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_LICENSE_DIRECTORY_STRING, mDebugPath);
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_AUTHENTICATE_TYPE_STRING, SpeechEngineDefines.AUTHENTICATE_TYPE_LATE_BIND);
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_AUTHENTICATE_ADDRESS_STRING, SensitiveDefines.AUTHENTICATE_ADDRESS);
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_AUTHENTICATE_URI_STRING, SensitiveDefines.AUTHENTICATE_URI);
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_BUSINESS_KEY_STRING, mCurBusinessKey);
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_AUTHENTICATE_SECRET_STRING, mCurAuthenticateSecret);
        String vadResourcePath = SpeechResourceManagerGenerator.getInstance().getResourcePath("aispeech_aed");
        Log.d(SpeechDemoDefines.TAG, "Async vad resource path: " + vadResourcePath);
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_AED_RESOURCE_PATH_STRING, vadResourcePath);
        mSpeechEngine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_VAD_HEAD_SILENCE_THRESHOLD, mSettings.getInt(R.string.config_vad_head_silence_threshold));
        mSpeechEngine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_VAD_TAIL_SILENCE_THRESHOLD, mSettings.getInt(R.string.config_vad_tail_silence_threshold));

        long startInitTimestamp = System.currentTimeMillis();
        int ret = mSpeechEngine.initEngine();
        if (ret != SpeechEngineDefines.ERR_NO_ERROR) {
            String errMessage = "Init Vad Engine Failed: " + ret;
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