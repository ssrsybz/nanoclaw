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

import androidx.lifecycle.LifecycleObserver;

import com.bytedance.speech.speechdemo.settings.Settings;
import com.bytedance.speech.speechdemo.utils.SpeechDemoDefines;
import com.bytedance.speech.speechdemo.utils.SpeechFileUtils;
import com.bytedance.speech.speechengine.SpeechEngine;
import com.bytedance.speech.speechengine.SpeechEngineDefines;
import com.bytedance.speech.speechengine.SpeechEngineGenerator;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.util.Arrays;
import java.util.List;

public class AfpActivity extends BaseActivity implements LifecycleObserver {


    // Engine
    private SpeechEngine mSpeechEngine = null;
    private boolean mEngineStarted = false;

    // UI
    private TextView mResult;
    private TextView mEngineStatus;
    private Button mInit;
    private Button mUninit;
    private Button mStart;
    private Button mStop;
    private Button mFetchResult;

    // Permissions
    private static final List<String> AFP_PERMISSIONS = Arrays.asList(
            Manifest.permission.WRITE_EXTERNAL_STORAGE,
            Manifest.permission.RECORD_AUDIO
    );

    // Settings
    protected Settings mSettings;

    @SuppressLint({"ClickableViewAccessibility", "InflateParams", "HardwareIds"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        Log.i(SpeechDemoDefines.TAG, "Afp onCreate");
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_afp);
        setTitleBar(R.string.afp_name);
        requestPermission(AFP_PERMISSIONS);

        final String viewId = SpeechDemoDefines.AFP_VIEW;

        mSettings = SettingsActivity.getSettings(viewId);

        mResult = findViewById(R.id.result_text);
        mResult.setMovementMethod(new ScrollingMovementMethod());
        mResult.setText("");

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

        mFetchResult = findViewById(R.id.fetch_result);
        setButton(mFetchResult, false);
        mFetchResult.setOnClickListener(v -> fetchResult());
    }

    @Override
    protected void onDestroy() {
        Log.i(SpeechDemoDefines.TAG, "Afp onDestroy");
        if (mSpeechEngine != null) {
            mSpeechEngine.destroyEngine();
            mSpeechEngine = null;
        }
        super.onDestroy();
    }

    private void init() {
        if (mEngineStarted) {
            mEngineStatus.setText(R.string.hint_engine_busy);
            return;
        }
        setButton(mStart, false);
        setButton(mStop, false);
        setButton(mFetchResult, false);
        setupEngine();
    }

    private void uninit() {
        if (mEngineStarted) {
            mEngineStatus.setText(R.string.hint_engine_busy);
            return;
        }
        uninitEngine();
        mEngineStatus.setText(R.string.hint_waiting_init);
        mResult.setText("");

        setButton(mUninit, false);
        setButton(mInit, true);
        setButton(mStart, false);
        setButton(mStop, false);
        setButton(mFetchResult, false);
    }

    private void startEngine() {
        Log.i(SpeechDemoDefines.TAG, "Speech engine start to feed.");
        File file = new File(getDebugPath(), "test_afp.pcm");
        byte[] bytes = new byte[(int) file.length()];
        try(FileInputStream fis = new FileInputStream(file)) {
            fis.read(bytes);
            int ret = mSpeechEngine.processAudio(bytes, bytes.length, true);
            if (ret != SpeechEngineDefines.ERR_NO_ERROR) {
                setResultText("Fail to feed audio: " + ret);
            }
        } catch (Exception e) {
            e.printStackTrace();
        }

        mEngineStarted = true;
        mEngineStatus.setText(R.string.hint_start_cb);
        setButton(mStart, false);
        setButton(mStop, true);
        setButton(mFetchResult, true);
        clearResultText();
    }

    private void stopEngine() {
        int ret = mSpeechEngine.resetEngine();
        Log.i(SpeechDemoDefines.TAG, "Speech engine reset ret: " + ret);
        mEngineStarted = false;
        mEngineStatus.setText(R.string.hint_stop_cb);
        setButton(mStart, true);
        setButton(mStop, false);
        setButton(mFetchResult, false);
    }

    private void fetchResult() {
        String engineName = getEngineName();
        int resultType = getResultType();
        int resultTypeIdx = mSettings.getOptions(R.string.config_afp_result_type).chooseIdx;
        if (resultTypeIdx == 0) {
            // Bytes result.
            String outputFileName = "test_" + engineName + "_out.bytes";
            OutputStream out = SpeechFileUtils.OpenOutputFile(getDebugPath(), outputFileName);

            byte[] result = new byte[4096 * 1000];
            int ret = mSpeechEngine.fetchResult(resultType, result);
            Log.i(SpeechDemoDefines.TAG, "Speech engine fetch result ret: " + ret);
            if (ret < 0) {
                setResultText("Fetch result failed! Err code: " + ret);
            } else {
                setResultText("Fetch result succeed!");
                SpeechFileUtils.WriteData(out, result, ret);
            }
            SpeechFileUtils.CloseOutputFile(out);
        } else {
            // Json result.
            String outputFileName = "test_" + engineName + "_out.json";
            OutputStream out = SpeechFileUtils.OpenOutputFile(getDebugPath(), outputFileName);

            String result = mSpeechEngine.fetchResult(resultType);
            int errCode = SpeechEngineDefines.ERR_NO_ERROR;
            try {
                // 从回调的 json 数据中解析 ASR 结果
                JSONObject reader = new JSONObject(result);
                errCode = reader.getInt("err_code");
            } catch (JSONException e) {
                e.printStackTrace();
            }
            Log.i(SpeechDemoDefines.TAG, "Speech engine fetch result: " + errCode);
            if (errCode != SpeechEngineDefines.ERR_NO_ERROR) {
                setResultText("result failed! Err code: " + errCode);
            } else {
                setResultText("result succeed!");
                SpeechFileUtils.WriteData(out, result);
            }

            SpeechFileUtils.CloseOutputFile(out);
        }
    }

    private String getEngineName() {
        int chooseIdx = mSettings.getOptions(R.string.config_music_engine_name).chooseIdx;
        switch (chooseIdx) {
            case 1:
                return SpeechEngineDefines.COVERSONG_ENGINE;
            case 2:
                return SpeechEngineDefines.HUMMING_ENGINE;
            case 0:
            default:
                return SpeechEngineDefines.AFP_ENGINE;
        }
    }

    private int getResultType() {
        String engineName = getEngineName();
        int resultTypeIdx = mSettings.getOptions(R.string.config_afp_result_type).chooseIdx;

        // Afp engine
        if (engineName.equals(SpeechEngineDefines.AFP_ENGINE)) {
            switch (resultTypeIdx) {
                case 0:
                    return SpeechEngineDefines.RESULT_TYPE_AFP_RESULT;
                case 1:
                default:
                    return SpeechEngineDefines.RESULT_TYPE_AFP_SLICE_RESULT;
            }
        }
        // CoverSong engine
        if (engineName.equals(SpeechEngineDefines.COVERSONG_ENGINE)) {
            switch (resultTypeIdx) {
                case 0:
                    return SpeechEngineDefines.RESULT_TYPE_COVERSONG_RESULT;
                case 1:
                default:
                    return SpeechEngineDefines.RESULT_TYPE_COVERSONG_SLICE_RESULT;
            }
        }
        // Humming engine
        if (engineName.equals(SpeechEngineDefines.HUMMING_ENGINE)) {
            switch (resultTypeIdx) {
                case 0:
                    return SpeechEngineDefines.RESULT_TYPE_HUMMING_RESULT;
                case 1:
                default:
                    return SpeechEngineDefines.RESULT_TYPE_HUMMING_SLICE_RESULT;
            }
        }

        // Return afp result as default.
        return SpeechEngineDefines.RESULT_TYPE_AFP_RESULT;
    }

    public void speechEnginInitOk(long initCost) {
        Log.i(SpeechDemoDefines.TAG, "Speech engine init OK!");
        this.runOnUiThread(() -> {
            setResultText("Cost: " + initCost);
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
            setResultText(tipText);
        });
    }

    public void setResultText(final String text) {
        mResult.setText("");
        mResult.append("\n" + text);
    }

    public void clearResultText() {
        this.runOnUiThread(() -> mResult.setText(""));
    }

    private void setupEngine() {
        initEngine();
    }

    private void configAfpParams() {
        // common
        Log.d(SpeechDemoDefines.TAG, "Debug path:" + getDebugPath());

        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_ENGINE_NAME_STRING, getEngineName());
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_LOG_LEVEL_STRING, SpeechEngineDefines.LOG_LEVEL_TRACE);
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_DEBUG_PATH_STRING, getDebugPath());
    }

    private void initEngine() {
        if (mSpeechEngine == null) {

            mSpeechEngine = SpeechEngineGenerator.getInstance();
            mSpeechEngine.createEngine();
        }
        Log.d(SpeechDemoDefines.TAG, "SDK version: " + mSpeechEngine.getVersion());

        configAfpParams();
        long startInitTimestamp = System.currentTimeMillis();
        int ret = mSpeechEngine.initEngine();
        if (ret != SpeechEngineDefines.ERR_NO_ERROR) {
            String errMessage = "Init Engine Faile: " + ret;
            Log.e(SpeechDemoDefines.TAG, errMessage);
            speechEngineInitFailed(errMessage);
            return;
        }
        long cost = System.currentTimeMillis() - startInitTimestamp;
        speechEnginInitOk(cost);
    }

    private void uninitEngine() {
        if (mSpeechEngine != null) {
            mSpeechEngine.destroyEngine();
            mSpeechEngine = null;
            Log.d(SpeechDemoDefines.TAG, "Speech engine uninit Ok!");
        }
    }
}
