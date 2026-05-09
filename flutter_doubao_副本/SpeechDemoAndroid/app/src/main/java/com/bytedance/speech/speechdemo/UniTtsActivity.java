// Copyright 2020 Bytedance Inc. All Rights Reserved.
// Author: Bytedance, Inc.

package com.bytedance.speech.speechdemo;

import android.annotation.SuppressLint;
import android.content.Context;
import android.content.Intent;
import android.media.AudioManager;
import android.os.Bundle;
import android.text.method.ScrollingMovementMethod;
import android.util.Log;
import android.widget.Button;
import android.widget.EditText;
import android.widget.TextView;

import androidx.core.content.ContextCompat;

import com.bytedance.speech.speechdemo.settings.Settings;
import com.bytedance.speech.speechdemo.utils.SensitiveDefines;
import com.bytedance.speech.speechdemo.utils.SpeechDemoDefines;
import com.bytedance.speech.speechengine.SpeechEngine;
import com.bytedance.speech.speechengine.SpeechEngineDefines;
import com.bytedance.speech.speechengine.SpeechEngineGenerator;

import java.util.Locale;

public class UniTtsActivity extends BaseActivity implements SpeechEngine.SpeechListener {
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
    private Button mPauseResumeBtn;
    // Engine State
    private boolean mEngineInited = false;
    private boolean mEngineStarted = false;
    private boolean mPlayerPaused = false;

    // Paths
    private String mDebugPath = "";

    // Android Audio Manager
    private AudioManager.OnAudioFocusChangeListener mAFChangeListener = null;
    private AudioManager mAudioManager = null;
    private boolean mResumeOnFocusGain = true;
    private boolean mPlaybackNowAuthorized = false;

    @SuppressLint({"ClickableViewAccessibility", "InflateParams", "HardwareIds"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        Log.i(SpeechDemoDefines.TAG, "Bi Tts onCreate");
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_unidirection_tts);

        setTitleBar(R.string.uni_tts_name);
        String viewId = SpeechDemoDefines.UNI_TTS_VIEW;
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
        mStartBtn.setOnClickListener(v -> startEngine());

        mStopBtn = findViewById(R.id.stop_engine_button);
        setButton(mStopBtn, false);
        mStopBtn.setOnClickListener(v -> stopEngine());

        mPauseResumeBtn = findViewById(R.id.pause_resume_button);
        setButton(mPauseResumeBtn, false);
        mPauseResumeBtn.setOnClickListener(v -> controlPlayingStatus());

        Intent serviceIntent = new Intent(this, ForegroundService.class);
        serviceIntent.putExtra("inputExtra", "Foreground Service Example in Android");
        ContextCompat.startForegroundService(this, serviceIntent);

        mDebugPath = getDebugPath();
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
        //【必需配置】Engine Name（双向流式TTS Engine 也支持 单向流式TTS 功能）
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
        //【必需配置】在线合成鉴权相关：Appid
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_APP_ID_STRING, mSettings.getString(R.string.config_app_id));
        //【必需配置】在线合成鉴权相关：Token
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_APP_TOKEN_STRING, mSettings.getString(R.string.config_token));
        //【必需配置】语音合成服务域名
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_TTS_ADDRESS_STRING, mSettings.getString(R.string.config_address));
        //【必需配置】语音合成服务Uri
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_TTS_URI_STRING, mSettings.getString(R.string.config_uri));
        //【必需配置】语音合成服务Resource id
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_RESOURCE_ID_STRING, mSettings.getString(R.string.config_resource_id));
        //【可选配置】是否允许在 websocket 建连失败时自动重连
        mSpeechEngine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_ENABLE_WS_RECONNECT_BOOL, !mSettings.getBoolean(R.string.disable_ws_reconnect));
        //【可选配置】语音合成服务链接超时时间
        mSpeechEngine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_TTS_CONN_TIMEOUT_INT,mSettings.getInt(R.string.config_tts_conn_timeout));
    }

    private void initEngine() {
        Log.i(SpeechDemoDefines.TAG, "调用初始化接口");
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

    private void startEngine() {
        Log.d(SpeechDemoDefines.TAG, "Start engine, current status: " + mEngineStarted);
        if (!mEngineStarted) {
            AcquireAudioFocus();
            if (!mPlaybackNowAuthorized) {
                Log.w(SpeechDemoDefines.TAG, "Acquire audio focus failed, can't play audio");
                return;
            }
            clearResultText();

            // Directive：启动引擎前调用SYNC_STOP指令，保证前一次请求结束。
            Log.i(SpeechDemoDefines.TAG, "关闭引擎（同步）");
            Log.i(SpeechDemoDefines.TAG, "Directive: DIRECTIVE_SYNC_STOP_ENGINE");
            mSpeechEngine.sendDirective(SpeechEngineDefines.DIRECTIVE_SYNC_STOP_ENGINE, "");
            Log.i(SpeechDemoDefines.TAG, "启动引擎");
            Log.i(SpeechDemoDefines.TAG, "Directive: DIRECTIVE_START_ENGINE");
            String startPayload = String.format("{\"req_params\":{\"text\":\"%s\",\"speaker\":\"zh_female_roumeinvyou_emo_v2_mars_bigtts\",\"audio_params\":{\"emotion\":\"excited\",\"loudness_rate\":50}}}", mReferText.getText().toString());
            int ret = mSpeechEngine.sendDirective(SpeechEngineDefines.DIRECTIVE_START_ENGINE, startPayload);
            if (ret != SpeechEngineDefines.ERR_NO_ERROR) {
                setResultText("发送启动引擎指令失败, " + ret);
                return;
            }
            ret = mSpeechEngine.sendDirective(SpeechEngineDefines.DIRECTIVE_EVENT_START_SESSION, "");
            if (ret != SpeechEngineDefines.ERR_NO_ERROR) {
                setResultText("发送StartSession指令失败, " + ret);
                return;
            }
        }
    }

    private void stopEngine() {
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
        String stdData = new String(data);

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
                setResultText("Callback: 错误信息: " + stdData);
                break;
            case SpeechEngineDefines.MESSAGE_TYPE_EVENT_TTS_SENTENCE_START:
                // Callback: 合成开始回调
                Log.e(SpeechDemoDefines.TAG, "Callback: TTS_SENTENCE_START: " + stdData);
                break;
            case SpeechEngineDefines.MESSAGE_TYPE_EVENT_TTS_SENTENCE_END:
                // Callback: 合成结束回调
                Log.e(SpeechDemoDefines.TAG, "Callback: TTS_SENTENCE_END: " + stdData);
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
                setResultText("Callback: 播放结束: " + stdData);
                runOnUiThread(this::stopEngine);
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

    public void speechStart(final String data) {
        mEngineStarted = true;
        this.runOnUiThread(() -> {
            mEngineStatus.setText(R.string.hint_start_cb);
            setButton(mStartBtn, false);
            setButton(mStopBtn, true);
        });
    }

    public void speechStop(final String data) {
        mEngineStarted = false;
        this.runOnUiThread(() -> {
            mEngineStatus.setText(R.string.hint_stop_cb);
            mPauseResumeBtn.setText("Pause");
            setButton(mStopBtn, false);
            setButton(mStartBtn, true);
            setButton(mPauseResumeBtn, false);
            mPlayerPaused = false;
        });

        // Abandon audio focus when playback complete
        mAudioManager.abandonAudioFocus(mAFChangeListener);
        mPlaybackNowAuthorized = false;
    }

    public void speechStartPlaying(final String data) {
        this.runOnUiThread(() -> {
            setButton(mPauseResumeBtn, true);
        });
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

    public void setResultText(final String text) {
        this.runOnUiThread(() -> {
            mResult.append("\n" + text);
            mResult.post(new Runnable() {
                @Override
                public void run() {
                    int scrollAmount = mResult.getLayout().getLineTop(mResult.getLineCount()) - mResult.getHeight();
                    mResult.scrollTo(0, Math.max(scrollAmount, 0));
                }
            });
        });
    }

    public void clearResultText() {
        this.runOnUiThread(() -> mResult.setText(""));
    }
}
