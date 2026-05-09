// Copyright 2020 Bytedance Inc. All Rights Reserved.
// Author: fengkai.0518@bytedance.com (fengkai.0518)

package com.bytedance.speech.speechdemo;

import android.Manifest;
import android.annotation.SuppressLint;
import android.os.Bundle;
import android.os.Handler;
import android.text.method.ScrollingMovementMethod;
import android.util.Log;
import android.view.MotionEvent;
import android.widget.Button;
import android.widget.EditText;
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

public class CaptActivity extends BaseActivity implements SpeechEngine.SpeechListener {
    // Permissions
    private static final List<String> CAPT_PERMISSIONS = Collections.singletonList(
            Manifest.permission.RECORD_AUDIO
    );

    // StreamRecorder
    private SpeechStreamRecorder mStreamRecorder;

    // Engine
    private SpeechEngine mSpeechEngine = null;
    private boolean mEngineStarted = false;

    // Record
    private Handler recordHandler = null;
    private Runnable recordRunnable = null;
    private boolean recordIsRunning = false;

    // UI
    private EditText mReferText;
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
    private String mDebugPath = "";

    // Settings
    protected Settings mSettings;
    private final String[] mCaptCoreTypeArray = {
            SpeechEngineDefines.CAPT_CORE_TYPE_EN_SENT_SCORE,
            SpeechEngineDefines.CAPT_CORE_TYPE_EN_WORD_SCORE,
            SpeechEngineDefines.CAPT_CORE_TYPE_EN_WORD_PRON,
            SpeechEngineDefines.CAPT_CORE_TYPE_CN_SENT_RAW};

    @SuppressLint({"ClickableViewAccessibility", "InflateParams", "HardwareIds"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        Log.i(SpeechDemoDefines.TAG, "Capt onCreate");
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_capt);
        setTitleBar(R.string.capt_name);

        final String viewId = SpeechDemoDefines.CAPT_VIEW;
        mSettings = SettingsActivity.getSettings(viewId);
        mStreamRecorder = MainActivity.getStreamRecorder();

        mReferText = findViewById(R.id.refer_text);
        mReferText.setEnabled(true);

        mResult = findViewById(R.id.result_text);
        mResult.setMovementMethod(new ScrollingMovementMethod());
        mEngineStatus = findViewById(R.id.engine_status);

        Button mConfig = findViewById(R.id.engine_config);
        mConfig.setEnabled(true);
        mConfig.setOnClickListener(v -> goToSettingsActivity(viewId));

        mInit = findViewById(R.id.init_engine_button);
        SetButton(mInit, true);
        mInit.setOnClickListener(v -> initEngineBtnClicked());

        mUninit = findViewById(R.id.uninit_engine_button);
        SetButton(mUninit, false);
        mUninit.setOnClickListener(v -> uninitEngineBtnClicked());

        mStart = findViewById(R.id.start_engin_button);
        SetButton(mStart, false);
        mStart.setOnClickListener(v -> startEngineBtnClicked());

        mStop = findViewById(R.id.stop_button);
        SetButton(mStop, false);
        mStop.setOnClickListener(v -> stopEngineBtnClicked());

        mLongPress = findViewById(R.id.long_press);
        SetButton(mLongPress, false);

        mLongPress.setOnTouchListener((v, event) -> {
            if (event.getAction() == MotionEvent.ACTION_DOWN) {
                Log.i(SpeechDemoDefines.TAG, "Touch: Action down");
                mLongPress.setBackground(getResources().getDrawable(R.drawable.btn_negative_background));
                recordBtnTouchDown();
                return true;
            } else if (event.getAction() == MotionEvent.ACTION_UP) {
                Log.i(SpeechDemoDefines.TAG, "Touch: Action up");
                mLongPress.setBackground(getResources().getDrawable(R.drawable.btn_active_background));
                recordBtnTouchUp();
                return true;
            } else if (event.getAction() == MotionEvent.ACTION_CANCEL) {
                Log.i(SpeechDemoDefines.TAG, "Touch: Action cancel");
                mLongPress.setBackground(getResources().getDrawable(R.drawable.btn_active_background));
                recordBtnTouchUp();
                return true;
            }
            return false;
        });
    }

    @Override
    protected void onDestroy() {
        Log.i(SpeechDemoDefines.TAG, "Capt onDestroy");
        uninitEngine();
        super.onDestroy();
    }

    private void configInitParams() {
        //【必需配置】Engine Name
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_ENGINE_NAME_STRING, SpeechEngineDefines.CAPT_ENGINE);

        //【可选配置】Debug & Log
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_DEBUG_PATH_STRING, mDebugPath);

        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_LOG_LEVEL_STRING, SpeechEngineDefines.LOG_LEVEL_DEBUG);

        //【必需配置】配置音频来源
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_RECORDER_TYPE_STRING, mSettings.getOptionsValue(R.string.config_recorder_type, this));
        if (mSettings.getBoolean(R.string.config_capt_rec_save)) {
            //【可选配置】录音文件保存路径，如配置，SDK会将录音保存到该路径下，文件格式为 .wav
            mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_CAPT_REC_PATH_STRING, mDebugPath);
        }

        // 当音频来源为 RECORDER_TYPE_STREAM 时，如输入音频采样率不等于 16K，需添加如下配置
        if (mSettings.getOptionsValue(R.string.config_recorder_type, this).equals(SpeechEngineDefines.RECORDER_TYPE_STREAM)) {
            if (mStreamRecorder.GetStreamSampleRate() != 16000) {
                // 当音频来源为 RECORDER_TYPE_STREAM 时【必需配置】，否则【无需配置】
                // 启用 SDK 内部的重采样
                mSpeechEngine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_ENABLE_RESAMPLER_BOOL, true);
                // 将重采样所需的输入采样率设置为 APP 层输入的音频的实际采样率
                mSpeechEngine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_CUSTOM_SAMPLE_RATE_INT, mStreamRecorder.GetStreamSampleRate());
            }
        }

        String address = mSettings.getString(R.string.config_address);
        if (address.isEmpty()) {
            address = SensitiveDefines.DEFAULT_ADDRESS;
        }
        Log.i(SpeechDemoDefines.TAG, "Current address: " + address);
        //【必需配置】评测服务域名
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_CAPT_ADDRESS_STRING, address);

        String uri = mSettings.getString(R.string.config_uri);
        if (uri.isEmpty()) {
            uri = SensitiveDefines.CAPT_DEFAULT_MDD_URI;
        }
        Log.i(SpeechDemoDefines.TAG, "Current uri: " + uri);
        //【必需配置】评测服务Uri
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_CAPT_URI_STRING, uri);

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
            cluster = SensitiveDefines.CAPT_DEFAULT_CLUSTER;
        }
        Log.i(SpeechDemoDefines.TAG, "Current cluster: " + cluster);
        //【必需配置】评测服务所用集群
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_CAPT_CLUSTER_STRING, cluster);

        //【可选配置】在线请求的建连与接收超时，一般不需配置使用默认值即可
        mSpeechEngine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_CAPT_CONN_TIMEOUT_INT, 12000);
        mSpeechEngine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_CAPT_RECV_TIMEOUT_INT, 8000);
    }

    private void configStartParams() {
        String referText = mReferText.getText().toString();
        if (referText.isEmpty()) {
            referText = "Write down the reference text here";
        }
        //【必需配置】评测参考文本
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_CAPT_REFER_TEXT_STRING, referText);

        //【可选配置】默认为英文打分，如果需要中文需要设置为SE_CAPT_CORE_TYPE_CN_SENT_RAW
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_CAPT_CORE_TYPE_STRING, mCaptCoreTypeArray[mSettings.getOptions(R.string.config_capt_core_type).chooseIdx]);

        //【可选配置】评测难度，默认2，1：容易，2：中等，3：困难
        mSpeechEngine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_CAPT_DIFFICULTY_INT, mSettings.getInt(R.string.config_capt_difficulty));

        //【可选配置】是否启用云端自动判停，默认false
        mSpeechEngine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_CAPT_AUTO_STOP_BOOL, false);

        String responseMode = mSettings.getBoolean(R.string.config_capt_streaming) ? SpeechEngineDefines.CAPT_RESPONSE_MODE_STREAMING : SpeechEngineDefines.CAPT_RESPONSE_MODE_ONCE;
        //【可选配置】评测结果返回模式，默认是CAPT_RESPONSE_MODE_ONCE单次返回，如果需要流式返回，需要设置为 CAPT_RESPONSE_MODE_STREAMING
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_CAPT_RESPONSE_MODE_STRING, responseMode);

        //【可选配置】控制是否返回录音音量，在 APP 需要显示音频波形时可以启用
        mSpeechEngine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_ENABLE_GET_VOLUME_BOOL, mSettings.getBoolean(R.string.config_get_volume));
        //【可选配置】用户音频输入最大时长，单位毫秒，默认为 150000ms.
        mSpeechEngine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_VAD_MAX_SPEECH_DURATION_INT, mSettings.getInt(R.string.config_vad_max_speech_duration));

        //【可选配置】User ID（用以辅助定位线上用户问题）
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_UID_STRING, SensitiveDefines.UID);

        if (mSettings.getOptionsValue(R.string.config_recorder_type, this).equals(SpeechEngineDefines.RECORDER_TYPE_STREAM)) {
            mSpeechEngine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_CUSTOM_SAMPLE_RATE_INT, mStreamRecorder.GetStreamSampleRate());
            if (!mStreamRecorder.Start()) {
                requestPermission(CAPT_PERMISSIONS);
            }
        } else if (mSettings.getOptionsValue(R.string.config_recorder_type, this).equals(SpeechEngineDefines.RECORDER_TYPE_FILE)) {
            // 使用音频文件评测时，需要设置文件的绝对路径
            String test_file_path = mDebugPath + "/capt_rec_file.pcm";
            Log.d(SpeechDemoDefines.TAG, "test file path: " + test_file_path);
            // 使用音频文件评测时【必须配置】，否则【无需配置】
            mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_RECORDER_FILE_STRING, test_file_path);
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
            mSpeechEngine.destroyEngine();
            mSpeechEngine = null;
        }
    }

    private void initEngineBtnClicked() {
        if (mEngineStarted) {
            mEngineStatus.setText(R.string.hint_engine_busy);
            return;
        }
        mReferText.setEnabled(false);
        SetButton(mStart, false);
        SetButton(mStop, false);
        SetButton(mLongPress, false);
        initEngine();
    }

    private void uninitEngineBtnClicked() {
        if (mEngineStarted) {
            mEngineStatus.setText(R.string.hint_engine_busy);
            return;
        }
        uninitEngine();
        mEngineStatus.setText(R.string.hint_waiting_init);
        mReferText.setEnabled(true);
        SetButton(mUninit, false);
        SetButton(mInit, true);
        SetButton(mStart, false);
        SetButton(mStop, false);
        SetButton(mLongPress, false);
    }

    private void startEngineBtnClicked() {
        Log.i(SpeechDemoDefines.TAG, "配置启动参数.");
        configStartParams();

        //【可选配置】是否启用云端自动判停
        Log.i(SpeechDemoDefines.TAG, "开启 CAPT 云端自动判停");
        mSpeechEngine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_CAPT_AUTO_STOP_BOOL, true);

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
                mEngineStatus.setText(R.string.check_rec_permission);
                requestPermission(CAPT_PERMISSIONS);
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
        recordIsRunning = false;
        recordHandler = new Handler();
        recordRunnable = () -> {
            recordIsRunning = true;

            Log.i(SpeechDemoDefines.TAG, "配置启动参数.");
            configStartParams();

            //【可选配置】是否启用云端自动判停
            Log.i(SpeechDemoDefines.TAG, "关闭 CAPT 云端自动判停");
            mSpeechEngine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_CAPT_AUTO_STOP_BOOL, false);

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
                    mEngineStatus.setText(R.string.check_rec_permission);
                    requestPermission(CAPT_PERMISSIONS);
                } else if (ret != SpeechEngineDefines.ERR_NO_ERROR) {
                    Log.e(SpeechDemoDefines.TAG, "send directive start failed, " + ret);
                }
            }
            clearResultText();
        };
        recordHandler.postDelayed(recordRunnable, 500);
    }

    private void recordBtnTouchUp() {
        if (recordIsRunning) {
            recordIsRunning = false;
            Log.i(SpeechDemoDefines.TAG, "CaptTouch: Finish");
            mFinishTalkingTimestamp = System.currentTimeMillis();
            // Directive：结束用户音频输入。
            Log.i(SpeechDemoDefines.TAG, "Directive: DIRECTIVE_FINISH_TALKING");
            mSpeechEngine.sendDirective(SpeechEngineDefines.DIRECTIVE_FINISH_TALKING, "");
            mStreamRecorder.Stop();
        } else if (recordRunnable != null) {
            Log.i(SpeechDemoDefines.TAG, "CaptTouch: Cancel");
            recordHandler.removeCallbacks(recordRunnable);
            recordRunnable = null;
        }
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
            case SpeechEngineDefines.MESSAGE_TYPE_PARTIAL_RESULT:
                // Callback: CAPT 当前请求的部分结果回调
                Log.d(SpeechDemoDefines.TAG, "Callback: CAPT 当前请求的部分结果");
                speechCaptResult(stdData, false);
                break;
            case SpeechEngineDefines.MESSAGE_TYPE_FINAL_RESULT:
                // Callback: CAPT 当前请求最终结果回调
                Log.i(SpeechDemoDefines.TAG, "Callback: CAPT 当前请求最终结果");
                speechCaptResult(stdData, true);
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
        mStreamRecorder.SetSpeechEngine(SpeechDemoDefines.CAPT_VIEW, mSpeechEngine);
        this.runOnUiThread(() -> {
            mEngineStatus.setText(R.string.hint_ready);
            SetButton(mUninit, true);
            SetButton(mInit, false);
            SetButton(mUninit, true);
            SetButton(mStart, true);
            SetButton(mLongPress, true);
            mReferText.setEnabled(true);
        });
    }

    public void speechEngineInitFailed(String tipText) {
        Log.e(SpeechDemoDefines.TAG, "引擎初始化失败: " + tipText);
        this.runOnUiThread(() -> {
            mEngineStatus.setText(R.string.hint_setup_failure);
            setResultText(tipText);
            SetButton(mInit, true);
        });
    }

    public void speechStart() {
        mEngineStarted = true;
        this.runOnUiThread(() -> {
            mEngineStatus.setText(R.string.hint_start_cb);
            mReferText.setEnabled(false);
            SetButton(mStart, false);
            SetButton(mStop, true);
        });
    }

    public void speechStop() {
        mEngineStarted = false;
        this.runOnUiThread(() -> {
            mStreamRecorder.Stop();
            mEngineStatus.setText(R.string.hint_stop_cb);
            mReferText.setEnabled(true);
            SetButton(mStart, true);
            SetButton(mStop, false);
        });
    }

    public void speechCaptResult(final String data, boolean isFinal) {
        // 计算由录音结束到 CAPT 最终结果之间的延迟
        long delay = 0;
        if (isFinal && mFinishTalkingTimestamp > 0) {
            delay = System.currentTimeMillis() - mFinishTalkingTimestamp;
            mFinishTalkingTimestamp = 0;
        }
        final long response_delay = delay;
        this.runOnUiThread(() -> {
            try {
                // 从回调的 json 数据中解析 CAPT 结果
                String text = "";
                JSONObject reader = new JSONObject(data);
                if (!reader.has("integrity_details") || !reader.has("scores")) {
                    return;
                }
                text += "\nreqid: " + reader.getString("reqid");
                text += "\nscores: " + reader.getJSONObject("scores").toString();
                text += "\nintegrity_details: " + reader.getJSONArray("integrity_details").getJSONObject(0).toString();
                text += "\nresponse_delay: " + response_delay;
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
        mResult.setText("");
        mResult.append("\n" + text);
    }

    public void clearResultText() {
        this.runOnUiThread(() -> mResult.setText(""));
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
