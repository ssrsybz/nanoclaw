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
import android.text.Spannable;
import android.text.SpannableString;
import android.text.Spanned;
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

public class TtsNovelActivity extends BaseActivity implements SpeechEngine.SpeechListener, LifecycleObserver {

    private final String[] mTtsTextTypeArray = {
            SpeechEngineDefines.TTS_TEXT_TYPE_PLAIN,
            SpeechEngineDefines.TTS_TEXT_TYPE_SSML,
    };
    private final int[] mTtsWorkModeArray = {
            SpeechEngineDefines.TTS_WORK_MODE_ONLINE,
            SpeechEngineDefines.TTS_WORK_MODE_OFFLINE,
            SpeechEngineDefines.TTS_WORK_MODE_ALTERNATE,
            SpeechEngineDefines.TTS_WORK_MODE_FILE,
    };
    private final String[] mAuthenticationTypeArray = {
            SpeechEngineDefines.AUTHENTICATE_TYPE_PRE_BIND,
            SpeechEngineDefines.AUTHENTICATE_TYPE_LATE_BIND
    };

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

    // Engine State
    private boolean mEngineInited = false;
    private boolean mEngineStarted = false;
    private boolean mEngineErrorOccurred = false;
    private boolean mPlayerPaused = false;

    // Paths
    private String mDebugPath = "";

    // Offline Resource Manager
    private SpeechResourceManager mResourceManager = null;

    // Options Default Value
    private String mCurAppId = SensitiveDefines.APPID;
    private String mCurVoiceOnline = SensitiveDefines.TTS_DEFAULT_ONLINE_VOICE;
    private String mCurVoiceOffline = SensitiveDefines.TTS_DEFAULT_OFFLINE_VOICE;
    private String mCurVoiceTypeOnline = SensitiveDefines.TTS_DEFAULT_ONLINE_VOICE_TYPE;
    private String mCurVoiceTypeOffline = SensitiveDefines.TTS_DEFAULT_OFFLINE_VOICE_TYPE;
    private int mCurTtsWorkMode = SpeechEngineDefines.TTS_WORK_MODE_ONLINE;
    private int mTtsSilenceDuration = 0;
    private Double mTtsSpeakSpeed = 1.0;
    private Double mTtsAudioVolume = 1.0;
    private Double mTtsAudioPitch = 1.0;

    // Novel Scenario Related
    private boolean mTtsSynthesisFromPlayer = false;
    private double mTtsPlayingProgress = 0.0;
    private Integer mTtsPlayingIndex = -1;
    private Integer mTtsSynthesisIndex = 0;
    private List<String> mTtsSynthesisText;
    private Map<String, Integer> mTtsSynthesisMap;

    // Android Audio Manager
    private AudioManager.OnAudioFocusChangeListener mAFChangeListener = null;
    private AudioManager mAudioManager = null;
    private boolean mResumeOnFocusGain = true;
    private boolean mPlaybackNowAuthorized = false;

    private static int TTS_MAX_RETRY_COUNT = 3;
    private int mRetryCount = TTS_MAX_RETRY_COUNT;
    private Handler mHandler = null;

    // State shared between Init Engine and Start Engine
    private Boolean mDisablePlayerReuse = false;

    @OnLifecycleEvent(Lifecycle.Event.ON_STOP)
    public void onAppBackgrounded() {
        // App in background
        Log.i(SpeechDemoDefines.TAG, "Application becomming background.");
    }

    @SuppressLint({"ClickableViewAccessibility", "InflateParams", "HardwareIds"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        Log.i(SpeechDemoDefines.TAG, "Tts onCreate");
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_novel_tts);
        ProcessLifecycleOwner.get().getLifecycle().addObserver(this);

        setTitleBar(R.string.tts_multi_name);
        String viewId = SpeechDemoDefines.TTS_VIEW;
        mSettings = SettingsActivity.getSettings(viewId);

        mReferText = findViewById(R.id.refer_text);
        mReferText.setEnabled(true);

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
                SpeechEngineDefines.TTS_ENGINE);

        //【必需配置】Work Mode, 可选值如下
        // SpeechEngineDefines.TTS_WORK_MODE_ONLINE, 只进行在线合成，不需要配置离线合成相关参数；
        // SpeechEngineDefines.TTS_WORK_MODE_OFFLINE, 只进行离线合成，不需要配置在线合成相关参数；
        // SpeechEngineDefines.TTS_WORK_MODE_ALTERNATE, 先发起在线合成，失败后（网络超时），启动离线合成引擎开始合成；
        mSpeechEngine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_TTS_WORK_MODE_INT, mCurTtsWorkMode);

        //【可选配置】Debug & Log
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_DEBUG_PATH_STRING, mDebugPath);
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_LOG_LEVEL_STRING, SpeechEngineDefines.LOG_LEVEL_DEBUG);

        //【可选配置】User ID（用以辅助定位线上用户问题）
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_UID_STRING, SensitiveDefines.UID);
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_DEVICE_ID_STRING, SensitiveDefines.DID);

        //【可选配置】是否将合成出的音频保存到设备上，为 true 时需要正确配置 PARAMS_KEY_TTS_AUDIO_PATH_STRING 才会生效
        mSpeechEngine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_TTS_ENABLE_DUMP_BOOL,
                mSettings.getBoolean(R.string.config_tts_dump));
        // TTS 音频文件保存目录，必须在合成之前创建好且 APP 具有访问权限，保存的音频文件名格式为 tts_{reqid}.wav, {reqid} 是本次合成的请求 id
        // PARAMS_KEY_TTS_ENABLE_DUMP_BOOL 配置为 true 的音频时为【必需配置】，否则为【可选配置】
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_TTS_AUDIO_PATH_STRING, mDebugPath);

        mDisablePlayerReuse = mSettings.getBoolean(R.string.config_disable_player_reuse);
        //【可选配置】是否禁止播放器对象的复用，如果禁用则每次 Start Engine 都会重新创建播放器对象
        mSpeechEngine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_PLAYER_DISABLE_REUSE_BOOL, mDisablePlayerReuse);
        //【可选配置】用于控制 SDK 播放器所用的音源,默认为媒体音源
        // 如果不禁用播放器的复用，必须在 SDK 初始化之前配置音源，其他时机配置无法生效
        mSpeechEngine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_AUDIO_STREAM_TYPE_INT,
                mSettings.getInt(R.string.config_player_stream_type));

        //【可选配置】合成出的音频的采样率，默认为 24000
        mSpeechEngine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_TTS_SAMPLE_RATE_INT,
                mSettings.getInt(R.string.config_tts_sample_rate));
        //【可选配置】打断播放时使用多长时间淡出停止，单位：毫秒。默认值 0 表示不淡出
        mSpeechEngine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_AUDIO_FADEOUT_DURATION_INT,
                mSettings.getInt(R.string.config_audio_fadeout_duration));

        // ------------------------ 在线合成相关配置 -----------------------

        mCurAppId = mSettings.getString(R.string.config_app_id);
        if (mCurAppId.isEmpty()) {
            mCurAppId = SensitiveDefines.APPID;
        }
        //【必需配置】在线合成鉴权相关：Appid
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_APP_ID_STRING, mCurAppId);

        String token = mSettings.getString(R.string.config_token);
        if (token.isEmpty()) {
            token = SensitiveDefines.TOKEN;
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
            uri = SensitiveDefines.TTS_DEFAULT_URI;
        }
        Log.i(SpeechDemoDefines.TAG, "Current uri: " + uri);
        //【必需配置】语音合成服务Uri
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_TTS_URI_STRING, uri);

        //【可选配置】是否允许在 websocket 建连失败时自动重连
        mSpeechEngine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_ENABLE_WS_RECONNECT_BOOL, !mSettings.getBoolean(R.string.disable_ws_reconnect));

        //【可选配置】在线合成下发的 opus-ogg 音频的压缩倍率
        mSpeechEngine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_TTS_COMPRESSION_RATE_INT, 10);


        // ------------------------ 离线合成相关配置 -----------------------

        if (mCurTtsWorkMode != SpeechEngineDefines.TTS_WORK_MODE_ONLINE && mCurTtsWorkMode != SpeechEngineDefines.TTS_WORK_MODE_FILE) {
            String ttsResourcePath = "";
            if (mResourceManager != null && mSettings.getOptionsValue(R.string.tts_offline_resource_format_title, this).equals("MultipleVoice")) {
                ttsResourcePath = mResourceManager.getResourcePath(mSettings.getString(R.string.config_tts_model_name));
            } else if (mSettings.getOptionsValue(R.string.tts_offline_resource_format_title, this).equals("SingleVoice")) {
                ttsResourcePath = mResourceManager.getResourcePath();
            }
            Log.d(SpeechDemoDefines.TAG, "tts resource root path:" + ttsResourcePath);
            //【必需配置】离线合成所需资源存放路径
            mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_TTS_OFFLINE_RESOURCE_PATH_STRING,
                    ttsResourcePath);
        }

        //【必需配置】离线合成鉴权相关：证书文件存放路径
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_LICENSE_DIRECTORY_STRING, mDebugPath);
        String curAuthenticateType = mAuthenticationTypeArray[mSettings
                .getOptions(R.string.config_authenticate_type).chooseIdx];
        //【必需配置】Authenticate Type
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_AUTHENTICATE_TYPE_STRING, curAuthenticateType);
        if (curAuthenticateType.equals(SpeechEngineDefines.AUTHENTICATE_TYPE_PRE_BIND)) {
            // 按包名授权，获取到授权的 APP 可以不限次数、不限设备数的使用离线合成
            String ttsLicenseName = mSettings.getString(R.string.config_license_name);
            String ttsLicenseBusiId = mSettings.getString(R.string.config_license_busi_id);
            // 证书名和业务 ID, 离线合成鉴权相关，使用火山提供的证书下发服务时为【必需配置】, 否则为【无需配置】
            // 证书名，用于下载按报名授权的证书文件
            mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_LICENSE_NAME_STRING, ttsLicenseName);
            // 业务 ID, 用于下载按报名授权的证书文件
            mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_LICENSE_BUSI_ID_STRING, ttsLicenseBusiId);
        } else if (curAuthenticateType.equals(SpeechEngineDefines.AUTHENTICATE_TYPE_LATE_BIND)) {
            // 按装机量授权，不限制 APP 的包名和使用次数，但是限制使用离线合成的设备数量
            //【必需配置】离线合成鉴权相关：Authenticate Address
            mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_AUTHENTICATE_ADDRESS_STRING,
                    SensitiveDefines.AUTHENTICATE_ADDRESS);
            //【必需配置】离线合成鉴权相关：Authenticate Uri
            mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_AUTHENTICATE_URI_STRING,
                    SensitiveDefines.AUTHENTICATE_URI);
            String businessKey = mSettings.getString(R.string.config_business_key);
            String authenticateSecret = mSettings.getString(R.string.config_authenticate_secret);
            //【必需配置】离线合成鉴权相关：Business Key
            mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_BUSINESS_KEY_STRING, businessKey);
            //【必需配置】离线合成鉴权相关：Authenticate Secret
            mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_AUTHENTICATE_SECRET_STRING,
                    authenticateSecret);
        }
    }

    private void configStartTtsParams() {
        //【必需配置】TTS 使用场景
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_TTS_SCENARIO_STRING, SpeechEngineDefines.TTS_SCENARIO_TYPE_NOVEL);

        // 准备待合成的文本
        if(!prepareTextList()) {
            speechError("{err_code:3006, err_msg:\"Invalid input text.\"}");
            return;
        }

        if(mDisablePlayerReuse) {
            //【可选配置】用于控制 SDK 播放器所用的音源,默认为媒体音源
            // 只有禁用了播放器的复用，在 Start Engine 前配置音源才是生效的
            mSpeechEngine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_AUDIO_STREAM_TYPE_INT,
                    mSettings.getInt(R.string.config_player_stream_type));
        }
        //【可选配置】是否使用 SDK 内置播放器播放合成出的音频，默认为 true
        mSpeechEngine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_TTS_ENABLE_PLAYER_BOOL,
                mSettings.getBoolean(R.string.config_sdk_player));
        //【可选配置】是否令 SDK 通过回调返回合成的音频数据，默认不返回。
        // 开启后，SDK 会流式返回音频，收到 MESSAGE_TYPE_TTS_AUDIO_DATA_END 回调表示当次合成所有的音频已经全部返回
        mSpeechEngine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_TTS_DATA_CALLBACK_MODE_INT,
                mSettings.getBoolean(R.string.config_tts_data_callback) ? 2 : 0);
    }

    private void configSynthesisParams() {
        //【可选配置】需合成的文本的类型，支持直接传文本(TTS_TEXT_TYPE_PLAIN)和传 SSML 形式(TTS_TEXT_TYPE_SSML)的文本
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_TTS_TEXT_TYPE_STRING,
                mTtsTextTypeArray[mSettings.getOptions(R.string.tts_text_type_title).chooseIdx]);
        String text = mTtsSynthesisText.get(mTtsSynthesisIndex);
        Log.e(SpeechDemoDefines.TAG, "Synthesis Text: " + text);
        //【必需配置】需合成的文本，不可超过 80 字
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_TTS_TEXT_STRING, text);
        mTtsSpeakSpeed = mSettings.getDouble(R.string.config_tts_speak_speed);
        //【可选配置】用于控制 TTS 音频的语速，支持的配置范围参考火山官网 语音技术/语音合成/离在线语音合成SDK/参数说明 文档
        mSpeechEngine.setOptionDouble(SpeechEngineDefines.PARAMS_KEY_TTS_SPEED_RATIO_DOUBLE, mTtsSpeakSpeed);
        mTtsAudioVolume = mSettings.getDouble(R.string.config_tts_audio_volume);
        //【可选配置】用于控制 TTS 音频的音量，支持的配置范围参考火山官网 语音技术/语音合成/离在线语音合成SDK/参数说明 文档
        mSpeechEngine.setOptionDouble(SpeechEngineDefines.PARAMS_KEY_TTS_VOLUME_RATIO_DOUBLE, mTtsAudioVolume);
        mTtsAudioPitch = mSettings.getDouble(R.string.config_tts_audio_pitch);
        //【可选配置】用于控制 TTS 音频的音高，支持的配置范围参考火山官网 语音技术/语音合成/离在线语音合成SDK/参数说明 文档
        mSpeechEngine.setOptionDouble(SpeechEngineDefines.PARAMS_KEY_TTS_PITCH_RATIO_DOUBLE, mTtsAudioPitch);
        mTtsSilenceDuration = mSettings.getInt(R.string.config_tts_silence_duration);
        //【可选配置】是否在文本的每句结尾处添加静音段，单位：毫秒，默认为 0ms
        mSpeechEngine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_TTS_SILENCE_DURATION_INT, mTtsSilenceDuration);

        // ------------------------ 在线合成相关配置 -----------------------

        String cluster = mSettings.getString(R.string.config_cluster);
        if (cluster.isEmpty()) {
            cluster = SensitiveDefines.TTS_DEFAULT_CLUSTER;
        }
        Log.i(SpeechDemoDefines.TAG, "Current cluster: " + cluster);
        //【必需配置】语音合成服务所用集群
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_TTS_CLUSTER_STRING, cluster);

        String curVoiceOnline = mSettings.getString(R.string.config_voice_online);
        if (curVoiceOnline.isEmpty()) {
            curVoiceOnline = mSettings.getOptionsValue(R.string.config_voice_online);
        }
        mCurVoiceOnline = curVoiceOnline;
        Log.d(SpeechDemoDefines.TAG, "Current online voice: " + mCurVoiceOnline);
        //【必需配置】在线合成使用的发音人代号
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_TTS_VOICE_ONLINE_STRING, mCurVoiceOnline);
        String curVoiceTypeOnline = mSettings.getString(R.string.config_voice_type_online);
        if (curVoiceTypeOnline.isEmpty()) {
            curVoiceTypeOnline = mSettings.getOptionsValue(R.string.config_voice_type_online);
        }
        mCurVoiceTypeOnline = curVoiceTypeOnline;
        Log.d(SpeechDemoDefines.TAG, "Current online voice type: " + mCurVoiceTypeOnline);
        //【必需配置】在线合成使用的音色代号
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_TTS_VOICE_TYPE_ONLINE_STRING,
                mCurVoiceTypeOnline);

        //【可选配置】是否打开在线合成的服务端缓存，默认关闭
        mSpeechEngine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_TTS_ENABLE_CACHE_BOOL,
                mSettings.getBoolean(R.string.enable_cache));
        //【可选配置】指定在线合成的语种，默认为空，即不指定
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_TTS_LANGUAGE_ONLINE_STRING, mSettings.getString(R.string.config_tts_language_online));
        //【可选配置】是否启用在线合成的情感预测功能
        mSpeechEngine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_TTS_WITH_INTENT_BOOL,
                mSettings.getBoolean(R.string.config_tts_with_intent));
        //【可选配置】指定在线合成的情感，例如 happy, sad 等
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_TTS_EMOTION_STRING, mSettings.getString(R.string.config_tts_emotion));
        //【可选配置】需要返回详细的播放进度或需要启用断点续播功能时应配置为 1, 否则配置为 0 或不配置
        mSpeechEngine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_TTS_WITH_FRONTEND_INT, 1);
        //【可选配置】需要返回字粒度的播放进度时应配置为 simple, 同时要求 PARAMS_KEY_TTS_WITH_FRONTEND_INT 也配置为 1; 默认为空
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_TTS_FRONTEND_TYPE_STRING, mSettings.getBoolean(R.string.config_tts_enable_word_level_progress_update) ? "simple" : "");
        //【可选配置】使用复刻音色
        mSpeechEngine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_TTS_USE_VOICECLONE_BOOL, mSettings.getBoolean(R.string.config_tts_use_voiceclone));
        //【可选配置】在开启前述使用复刻音色的开关后，制定复刻音色所用的后端集群
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_TTS_BACKEND_CLUSTER_STRING, mSettings.getString(R.string.config_backend_cluster));

        //【可选配置】在线合成的请求参数，JSON 格式。当服务端新增参数但是 SDK 还未新增对应的配置项时，开发者可自行构造请求参数由此传入
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_TTS_REQ_PARAMS_STRING, mSettings.getString(R.string.config_tts_request_params));

        // ------------------------ 离线合成相关配置 -----------------------

        String curVoiceOffline = mSettings.getString(R.string.config_voice_offline);
        if (curVoiceOffline.isEmpty()) {
            curVoiceOffline = mSettings.getOptionsValue(R.string.config_voice_offline);
        }
        mCurVoiceOffline = curVoiceOffline;
        Log.d(SpeechDemoDefines.TAG, "Current offline voice: " + mCurVoiceOffline);
        //【必需配置】离线合成使用的发音人代号
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_TTS_VOICE_OFFLINE_STRING,
                mCurVoiceOffline);
        String curVoiceTypeOffline = mSettings.getString(R.string.config_voice_type_offline);
        if (curVoiceTypeOffline.isEmpty()) {
            curVoiceTypeOffline = mSettings.getOptionsValue(R.string.config_voice_type_offline);
        }
        mCurVoiceTypeOffline = curVoiceTypeOffline;
        Log.d(SpeechDemoDefines.TAG, "Current offline voice type: " + mCurVoiceTypeOffline);
        //【必需配置】离线合成使用的音色代号
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_TTS_VOICE_TYPE_OFFLINE_STRING,
                mCurVoiceTypeOffline);

        //【可选配置】是否降低离线合成的 CPU 利用率，默认关闭
        // 打开该配置会使离线合成的实时率变大，仅当必要（例如为避免系统主动杀死CPU占用持续过高的进程）时才应开启
        mSpeechEngine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_TTS_LIMIT_CPU_USAGE_BOOL,
                mSettings.getBoolean(R.string.tts_limit_cpu_usage));
    }

    private void initEngine() {
        mCurTtsWorkMode = mTtsWorkModeArray[mSettings.getOptions(R.string.tts_work_mode_title).chooseIdx];
        Log.i(SpeechDemoDefines.TAG, "调用初始化接口前的语音合成工作模式为 " + mCurTtsWorkMode);
        if (mCurTtsWorkMode == SpeechEngineDefines.TTS_WORK_MODE_ONLINE || mCurTtsWorkMode == SpeechEngineDefines.TTS_WORK_MODE_FILE) {
            // 当使用纯在线模式时，不需要下载离线合成所需资源
            initEngineInternal();
        } else {
            try {
                if (mResourceManager == null) {
                    mResourceManager = SpeechResourceManagerGenerator.getInstance();
                }
            } catch (RuntimeException e) {
                speechEngineInitFailed(e.getMessage());
                return;
            }
            // 下载离线合成所需资源需要区分多音色资源和单音色资源，下载这两种资源所调用的方法略有不同
            if (mSettings.getOptionsValue(R.string.tts_offline_resource_format_title, this).equals("MultipleVoice")) {
                // 多音色资源是指一个资源文件中包含了多个离线音色，这种资源一般是旧版(V2)离线合成所用资源
                Log.i(SpeechDemoDefines.TAG, "当前所用资源类别为多音色资源，开始准备多音色资源");
                prepareMultipleVoiceResource();
            } else if (mSettings.getOptionsValue(R.string.tts_offline_resource_format_title, this).equals("SingleVoice")) {
                // 单音色资源是指一个资源文件仅包含一个离线音色，新版(V4 及以上)离线合成用的就是单音色资源
                Log.i(SpeechDemoDefines.TAG, "当前所用资源类别为单音色资源，开始准备单音色资源");
                prepareSingleVoiceResource();
            }
        }
    }

    private void prepareMultipleVoiceResource() {
        Log.i(SpeechDemoDefines.TAG, "初始化模型资源管理器");
        mResourceManager.initResourceManager(getApplicationContext(), "0", mCurAppId, SensitiveDefines.APP_VERSION, true, mDebugPath);
        // 因为多音色资源的一个文件包含了多个音色，导致资源的名字和音色的名字无法一一对应
        // 所以下载资源需要显式指定资源名字
        String resourceName = mSettings.getString(R.string.config_tts_model_name);
        Log.i(SpeechDemoDefines.TAG, "检查本地是否存在可用资源");
        if (!mResourceManager.checkResourceDownload(resourceName)) {
            Log.i(SpeechDemoDefines.TAG, "本地没有资源，开始下载");
            fetchMultipleVoiceResource(resourceName);
        } else {
            Log.i(SpeechDemoDefines.TAG, "资源存在，检查资源是否需要升级");
            mResourceManager.checkResourceUpdate(resourceName, new SpeechResourceManager.CheckResouceUpdateListener() {
                @Override
                public void onCheckResult(boolean needUpdate) {
                    if (needUpdate) {
                        Log.i(SpeechDemoDefines.TAG, "存在可用升级，开始升级");
                        fetchMultipleVoiceResource(resourceName);
                    } else {
                        Log.i(SpeechDemoDefines.TAG, "不存在可用升级，使用本地已有模型");
                        initEngineInternal();
                    }
                }
            });
        }
    }

    private void fetchMultipleVoiceResource(final String resourceName) {
        Log.i(SpeechDemoDefines.TAG, "需要下载的资源名为: " + resourceName);
        mResourceManager.fetchResourceByName(resourceName,
            new SpeechResourceManager.FetchResourceListener() {
                @Override
                public void onSuccess() {
                    Log.i(SpeechDemoDefines.TAG, "资源下载成功");
                    initEngineInternal();
                }

                @Override
                public void onFailed(String errorMsg) {
                    Log.i(SpeechDemoDefines.TAG, "资源下载失败，错误：" + errorMsg);
                    speechEngineInitFailed("Download tts resource failed.");
                }
            });
    }

    private void prepareSingleVoiceResource() {
        mResourceManager.setAppVersion(SensitiveDefines.APP_VERSION);
        mResourceManager.setAppId(mCurAppId);
        String androidId = android.provider.Settings.Secure.getString(getContentResolver(), android.provider.Settings.Secure.ANDROID_ID);
        Log.i(SpeechDemoDefines.TAG, "Current device android id: " + androidId);
        mResourceManager.setDeviceId(androidId);
        mResourceManager.setUseOnlineModel(true);
        mResourceManager.setEngineName(SpeechEngineDefines.TTS_ENGINE);
        Log.i(SpeechDemoDefines.TAG, "初始化模型资源管理器");
        mResourceManager.initResourceManager(getApplicationContext(), mDebugPath);

        String[] needDownloadVoiceType = SensitiveDefines.TTS_DEFAULT_DOWNLOAD_OFFLINE_VOICES;
        List<String> voiceTypeArray = mSettings.getOptions(R.string.config_voice_type_offline).arrayObj;
        if (voiceTypeArray != null && !voiceTypeArray.isEmpty()) {
            needDownloadVoiceType = voiceTypeArray.toArray(new String[0]);
        }
        Log.d(SpeechDemoDefines.TAG, "离线合成将会使用的音色有： " + Arrays.toString(needDownloadVoiceType));
        mResourceManager.setTtsVoiceType(needDownloadVoiceType);
        String offlineLanguage = mSettings.getString(R.string.config_tts_language_offline);
        if (offlineLanguage.isEmpty()) {
            offlineLanguage = SensitiveDefines.TTS_DEFAULT_OFFLINE_LANGUAGE;
        }
        String[] needDownloadLanauges = new String[]{offlineLanguage};
        Log.d(SpeechDemoDefines.TAG, "需要下载的离线合成语种资源有： " + offlineLanguage);
        mResourceManager.setTtsLanguage(new String[]{offlineLanguage});

        Log.i(SpeechDemoDefines.TAG, "检查本地是否存在可用资源");
        if (!mResourceManager.checkResourceDownload()) {
            Log.i(SpeechDemoDefines.TAG, "本地没有资源，开始下载");
            fetchSingleVoiceResource();
        } else {
            Log.i(SpeechDemoDefines.TAG, "资源存在，检查资源是否需要升级");
            mResourceManager.checkResourceUpdate(new SpeechResourceManager.CheckResouceUpdateListener() {
                @Override
                public void onCheckResult(boolean needUpdate) {
                    if (needUpdate) {
                        Log.i(SpeechDemoDefines.TAG, "存在可用升级，开始升级");
                        fetchSingleVoiceResource();
                    } else {
                        Log.i(SpeechDemoDefines.TAG, "不存在可用升级，使用本地已有模型");
                        initEngineInternal();
                    }
                }
            });
        }
    }

    private void fetchSingleVoiceResource() {
        mResourceManager.fetchResource(new SpeechResourceManager.FetchResourceListener() {
            @Override
            public void onSuccess() {
                Log.i(SpeechDemoDefines.TAG, "资源下载成功");
                initEngineInternal();
            }

            @Override
            public void onFailed(String errorMsg) {
                Log.i(SpeechDemoDefines.TAG, "资源下载失败，错误：" + errorMsg);
                speechEngineInitFailed("Download tts resource failed.");
            }
        });
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
            mReferText.setEnabled(false);
        } else {
            mReferText.setEnabled(false);
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
                ret = mSpeechEngine.sendDirective(SpeechEngineDefines.DIRECTIVE_START_ENGINE, "");
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
            case SpeechEngineDefines.MESSAGE_TYPE_TTS_SYNTHESIS_BEGIN:
                // Callback: 合成开始回调
                Log.e(SpeechDemoDefines.TAG, "Callback: 合成开始: " + stdData);
                speechStartSynthesis(stdData);
                break;
            case SpeechEngineDefines.MESSAGE_TYPE_TTS_SYNTHESIS_END:
                // Callback: 合成结束回调
                Log.e(SpeechDemoDefines.TAG, "Callback: 合成结束: " + stdData);
                speechFinishSynthesis(stdData);
                break;
            case SpeechEngineDefines.MESSAGE_TYPE_TTS_START_PLAYING:
                // Callback: 播放开始回调
                Log.e(SpeechDemoDefines.TAG, "Callback: 播放开始: " + stdData);
                speechStartPlaying(stdData);
                break;
            case SpeechEngineDefines.MESSAGE_TYPE_TTS_PLAYBACK_PROGRESS:
                // Callback: 播放进度回调
                Log.e(SpeechDemoDefines.TAG, "Callback: 播放进度");
                updatePlayingProgress(stdData);
                break;
            case SpeechEngineDefines.MESSAGE_TYPE_TTS_FINISH_PLAYING:
                // Callback: 播放结束回调
                Log.e(SpeechDemoDefines.TAG, "Callback: 播放结束: " + stdData);
                speechFinishPlaying(stdData);
                break;
            case SpeechEngineDefines.MESSAGE_TYPE_TTS_AUDIO_DATA:
                // Callback: 音频数据回调
                Log.e(SpeechDemoDefines.TAG, String.format("Callback: 音频数据，长度 %d 字节", stdData.length()));
                speechTtsAudioData(stdData);
                break;
            default:
                break;
        }
    }

    public void speechEnginInitSucceeded(long initCost) {
        Log.i(SpeechDemoDefines.TAG, "引擎初始化成功!");
        this.runOnUiThread(() -> {
            mEngineStatus.setText(R.string.hint_ready);
            mReferText.setEnabled(true);
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
            mReferText.setEnabled(false);
        });
    }

    public void speechStop(final String data) {
        mEngineStarted = false;
        this.runOnUiThread(() -> {
            mEngineStatus.setText(R.string.hint_stop_cb);
            mPauseResumeBtn.setText("Pause");
            mReferText.setEnabled(true);
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

    // 根据 SDK 返回的播放进度高亮正在播放的文本，用红色表示
    private void updateTtsResultText(String playingId) {
        if (mEngineErrorOccurred) {
            Log.w(SpeechDemoDefines.TAG, "When a fatal error occurs, prevent the playback text from being displayed.");
            return;
        }

        if (mTtsSynthesisMap.containsKey(playingId)) {
            mTtsPlayingIndex = Objects.requireNonNull(mTtsSynthesisMap.get(playingId));
        }

        int maxSentencesDisplayed = Math.min(mTtsSynthesisText.size(), 16);
        int beginIndex = Math.max(mTtsPlayingIndex, 0);
        StringBuilder stringBuilder = new StringBuilder();
        int playingBeginIndex = 0;
        int playingEndIndex = 0;
        for (int cnt = 0; cnt < maxSentencesDisplayed; ++cnt) {
            int index = (beginIndex + cnt) % mTtsSynthesisText.size();
            if (index == mTtsPlayingIndex) {
                playingBeginIndex = stringBuilder.length();
            }
            stringBuilder.append(mTtsSynthesisText.get(index)).append("\n");
            if (index == mTtsPlayingIndex) {
                playingEndIndex = Math.min(
                        (int) (Math.ceil(mTtsSynthesisText.get(index).length() * mTtsPlayingProgress)),
                        mTtsSynthesisText.get(index).length()) + playingBeginIndex;
            }
        }
        Spannable spanText = new SpannableString(stringBuilder.toString());
        spanText.setSpan(new ForegroundColorSpan(Color.RED), playingBeginIndex, playingEndIndex,
                Spannable.SPAN_EXCLUSIVE_EXCLUSIVE);
        setResultText(spanText);
    }

    private void updateSynthesisMap(String synthesisId) {
        if (mTtsSynthesisIndex < mTtsSynthesisText.size()) {
            mTtsSynthesisMap.put(synthesisId, mTtsSynthesisIndex);
        }
    }

    public void speechStartSynthesis(final String data) {
        this.runOnUiThread(() -> {
            updateSynthesisMap(data);
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
            if (!mTtsSynthesisFromPlayer) {
                synthesisNextSentence();
            }
        });
    }

    public void speechStartPlaying(final String data) {
        this.runOnUiThread(() -> {
            setButton(mPauseResumeBtn, true);
            mTtsPlayingProgress = 0.0;
            updateTtsResultText(data);
        });
    }

    public void updatePlayingProgress(final String data) {
        try {
            JSONObject reader = new JSONObject(data);
            if (!reader.has("reqid") || !reader.has("progress")) {
                Log.w(SpeechDemoDefines.TAG, "Can't find necessary field in progress callback. ");
                return;
            }
            double percentage = reader.getDouble("progress");
            String reqid = reader.getString("reqid");
            Log.d(SpeechDemoDefines.TAG, "playing id: " + reqid + ", progress in percent: " + percentage);
            this.runOnUiThread(() -> {
                mTtsPlayingProgress = percentage;
                updateTtsResultText(reqid);
            });
        } catch (JSONException e) {
            e.printStackTrace();
        }
    }

    public void speechFinishPlaying(final String data) {
        this.runOnUiThread(() -> {
            mTtsPlayingProgress = 1.0;
            updateTtsResultText(data);
            if (!mSettings.getBoolean(R.string.config_dump_novel_tts_detail)) {
                mTtsSynthesisMap.remove(data);
            }
            if (mTtsSynthesisFromPlayer) {
                triggerSynthesis();
                mTtsSynthesisFromPlayer = false;
            }
        });
    }

    private void speechTtsAudioData(final String data) {
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
        configSynthesisParams();
        // DIRECTIVE_SYNTHESIS 是连续合成必需的一个指令，在成功调用 DIRECTIVE_START_ENGINE 之后，每次合成新的文本需要再调用 DIRECTIVE_SYNTHESIS 指令
        // DIRECTIVE_SYNTHESIS 需要在当前没有正在合成的文本时才可以成功调用，否则就会报错 -901，可以在收到 MESSAGE_TYPE_TTS_SYNTHESIS_END 之后调用
        // 当使用 SDK 内置的播放器时，为了避免缓存过多的音频导致内存占用过高，SDK 内部限制缓存的音频数量不超过 5 次合成的结果，
        // 如果 DIRECTIVE_SYNTHESIS 后返回 -902, 就需要在下一次收到 MESSAGE_TYPE_TTS_FINISH_PLAYING 再去调用 MESSAGE_TYPE_TTS_FINISH_PLAYING
        Log.i(SpeechDemoDefines.TAG, "触发合成");
        Log.i(SpeechDemoDefines.TAG, "Directive: DIRECTIVE_SYNTHESIS");
        int ret = mSpeechEngine.sendDirective(SpeechEngineDefines.DIRECTIVE_SYNTHESIS, "");
        if (ret != 0) {
            Log.e(SpeechDemoDefines.TAG, "Synthesis faile: " + ret);
            if (ret == SpeechEngineDefines.ERR_SYNTHESIS_PLAYER_IS_BUSY) {
                mTtsSynthesisFromPlayer = true;
            } else {
                String message = "发送合成指令失败, " + ret;
                sendSynthesisDirectiveFailed(message);
            }
        }
    }

    private void AddSentence(final String text) {
        String tmp = text.trim();
        if (!tmp.isEmpty()) {
            mTtsSynthesisText.add(tmp);
        }
    }

    private void resetTtsContext() {
        mTtsPlayingIndex = -1;
        mTtsSynthesisIndex = 0;
        mTtsSynthesisFromPlayer = false;
        if (mTtsSynthesisText != null) {
            mTtsSynthesisText.clear();
        } else {
            mTtsSynthesisText = new ArrayList<>();
        }
        if (mTtsSynthesisMap != null) {
            mTtsSynthesisMap.clear();
        } else {
            mTtsSynthesisMap = new HashMap<>();
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
            String[] tmp = ttsText.split("[;|!|?|。|！|？|；|…]");
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
        mResult.setText("");
        mResult.append("\n" + text);
    }

    public void clearResultText() {
        this.runOnUiThread(() -> mResult.setText(""));
    }

}
