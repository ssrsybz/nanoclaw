// Copyright 2020 Bytedance Inc. All Rights Reserved.
// Author: Bytedance, Inc.

package com.bytedance.speech.speechdemo;

import android.annotation.SuppressLint;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.media.AudioManager;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.os.Bundle;
import android.os.Handler;
import android.text.Editable;
import android.text.Spannable;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.TextWatcher;
import android.text.method.ScrollingMovementMethod;
import android.text.style.ForegroundColorSpan;
import android.util.Log;
import android.widget.Button;
import android.widget.EditText;
import android.widget.TextView;

import androidx.core.content.ContextCompat;
import androidx.lifecycle.Lifecycle;
import androidx.lifecycle.LifecycleObserver;
import androidx.lifecycle.OnLifecycleEvent;
import androidx.lifecycle.ProcessLifecycleOwner;



import com.bytedance.speech.speechdemo.settings.Settings;
import com.bytedance.speech.speechdemo.utils.SensitiveDefines;
import com.bytedance.speech.speechdemo.utils.SpeechDemoDefines;
import com.bytedance.speech.speechengine.SpeechEngineGenerator;
import com.bytedance.speech.speechengine.SpeechEngine;
import com.bytedance.speech.speechengine.SpeechEngineDefines;
import com.bytedance.speech.speechengine.SpeechResourceManager;
import com.bytedance.speech.speechengine.SpeechResourceManagerGenerator;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

public class BiTtsActivity extends BaseActivity implements SpeechEngine.SpeechListener, LifecycleObserver {

    // Settings
    protected Settings mSettings;
    // Engine
    private SpeechEngine mSpeechEngine = null;

    // UI
    private EditText mReferText;
    private TextView mResult;
    private TextView mEngineStatus;
    private Button mEngineSwitch;
    private Button mStartBtn;
    private Button mStopBtn;
    private Button mSynthesisBtn;
    private Button mPauseResumeBtn;
    private Boolean refTextChanged;
    // Engine State
    private boolean mEngineInited = false;
    private boolean mEngineStarted = false;
    private boolean mEngineErrorOccurred = false;
    private boolean mPlayerPaused = false;

    // Paths
    private String mDebugPath = "";

    // Options Default Value
    private String mCurAppId = SensitiveDefines.BITTS_DEFAULT_APP_ID;
    //tts
    private Integer mTtsSynthesisIndex = 0;
    private List<String> mTtsSynthesisText;
    // Android Audio Manager
    private AudioManager.OnAudioFocusChangeListener mAFChangeListener = null;
    private AudioManager mAudioManager = null;
    private boolean mResumeOnFocusGain = true;
    private boolean mPlaybackNowAuthorized = false;

    private static int TTS_MAX_RETRY_COUNT = 3;
    private int mRetryCount = TTS_MAX_RETRY_COUNT;
    private Handler mHandler = null;

    @OnLifecycleEvent(Lifecycle.Event.ON_STOP)
    public void onAppBackgrounded() {
        // App in background
        Log.i(SpeechDemoDefines.TAG, "Application becomming background.");
    }

    @SuppressLint({"ClickableViewAccessibility", "InflateParams", "HardwareIds"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        Log.i(SpeechDemoDefines.TAG, "Bi Tts onCreate");
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_bidirection_tts);
        ProcessLifecycleOwner.get().getLifecycle().addObserver(this);

        setTitleBar(R.string.bi_tts_name);
        String viewId = SpeechDemoDefines.BI_TTS_VIEW;
        mSettings = SettingsActivity.getSettings(viewId);

        mReferText = findViewById(R.id.refer_text);
        mReferText.setEnabled(true);
        mReferText.setText("愿中国青年都摆脱冷气，只是向上走，不必听自暴自弃者流的话。能做事的做事，能发声的发声。有一分热，发一分光。就令萤火一般，也可以在黑暗里发一点光，不必等候炬火。此后如竟没有炬火：我便是唯一的光。");
        mReferText.addTextChangedListener(new TextWatcher() {
            @Override
            public void beforeTextChanged(CharSequence s, int start, int count, int after) {
                // 文本即将改变时触发
            }

            @Override
            public void onTextChanged(CharSequence s, int start, int before, int count) {
                // 文本正在改变时触发（实时监听）
            }

            @Override
            public void afterTextChanged(Editable s) {
                // 文本改变完成后触发（适合最终处理）
                refTextChanged = true;
            }
        });
        refTextChanged = false;
        mResult = findViewById(R.id.result_text);
        mResult.setMovementMethod(new ScrollingMovementMethod());
        mEngineStatus = findViewById(R.id.engine_status);

        Button mConfig = findViewById(R.id.engine_config);
        mConfig.setEnabled(true);
        mConfig.setOnClickListener(v -> goToSettingsActivity(viewId));

        mEngineSwitch = findViewById(R.id.engine_switch);
        setButton(mEngineSwitch, true);
        mEngineSwitch.setOnClickListener(v -> switchEngine());

        mStartBtn = findViewById(R.id.start_engine_button);
        setButton(mStartBtn, false);
        mStartBtn.setOnClickListener(v -> startEngineBtnClicked());

        mStopBtn = findViewById(R.id.stop_engine_button);
        setButton(mStopBtn, false);
        mStopBtn.setOnClickListener(v -> stopEngineBtnClicked());

        mSynthesisBtn = findViewById(R.id.synthesis_button);
        setButton(mSynthesisBtn, false);
        mSynthesisBtn.setOnClickListener(v -> synthesisBtnClicked());

        mPauseResumeBtn = findViewById(R.id.pause_resume_button);
        setButton(mPauseResumeBtn, false);
        mPauseResumeBtn.setOnClickListener(v -> controlPlayingStatus());

        Intent serviceIntent = new Intent(this, ForegroundService.class);
        serviceIntent.putExtra("inputExtra", "Foreground Service Example in Android");
        ContextCompat.startForegroundService(this, serviceIntent);

        if (mHandler == null) {
            mHandler = new Handler();
        }

        if (mDebugPath.isEmpty()) {
            mDebugPath = getDebugPath();
        }
        Log.i(SpeechDemoDefines.TAG, "当前调试路径：" + mDebugPath);

        mAFChangeListener = new AudioManager.OnAudioFocusChangeListener() {
            public void onAudioFocusChange(int focusChange) {
                switch (focusChange) {
                    case AudioManager.AUDIOFOCUS_GAIN:
                        Log.d(SpeechDemoDefines.TAG, "onAudioFocusChange: AUDIOFOCUS_GAIN, " + mResumeOnFocusGain);
                        if (mResumeOnFocusGain) {
                            mResumeOnFocusGain = false;
                            resumePlayback();
                        }
                        break;
                    case AudioManager.AUDIOFOCUS_LOSS:
                        Log.d(SpeechDemoDefines.TAG, "onAudioFocusChange: AUDIOFOCUS_LOSS");
                        mResumeOnFocusGain = false;
                        pausePlayback();
                        mPlaybackNowAuthorized = false;
                        break;
                    case AudioManager.AUDIOFOCUS_LOSS_TRANSIENT:
                        Log.d(SpeechDemoDefines.TAG, "onAudioFocusChange: AUDIOFOCUS_LOSS_TRANSIENT");
                        mResumeOnFocusGain = mEngineStarted;
                        pausePlayback();
                        break;
                }
            }
        };
        mAudioManager = (AudioManager) getApplicationContext().getSystemService(Context.AUDIO_SERVICE);
    }

    @Override
    protected void onDestroy() {
        Log.i(SpeechDemoDefines.TAG, "Tts onDestroy");
        uninitEngine();

        Intent serviceIntent = new Intent(this, ForegroundService.class);
        stopService(serviceIntent);

        super.onDestroy();
    }

    private void configInitParams() {
        //【必需配置】Engine Name
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_ENGINE_NAME_STRING,
                SpeechEngineDefines.BITTS_ENGINE);

        //【可选配置】Debug & Log
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_DEBUG_PATH_STRING, mDebugPath);
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_LOG_LEVEL_STRING, SpeechEngineDefines.LOG_LEVEL_DEBUG);

        //【可选配置】User ID（用以辅助定位线上用户问题）
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_UID_STRING, SensitiveDefines.UID);
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_DEVICE_ID_STRING, SensitiveDefines.DID);

        //【可选配置】是否将合成出的音频保存到设备上，为 true 时需要正确配置 PARAMS_KEY_TTS_AUDIO_PATH_STRING 才会生效
        mSpeechEngine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_TTS_ENABLE_DUMP_BOOL,
                mSettings.getBoolean(R.string.config_tts_dump));
        //【可选配置】 TTS 播放音频文件保存目录，必须在合成之前创建好且 APP 具有访问权限，保存的音频文件名格式为 tts_{reqid}.wav, {reqid} 是本次合成的请求 id
        // PARAMS_KEY_TTS_ENABLE_DUMP_BOOL 配置为 true 的音频时为【必需配置】，否则为【可选配置】
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_TTS_AUDIO_PATH_STRING, mDebugPath);
        //【可选配置】语音合成服务请求的Header部分额外参数
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_REQUEST_HEADERS_STRING,mSettings.getString(R.string.config_request_headers));
        //【可选配置】是否使用内置播放器播放TTS音频
        mSpeechEngine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_TTS_ENABLE_PLAYER_BOOL,mSettings.getBoolean(R.string.config_enable_player));
        //【可选配置】是否打开播放器的数据回调
        mSpeechEngine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_ENABLE_PLAYER_AUDIO_CALLBACK_BOOL,mSettings.getBoolean(R.string.config_enable_player_audio_callback));


        // ------------------------ 在线合成相关配置 -----------------------

        mCurAppId = mSettings.getString(R.string.config_app_id);
        if (mCurAppId.isEmpty()) {
            mCurAppId = SensitiveDefines.APPID;
        }
        //【必需配置】在线合成鉴权相关：Appid
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_APP_ID_STRING, mCurAppId);

        String token = mSettings.getString(R.string.config_token);
        if (token.isEmpty()) {
            token = SensitiveDefines.BITTS_DEFAULT_TOKEN;
        }
        //【必需配置】在线合成鉴权相关：Token
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_APP_TOKEN_STRING, token);

        String address = mSettings.getString(R.string.config_address);
        if (address.isEmpty()) {
            address = SensitiveDefines.DEFAULT_ADDRESS;
        }
        Log.i(SpeechDemoDefines.TAG, "Current address: " + address);
        //【必需配置】语音合成服务域名
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_TTS_ADDRESS_STRING, address);

        String uri = mSettings.getString(R.string.config_uri);
        if (uri.isEmpty()) {
            uri = SensitiveDefines.BITTS_DEFAULT_URI;
        }
        Log.i(SpeechDemoDefines.TAG, "Current uri: " + uri);
        //【必需配置】语音合成服务Uri
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_TTS_URI_STRING, uri);

        String resourceId = mSettings.getString(R.string.config_resource_id);
        if (resourceId.isEmpty()) {
            resourceId = SensitiveDefines.BITTS_DEFAULT_RESOURCE_ID;
        }
        Log.i(SpeechDemoDefines.TAG, "Current resourceId: " + resourceId);
        //【必需配置】语音合成服务Resource id
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_RESOURCE_ID_STRING, resourceId);
        //【可选配置】是否允许在 websocket 建连失败时自动重连
        mSpeechEngine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_ENABLE_WS_RECONNECT_BOOL, !mSettings.getBoolean(R.string.disable_ws_reconnect));
        //【可选配置】语音合成服务链接超时时间
        mSpeechEngine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_TTS_CONN_TIMEOUT_INT,mSettings.getInt(R.string.config_tts_conn_timeout));
    }

    private void configStartTtsParams() {
        // 准备待合成的文本
        if(!prepareTextList()) {
            speechError("{err_code:3006, err_msg:\"Invalid input text.\"}");
            return;
        }
    }
    private String getSynthesisText(){
        String text = new String();
        if(refTextChanged){
            refTextChanged = false;
            text = mReferText.getText().toString();
            // 使用下面几个标点符号来分句，会让通过 MESSAGE_TYPE_TTS_PLAYBACK_PROGRESS 返回的播放进度更加准确
            String[] tmp = text.split("(?<=[;!?。！？；…])");
            for (int j = 0; j < tmp.length; ++j) {
                AddSentence(tmp[j]);
            }
        }
        if(mTtsSynthesisIndex == mTtsSynthesisText.size()){
            setResultText("No more text to Synthesis");
            return null;
        }
        text = mTtsSynthesisText.get(mTtsSynthesisIndex);
        mTtsSynthesisIndex++;

        return text;
    }

    private void initEngine() {
        Log.i(SpeechDemoDefines.TAG, "调用初始化接口");
        initEngineInternal();
    }

    private void initEngineInternal() {
        int ret = SpeechEngineDefines.ERR_NO_ERROR;
        if (mSpeechEngine == null) {
            Log.i(SpeechDemoDefines.TAG, "创建引擎.");
            mSpeechEngine = SpeechEngineGenerator.getInstance();
            mSpeechEngine.createEngine();
        }
        if (ret != SpeechEngineDefines.ERR_NO_ERROR) {
            speechEngineInitFailed("Create engine failed: " + ret);
            return;
        }
        Log.d(SpeechDemoDefines.TAG, "SDK 版本号: " + mSpeechEngine.getVersion());

        Log.i(SpeechDemoDefines.TAG, "配置初始化参数.");
        configInitParams();
        mSpeechEngine.setContext(getApplicationContext());

        long startInitTimestamp = System.currentTimeMillis();
        Log.i(SpeechDemoDefines.TAG, "引擎初始化.");
        ret = mSpeechEngine.initEngine();
        if (ret != SpeechEngineDefines.ERR_NO_ERROR) {
            String errMessage = "初始化失败，返回值: " + ret;
            Log.e(SpeechDemoDefines.TAG, errMessage);
            speechEngineInitFailed(errMessage);
            return;
        }
        Log.i(SpeechDemoDefines.TAG, "设置消息监听");
        mSpeechEngine.setListener(this);

        long cost = System.currentTimeMillis() - startInitTimestamp;
        Log.d(SpeechDemoDefines.TAG, String.format("初始化耗时 %d 毫秒", cost));
        speechEnginInitSucceeded(cost);
    }

    private void uninitEngine() {
        if (mSpeechEngine != null) {
            Log.i(SpeechDemoDefines.TAG, "引擎析构.");
            mSpeechEngine.destroyEngine();
            mSpeechEngine = null;
            Log.i(SpeechDemoDefines.TAG, "引擎析构完成!");
        }
    }

    private void switchEngine() {
        if (mEngineStarted) {
            mEngineStatus.setText(R.string.hint_engine_busy);
            return;
        }
        clearResultText();
        setButton(mStartBtn, false);
        setButton(mSynthesisBtn, false);
        setButton(mPauseResumeBtn, false);
        if (mEngineInited) {
            uninitEngine();
            mEngineInited = false;
            mEngineStatus.setText(R.string.hint_waiting_init);
            mEngineSwitch.setText(R.string.init_engine_title);

            setButton(mStopBtn, false);
        } else {
            initEngine();
        }
    }

    private void startEngineBtnClicked() {
        Log.d(SpeechDemoDefines.TAG, "Start engine, current status: " + mEngineStarted);
        if (!mEngineStarted) {
            AcquireAudioFocus();
            if (!mPlaybackNowAuthorized) {
                Log.w(SpeechDemoDefines.TAG, "Acquire audio focus failed, can't play audio");
                return;
            }
            clearResultText();
            mEngineErrorOccurred = false;

            // Directive：启动引擎前调用SYNC_STOP指令，保证前一次请求结束。
            Log.i(SpeechDemoDefines.TAG, "关闭引擎（同步）");
            Log.i(SpeechDemoDefines.TAG, "Directive: DIRECTIVE_SYNC_STOP_ENGINE");
            int ret = mSpeechEngine.sendDirective(SpeechEngineDefines.DIRECTIVE_SYNC_STOP_ENGINE, "");
            if (ret != SpeechEngineDefines.ERR_NO_ERROR) {
                Log.e(SpeechDemoDefines.TAG, "send directive syncstop failed, " + ret);
            } else {
                configStartTtsParams();
                Log.i(SpeechDemoDefines.TAG, "启动引擎");
                Log.i(SpeechDemoDefines.TAG, "Directive: DIRECTIVE_START_ENGINE");
                String startPayload = "{\"req_params\":{\"speaker\":\"zh_female_roumeinvyou_emo_v2_mars_bigtts\",\"audio_params\":{\"emotion\":\"excited\",\"loudness_rate\":50}}}";
                ret = mSpeechEngine.sendDirective(SpeechEngineDefines.DIRECTIVE_START_ENGINE, startPayload);
                if (ret != SpeechEngineDefines.ERR_NO_ERROR) {
                    String message = "发送启动引擎指令失败, " + ret;
                    sendStartEngineDirectiveFailed(message);
                }
            }
        }
    }

    private void synthesisBtnClicked() {
        triggerSynthesis();
    }

    private void stopEngineBtnClicked() {
        Log.i(SpeechDemoDefines.TAG, "关闭引擎（异步）");
        Log.i(SpeechDemoDefines.TAG, "Directive: DIRECTIVE_STOP_ENGINE");
        if (mEngineStarted) {
            mSpeechEngine.sendDirective(SpeechEngineDefines.DIRECTIVE_STOP_ENGINE, "");
        }
    }

    private void pausePlayback() {
        Log.i(SpeechDemoDefines.TAG, "暂停播放");
        Log.i(SpeechDemoDefines.TAG, "Directive: DIRECTIVE_PAUSE_PLAYER");
        int ret = mSpeechEngine.sendDirective(SpeechEngineDefines.DIRECTIVE_PAUSE_PLAYER, "");
        if (ret == SpeechEngineDefines.ERR_NO_ERROR) {
            mPlayerPaused = true;
            mPauseResumeBtn.setText("Resume");
        }
        Log.d(SpeechDemoDefines.TAG, "Pause playback status:" + ret);
    }

    private void resumePlayback() {
        Log.i(SpeechDemoDefines.TAG, "继续播放");
        Log.i(SpeechDemoDefines.TAG, "Directive: DIRECTIVE_RESUME_PLAYER");
        int ret = mSpeechEngine.sendDirective(SpeechEngineDefines.DIRECTIVE_RESUME_PLAYER, "");
        if (ret == SpeechEngineDefines.ERR_NO_ERROR) {
            mPlayerPaused = false;
            mPauseResumeBtn.setText("Pause");
        }
        Log.d(SpeechDemoDefines.TAG, "Resume playback status:" + ret);
    }

    private void controlPlayingStatus() {
        Log.d(SpeechDemoDefines.TAG, "Pause or resume player, current player status: " + mPlayerPaused);
        if (mPlayerPaused) {
            if (!mPlaybackNowAuthorized) { // AudioFocus 被其他 APP 占用，需要再次获取
                AcquireAudioFocus();
            }
            resumePlayback();
        } else {
            pausePlayback();
        }
    }

    @Override
    public void onSpeechMessage(int type, byte[] data, int len) {
        String stdData = "";
        stdData = new String(data);

        switch (type) {
            case SpeechEngineDefines.MESSAGE_TYPE_ENGINE_START:
                // Callback: 引擎启动成功回调
                Log.i(SpeechDemoDefines.TAG, "Callback: 引擎启动成功: data: " + stdData);
                speechStart(stdData);
                break;
            case SpeechEngineDefines.MESSAGE_TYPE_ENGINE_STOP:
                // Callback: 引擎关闭回调
                Log.i(SpeechDemoDefines.TAG, "Callback: 引擎关闭: data: " + stdData);
                speechStop(stdData);
                break;
            case SpeechEngineDefines.MESSAGE_TYPE_ENGINE_ERROR:
                // Callback: 错误信息回调
                Log.e(SpeechDemoDefines.TAG, "Callback: 错误信息: " + stdData);
                speechError(stdData);
                break;
            case SpeechEngineDefines.MESSAGE_TYPE_EVENT_TTS_SENTENCE_START:
                // Callback: 合成开始回调
                Log.e(SpeechDemoDefines.TAG, "Callback: TTS_SENTENCE_START: " + stdData);
                speechStartSynthesis(stdData);
                break;
            case SpeechEngineDefines.MESSAGE_TYPE_EVENT_TTS_SENTENCE_END:
                // Callback: 合成结束回调
                Log.e(SpeechDemoDefines.TAG, "Callback: TTS_SENTENCE_END: " + stdData);
                speechFinishSynthesis(stdData);
                break;
            case SpeechEngineDefines.MESSAGE_TYPE_EVENT_TTS_RESPONSE:
                Log.e(SpeechDemoDefines.TAG, "Callback: TTS_RESPONSE: data len " + stdData.length());
                break;
            case SpeechEngineDefines.MESSAGE_TYPE_EVENT_TTS_ENDED:
                Log.e(SpeechDemoDefines.TAG, "Callback: TTSEnded: " + stdData);
                break;
            case SpeechEngineDefines.MESSAGE_TYPE_PLAYER_AUDIO_DATA:
                break;
            case SpeechEngineDefines.MESSAGE_TYPE_PLAYER_START_PLAY_AUDIO:
                // Callback: 播放开始回调
                Log.e(SpeechDemoDefines.TAG, "Callback: 播放开始: " + stdData);
                speechStartPlaying(stdData);
                break;
            case SpeechEngineDefines.MESSAGE_TYPE_PLAYER_FINISH_PLAY_AUDIO:
                // Callback: 播放结束回调
                Log.e(SpeechDemoDefines.TAG, "Callback: 播放结束: " + stdData);
                speechFinishPlaying(stdData);
                break;
            default:
                break;
        }
    }

    public void speechEnginInitSucceeded(long initCost) {
        Log.i(SpeechDemoDefines.TAG, "引擎初始化成功!");
        this.runOnUiThread(() -> {
            mEngineStatus.setText(R.string.hint_ready);
            setResultText("Cost: " + initCost + "ms");
            mEngineSwitch.setText(R.string.uninit_engine_title);
            setButton(mEngineSwitch, true);
            setButton(mStartBtn, true);
            mEngineInited = true;
        });
    }

    public void speechEngineInitFailed(String tipText) {
        Log.e(SpeechDemoDefines.TAG, "引擎初始化失败: " + tipText);
        this.runOnUiThread(() -> {
            setResultText(tipText);
            mEngineStatus.setText(R.string.hint_setup_failure);
            setButton(mEngineSwitch, true);
            mEngineInited = false;
        });
    }

    private void sendStartEngineDirectiveFailed(String tipText) {
        Log.e(SpeechDemoDefines.TAG, tipText);
        this.runOnUiThread(() -> {
            setResultText(tipText);
            mEngineStarted = false;
        });
    }

    private void sendSynthesisDirectiveFailed(String tipText) {
        Log.e(SpeechDemoDefines.TAG, tipText);
        this.runOnUiThread(() -> {
            setResultText(tipText);
            mSpeechEngine.sendDirective(SpeechEngineDefines.DIRECTIVE_STOP_ENGINE, "");
        });
    }

    public void speechStart(final String data) {
        mEngineStarted = true;
        mRetryCount = TTS_MAX_RETRY_COUNT;
        this.runOnUiThread(() -> {
            mEngineStatus.setText(R.string.hint_start_cb);
            setButton(mStartBtn, false);
            setButton(mStopBtn, true);
            setButton(mSynthesisBtn, true);
        });
    }

    public void speechStop(final String data) {
        mEngineStarted = false;
        this.runOnUiThread(() -> {
            mEngineStatus.setText(R.string.hint_stop_cb);
            mPauseResumeBtn.setText("Pause");
            setButton(mStopBtn, false);
            setButton(mStartBtn, true);
            setButton(mSynthesisBtn, false);
            setButton(mPauseResumeBtn, false);
            mPlayerPaused = false;
        });

        // Abandon audio focus when playback complete
        mAudioManager.abandonAudioFocus(mAFChangeListener);
        mPlaybackNowAuthorized = false;
    }

    public void speechError(final String data) {
        this.runOnUiThread(() -> {
            boolean needStop = false;
            try {
                JSONObject reader = new JSONObject(data);
                if (!reader.has("err_code") || !reader.has("err_msg")) {
                    return;
                }
                int code = reader.getInt("err_code");
                switch (code) {
                    case SpeechEngineDefines.CODE_TTS_LIMIT_QPS:
                    case SpeechEngineDefines.CODE_TTS_LIMIT_COUNT:
                    case SpeechEngineDefines.CODE_TTS_SERVER_BUSY:
                    case SpeechEngineDefines.CODE_TTS_LONG_TEXT:
                    case SpeechEngineDefines.CODE_TTS_INVALID_TEXT:
                    case SpeechEngineDefines.CODE_TTS_SYNTHESIS_TIMEOUT:
                    case SpeechEngineDefines.CODE_TTS_SYNTHESIS_ERROR:
                    case SpeechEngineDefines.CODE_TTS_SYNTHESIS_WAITING_TIMEOUT:
                    case SpeechEngineDefines.CODE_TTS_ERROR_UNKNOWN:
                        Log.w(SpeechDemoDefines.TAG, "When meeting this kind of error, continue to synthesize.");
                        synthesisNextSentence();
                        break;
                    case SpeechEngineDefines.CODE_CONNECT_TIMEOUT:
                    case SpeechEngineDefines.CODE_RECEIVE_TIMEOUT:
                    case SpeechEngineDefines.CODE_NET_LIB_ERROR:
                        // 遇到网络错误时建议重试，重试次数不超过 3 次
                        needStop = !retrySynthesis();
                        if (needStop) {
                            mEngineErrorOccurred = true;
                        }
                        break;
                    default:
                        mEngineErrorOccurred = true;
                        setResultText(data);
                        needStop = true;
                        break;
                }
            } catch (JSONException e) {
                e.printStackTrace();
                needStop = true;
            }
            if (needStop) {
                mSpeechEngine.sendDirective(SpeechEngineDefines.DIRECTIVE_STOP_ENGINE, "");
            }
        });
    }

    public void speechStartSynthesis(final String data) {
        this.runOnUiThread(() -> {
            if (mSynthesisBtn.isEnabled()) {
                setButton(mSynthesisBtn, false);
            }
        });
    }

    public void speechFinishSynthesis(final String data) {
        if (mRetryCount < TTS_MAX_RETRY_COUNT) {
            mRetryCount = TTS_MAX_RETRY_COUNT;
        }
        this.runOnUiThread(() -> {
            setButton(mSynthesisBtn, true);
        });
    }

    public void speechStartPlaying(final String data) {
        this.runOnUiThread(() -> {
            setButton(mPauseResumeBtn, true);
        });
    }
    public void speechFinishPlaying(final String data) {
        this.runOnUiThread(() -> {
            setResultText("playing cur sentence finished");
            triggerSynthesis();
        });
    }

    private boolean retrySynthesis() {
        boolean ret = false;
        if (mEngineStarted && mRetryCount > 0) {
            ConnectivityManager conMgr = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            if (conMgr.getNetworkInfo(ConnectivityManager.TYPE_MOBILE).getState() == NetworkInfo.State.CONNECTED
                    || conMgr.getNetworkInfo(ConnectivityManager.TYPE_WIFI).getState() == NetworkInfo.State.CONNECTED) {
                Log.w(SpeechDemoDefines.TAG, "Retry synthesis for text: " + mTtsSynthesisText.get(mTtsSynthesisIndex));
                mHandler.postDelayed(new Runnable() {
                    @Override
                    public void run() {
                        triggerSynthesis();
                    }
                }, 1000);
                mRetryCount -= 1;
                ret = true;
            }
        }
        return ret;
    }

    private void synthesisNextSentence() {
        if (mEngineStarted) {
            mTtsSynthesisIndex = (1 + mTtsSynthesisIndex) % mTtsSynthesisText.size();
            triggerSynthesis();
        }
    }

    private void triggerSynthesis() {
        String text = getSynthesisText();
        if(text == null){
            return;
        }

        Log.i(SpeechDemoDefines.TAG, "触发合成");
        Log.i(SpeechDemoDefines.TAG, "Directive: DIRECTIVE_EventTaskRequest");
        int ret = 0;
        ret = mSpeechEngine.sendDirective(SpeechEngineDefines.DIRECTIVE_EVENT_START_SESSION,"");
        if(ret!=0){
            Log.e(SpeechDemoDefines.TAG, "发送StartSession failed: " + ret);
            String message = "发送StartSession指令失败, " + ret;
            sendSynthesisDirectiveFailed(message);
        }
        String result = "{\"req_params\":{\"text\":\"" + text + "\"}}";
        ret = mSpeechEngine.sendDirective(SpeechEngineDefines.DIRECTIVE_EVENT_TASK_REQUEST, result);
        if (ret != 0) {
            Log.e(SpeechDemoDefines.TAG, "Synthesis faile: " + ret);
            String message = "发送合成指令失败, " + ret;
            sendSynthesisDirectiveFailed(message);
        }
        setResultText(text);
        ret = mSpeechEngine.sendDirective(SpeechEngineDefines.DIRECTIVE_EVENT_FINISH_SESSION, "");
        if(ret!=0){
            Log.e(SpeechDemoDefines.TAG, "发送FinishSession failed: " + ret);
            String message = "发送FinishSession指令失败, " + ret;
            sendSynthesisDirectiveFailed(message);
        }
    }

    private void AddSentence(final String text) {
        String tmp = text.trim();
        if (!tmp.isEmpty()) {
            mTtsSynthesisText.add(tmp);
        }
    }

    private void resetTtsContext() {
        mTtsSynthesisIndex = 0;
        if (mTtsSynthesisText != null) {
            mTtsSynthesisText.clear();
        } else {
            mTtsSynthesisText = new ArrayList<>();
        }
    }

    private boolean prepareTextList() {
        resetTtsContext();

        String ttsText = mReferText.getText().toString();
        if (ttsText.isEmpty()) {
            ttsText= "愿中国青年都摆脱冷气，只是向上走，不必听自暴自弃者流的话。能做事的做事，能发声的发声。有一分热，发一分光。就令萤火一般，也可以在黑暗里发一点光，不必等候炬火。此后如竟没有炬火：我便是唯一的光。";
        }
        //【必需配置】需合成的文本，不可超过 80 字
        if (mTtsSynthesisText == null || mTtsSynthesisText.isEmpty()) {
            // 使用下面几个标点符号来分句，会让通过 MESSAGE_TYPE_TTS_PLAYBACK_PROGRESS 返回的播放进度更加准确
            String[] tmp = ttsText.split("(?<=[;!?。！？；…])");
            for (int j = 0; j < tmp.length; ++j) {
                AddSentence(tmp[j]);
            }
        }
        Log.d(SpeechDemoDefines.TAG, "Synthesis text item num: " + mTtsSynthesisText.size());
        return !mTtsSynthesisText.isEmpty();
    }

    public void AcquireAudioFocus() {
        // 向系统请求 Audio Focus 并记录返回结果
        int res = mAudioManager.requestAudioFocus(mAFChangeListener, AudioManager.STREAM_MUSIC,
                AudioManager.AUDIOFOCUS_GAIN);
        if (res == AudioManager.AUDIOFOCUS_REQUEST_FAILED) {
            mPlaybackNowAuthorized = false;
        } else if (res == AudioManager.AUDIOFOCUS_REQUEST_GRANTED) {
            mPlaybackNowAuthorized = true;
        }
    }

    public void setResultText(final Spanned text) {
        mResult.setText(text);
    }

    public void setResultText(final String text) {
        mResult.append("\n" + text);
        mResult.post(new Runnable() {
            @Override
            public void run() {
                int scrollAmount = mResult.getLayout().getLineTop(mResult.getLineCount()) - mResult.getHeight();
                mResult.scrollTo(0, Math.max(scrollAmount, 0));
            }
        });

    }

    public void clearResultText() {
        this.runOnUiThread(() -> mResult.setText(""));
    }

}
