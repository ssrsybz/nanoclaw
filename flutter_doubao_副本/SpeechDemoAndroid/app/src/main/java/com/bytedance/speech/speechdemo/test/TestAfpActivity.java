// Copyright 2020 Bytedance Inc. All Rights Reserved.
// Author: fengkai.0518@bytedance.com (fengkai.0518)

package com.bytedance.speech.speechdemo.test;

import android.Manifest;
import android.annotation.SuppressLint;
import android.os.Bundle;
import android.text.method.ScrollingMovementMethod;
import android.util.Log;
import android.widget.Button;
import android.widget.TextView;

import androidx.lifecycle.LifecycleObserver;

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
import java.io.FileOutputStream;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;

public class TestAfpActivity extends BaseActivity implements LifecycleObserver {
    class PressureSubject {
        public int id = 0;
        public SpeechEngine engine = null;
        public Thread thread = null;
        public int resultType = 0;
        public AtomicBoolean running = new AtomicBoolean(true);
    }


    // Engine
    private List<PressureSubject> pressureSubjects = null;

    // UI
    private TextView mResult;
    private TextView mEngineStatus;
    private Button mPressureTest;

    // Permissions
    private static final List<String> AFP_PERMISSIONS = Arrays.asList(
            Manifest.permission.WRITE_EXTERNAL_STORAGE
    );

    // Settings
    protected Settings mSettings;

    @SuppressLint({"ClickableViewAccessibility", "InflateParams", "HardwareIds"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        Log.i(SpeechDemoDefines.TAG, "Afp onCreate");
        super.onCreate(savedInstanceState);
        setContentView(R.layout.test_activity_afp);
        setTitleBar(R.string.afp_name);
        requestPermission(AFP_PERMISSIONS);

        final String viewId = SpeechDemoDefines.TEST_AFP_VIEW;

        mSettings = SettingsActivity.getSettings(viewId);

        mResult = findViewById(R.id.result_text);
        mResult.setMovementMethod(new ScrollingMovementMethod());
        mResult.setText("");

        mEngineStatus = findViewById(R.id.engine_status);
        mEngineStatus.setText(R.string.hint_waiting_init);

        Button mConfig = findViewById(R.id.engine_config);
        mConfig.setEnabled(true);
        mConfig.setOnClickListener(v -> goToSettingsActivity(viewId));

        mPressureTest = findViewById(R.id.start_stop_test);
        mPressureTest.setOnClickListener(v -> {
            if (pressureSubjects == null) {
                startPressureTest();
                mResult.setText("压测中：" + mSettings.getInt(R.string.config_afp_instance_number) + "个实例");
            } else {
                stopPressureTest();
                mResult.setText("压测停止");
            }
        });
    }

    @Override
    protected void onDestroy() {
        Log.i(SpeechDemoDefines.TAG, "Afp onDestroy");
        stopPressureTest();
        super.onDestroy();
    }

    private void startPressureTest() {
        if (pressureSubjects != null) {
            return;
        }

        int resultType = getResultType();
        int instanceNumber = mSettings.getInt(R.string.config_afp_instance_number);
        pressureSubjects = new ArrayList<>(instanceNumber);
        for (int i = 0; i < instanceNumber; ++i) {
            PressureSubject pressure = new PressureSubject();
            pressure.id = i;
            pressure.engine = null;
            pressure.resultType = resultType;
            pressure.running.set(true);
            pressure.thread = new Thread(() -> {
                while (pressure.running.get()) {
                    // Init
                    pressure.engine = SpeechEngineGenerator.getInstance();
                    pressure.engine.createEngine();
                    pressure.engine.setOptionString(SpeechEngineDefines.PARAMS_KEY_ENGINE_NAME_STRING, SpeechEngineDefines.AFP_ENGINE);
                    int ret = pressure.engine.initEngine();
                    if (ret != SpeechEngineDefines.ERR_NO_ERROR) {
                        Log.e(SpeechDemoDefines.TAG, "Fail to initEngine during pressure test:" + ret);
                    }

                    // Process
                    File file = new File(getDebugPath(), "test_afp.pcm");
                    byte[] bytes = new byte[(int) file.length()];
                    try(FileInputStream fis = new FileInputStream(file)) {
                        fis.read(bytes);
                        ret = pressure.engine.processAudio(bytes, bytes.length, true);
                        if (ret != SpeechEngineDefines.ERR_NO_ERROR) {
                            Log.e(SpeechDemoDefines.TAG, "Fail to processAudio during pressure test:" + ret);
                        }
                    } catch (Exception e) {
                        e.printStackTrace();
                    }

                    // Fetch result
                    ret = fetchResult(pressure.engine, pressure.id, pressure.resultType);
                    if (ret != SpeechEngineDefines.ERR_NO_ERROR) {
                        Log.e(SpeechDemoDefines.TAG, "Fail to fetchResult during pressure test:" + ret);
                    }

                    // Reset
                    ret = pressure.engine.resetEngine();
                    if (ret != SpeechEngineDefines.ERR_NO_ERROR) {
                        Log.e(SpeechDemoDefines.TAG, "Fail to resetEngine during pressure test:" + ret);
                    }

                    // Destroy
                    pressure.engine.destroyEngine();
                    pressure.engine = null;
                }
            });
            pressure.thread.start();
            pressureSubjects.add(pressure);
        }
    }

    private void stopPressureTest() {
        if (pressureSubjects == null) {
            return;
        }

        for (PressureSubject sub : pressureSubjects) {
            sub.running.set(false);
        }

        for (PressureSubject sub : pressureSubjects) {
            try {
                sub.thread.join();
            } catch (Exception e) {
                e.printStackTrace();
            }
        }
        pressureSubjects = null;
    }

    private int fetchResult(SpeechEngine engine, int id, int resultType) {
        String filename;
        if (resultType == SpeechEngineDefines.RESULT_TYPE_AFP_RESULT) {
            filename = "test_afp_out_" + id + ".bytes";
        } else {
            filename = "test_afp_out_" + id + ".json";
        }
        File outFile = new File(getDebugPath(), filename);

        try(FileOutputStream out = new FileOutputStream(outFile)) {
            if (resultType == SpeechEngineDefines.RESULT_TYPE_AFP_RESULT) {
                byte[] result = new byte[4096 * 3];
                int ret = engine.fetchResult(SpeechEngineDefines.RESULT_TYPE_AFP_RESULT, result);
                if (ret < 0) {
                    Log.e(SpeechDemoDefines.TAG, "Fail to fetchResult during pressure test:" + ret);
                    return ret;
                } else {
                    out.write(result, 0, ret);
                }
            } else {
                String result = engine.fetchResult(SpeechEngineDefines.RESULT_TYPE_AFP_SLICE_RESULT);
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
                    Log.e(SpeechDemoDefines.TAG, "Fail to fetchResult during pressure test:" + errCode);
                    return errCode;
                } else {
                    out.write(result.getBytes());
                }
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
        return 0;
    }

    private int getResultType() {
        int chooseIdx = mSettings.getOptions(R.string.config_afp_result_type).chooseIdx;
        switch (chooseIdx) {
            case 0:
                return SpeechEngineDefines.RESULT_TYPE_AFP_RESULT;
            case 1:
            default:
                return SpeechEngineDefines.RESULT_TYPE_AFP_SLICE_RESULT;
        }
    }
}
