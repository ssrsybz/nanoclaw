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

import org.json.JSONException;
import org.json.JSONObject;

import java.util.Collections;
import java.util.List;

public class AuActivity extends BaseActivity implements SpeechEngine.SpeechListener {
    // Permissions
    private static final List<String> AU_PERMISSIONS = Collections.singletonList(
            Manifest.permission.RECORD_AUDIO
    );

    // StreamRecorder
    private SpeechStreamRecorder mStreamRecorder;

    // Engine
    private SpeechEngine engine = null;
    private boolean mEngineStarted = false;

    // Au Touch
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

    // Settings
    protected Settings mSettings;

    // ASR Scenarios
    private final int[] mAuAbilityArray = {
            SpeechEngineDefines.AU_ABILITY_ASR,
            SpeechEngineDefines.AU_ABILITY_MUSIC,
            SpeechEngineDefines.AU_ABILITY_ASR | SpeechEngineDefines.AU_ABILITY_MUSIC};

    @SuppressLint({"ClickableViewAccessibility", "InflateParams", "HardwareIds"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        Log.i(SpeechDemoDefines.TAG, "Au onCreate");
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_au);
        setTitleBar(R.string.au_name);

        final String viewId = SpeechDemoDefines.AU_VIEW;
        mSettings = SettingsActivity.getSettings(viewId);
        mStreamRecorder = MainActivity.getStreamRecorder();

        if (mDebugPath.isEmpty()) {
            mDebugPath = getDebugPath();
        }
        Log.i(SpeechDemoDefines.TAG, "当前调试路径：" + mDebugPath);

        mResult = findViewById(R.id.result_text);
        mResult.setMovementMethod(new ScrollingMovementMethod());
        mResult.setText(R.string.au_input_hint);

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

        mStart = findViewById(R.id.start_engine_button);
        setButton(mStart, false);
        mStart.setOnClickListener(v -> startEngine());

        mStop = findViewById(R.id.stop_button);
        setButton(mStop, false);
        mStop.setOnClickListener(v -> stopEngine());

        mLongPress = findViewById(R.id.long_press);
        setButton(mLongPress, false);

        mLongPress.setOnTouchListener((v, event) -> {
            if (event.getAction() == MotionEvent.ACTION_DOWN) {
                Log.i(SpeechDemoDefines.TAG, "AuTouch: Action down");
                mLongPress.setBackground(getResources().getDrawable(R.drawable.btn_negative_background));
                touchDown();
                return true;
            } else if (event.getAction() == MotionEvent.ACTION_UP) {
                Log.i(SpeechDemoDefines.TAG, "AuTouch: Action up");
                mLongPress.setBackground(getResources().getDrawable(R.drawable.btn_active_background));
                touchUp();
                return true;
            } else if (event.getAction() == MotionEvent.ACTION_CANCEL) {
                Log.i(SpeechDemoDefines.TAG, "AuTouch: Action cancel");
                mLongPress.setBackground(getResources().getDrawable(R.drawable.btn_active_background));
                touchUp();
                return true;
            }
            return false;
        });
    }

    @Override
    protected void onDestroy() {
        Log.i(SpeechDemoDefines.TAG, "Au onDestroy");
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
        mResult.setText(R.string.au_input_hint);

        setButton(mUninit, false);
        setButton(mInit, true);
        setButton(mStart, false);
        setButton(mStop, false);
        setButton(mLongPress, false);
    }

    private void startEngine() {
        configStartAuParams();
        engine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_ASR_AUTO_STOP_BOOL, true);
        int ret = engine.sendDirective(SpeechEngineDefines.DIRECTIVE_START_ENGINE, "");
        if (ret == SpeechEngineDefines.ERR_REC_CHECK_ENVIRONMENT_FAILED) {
            mEngineStatus.setText(R.string.check_rec_permission);
            requestPermission(AU_PERMISSIONS);
        } else if (ret != SpeechEngineDefines.ERR_NO_ERROR) {
            Log.e(SpeechDemoDefines.TAG, "send directive failed, " + ret);
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
            Log.i(SpeechDemoDefines.TAG, "AuTouch: Running");
            longPressIsRunning = true;
            configStartAuParams();
            engine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_ASR_AUTO_STOP_BOOL, false);

            int ret = engine.sendDirective(SpeechEngineDefines.DIRECTIVE_START_ENGINE, "");
            if (ret == SpeechEngineDefines.ERR_REC_CHECK_ENVIRONMENT_FAILED) {
                mEngineStatus.setText(R.string.check_rec_permission);
                requestPermission(AU_PERMISSIONS);
            } else if (ret != SpeechEngineDefines.ERR_NO_ERROR) {
                Log.e(SpeechDemoDefines.TAG, "send directive failed, " + ret);
            }
            mResult.setText("");
        };
        longPressHandler.postDelayed(longPressRunnable, 500);
    }

    private void touchUp() {
        if (longPressIsRunning) {
            longPressIsRunning = false;
            Log.i(SpeechDemoDefines.TAG, "AuTouch: Finish");
            mFinishTalkingTimestamp = System.currentTimeMillis();
            engine.sendDirective(SpeechEngineDefines.DIRECTIVE_FINISH_TALKING, "");
            mStreamRecorder.Stop();
        } else if (longPressRunnable != null) {
            Log.i(SpeechDemoDefines.TAG, "AuTouch: Cancel");
            longPressHandler.removeCallbacks(longPressRunnable);
            longPressRunnable = null;
        }
    }

    private void configInitParams() {
        // common
        if (mRecFilePath.isEmpty()) {
            mRecFilePath = copyAssetsToFiles("testdata");
        }
        Log.d(SpeechDemoDefines.TAG, "Recorder file path: " + mRecFilePath);

        //【可选配置】Debug & Log
        engine.setOptionString(SpeechEngineDefines.PARAMS_KEY_DEBUG_PATH_STRING, mDebugPath);
        engine.setOptionString(SpeechEngineDefines.PARAMS_KEY_LOG_LEVEL_STRING, SpeechEngineDefines.LOG_LEVEL_DEBUG);

        //【可选配置】User ID（用以辅助定位线上用户问题）
        engine.setOptionString(SpeechEngineDefines.PARAMS_KEY_UID_STRING, SensitiveDefines.UID);
        //【必需配置】鉴权相关：Appid
        engine.setOptionString(SpeechEngineDefines.PARAMS_KEY_APP_ID_STRING, mSettings.getString(R.string.config_app_id));
        //【必需配置】鉴权相关：Token
        engine.setOptionString(SpeechEngineDefines.PARAMS_KEY_APP_TOKEN_STRING, mSettings.getString(R.string.config_token));
        //【必需配置】配置音频来源
        engine.setOptionString(SpeechEngineDefines.PARAMS_KEY_RECORDER_TYPE_STRING, mSettings.getOptionsValue(R.string.config_recorder_type, this));
        //【必需配置】Engine Name
        engine.setOptionString(SpeechEngineDefines.PARAMS_KEY_ENGINE_NAME_STRING, SpeechEngineDefines.AU_ENGINE);
        //【可选配置】使用的AU能力组合，默认只进行ASR识别
        engine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_AU_ABILITY_INT, mAuAbilityArray[mSettings.getOptions(R.string.config_au_ability).chooseIdx]);
        //【必需配置】识别服务域名
        engine.setOptionString(SpeechEngineDefines.PARAMS_KEY_AU_ADDRESS_STRING, mSettings.getString(R.string.config_address));
        //【必需配置】识别服务Uri
        engine.setOptionString(SpeechEngineDefines.PARAMS_KEY_AU_URI_STRING, mSettings.getString(R.string.config_uri));
        //【必需配置】识别服务所用集群
        engine.setOptionString(SpeechEngineDefines.PARAMS_KEY_AU_CLUSTER_STRING, mSettings.getString(R.string.config_cluster));
        //【可选配置】在线请求的建连与接收超时，一般不需配置使用默认值即可
        engine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_AU_CONN_TIMEOUT_INT, 3000);
        engine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_AU_RECV_TIMEOUT_INT, 5000);
        //【可选配置】AU处理超时，音乐流程需要额外处理时间，一般不需配置使用默认值即可
        engine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_AU_PROCESS_TIMEOUT_INT, mSettings.getInt(R.string.config_au_process_timeout));
        //【可选配置】AU音频包发送间隔，一般不需配置使用默认值即可
        engine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_AU_AUDIO_PACKET_DURATION_INT, mSettings.getInt(R.string.config_au_audio_packet_duration));
        //【可选配置】AU轮询包发送间隔，一般不需配置使用默认值即可
        engine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_AU_EMPTY_PACKET_INTERVAL_INT, mSettings.getInt(R.string.config_au_empty_packet_interval));
        if (mSettings.getBoolean(R.string.config_au_rec_save)) {
            //【可选配置】录音文件保存路径，如配置，SDK会将录音保存到该路径下，文件格式为 .wav
            engine.setOptionString(SpeechEngineDefines.PARAMS_KEY_AU_REC_PATH_STRING, mDebugPath);
        }
        // 当音频来源为 RECORDER_TYPE_STREAM 时，如输入音频采样率不等于 16K，需添加如下配置
        if (mSettings.getOptionsValue(R.string.config_recorder_type, this).equals(SpeechEngineDefines.RECORDER_TYPE_STREAM)) {
            if (mStreamRecorder.GetStreamSampleRate() != 16000) {
                // 当音频来源为 RECORDER_TYPE_STREAM 时【必需配置】，否则【无需配置】
                // 启用 SDK 内部的重采样
                engine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_ENABLE_RESAMPLER_BOOL, true);
                // 将重采样所需的输入采样率设置为 APP 层输入的音频的实际采样率
                engine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_CUSTOM_SAMPLE_RATE_INT, mStreamRecorder.GetStreamSampleRate());
                engine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_CUSTOM_CHANNEL_INT, mStreamRecorder.GetStreamChannel());
            }
        }
    }

    private void configStartAuParams() {
        // Au 部分配置
        //【可选配置】用户说话最大时长，单位毫秒，默认为 150000ms.
        engine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_VAD_MAX_SPEECH_DURATION_INT, mSettings.getInt(R.string.config_vad_max_speech_duration));
        //【可选配置】用户歌唱最大时长，单位毫秒，默认为 12000ms.
        engine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_VAD_MAX_MUSIC_DURATION_INT, mSettings.getInt(R.string.config_vad_max_music_duration));

        if (mSettings.getOptionsValue(R.string.config_recorder_type, this).equals(SpeechEngineDefines.RECORDER_TYPE_STREAM)) {
            if (!mStreamRecorder.Start()) {
                Log.e(SpeechDemoDefines.TAG, "Stream recorder start failed");
                requestPermission(AU_PERMISSIONS);
                return;
            }
        } else if (mSettings.getOptionsValue(R.string.config_recorder_type, this).equals(SpeechEngineDefines.RECORDER_TYPE_FILE)) {
            // 使用音频文件识别时，需要设置文件的绝对路径
            String test_file_path = mDebugPath + "/au_rec_file.pcm";
            Log.d(SpeechDemoDefines.TAG, "test file path: " + test_file_path);
            // 使用音频文件识别时【必须配置】，否则【无需配置】
            engine.setOptionString(SpeechEngineDefines.PARAMS_KEY_RECORDER_FILE_STRING, test_file_path);
        }

        // Asr 部分配置
        //【可选配置】是否开启顺滑(DDC)
        engine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_ASR_ENABLE_DDC_BOOL, mSettings.getBoolean(R.string.config_asr_enable_ddc));
        //【可选配置】是否开启文字转数字(ITN)
        engine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_ASR_ENABLE_ITN_BOOL, mSettings.getBoolean(R.string.config_asr_enable_itn));
        //【可选配置】是否开启标点
        engine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_ASR_SHOW_NLU_PUNC_BOOL, mSettings.getBoolean(R.string.config_asr_enable_nlu_punctuation));
        //【可选配置】是否返回用户说话的语种
        engine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_ASR_SHOW_LANG_BOOL, mSettings.getBoolean(R.string.config_asr_show_lang));
        //【可选配置】设置识别目标语种
        engine.setOptionString(SpeechEngineDefines.PARAMS_KEY_ASR_LANGUAGE_STRING, mSettings.getString(R.string.config_asr_language));
        //【可选配置】控制识别结果返回的形式，全量返回或增量返回，默认为全量
        engine.setOptionString(SpeechEngineDefines.PARAMS_KEY_ASR_RESULT_TYPE_STRING, mSettings.getOptionsValue(R.string.config_asr_result_type, this));
        //【可选配置】设置VAD头部静音时长，用户多久没说话视为空音频，即静音检测时长
        engine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_ASR_VAD_START_SILENCE_TIME_INT, mSettings.getInt(R.string.config_asr_vad_start_silence_time));
        //【可选配置】设置VAD尾部静音时长，用户说话后停顿多久视为说话结束，即自动判停时长
        engine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_ASR_VAD_END_SILENCE_TIME_INT, mSettings.getInt(R.string.config_asr_vad_end_silence_time));
        //【可选配置】设置VAD模式，用于定制VAD场景，默认为空
        engine.setOptionString(SpeechEngineDefines.PARAMS_KEY_ASR_VAD_MODE_STRING, mSettings.getString(R.string.config_asr_vad_mode));
        //【可选配置】更新 ASR 热词
        if (!mSettings.getString(R.string.config_asr_hotwords).isEmpty()) {
            Log.d(SpeechDemoDefines.TAG, "Set hotwords.");
            setHotWords(mSettings.getString(R.string.config_asr_hotwords));
        }
    }

    private void setHotWords(String hotWords) {
        if (engine != null) {
            engine.sendDirective(SpeechEngineDefines.DIRECTIVE_UPDATE_ASR_HOTWORDS, hotWords);
        }
    }

    private void initEngine() {
        if (engine == null) {
            engine = SpeechEngineGenerator.getInstance();
            engine.createEngine();
            engine.setContext(getApplicationContext());
        }
        Log.d(SpeechDemoDefines.TAG, "SDK version: " + engine.getVersion());

        configInitParams();

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
        mStreamRecorder.SetSpeechEngine(SpeechDemoDefines.AU_VIEW, engine);
        this.runOnUiThread(() -> {
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

    public void speechAuResult(final String data, boolean isFinal) {
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
                speechAuResult(stdData, false);
                break;
            case SpeechEngineDefines.MESSAGE_TYPE_FINAL_RESULT:
                speechAuResult(stdData, true);
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
