package com.bytedance.speech.speechdemo;

import androidx.lifecycle.ProcessLifecycleOwner;

import android.Manifest;
import android.annotation.SuppressLint;
import android.os.Bundle;
import android.text.method.ScrollingMovementMethod;
import android.util.Log;
import android.widget.Button;
import android.widget.EditText;
import android.widget.TextView;

import com.bytedance.speech.speechdemo.settings.Settings;
import com.bytedance.speech.speechdemo.utils.SensitiveDefines;
import com.bytedance.speech.speechdemo.utils.SpeechDemoDefines;
import com.bytedance.speech.speechengine.SpeechEngine;
import com.bytedance.speech.speechengine.SpeechEngineDefines;
import com.bytedance.speech.speechengine.SpeechEngineGenerator;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.Collections;
import java.util.Iterator;
import java.util.LinkedList;
import java.util.List;

public class DialogDelegateActivity extends BaseActivity implements SpeechEngine.SpeechListener {
    private enum Role {
        // 用户提问内容
        USER,
        // 助手机器人回复内容
        ASSISTANT,
        // 日志信息
        LOG,
    }

    private static class Message {
        public Role role;
        public String text;
        public boolean confirmed;

        public Message(Role role, String text, boolean confirmed) {
            this.role = role;
            this.text = text;
            this.confirmed = confirmed;
        }
    }

    private static final int MAX_DIALOG_MESSAGE_COUNT = 20;
    private static final String AEC_MODEL_NAME = "aec.model";

    // UI
    private Button mInitEngineBtn;
    private Button mUninitEngineBtn;
    private Button mStartEngineBtn;
    private Button mStopEngineBtn;
    private Button mChatTtsTextBtn;
    private Button mChatTtsTextAutoBtn;
    private EditText mHelloEt;
    private TextView mEngineStatusTv;
    private TextView mResultTv;
    private LinkedList<Message> mDialogMessages = new LinkedList<>();

    // Settings
    protected Settings mSettings;

    // Paths
    private String mDebugPath = "";
    private String mAecModelDir = "";

    // Engine
    private SpeechEngine mSpeechEngine = null;
    private boolean mEngineStarted = false;

    // Permissions
    private static final List<String> DIALOG_PERMISSIONS = Collections.singletonList(
            Manifest.permission.RECORD_AUDIO
    );

    @SuppressLint({"ClickableViewAccessibility", "InflateParams", "HardwareIds", "UseCompatLoadingForDrawables"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        Log.i(SpeechDemoDefines.TAG, "Dialog onCreate");
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_dialog_delegate);
        mAecModelDir = copyAssetsToFiles("testdata/aec");

        setTitleBar(R.string.dialog_delegate_name);
        String viewId = SpeechDemoDefines.DIALOG_DELEGATE_VIEW;
        mSettings = SettingsActivity.getSettings(viewId);

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
        mStartEngineBtn.setOnClickListener(v -> startEngine());

        mStopEngineBtn = findViewById(R.id.stop_button);
        setButton(mStopEngineBtn, false);
        mStopEngineBtn.setOnClickListener(v -> stopEngine());

        mChatTtsTextBtn = findViewById(R.id.chat_tts_text_button);
        setButton(mChatTtsTextBtn, false);
        mChatTtsTextBtn.setOnClickListener(v -> chatTtsText());

        mChatTtsTextAutoBtn = findViewById(R.id.chat_tts_text_auto_button);
        setButton(mChatTtsTextAutoBtn, false);
        mChatTtsTextAutoBtn.setOnClickListener(v -> chatTtsTextAuto());

        mHelloEt = findViewById(R.id.hello_edit_text);

        mResultTv = findViewById(R.id.result_text);
        mResultTv.setMovementMethod(new ScrollingMovementMethod());

        mEngineStatusTv = findViewById(R.id.engine_status);
        mEngineStatusTv.setText(R.string.hint_waiting_init);

        requestPermission(DIALOG_PERMISSIONS);
    }

    @Override
    protected void onDestroy() {
        Log.i(SpeechDemoDefines.TAG, "Dialog onDestroy");
        uninitEngine();
        super.onDestroy();
    }

    private void configInitParams() {
        //【必需配置】Engine Name
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_ENGINE_NAME_STRING, SpeechEngineDefines.DIALOG_ENGINE);

        //【可选配置】Debug & Log
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_DEBUG_PATH_STRING, mDebugPath);
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_LOG_LEVEL_STRING, SpeechEngineDefines.LOG_LEVEL_TRACE);

        //【必需配置】鉴权相关：AppId
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_APP_ID_STRING, mSettings.getString(R.string.config_app_id));
        //【必需配置】鉴权相关：AppKey
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_APP_KEY_STRING, mSettings.getString(R.string.config_app_key));
        //【必需配置】鉴权相关：Token
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_APP_TOKEN_STRING, mSettings.getString(R.string.config_token));
        //【必需配置】对话服务资源信息ResourceId
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_RESOURCE_ID_STRING, mSettings.getString(R.string.config_resource_id));
        //【必需配置】User ID（用以辅助定位线上用户问题，如无法提供可提供固定字符串）
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_UID_STRING, SensitiveDefines.UID);
        //【必需配置】Dialog Address，对话服务域名
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_DIALOG_ADDRESS_STRING, mSettings.getString(R.string.config_address));
        //【必需配置】Dialog Uri，对话服务Uri
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_DIALOG_URI_STRING, mSettings.getString(R.string.config_uri));
        //【可选配置】是否开启AEC，默认不开启，同时启用设备录音和播放时必须开启
        mSpeechEngine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_ENABLE_AEC_BOOL, true);
        //【可选配置】AEC模型路径，开启AEC时必填
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_AEC_MODEL_PATH_STRING, mAecModelDir + "/" + AEC_MODEL_NAME);
        //【可选配置】配置音频来源，默认使用设备麦克风录音（Dialog 仅支持 RECORDER 和 STREAM 模式，RECORDER表示设备麦克风录音，STREAM表示自定义音频输入）
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_RECORDER_TYPE_STRING, SpeechEngineDefines.RECORDER_TYPE_RECORDER);
        //【可选配置】启用录音机音频回调，默认不启用
        mSpeechEngine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_DIALOG_ENABLE_RECORDER_AUDIO_CALLBACK_BOOL, false);
        //【可选配置】启用播放器音频回调，默认不启用
        mSpeechEngine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_DIALOG_ENABLE_PLAYER_AUDIO_CALLBACK_BOOL, false);
        //【可选配置】自定义请求Header
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_REQUEST_HEADERS_STRING, mSettings.getString(R.string.config_request_headers));
        //【可选配置】录音文件保存路径，如不为空，则SDK会将录音机音频保存到该路径下，文件格式为 .wav
        if (mSettings.getBoolean(R.string.config_dialog_enable_recorder_dump)) {
            mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_DIALOG_RECORDER_PATH_STRING, mDebugPath);
        } else {
            mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_DIALOG_RECORDER_PATH_STRING, "");
        }
        //【可选配置】播放文件保存路径，如不为空，则SDK会将播放器音频保存到该路径下，文件格式为 .wav
        if (mSettings.getBoolean(R.string.config_dialog_enable_player_dump)) {
            mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_DIALOG_PLAYER_PATH_STRING, mDebugPath);
        } else {
            mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_DIALOG_PLAYER_PATH_STRING, "");
        }

        // 【可选配置】启用TTS文本委托，默认不启用
        if (mSettings.getBoolean(R.string.config_dialog_delegate_chat_tts_text)) {
            mSpeechEngine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_DIALOG_WORK_MODE_INT, SpeechEngineDefines.DIALOG_WORK_MODE_DELEGATE_CHAT_TTS_TEXT);
        } else {
            mSpeechEngine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_DIALOG_WORK_MODE_INT, SpeechEngineDefines.DIALOG_WORK_MODE_DEFAULT);
        }
    }

    private void initEngine() {
        if (mDebugPath.isEmpty()) {
            mDebugPath = getDebugPath();
        }
        Log.i(SpeechDemoDefines.TAG, "Debug path:" + mDebugPath);

        if (mSpeechEngine == null) {
            Log.i(SpeechDemoDefines.TAG, "创建引擎.");
            mSpeechEngine = SpeechEngineGenerator.getInstance();
            mSpeechEngine.createEngine();
            mSpeechEngine.setContext(getApplicationContext());
        }
        Log.i(SpeechDemoDefines.TAG, "SDK version: " + mSpeechEngine.getVersion());

        Log.i(SpeechDemoDefines.TAG, "配置初始化参数.");
        configInitParams();

        Log.i(SpeechDemoDefines.TAG, "引擎初始化.");
        int ret = mSpeechEngine.initEngine();
        if (ret != SpeechEngineDefines.ERR_NO_ERROR) {
            String errMessage = "Init Engine Failed: " + ret;
            speechEngineInitFailed(errMessage);
            return;
        }

        Log.i(SpeechDemoDefines.TAG, "设置监听.");
        mSpeechEngine.setListener(this);

        speechEnginInitOk();
    }

    private void uninitEngine() {
        if (mSpeechEngine != null) {
            Log.i(SpeechDemoDefines.TAG, "引擎析构.");
            mSpeechEngine.destroyEngine();
            mSpeechEngine = null;
            Log.i(SpeechDemoDefines.TAG, "引擎析构完成!");
        }
        mEngineStatusTv.setText(R.string.hint_engine_busy);
    }

    private void initEngineBtnClicked() {
        if (mEngineStarted) {
            mEngineStatusTv.setText(R.string.hint_engine_busy);
            return;
        }
        setButton(mStartEngineBtn, false);
        setButton(mStopEngineBtn, false);
        setButton(mChatTtsTextBtn, false);
        setButton(mChatTtsTextAutoBtn, false);
        initEngine();
    }

    private void uninitEngineBtnClicked() {
        if (mEngineStarted) {
            mEngineStatusTv.setText(R.string.hint_engine_busy);
            return;
        }
        uninitEngine();
        mEngineStatusTv.setText(R.string.hint_waiting_init);
        mResultTv.setText("");

        setButton(mInitEngineBtn, true);
        setButton(mUninitEngineBtn, false);
        setButton(mStartEngineBtn, false);
        setButton(mStopEngineBtn, false);
        setButton(mChatTtsTextBtn, false);
        setButton(mChatTtsTextAutoBtn, false);
    }

    private void startEngine() {
        if (mSpeechEngine == null) {
            mEngineStatusTv.setText(R.string.hint_engine_not_init);
            return;
        }

        // Directive：启动引擎前调用SYNC_STOP指令，保证前一次请求结束。
        Log.i(SpeechDemoDefines.TAG, "Directive: DIRECTIVE_SYNC_STOP_ENGINE");
        mSpeechEngine.sendDirective(SpeechEngineDefines.DIRECTIVE_SYNC_STOP_ENGINE, "");
        // Directive：启动引擎指令。
        Log.i(SpeechDemoDefines.TAG, "Directive: DIRECTIVE_START_ENGINE");
        String startJson = String.format("{\"dialog\":{\"bot_name\":\"%s\"}}", mSettings.getString(R.string.config_dialog_bot_name));
        int ret = mSpeechEngine.sendDirective(SpeechEngineDefines.DIRECTIVE_START_ENGINE, startJson);
        if (ret != SpeechEngineDefines.ERR_NO_ERROR) {
            String errMessage = "启动引擎失败: " + ret;
            Log.e(SpeechDemoDefines.TAG, errMessage);
            mEngineStatusTv.setText(errMessage);
        } else {
            mDialogMessages.clear();
            setTextOnUiThread(mResultTv, "");
            // 开场白
            if (!mHelloEt.getText().toString().isEmpty()) {
                sayHello();
            }
        }
    }

    private void stopEngine() {
        if (mSpeechEngine == null) {
            mEngineStatusTv.setText(R.string.hint_engine_not_init);
            return;
        }
        // Directive：关闭引擎，停止对话功能。
        Log.i(SpeechDemoDefines.TAG, "Directive: DIRECTIVE_STOP_ENGINE");
        mSpeechEngine.sendDirective(SpeechEngineDefines.DIRECTIVE_STOP_ENGINE, "");
    }

    private void sayHello() {
        // Directive：发送say_hello指令以播放开场白。
        String helloText = String.format("{\"content\": \"%s\"}", mHelloEt.getText().toString());
        int ret = mSpeechEngine.sendDirective(SpeechEngineDefines.DIRECTIVE_EVENT_SAY_HELLO, helloText);
        if (ret != SpeechEngineDefines.ERR_NO_ERROR) {
            mEngineStatusTv.setText("开场白触发失败: " + ret);
        } else {
            showHelloMessage(mHelloEt.getText().toString());
        }
    }

    private void chatTtsText() {
        if (mSpeechEngine == null) {
            mEngineStatusTv.setText(R.string.hint_engine_not_init);
            return;
        }
        String chatTtsText = mHelloEt.getText().toString();
        // Directive：发送ChatTtsText指令以播放自定义回复文本，可以流式不断补充文本内容。首包需要包含start:true，end:false 。
        String chatTtsTextJson = String.format("{\"start\": true, \"content\": \"%s\", \"end\": false}", chatTtsText);
        int ret = mSpeechEngine.sendDirective(SpeechEngineDefines.DIRECTIVE_DIALOG_CHAT_TTS_TEXT, chatTtsTextJson);
        if (ret != SpeechEngineDefines.ERR_NO_ERROR) {
            mEngineStatusTv.setText("自定义TTS回复失败: " + ret);
            return;
        }
        // Directive：发送ChatTtsText指令以播放自定义回复文本，可以流式不断补充文本内容。尾包需要包含start:false，end:true 。
        chatTtsTextJson = "{\"start\": false, \"content\": \"\", \"end\": true}";
        ret = mSpeechEngine.sendDirective(SpeechEngineDefines.DIRECTIVE_DIALOG_CHAT_TTS_TEXT, chatTtsTextJson);
        if (ret != SpeechEngineDefines.ERR_NO_ERROR) {
            mEngineStatusTv.setText("自定义TTS回复失败: " + ret);
            return;
        }
        updateChatTtsTextMessage(chatTtsText);
    }

    private void chatTtsTextAuto() {
        if (mSpeechEngine == null) {
            mEngineStatusTv.setText(R.string.hint_engine_not_init);
            return;
        }
        // Directive：发送ChatTtsTextAuto指令以播放Dialog自身的回复文本。
        int ret = mSpeechEngine.sendDirective(SpeechEngineDefines.DIRECTIVE_DIALOG_CHAT_TTS_TEXT_AUTO, "");
        if (ret != SpeechEngineDefines.ERR_NO_ERROR) {
            mEngineStatusTv.setText("播放Dialog自动回复失败: " + ret);
        }
    }

    @Override
    public void onSpeechMessage(int type, byte[] data, int len) {
        String strData = new String(data);
        switch (type) {
            case SpeechEngineDefines.MESSAGE_TYPE_ENGINE_START:
                // Callback: 引擎启动成功回调
                Log.i(SpeechDemoDefines.TAG, "Callback: 引擎启动成功: " + type);
                speechEngineStarted(strData);
                break;
            case SpeechEngineDefines.MESSAGE_TYPE_ENGINE_STOP:
                // Callback: 引擎关闭回调
                Log.i(SpeechDemoDefines.TAG, "Callback: 引擎关闭: " + type);
                speechEngineStopped(strData);
                break;
            case SpeechEngineDefines.MESSAGE_TYPE_ENGINE_ERROR:
                // Callback: 错误信息回调
                Log.e(SpeechDemoDefines.TAG, "Callback: 错误信息: " + type + " data: " + strData);
                speechEngineError(strData);
                break;
            case SpeechEngineDefines.MESSAGE_TYPE_DIALOG_ASR_RESPONSE:
                // Callback: ASR语音识别结果回调
                showUserMessage(strData);
                break;
            case SpeechEngineDefines.MESSAGE_TYPE_DIALOG_ASR_ENDED:
                // Callback: ASR语音识别结束
                confirmUserMessage();
                break;
            case SpeechEngineDefines.MESSAGE_TYPE_DIALOG_CHAT_RESPONSE:
                // Callback: Chat对话内容回调
                showAssistantMessage(strData);
                break;
            case SpeechEngineDefines.MESSAGE_TYPE_DIALOG_ASR_INFO:
            case SpeechEngineDefines.MESSAGE_TYPE_DIALOG_CHAT_ENDED:
                // Callback: Chat对话内容结束
                confirmAssistantMessage();
                break;
            default:
                break;
        }
    }

    public void speechEnginInitOk() {
        Log.i(SpeechDemoDefines.TAG, "引擎初始化成功!");
        runOnUiThread(() -> {
            mEngineStatusTv.setText(R.string.hint_ready);
            setButton(mInitEngineBtn, false);
            setButton(mUninitEngineBtn, true);
            setButton(mStartEngineBtn, true);
        });
    }

    public void speechEngineInitFailed(String tipText) {
        Log.e(SpeechDemoDefines.TAG, "引擎初始化失败: " + tipText);
        runOnUiThread(() -> {
            mEngineStatusTv.setText(tipText);
            setButton(mInitEngineBtn, true);
        });
    }

    public void speechEngineStarted(String sessionId) {
        showLogMessage("Engine start: " + sessionId);
        mEngineStarted = true;
        runOnUiThread(() -> {
            mEngineStatusTv.setText(R.string.hint_start_cb);
            setButton(mStartEngineBtn, false);
            setButton(mStopEngineBtn, true);
            setButton(mChatTtsTextBtn, true);
            setButton(mChatTtsTextAutoBtn, true);
        });
    }

    public void speechEngineStopped(String sessionId) {
        showLogMessage("Engine stop: " + sessionId);
        mEngineStarted = false;
        runOnUiThread(() -> {
            mEngineStatusTv.setText(R.string.hint_stop_cb);
            setButton(mStartEngineBtn, true);
            setButton(mStopEngineBtn, false);
            setButton(mChatTtsTextBtn, false);
            setButton(mChatTtsTextAutoBtn, false);
        });
    }

    public void speechEngineError(final String data) {
        runOnUiThread(() -> {
            try {
                JSONObject reader = new JSONObject(data);
                if (!reader.has("err_code") || !reader.has("err_msg")) {
                    return;
                }
                showLogMessage(data);
                stopEngine();
            } catch (JSONException e) {
                e.printStackTrace();
            }
        });
    }

    private void showHelloMessage(String data) {
        runOnUiThread(() -> {
            mDialogMessages.add(new Message(Role.ASSISTANT, data, true));
            updateMessageUI();
        });
    }

    private void showUserMessage(String data) {
        runOnUiThread(() -> {
            Message message = lastUnconfirmedMessage(Role.USER);
            if (message == null) {
                message = new Message(Role.USER, "", false);
                mDialogMessages.addLast(message);
            }
            try {
                JSONObject reader = new JSONObject(data);
                message.text = reader.getJSONArray("results").getJSONObject(0).getString("text");
            } catch (Exception e) {
                e.printStackTrace();
            }
            updateMessageUI();
        });
    }

    private void confirmUserMessage() {
        runOnUiThread(() -> {
            Message message = lastUnconfirmedMessage(Role.USER);
            if (message != null) {
                message.confirmed = true;
            }
        });
    }

    private void showAssistantMessage(String data) {
        runOnUiThread(() -> {
            Message message = lastUnconfirmedMessage(Role.ASSISTANT);
            if (message == null) {
                message = new Message(Role.ASSISTANT, "", false);
                mDialogMessages.addLast(message);
            }
            try {
                JSONObject reader = new JSONObject(data);
                message.text += reader.getString("content");
            } catch (Exception e) {
                e.printStackTrace();
            }
            updateMessageUI();
        });
    }

    private void confirmAssistantMessage() {
        runOnUiThread(() -> {
            Message message = lastUnconfirmedMessage(Role.ASSISTANT);
            if (message != null) {
                message.confirmed = true;
            }
        });
    }

    private void showLogMessage(String data) {
        runOnUiThread(() -> {
            mDialogMessages.add(new Message(Role.LOG, data, true));
            updateMessageUI();
        });
    }

    private void updateChatTtsTextMessage(String data) {
        runOnUiThread(() -> {
            Message message = mDialogMessages.getLast();
            if (message == null || message.role != Role.ASSISTANT) {
                message = new Message(Role.ASSISTANT, "", false);
                mDialogMessages.addLast(message);
            }
            message.text = data;
            message.confirmed = true;
            updateMessageUI();
        });
    }

    private Message lastUnconfirmedMessage(Role role) {
        Message message = null;
        Iterator<Message> it = mDialogMessages.descendingIterator();
        while (it.hasNext()) {
            Message current = it.next();
            if (current.role == role) {
                if (!current.confirmed) {
                    message = current;
                }
                break;
            }
        }
        return message;
    }

    private void updateMessageUI() {
        // 刷新消息内容
        if (mDialogMessages.size() > MAX_DIALOG_MESSAGE_COUNT) {
            mDialogMessages.removeFirst();
        }

        // 构建消息内容
        StringBuilder sb = new StringBuilder();
        for (Message message : mDialogMessages) {
            String role = "";
            switch (message.role) {
                case USER:
                    role = "[USER]:";
                    break;
                case ASSISTANT:
                    role = "[ASSISTANT]:";
                    break;
                case LOG:
                    role = "[LOG]:";
                    break;
            }
            sb.append(role).append(message.text).append("\n");
        }
        mResultTv.setText(sb.toString());
        // 滚动到底部
        final int scrollAmount = mResultTv.getLayout().getLineTop(mResultTv.getLineCount()) - mResultTv.getHeight();
        if (scrollAmount > 0) {
            mResultTv.scrollTo(0, scrollAmount);
        } else {
            mResultTv.scrollTo(0, 0);
        }
    }
}