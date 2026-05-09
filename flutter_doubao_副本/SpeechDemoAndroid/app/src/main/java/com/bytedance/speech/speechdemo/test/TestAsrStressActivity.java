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
import androidx.lifecycle.ProcessLifecycleOwner;

import com.bytedance.speech.speechdemo.BaseActivity;
import com.bytedance.speech.speechdemo.MainActivity;
import com.bytedance.speech.speechdemo.R;
import com.bytedance.speech.speechdemo.SettingsActivity;
import com.bytedance.speech.speechdemo.settings.Settings;
import com.bytedance.speech.speechdemo.utils.SensitiveDefines;
import com.bytedance.speech.speechdemo.utils.SpeechDemoDefines;
import com.bytedance.speech.speechdemo.utils.SpeechStreamRecorder;
import com.bytedance.speech.speechengine.SpeechEngine;
import com.bytedance.speech.speechengine.SpeechEngineDefines;
import com.bytedance.speech.speechengine.SpeechEngineGenerator;
import com.bytedance.speech.speechengine.SpeechResourceManagerGenerator;

import java.util.Collections;
import java.util.List;


public class TestAsrStressActivity extends BaseActivity implements SpeechEngine.SpeechListener, LifecycleObserver {

    // UI
    private TextView mResultTv;
    private Button mStartBtn = null;
    private Button mStopBtn = null;

    // Settings
    protected Settings mSettings;

    // Paths
    private String mDebugPath = "";

    // Engine
    private SpeechEngine mSpeechEngine = null;

    // Permissions
    private static final List<String> ASR_PERMISSIONS = Collections.singletonList(
            Manifest.permission.RECORD_AUDIO
    );

    // StreamRecorder
    private SpeechStreamRecorder mStreamRecorder;

    // ASR Scenarios
    private final int[] mAsrScenarioTypeArray = {
            SpeechEngineDefines.ASR_SCENARIO_ONE_SENTENCE,
            SpeechEngineDefines.ASR_SCENARIO_STREAMING};

    // ASR Stress
    private int mStressSceneId = 0;
    private boolean mStressStarted = false;
    private Thread mTestThread = null;

    @SuppressLint({"ClickableViewAccessibility", "InflateParams", "HardwareIds", "UseCompatLoadingForDrawables"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        Log.i(SpeechDemoDefines.TAG, "Asr onCreate");
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_test_asr_stress);
        ProcessLifecycleOwner.get().getLifecycle().addObserver(this);

        setTitleBar(R.string.test_asr_stress_name);

        final String viewId = SpeechDemoDefines.TEST_ASR_STRESS_VIEW;
        mSettings = SettingsActivity.getSettings(viewId);
        mStreamRecorder = MainActivity.getStreamRecorder();

        mResultTv = findViewById(R.id.result_text);
        mResultTv.setMovementMethod(new ScrollingMovementMethod());
        mResultTv.setText(R.string.asr_input_hint);

        Button mConfig = findViewById(R.id.engine_config);
        mConfig.setEnabled(true);
        mConfig.setOnClickListener(v -> goToSettingsActivity(viewId));

        mStartBtn = findViewById(R.id.start_button);
        setButton(mStartBtn, true);
        mStartBtn.setOnClickListener(v -> startStressTest());

        mStopBtn = findViewById(R.id.stop_button);
        setButton(mStopBtn, true);
        mStopBtn.setOnClickListener(v -> stopStressTest());
    }

    @Override
    protected void onDestroy() {
        Log.i(SpeechDemoDefines.TAG, "Asr onDestroy");
        uninitEngine();
        super.onDestroy();
    }

    private void configInitParams() {
        //【必需配置】Engine Name
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_ENGINE_NAME_STRING, SpeechEngineDefines.ASR_ENGINE);

        //【可选配置】Debug & Log
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_DEBUG_PATH_STRING, mDebugPath);
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_LOG_LEVEL_STRING, SpeechEngineDefines.LOG_LEVEL_DEBUG);

        //【可选配置】User ID（用以辅助定位线上用户问题）
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_UID_STRING, SensitiveDefines.UID);

        //【必需配置】配置音频来源
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_RECORDER_TYPE_STRING, mSettings.getOptionsValue(R.string.config_recorder_type, this));

        if (mSettings.getBoolean(R.string.config_asr_rec_save)) {
            //【可选配置】录音文件保存路径，如配置，SDK会将录音保存到该路径下，文件格式为 .wav
            mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_ASR_REC_PATH_STRING, mDebugPath);
        }

        // 当音频来源为 RECORDER_TYPE_STREAM 时，如输入音频采样率不等于 16K，需添加如下配置
        if (mSettings.getOptionsValue(R.string.config_recorder_type, this).equals(SpeechEngineDefines.RECORDER_TYPE_STREAM)) {
            if (mStreamRecorder.GetStreamSampleRate() != 16000 || mStreamRecorder.GetStreamChannel() != 1) {
                // 当音频来源为 RECORDER_TYPE_STREAM 时【必需配置】，否则【无需配置】
                // 启用 SDK 内部的重采样
                mSpeechEngine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_ENABLE_RESAMPLER_BOOL, true);
                // 将重采样所需的输入采样率设置为 APP 层输入的音频的实际采样率
                mSpeechEngine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_CUSTOM_SAMPLE_RATE_INT, mStreamRecorder.GetStreamSampleRate());
                mSpeechEngine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_CUSTOM_CHANNEL_INT, mStreamRecorder.GetStreamChannel());
            }
        }

        String recPath = "";
        if (mSettings.getBoolean(R.string.config_rec_save)) {
            recPath = mDebugPath;
        }
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_REC_PATH_STRING, recPath);
        mSpeechEngine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_REC_FILE_TYPE_INT, mSettings.getOptions(R.string.config_rec_file_type).chooseIdx);

        String address = mSettings.getString(R.string.config_address);
        if (address.isEmpty()) {
            address = SensitiveDefines.DEFAULT_ADDRESS;
        }
        Log.i(SpeechDemoDefines.TAG, "Current address: " + address);
        //【必需配置】识别服务域名
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_ASR_ADDRESS_STRING, address);

        String uri = mSettings.getString(R.string.config_uri);
        if (uri.isEmpty()) {
            uri = SensitiveDefines.ASR_DEFAULT_URI;
        }
        Log.i(SpeechDemoDefines.TAG, "Current uri: " + uri);
        //【必需配置】识别服务Uri
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_ASR_URI_STRING, uri);

        String appid = mSettings.getString(R.string.config_app_id);
        if (appid.isEmpty()) {
            appid = SensitiveDefines.APPID;
        }
        //【必需配置】鉴权相关：Appid
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_APP_ID_STRING, appid);

        String token = mSettings.getString(R.string.config_token);
        if (token.isEmpty()) {
            token = SensitiveDefines.TOKEN;
        }
        //【必需配置】鉴权相关：Token
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_APP_TOKEN_STRING, token);

        String cluster = mSettings.getString(R.string.config_cluster);
        if (cluster.isEmpty()) {
            cluster = SensitiveDefines.ASR_DEFAULT_CLUSTER;
        }
        Log.i(SpeechDemoDefines.TAG, "Current cluster: " + cluster);
        //【必需配置】识别服务所用集群
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_ASR_CLUSTER_STRING, cluster);

        //【必需配置】配置 ASR 使用场景，一句话识别或流式识别
        int curScenario = mAsrScenarioTypeArray[mSettings.getOptions(R.string.config_asr_scenario_type).chooseIdx];
        mSpeechEngine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_ASR_SCENARIO_INT, curScenario);

        // ASR 使用场景为流式识别时，需要下载模型并配置模型所在路径
        // ASR 使用场景为流式识别时【必须配置】，否则【无需配置】
        if (curScenario == SpeechEngineDefines.ASR_SCENARIO_STREAMING) {
            String aedResourcePath = SpeechResourceManagerGenerator.getInstance().getResourcePath("aispeech_aed");
            Log.d(SpeechDemoDefines.TAG, "Aed resource path: " + aedResourcePath);
            mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_AED_RESOURCE_PATH_STRING, aedResourcePath);
        }

        //【可选配置】在线请求的建连与接收超时，一般不需配置使用默认值即可
        mSpeechEngine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_ASR_CONN_TIMEOUT_INT, 3000);
        mSpeechEngine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_ASR_RECV_TIMEOUT_INT, 5000);
    }

    private void configStartAsrParams() {
        //【可选配置】控制识别结果的配置
        mSpeechEngine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_ASR_ENABLE_DDC_BOOL, mSettings.getBoolean(R.string.config_asr_enable_ddc));
        mSpeechEngine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_ASR_ENABLE_ITN_BOOL, mSettings.getBoolean(R.string.config_asr_enable_itn));
        mSpeechEngine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_ASR_SHOW_NLU_PUNC_BOOL, mSettings.getBoolean(R.string.config_asr_enable_nlu_punctuation));
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_ASR_LANGUAGE_STRING, mSettings.getString(R.string.config_asr_language));

        //【可选配置】控制识别结果返回的形式，全量返回或增量返回，默认为全量
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_ASR_RESULT_TYPE_STRING, mSettings.getOptionsValue(R.string.config_asr_result_type, this));

        //【可选配置】控制 ASR 中的 VAD 模块的阈值的配置
        mSpeechEngine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_ASR_VAD_START_SILENCE_TIME_INT, mSettings.getInt(R.string.config_asr_vad_start_silence_time));
        mSpeechEngine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_ASR_VAD_END_SILENCE_TIME_INT, mSettings.getInt(R.string.config_asr_vad_end_silence_time));
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_ASR_VAD_MODE_STRING, mSettings.getString(R.string.config_asr_vad_mode));
        //【可选配置】用户音频输入最大时长，仅一句话识别场景生效，单位毫秒，默认为 150000ms.
        mSpeechEngine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_VAD_MAX_SPEECH_DURATION_INT, mSettings.getInt(R.string.config_vad_max_speech_duration));

        //【可选配置】控制是否返回录音音量，在 APP 需要显示音频波形时可以启用
        mSpeechEngine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_ENABLE_GET_VOLUME_BOOL, mSettings.getBoolean(R.string.config_get_volume));


        //【可选配置】更新 ASR 热词
        if (!mSettings.getString(R.string.config_asr_hotwords).isEmpty()) {
            Log.d(SpeechDemoDefines.TAG, "Set hotwords.");
            setHotWords(mSettings.getString(R.string.config_asr_hotwords));
        }

        if (mSettings.getOptionsValue(R.string.config_recorder_type, this).equals(SpeechEngineDefines.RECORDER_TYPE_STREAM)) {
            if (!mStreamRecorder.Start()) {
                requestPermission(ASR_PERMISSIONS);
            }
        } else if (mSettings.getOptionsValue(R.string.config_recorder_type, this).equals(SpeechEngineDefines.RECORDER_TYPE_FILE)) {
            // 使用音频文件识别时，需要设置文件的绝对路径
            String test_file_path = mDebugPath + "/asr_rec_file.pcm";
            Log.d(SpeechDemoDefines.TAG, "输入的音频文件路径: " + test_file_path);
            // 使用音频文件识别时【必须配置】，否则【无需配置】
            mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_RECORDER_FILE_STRING, test_file_path);
        }
    }

    private void setHotWords(String hotWords) {
        if (mSpeechEngine != null) {
            mSpeechEngine.sendDirective(SpeechEngineDefines.DIRECTIVE_UPDATE_ASR_HOTWORDS, hotWords);
        }
    }

    private void initEngine() {
        if (mDebugPath.isEmpty()) {
            mDebugPath = getDebugPath();
        }
        Log.i(SpeechDemoDefines.TAG, "当前调试路径：" + mDebugPath);
        if (mSpeechEngine == null) {
            Log.i(SpeechDemoDefines.TAG, "创建引擎.");
            mSpeechEngine = SpeechEngineGenerator.getInstance();
            mSpeechEngine.createEngine();
        }
        Log.d(SpeechDemoDefines.TAG, "SDK 版本号: " + mSpeechEngine.getVersion());

        Log.i(SpeechDemoDefines.TAG, "配置初始化参数.");
        configInitParams();

        mSpeechEngine.setContext(getApplicationContext());
        Log.i(SpeechDemoDefines.TAG, "引擎初始化.");
        int ret = mSpeechEngine.initEngine();
        if (ret != SpeechEngineDefines.ERR_NO_ERROR) {
            String errMessage = "初始化失败，返回值: " + ret;
            Log.e(SpeechDemoDefines.TAG, errMessage);
            speechEngineInitFailed(errMessage);
            return;
        }
        Log.i(SpeechDemoDefines.TAG, "设置消息监听");
        mSpeechEngine.setListener(this);
        speechEnginInitucceeded();
    }

    private void uninitEngine() {
        if (mSpeechEngine != null) {
            Log.i(SpeechDemoDefines.TAG, "引擎析构.");
            mSpeechEngine.destroyEngine();
            mSpeechEngine = null;
            Log.i(SpeechDemoDefines.TAG, "引擎析构完成!");
        }
    }

    private void startEngine() {
        Log.i(SpeechDemoDefines.TAG, "配置启动参数.");
        configStartAsrParams();

        //【可选配置】是否启用云端自动判停，仅一句话识别场景生效
        Log.i(SpeechDemoDefines.TAG, "开启 ASR 云端自动判停");
        mSpeechEngine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_ASR_AUTO_STOP_BOOL, true);

        Log.i(SpeechDemoDefines.TAG, "启动引擎");
        Log.i(SpeechDemoDefines.TAG, "Directive: DIRECTIVE_START_ENGINE");
        int ret = mSpeechEngine.sendDirective(SpeechEngineDefines.DIRECTIVE_START_ENGINE, "");
        if (ret == SpeechEngineDefines.ERR_REC_CHECK_ENVIRONMENT_FAILED) {
            requestPermission(ASR_PERMISSIONS);
        } else if (ret != SpeechEngineDefines.ERR_NO_ERROR) {
            Log.e(SpeechDemoDefines.TAG, "send directive start failed, " + ret);
        }
    }

    private void stopEngine() {
        Log.i(SpeechDemoDefines.TAG, "关闭引擎（异步）");
        Log.i(SpeechDemoDefines.TAG, "Directive: DIRECTIVE_STOP_ENGINE");
        mSpeechEngine.sendDirective(SpeechEngineDefines.DIRECTIVE_STOP_ENGINE, "");
    }

    private void syncStopEngine() {
        Log.i(SpeechDemoDefines.TAG, "关闭引擎（同步）");
        Log.i(SpeechDemoDefines.TAG, "Directive: DIRECTIVE_SYNC_STOP_ENGINE");
        mSpeechEngine.sendDirective(SpeechEngineDefines.DIRECTIVE_SYNC_STOP_ENGINE, "");
    }

    private void finishTalking() {
        Log.i(SpeechDemoDefines.TAG, "结束音频输入");
        Log.i(SpeechDemoDefines.TAG, "Directive: DIRECTIVE_FINISH_TALKING");
        mSpeechEngine.sendDirective(SpeechEngineDefines.DIRECTIVE_FINISH_TALKING, "");
    }

    private void sleep(int time) {
        try {
            Thread.sleep(time * 1000);
        } catch (InterruptedException e) {
            throw new RuntimeException(e);
        }
    }

    private int getRandomValue(int a, int b) {
        return (int)a + (int)(Math.random() * (b - a + 1));
    }

    private void testScene0() {
        initEngine();
        while (mStressStarted) {
            syncStopEngine();
            startEngine();
            sleep(getRandomValue(0, 3));
            if (getRandomValue(0, 1) == 0) {
                finishTalking();
            } else {
                stopEngine();
            }
            sleep(getRandomValue(0, 3));
        }
        uninitEngine();
    }

    private void testScene1() {
        while (mStressStarted) {
            initEngine();
            syncStopEngine();
            startEngine();
            sleep(getRandomValue(0, 3));
            if (getRandomValue(0, 1) == 0) {
                finishTalking();
            } else {
                stopEngine();
            }
            sleep(getRandomValue(0, 3));
            uninitEngine();
        }
    }

    private void testScene2() {
        while (mStressStarted) {
            initEngine();
            syncStopEngine();
            startEngine();
            sleep(1);
            finishTalking();
            sleep(2);
            uninitEngine();
        }
    }

    private void testScene3() {
        initEngine();
        while (mStressStarted) {
            int method = getRandomValue(0, 4);
            switch (method) {
                case 0:
                    startEngine();
                    break;
                case 1:
                    syncStopEngine();
                    break;
                case 2:
                    stopEngine();
                    break;
                case 3:
                    finishTalking();
                    break;
                case 4:
                    uninitEngine();
                    initEngine();
                    break;
            }
            sleep(getRandomValue(0, 5));
        }
        uninitEngine();
    }

    private final class test extends Thread {
        @Override
        public void run() {
            String sceneID = mSettings.getOptionsValue(R.string.config_asr_stress_scendid, TestAsrStressActivity.this);
            TestAsrStressActivity.this.runOnUiThread(() -> {
                setResultText("开始压测 " + sceneID);
            });
            switch (sceneID) {
                case "正常场景1":
                    mStressSceneId = 0;
                    testScene0();
                    break;
                case "正常场景2":
                    mStressSceneId = 1;
                    testScene1();
                    break;
                case "ERROR回调时析构":
                    mStressSceneId = 2;
                    testScene2();
                    break;
                case "随机压测":
                    mStressSceneId = 3;
                    testScene3();
                    break;
                default:
                    break;
            }
            TestAsrStressActivity.this.runOnUiThread(() -> {
                setResultText("结束压测 " + sceneID);
            });
        }
    }

    private void startStressTest() {
        mStressStarted = true;
        if (null != mTestThread) {
            if (mTestThread.isAlive()) {
                Log.w(SpeechDemoDefines.TAG, "Already start!");
                return;
            }
            mTestThread = null;
        }
        mTestThread = new test();
        mTestThread.start();
    }

    private void stopStressTest() {
        mStressStarted = false;
    }

    @Override
    public void onSpeechMessage(int type, byte[] data, int len) {
        String stdData = new String(data);
        switch (type) {
            case SpeechEngineDefines.MESSAGE_TYPE_ENGINE_START:
                // Callback: 引擎启动成功回调
                Log.i(SpeechDemoDefines.TAG, "Callback: 引擎启动成功: data: " + stdData);
                break;
            case SpeechEngineDefines.MESSAGE_TYPE_ENGINE_STOP:
                // Callback: 引擎关闭回调
                Log.i(SpeechDemoDefines.TAG, "Callback: 引擎关闭: data: " + stdData);
                break;
            case SpeechEngineDefines.MESSAGE_TYPE_ENGINE_ERROR:
                // Callback: 错误信息回调
                Log.e(SpeechDemoDefines.TAG, "Callback: 错误信息: " + stdData);
                speechError(stdData);
                break;
            case SpeechEngineDefines.MESSAGE_TYPE_PARTIAL_RESULT:
                // Callback: ASR 当前请求的部分结果回调
                Log.d(SpeechDemoDefines.TAG, "Callback: ASR 当前请求的部分结果");
                break;
            case SpeechEngineDefines.MESSAGE_TYPE_FINAL_RESULT:
                // Callback: ASR 当前请求最终结果回调
                Log.i(SpeechDemoDefines.TAG, "Callback: ASR 当前请求最终结果");
                speechAsrResult(stdData, true);
                break;
            case SpeechEngineDefines.MESSAGE_TYPE_VOLUME_LEVEL:
                // Callback: 录音音量回调
                Log.d(SpeechDemoDefines.TAG, "Callback: 录音音量");
                break;
            default:
                break;
        }
    }

    public void speechEnginInitucceeded() {
        Log.i(SpeechDemoDefines.TAG, "引擎初始化成功!");
        mStreamRecorder.SetSpeechEngine(SpeechDemoDefines.TEST_ASR_STRESS_VIEW, mSpeechEngine);
    }

    public void speechEngineInitFailed(String tipText) {
        Log.e(SpeechDemoDefines.TAG, "引擎初始化失败: " + tipText);
    }

    public void speechError(final String data) {
        this.runOnUiThread(() -> {
            if (mStressSceneId == 2) {
                if (getRandomValue(0, 1) == 0) {
                    stopEngine();
                }
                uninitEngine();
            }
        });
    }

    public void speechAsrResult(final String data, boolean isFinal) {
        this.runOnUiThread(() -> {
            if (isFinal && mStressSceneId == 2) {
                if (getRandomValue(0, 1) == 0) {
                    stopEngine();
                }
                uninitEngine();
            }
        });
    }

    public void setResultText(final String text) {
        mResultTv.setText("");
        mResultTv.append("\n" + text);
    }

}
