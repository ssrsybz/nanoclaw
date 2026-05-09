// Copyright 2020 Bytedance Inc. All Rights Reserved.
// Author: fengkai.0518@bytedance.com (fengkai.0518)

package com.bytedance.speech.speechdemo;

import androidx.lifecycle.LifecycleObserver;
import androidx.lifecycle.ProcessLifecycleOwner;

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


import org.json.JSONException;
import org.json.JSONObject;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

public class AsrActivity extends BaseActivity implements SpeechEngine.SpeechListener, LifecycleObserver {

    // UI
    private TextView mResultTv;
    private TextView mEngineStatusTv;
    private Button mInitEngineBtn;
    private Button mUninitEngineBtn;
    private Button mStartEngineBtn;
    private Button mStopEngineBtn;
    private Button mRecordBtn;

    // Settings
    protected Settings mSettings;

    // Paths
    private String mDebugPath = "";

    // Engine
    private SpeechEngine mSpeechEngine = null;
    private boolean mEngineStarted = false;

    // Permissions
    private static final List<String> ASR_PERMISSIONS = Collections.singletonList(
            Manifest.permission.RECORD_AUDIO
    );

    // StreamRecorder
    private SpeechStreamRecorder mStreamRecorder;

    // Statistics
    private long mFinishTalkingTimestamp = 0;

    @SuppressLint({"ClickableViewAccessibility", "InflateParams", "HardwareIds", "UseCompatLoadingForDrawables"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        Log.i(SpeechDemoDefines.TAG, "Asr onCreate");
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_asr);
        ProcessLifecycleOwner.get().getLifecycle().addObserver(this);

        setTitleBar(R.string.asr_name);

        final String viewId = SpeechDemoDefines.ASR_VIEW;
        mSettings = SettingsActivity.getSettings(viewId);
        mStreamRecorder = MainActivity.getStreamRecorder();

        if (mDebugPath.isEmpty()) {
            mDebugPath = getDebugPath();
        }
        Log.i(SpeechDemoDefines.TAG, "当前调试路径：" + mDebugPath);

        mResultTv = findViewById(R.id.result_text);
        mResultTv.setMovementMethod(new ScrollingMovementMethod());
        mResultTv.setText(R.string.asr_input_hint);

        mEngineStatusTv = findViewById(R.id.engine_status);
        mEngineStatusTv.setText(R.string.hint_waiting_init);

        Button mConfig = findViewById(R.id.engine_config);
        mConfig.setEnabled(true);
        mConfig.setOnClickListener(v -> goToSettingsActivity(viewId));

        mInitEngineBtn = findViewById(R.id.init_engine_button);
        setButton(mInitEngineBtn, true);
        mInitEngineBtn.setOnClickListener(v -> initEngineBtnClicked());

        mUninitEngineBtn = findViewById(R.id.uninit_engine_button);
        setButton(mUninitEngineBtn, false);
        mUninitEngineBtn.setOnClickListener(v -> uninitEngineBtnClicked());

        mStartEngineBtn = findViewById(R.id.start_engin_button);
        setButton(mStartEngineBtn, false);
        mStartEngineBtn.setOnClickListener(v -> startEngineBtnClicked());

        mStopEngineBtn = findViewById(R.id.stop_button);
        setButton(mStopEngineBtn, false);
        mStopEngineBtn.setOnClickListener(v -> stopEngineBtnClicked());

        mRecordBtn = findViewById(R.id.long_press);
        setButton(mRecordBtn, false);

        mRecordBtn.setOnTouchListener((v, event) -> {
            if (event.getAction() == MotionEvent.ACTION_DOWN) {
                Log.i(SpeechDemoDefines.TAG, "Record: Action down");
                mRecordBtn.setBackground(getResources().getDrawable(R.drawable.btn_negative_background));
                recordBtnTouchDown();
                return true;
            } else if (event.getAction() == MotionEvent.ACTION_UP || event.getAction() == MotionEvent.ACTION_CANCEL) {
                Log.i(SpeechDemoDefines.TAG, "Record: Action up");
                mRecordBtn.setBackground(getResources().getDrawable(R.drawable.btn_active_background));
                recordBtnTouchUp();
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

        //【可选配置】音频采样率，默认16000
        mSpeechEngine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_SAMPLE_RATE_INT, mSettings.getInt(R.string.config_sample_rate));
        //【可选配置】音频通道数，默认1，可选1或2
        mSpeechEngine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_CHANNEL_NUM_INT, mSettings.getInt(R.string.config_channel));
        //【可选配置】上传给服务的音频通道数，默认1，可选1或2，一般与PARAMS_KEY_CHANNEL_NUM_INT保持一致即可
        mSpeechEngine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_UP_CHANNEL_NUM_INT, mSettings.getInt(R.string.config_channel));

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
        //【必需配置】鉴权相关：Token
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_APP_TOKEN_STRING, token);

        //【可需配置】自定义请求头部KV：Headers
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_REQUEST_HEADERS_STRING, mSettings.getString(R.string.config_request_headers));

        String cluster = mSettings.getString(R.string.config_cluster);
        if (cluster.isEmpty()) {
            cluster = SensitiveDefines.ASR_DEFAULT_CLUSTER;
        }
        Log.i(SpeechDemoDefines.TAG, "Current cluster: " + cluster);
        //【必需配置】识别服务所用集群
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_ASR_CLUSTER_STRING, cluster);

        //【可选配置】在线请求的建连与接收超时，一般不需配置使用默认值即可
        mSpeechEngine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_ASR_CONN_TIMEOUT_INT, 3000);
        mSpeechEngine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_ASR_RECV_TIMEOUT_INT, 5000);

        //【可选配置】在线请求断连后，重连次数，默认值为0，如果需要开启需要设置大于0的次数
        mSpeechEngine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_ASR_MAX_RETRY_TIMES_INT, mSettings.getInt(R.string.config_asr_max_retry_times));
    
    }

    private void configStartAsrParams() {
        //【可选配置】是否开启顺滑(DDC)
        mSpeechEngine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_ASR_ENABLE_DDC_BOOL, mSettings.getBoolean(R.string.config_asr_enable_ddc));
        //【可选配置】是否开启文字转数字(ITN)
        mSpeechEngine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_ASR_ENABLE_ITN_BOOL, mSettings.getBoolean(R.string.config_asr_enable_itn));
        //【可选配置】是否开启标点
        mSpeechEngine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_ASR_SHOW_NLU_PUNC_BOOL, mSettings.getBoolean(R.string.config_asr_enable_nlu_punctuation));
        //【可选配置】设置识别语种
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_ASR_LANGUAGE_STRING, mSettings.getString(R.string.config_asr_language));
        //【可选配置】是否隐藏句尾标点
        mSpeechEngine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_ASR_DISABLE_END_PUNC_BOOL, mSettings.getBoolean(R.string.config_asr_disable_end_punctuation));
        //【可选配置】是否返回用户说话的语种
        mSpeechEngine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_ASR_SHOW_LANG_BOOL, mSettings.getBoolean(R.string.config_asr_show_lang));
        // 【可选配置】直接传递自定义的ASR请求JSON，若使用此参数需自行确保JSON格式正确
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_ASR_REQ_PARAMS_STRING, mSettings.getString(R.string.config_asr_req_params));

        //【可选配置】控制识别结果返回的形式，全量返回或增量返回，默认为全量
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_ASR_RESULT_TYPE_STRING, mSettings.getOptionsValue(R.string.config_asr_result_type, this));

        //【可选配置】设置VAD头部静音时长，用户多久没说话视为空音频，即静音检测时长
        mSpeechEngine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_ASR_VAD_START_SILENCE_TIME_INT, mSettings.getInt(R.string.config_asr_vad_start_silence_time));
        //【可选配置】设置VAD尾部静音时长，用户说话后停顿多久视为说话结束，即自动判停时长
        mSpeechEngine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_ASR_VAD_END_SILENCE_TIME_INT, mSettings.getInt(R.string.config_asr_vad_end_silence_time));
        //【可选配置】设置VAD模式，用于定制VAD场景，默认为空
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_ASR_VAD_MODE_STRING, mSettings.getString(R.string.config_asr_vad_mode));
        //【可选配置】用户音频输入最大时长，仅一句话识别场景生效，单位毫秒，默认为 60000ms.
        mSpeechEngine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_VAD_MAX_SPEECH_DURATION_INT, mSettings.getInt(R.string.config_vad_max_speech_duration));

        //【可选配置】控制是否返回录音音量，在 APP 需要显示音频波形时可以启用
        mSpeechEngine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_ENABLE_GET_VOLUME_BOOL, mSettings.getBoolean(R.string.config_get_volume));

        //【可选配置】设置纠错词表，识别结果会根据设置的纠错词纠正结果，例如："{\"古爱玲\":\"谷爱凌\"}"，当识别结果中出现"古爱玲"时会替换为"谷爱凌"
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_ASR_CORRECT_WORDS_STRING, mSettings.getString(R.string.config_asr_correct_words));


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
            // 更新 ASR 热词，例如："{\"hotwords\":[{\"word\":\"过秦论\",\"scale\":2.0}]}"
            // scale为float类型参数，其中叠词的范围为[1.0,2.0]，非叠词的范围为[1.0,50.0]，scale值越大，结果中出现热词的概率越大
            mSpeechEngine.sendDirective(SpeechEngineDefines.DIRECTIVE_UPDATE_ASR_HOTWORDS, hotWords);
        }
    }

    private void initEngine() {
        if (mSpeechEngine == null) {
            Log.i(SpeechDemoDefines.TAG, "创建引擎.");
            mSpeechEngine = SpeechEngineGenerator.getInstance();
            mSpeechEngine.createEngine();
            mSpeechEngine.setContext(getApplicationContext());
        }
        Log.d(SpeechDemoDefines.TAG, "SDK 版本号: " + mSpeechEngine.getVersion());

        Log.i(SpeechDemoDefines.TAG, "配置初始化参数.");
        configInitParams();

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

    private void initEngineBtnClicked() {
        if (mEngineStarted) {
            mEngineStatusTv.setText(R.string.hint_engine_busy);
            return;
        }
        setButton(mStartEngineBtn, false);
        setButton(mStopEngineBtn, false);
        setButton(mRecordBtn, false);
        initEngine();
    }

    private void uninitEngineBtnClicked() {
        if (mEngineStarted) {
            mEngineStatusTv.setText(R.string.hint_engine_busy);
            return;
        }
        uninitEngine();
        mEngineStatusTv.setText(R.string.hint_waiting_init);
        mResultTv.setText(R.string.asr_input_hint);

        setButton(mUninitEngineBtn, false);
        setButton(mInitEngineBtn, true);
        setButton(mStartEngineBtn, false);
        setButton(mStopEngineBtn, false);
        setButton(mRecordBtn, false);
    }

    private void startEngineBtnClicked() {
        mFinishTalkingTimestamp = 0;

        Log.i(SpeechDemoDefines.TAG, "配置启动参数.");
        configStartAsrParams();
        //【可选配置】该按钮为短按模式，预期是按下开始录音，自动判停结束，需要开启云端自动判停功能。
        Log.i(SpeechDemoDefines.TAG, "开启 ASR 云端自动判停");
        mSpeechEngine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_ASR_AUTO_STOP_BOOL, true);

        // Directive：启动引擎前调用SYNC_STOP指令，保证前一次请求结束。
        Log.i(SpeechDemoDefines.TAG, "关闭引擎（同步）");
        Log.i(SpeechDemoDefines.TAG, "Directive: DIRECTIVE_SYNC_STOP_ENGINE");
        int ret = mSpeechEngine.sendDirective(SpeechEngineDefines.DIRECTIVE_SYNC_STOP_ENGINE, "");
        if (ret != SpeechEngineDefines.ERR_NO_ERROR) {
            Log.e(SpeechDemoDefines.TAG, "send directive syncstop failed, " + ret);
        } else {
            Log.i(SpeechDemoDefines.TAG, "启动引擎");
            Log.i(SpeechDemoDefines.TAG, "Directive: DIRECTIVE_START_ENGINE");

            ret = mSpeechEngine.sendDirective(SpeechEngineDefines.DIRECTIVE_START_ENGINE, "");
            if (ret == SpeechEngineDefines.ERR_REC_CHECK_ENVIRONMENT_FAILED) {
                mEngineStatusTv.setText(R.string.check_rec_permission);
                requestPermission(ASR_PERMISSIONS);
            } else if (ret != SpeechEngineDefines.ERR_NO_ERROR) {
                Log.e(SpeechDemoDefines.TAG, "send directive start failed, " + ret);
            }
        }
        clearResultText();
    }

    private void stopEngineBtnClicked() {
        Log.i(SpeechDemoDefines.TAG, "关闭引擎（异步）");
        Log.i(SpeechDemoDefines.TAG, "Directive: DIRECTIVE_STOP_ENGINE");
        mSpeechEngine.sendDirective(SpeechEngineDefines.DIRECTIVE_STOP_ENGINE, "");
    }

    private void recordBtnTouchDown() {
        mFinishTalkingTimestamp = 0;

        Log.i(SpeechDemoDefines.TAG, "配置启动参数.");
        configStartAsrParams();
        //【可选配置】该按钮为长按模式，预期是按下开始录音，抬手结束录音，需要关闭云端自动判停功能。
        mSpeechEngine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_ASR_AUTO_STOP_BOOL, false);

        // Directive：启动引擎前调用SYNC_STOP指令，保证前一次请求结束。
        Log.i(SpeechDemoDefines.TAG, "关闭引擎（同步）");
        Log.i(SpeechDemoDefines.TAG, "Directive: DIRECTIVE_SYNC_STOP_ENGINE");
        int ret = mSpeechEngine.sendDirective(SpeechEngineDefines.DIRECTIVE_SYNC_STOP_ENGINE, "");
        if (ret != SpeechEngineDefines.ERR_NO_ERROR) {
            Log.e(SpeechDemoDefines.TAG, "send directive syncstop failed, " + ret);
        } else {
            Log.i(SpeechDemoDefines.TAG, "启动引擎");
            Log.i(SpeechDemoDefines.TAG, "Directive: DIRECTIVE_START_ENGINE");
            ret = mSpeechEngine.sendDirective(SpeechEngineDefines.DIRECTIVE_START_ENGINE, "");
            if (ret == SpeechEngineDefines.ERR_REC_CHECK_ENVIRONMENT_FAILED) {
                mEngineStatusTv.setText(R.string.check_rec_permission);
                requestPermission(ASR_PERMISSIONS);
            } else if (ret != SpeechEngineDefines.ERR_NO_ERROR) {
                Log.e(SpeechDemoDefines.TAG, "send directive start failed, " + ret);
            }
        }
        clearResultText();
    }

    private void recordBtnTouchUp() {
        Log.i(SpeechDemoDefines.TAG, "AsrTouch: Finish");
        mFinishTalkingTimestamp = System.currentTimeMillis();
        // Directive：结束用户音频输入。
        Log.i(SpeechDemoDefines.TAG, "Directive: DIRECTIVE_FINISH_TALKING");
        mSpeechEngine.sendDirective(SpeechEngineDefines.DIRECTIVE_FINISH_TALKING, "");
        mStreamRecorder.Stop();
    }

    @Override
    public void onSpeechMessage(int type, byte[] data, int len) {
        String stdData = new String(data);
        switch (type) {
            case SpeechEngineDefines.MESSAGE_TYPE_ENGINE_START:
                // Callback: 引擎启动成功回调
                Log.i(SpeechDemoDefines.TAG, "Callback: 引擎启动成功: data: " + stdData);
                speechStart();
                break;
            case SpeechEngineDefines.MESSAGE_TYPE_ENGINE_STOP:
                // Callback: 引擎关闭回调
                Log.i(SpeechDemoDefines.TAG, "Callback: 引擎关闭: data: " + stdData);
                speechStop();
                break;
            case SpeechEngineDefines.MESSAGE_TYPE_ENGINE_ERROR:
                // Callback: 错误信息回调
                Log.e(SpeechDemoDefines.TAG, "Callback: 错误信息: " + stdData);
                speechError(stdData);
                break;
            case SpeechEngineDefines.MESSAGE_TYPE_CONNECTION_CONNECTED:
                Log.i(SpeechDemoDefines.TAG, "Callback: 建连成功: data: " + stdData);
                break;
            case SpeechEngineDefines.MESSAGE_TYPE_PARTIAL_RESULT:
                // Callback: ASR 当前请求的部分结果回调
                Log.d(SpeechDemoDefines.TAG, "Callback: ASR 当前请求的部分结果");
                speechAsrResult(stdData, false);
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
        mStreamRecorder.SetSpeechEngine(SpeechDemoDefines.ASR_VIEW, mSpeechEngine);
        this.runOnUiThread(() -> {
            mEngineStatusTv.setText(R.string.hint_ready);
            setButton(mInitEngineBtn, false);
            setButton(mUninitEngineBtn, true);
            setButton(mStartEngineBtn, true);
            setButton(mRecordBtn, true);
        });
    }

    public void speechEngineInitFailed(String tipText) {
        Log.e(SpeechDemoDefines.TAG, "引擎初始化失败: " + tipText);
        this.runOnUiThread(() -> {
            mEngineStatusTv.setText(R.string.hint_setup_failure);
            setButton(mInitEngineBtn, true);
            setResultText(tipText);
        });
    }

    public void speechStart() {
        mEngineStarted = true;
        this.runOnUiThread(() -> {
            mEngineStatusTv.setText(R.string.hint_start_cb);
            setButton(mStartEngineBtn, false);
            setButton(mStopEngineBtn, true);
        });
    }

    public void speechStop() {
        mEngineStarted = false;
        this.runOnUiThread(() -> {
            mStreamRecorder.Stop();
            mEngineStatusTv.setText(R.string.hint_stop_cb);
            setButton(mStartEngineBtn, true);
            setButton(mStopEngineBtn, false);
        });
    }

    public void speechAsrResult(final String data, boolean isFinal) {
        // 计算由录音结束到 ASR 最终结果之间的延迟
        long delay = 0;
        if (isFinal && mFinishTalkingTimestamp > 0) {
            delay = System.currentTimeMillis() - mFinishTalkingTimestamp;
        }
        final long response_delay = delay;
        this.runOnUiThread(() -> {
            try {
                // 从回调的 json 数据中解析 ASR 结果
                JSONObject reader = new JSONObject(data);
                if (!reader.has("result")) {
                    return;
                }
                String text = reader.getJSONArray("result").getJSONObject(0).getString("text");
                if (text.isEmpty()) {
                    return;
                }
                text = "result: " + text;
                text += "\nreqid: " + reader.getString("reqid");
                if (isFinal && response_delay > 0) {
                    text += "\nresponse_delay: " + response_delay;
                }
                setResultText(text);
            } catch (JSONException e) {
                e.printStackTrace();
            }
        });
    }

    public void speechError(final String data) {
        this.runOnUiThread(() -> {
            try {
                // 从回调的 json 数据中解析错误码和错误详细信息
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
        mResultTv.setText("");
        mResultTv.append("\n" + text);
    }

    public void clearResultText() {
        this.runOnUiThread(() -> mResultTv.setText(""));
    }
}
