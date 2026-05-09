// Copyright 2021 Bytedance Inc. All Rights Reserved.
// Author: chengzihao.ds@bytedance.com (chengzihao.ds)

package com.bytedance.speech.speechdemo;

import android.Manifest;
import android.annotation.SuppressLint;
import android.os.Bundle;
import android.text.method.ArrowKeyMovementMethod;
import android.util.Log;
import android.view.View;
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

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.Collections;
import java.util.List;

public class VoiceCloneActivity extends BaseActivity implements SpeechEngine.SpeechListener, View.OnClickListener {
    private enum ActivityStatus {
        // activity status sequence from first(BEFORE_INIT) to last(AFTER_SUBMIT)
        BEFORE_INIT,
        INITING,
        BEFORE_GET_TASK,
        BEFORE_CHECK_ENV,
        BEFORE_RECORD,
        RECORDING,
        BEFORE_SUBMIT,
        AFTER_SUBMIT,
    }

    // Permissions
    private static final List<String> VOICECLONE_PERMISSIONS = Collections.singletonList(
            Manifest.permission.RECORD_AUDIO
    );

    // StreamRecorder
    private SpeechStreamRecorder mStreamRecorder;

    // Engine
    private SpeechEngine mSpeechEngine = null;
    private boolean mEngineInited = false;
    private boolean mEngineStarted = false;

    // UI
    private EditText mReferText;
    private TextView mResultText;
    private TextView mEngineStatus;
    private Button engineSwitchBtn;
    private Button getTaskBtn;
    private Button checkEnvBtn;
    private Button voiceRecordBtn;
    private Button finishTalkingBtn;
    private Button getTrainStatusBtn;
    private Button submitTaskBtn;
    private Button delTrainDataBtn;
    private Button engineConfigBtn;
    private Button nextRecordTaskBtn;

    // Statistics
    private long mStartEngineTimestamp = -1;

    // VoiceClone Params
    private String voiceCloneCurText;
    private int voiceCloneCurTextSeq;
    private int voiceCloneCurTaskId;
    private JSONObject voiceCloneTaskInfoJson;

    // Activity Status
    private ActivityStatus preActivityStatus = ActivityStatus.BEFORE_INIT;
    private ActivityStatus curActivityStatus = ActivityStatus.BEFORE_INIT;

    // Settings
    protected Settings mSettings;

    @SuppressLint({"ClickableViewAccessibility", "InflateParams", "HardwareIds"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        Log.i(SpeechDemoDefines.TAG, "VoiceClone onCreate");
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_voiceclone);
        setTitleBar(R.string.voiceclone_name);

        final String viewId = SpeechDemoDefines.VOICECLONE_VIEW;
        mSettings = SettingsActivity.getSettings(viewId);
        mStreamRecorder = MainActivity.getStreamRecorder();

        initView();
        switchStatus(ActivityStatus.BEFORE_INIT);
    }

    private void initView() {
        mReferText = findViewById(R.id.refer_text);
        mReferText.setEnabled(false);

        mResultText = findViewById(R.id.result_text);
        mResultText.setMovementMethod(new ArrowKeyMovementMethod());
        mEngineStatus = findViewById(R.id.engine_status);

        engineSwitchBtn = findViewById(R.id.engine_switch);
        engineSwitchBtn.setOnClickListener(this);

        getTaskBtn = findViewById(R.id.get_task_btn);
        getTaskBtn.setOnClickListener(this);
        checkEnvBtn = findViewById(R.id.check_env_btn);
        checkEnvBtn.setOnClickListener(this);
        voiceRecordBtn = findViewById(R.id.voice_record_btn);
        voiceRecordBtn.setOnClickListener(this);
        finishTalkingBtn = findViewById(R.id.finish_talking_btn);
        finishTalkingBtn.setOnClickListener(this);
        getTrainStatusBtn = findViewById(R.id.get_train_status_btn);
        getTrainStatusBtn.setOnClickListener(this);
        submitTaskBtn = findViewById(R.id.submit_task_btn);
        submitTaskBtn.setOnClickListener(this);
        delTrainDataBtn = findViewById(R.id.del_train_data_btn);
        delTrainDataBtn.setOnClickListener(this);
        engineConfigBtn = findViewById(R.id.engine_config);
        engineConfigBtn.setOnClickListener(this);
        nextRecordTaskBtn = findViewById(R.id.next_record_task);
        nextRecordTaskBtn.setOnClickListener(this);
    }

    @Override
    protected void onPause() {
        super.onPause();
        stopEngine();
        if (curActivityStatus == ActivityStatus.RECORDING) {
            switchStatus(preActivityStatus);
            setResultText("");
        }
    }

    @Override
    protected void onDestroy() {
        Log.i(SpeechDemoDefines.TAG, "VoiceClone onDestroy");
        uninitEngine();
        super.onDestroy();
    }

    private void stopEngine() {
        if (mSpeechEngine != null && mEngineStarted) {
            mSpeechEngine.sendDirective(SpeechEngineDefines.DIRECTIVE_STOP_ENGINE, "");
        }
    }

    @Override
    public void onClick(View view) {
        int id = view.getId();
        if (id == R.id.engine_switch) {
            switchEngine();
        } else if (id == R.id.engine_config) {
            goToSettingsActivity(SpeechDemoDefines.VOICECLONE_VIEW);
        } else if (id == R.id.get_task_btn) {
            getTaskInfo();
        } else if (id == R.id.check_env_btn) {
            checkEnv();
        } else if (id == R.id.voice_record_btn) {
            voiceRecord();
        } else if (id == R.id.finish_talking_btn) {
            finishTalking();
        } else if (id == R.id.get_train_status_btn) {
            getTrainStatus();
        } else if (id == R.id.submit_task_btn) {
            submitTask();
        } else if (id == R.id.del_train_data_btn) {
            delTrainData();
        } else if (id == R.id.next_record_task) {
            nextRecordTask();
        }
    }

    private void switchEngine() {
        if (mEngineStarted) {
            mEngineStatus.setText(R.string.hint_engine_busy);
            return;
        }
        mReferText.setText("");
        voiceCloneTaskInfoJson = null;
        updateCurTaskInfo();
        if (mEngineInited) {
            uninitEngine();
            mEngineInited = false;
            mEngineStatus.setText(R.string.hint_waiting_init);
            switchStatus(ActivityStatus.BEFORE_INIT);
        } else {
            switchStatus(ActivityStatus.INITING);
            initEngine();
        }
    }

    private void getTaskInfo() {
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_UID_STRING, mSettings.getString(R.string.config_voiceclone_uid));
        mSpeechEngine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_VOICECLONE_GENDER_BOOL, mSettings.getBoolean(R.string.config_voiceclone_gender));
        mSpeechEngine.sendDirective(SpeechEngineDefines.DIRECTIVE_VOICECLONE_GET_TASK, "");
        setResultText("");
    }

    private void checkEnv() {
        if (!checkRecorder()) {
            return;
        }
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_UID_STRING, mSettings.getString(R.string.config_voiceclone_uid));
        mSpeechEngine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_VOICECLONE_TASKID_INT, voiceCloneCurTaskId);
        int ret = mSpeechEngine.sendDirective(SpeechEngineDefines.DIRECTIVE_VOICECLONE_CHECK_ENV, "");
        if (ret == SpeechEngineDefines.ERR_NO_ERROR) {
            switchStatus(ActivityStatus.RECORDING);
        } else if (ret == SpeechEngineDefines.ERR_REC_CHECK_ENVIRONMENT_FAILED) {
            mEngineStatus.setText(R.string.check_rec_permission);
            requestPermission(VOICECLONE_PERMISSIONS);
        } else {
            setResultText("Fail to send directive: " + SpeechEngineDefines.DIRECTIVE_VOICECLONE_CHECK_ENV + ", Ret: " + ret);
        }
    }

    private void voiceRecord() {
        if (!checkRecorder()) {
            return;
        }
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_UID_STRING, mSettings.getString(R.string.config_voiceclone_uid));
        mSpeechEngine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_VOICECLONE_TASKID_INT, voiceCloneCurTaskId);
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_VOICECLONE_TEXT_STRING, voiceCloneCurText);
        mSpeechEngine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_VOICECLONE_TEXT_SEQ_INT, voiceCloneCurTextSeq);
        int ret = mSpeechEngine.sendDirective(SpeechEngineDefines.DIRECTIVE_VOICECLONE_RECORD_VOICE, "");
        if (ret == SpeechEngineDefines.ERR_NO_ERROR) {
            switchStatus(ActivityStatus.RECORDING);
        } else if (ret == SpeechEngineDefines.ERR_REC_CHECK_ENVIRONMENT_FAILED) {
            mEngineStatus.setText(R.string.check_rec_permission);
            requestPermission(VOICECLONE_PERMISSIONS);
        } else {
            setResultText("Fail to send directive: " + SpeechEngineDefines.DIRECTIVE_VOICECLONE_RECORD_VOICE + ", Ret: " + ret);
        }
    }

    private void finishTalking() {
        mSpeechEngine.sendDirective(SpeechEngineDefines.DIRECTIVE_FINISH_TALKING, "");
        mStreamRecorder.Stop();
    }

    private void getTrainStatus() {
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_UID_STRING, mSettings.getString(R.string.config_voiceclone_uid));
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_VOICECLONE_QUERY_UIDS_STRING, mSettings.getString(R.string.config_voiceclone_query_uids));
        mSpeechEngine.sendDirective(SpeechEngineDefines.DIRECTIVE_VOICECLONE_QUERY_STATUS, "");
        setResultText("");
    }

    private void submitTask() {
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_UID_STRING, mSettings.getString(R.string.config_voiceclone_uid));
        mSpeechEngine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_VOICECLONE_TASKID_INT, voiceCloneCurTaskId);
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_VOICECLONE_VOICE_TYPE_STRING,
                mSettings.getString(R.string.config_voiceclone_voice_type));
        mSpeechEngine.sendDirective(SpeechEngineDefines.DIRECTIVE_VOICECLONE_SUBMIT_TASK, "");
        setResultText("");
    }

    private void delTrainData() {
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_UID_STRING, mSettings.getString(R.string.config_voiceclone_uid));
        mSpeechEngine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_VOICECLONE_TASKID_INT, voiceCloneCurTaskId);
        mSpeechEngine.sendDirective(SpeechEngineDefines.DIRECTIVE_VOICECLONE_DELETE_DATA, "");
        setResultText("");
    }

    private void nextRecordTask() {
        try {
            if (voiceCloneTaskInfoJson != null) {
                JSONArray textArr = voiceCloneTaskInfoJson.getJSONArray("texts");
                if (textArr.length() != 0) {
                    updateCurTaskInfo((voiceCloneCurTextSeq + 1) % textArr.length());
                    setResultText("");
                    return;
                }
            }
            setResultText("You should get task info successfully first!");
        } catch (JSONException e) {
            e.printStackTrace();
        }
    }

    @Override
    public void onSpeechMessage(int type, byte[] data, int len) {
        String stdData = new String(data);
        Log.i(SpeechDemoDefines.TAG, "Message type: " + type + " data: " + stdData);
        switch (type) {
            case SpeechEngineDefines.MESSAGE_TYPE_ENGINE_START:
                onMsgStart(stdData);
                break;
            case SpeechEngineDefines.MESSAGE_TYPE_ENGINE_STOP:
                onMsgStop(stdData);
                break;
            case SpeechEngineDefines.MESSAGE_TYPE_ENGINE_ERROR:
                onMsgError(stdData);
                break;
            case SpeechEngineDefines.MESSAGE_TYPE_VOICECLONE_GET_TASK_RESULT:
                onMsgGetTaskResult(stdData);
                break;
            case SpeechEngineDefines.MESSAGE_TYPE_VOICECLONE_CHECK_ENV_RESULT:
                onMsgCheckEnvResult(stdData);
                break;
            case SpeechEngineDefines.MESSAGE_TYPE_VOICECLONE_RECORD_VOICE_RESULT:
                onMsgRecordVoiceResult(stdData);
                break;
            case SpeechEngineDefines.MESSAGE_TYPE_VOICECLONE_QUERY_STATUS_RESULT:
                onMsgQueryStatusResult(stdData);
                break;
            case SpeechEngineDefines.MESSAGE_TYPE_VOICECLONE_SUBMIT_TASK_RESULT:
                onMsgSubmitTaskResult(stdData);
                break;
            case SpeechEngineDefines.MESSAGE_TYPE_VOICECLONE_DELETE_DATA_RESULT:
                onMsgDeleteDataResult(stdData);
                break;
            default:
                break;
        }
    }

    private void onMsgStart(String stdData) {
        Log.i(SpeechDemoDefines.TAG, "Engine Started");
        mEngineStarted = true;
        mStartEngineTimestamp = System.currentTimeMillis();
    }

    private void onMsgStop(String stdData) {
        Log.i(SpeechDemoDefines.TAG, "Engine Stopped");
        mEngineStarted = false;
        mStreamRecorder.Stop();
        setResultText("Engine Stopped, cost: " + (System.currentTimeMillis() - mStartEngineTimestamp), true);
    }

    private void onMsgError(String stdData) {
        Log.i(SpeechDemoDefines.TAG, "Engine Error");
        setResultText(stdData);
        if (curActivityStatus == ActivityStatus.RECORDING) {
            switchStatus(preActivityStatus);
        }
    }

    private void onMsgGetTaskResult(String stdData) {
        try {
            setResultText("");
            voiceCloneTaskInfoJson = null;
            JSONArray jsonArr = new JSONArray(stdData);
            if (jsonArr.length() == 0) {
                setResultText("No task data!");
                Log.i(SpeechDemoDefines.TAG, "No task data!");
                return;
            }
            voiceCloneCurTaskId = mSettings.getInt(R.string.config_voiceclone_task_id);
            for (int i = 0; i < jsonArr.length(); ++i) {
                if (jsonArr.getJSONObject(i).optInt("task_id", -1) == voiceCloneCurTaskId) {
                    voiceCloneTaskInfoJson = jsonArr.getJSONObject(i);
                    break;
                }
            }
            if (voiceCloneTaskInfoJson == null) {
                voiceCloneTaskInfoJson = jsonArr.getJSONObject(0);
                setResultText("Find task: " + voiceCloneCurTaskId + " failed! Choose task: " + voiceCloneTaskInfoJson.getInt("task_id"));
            }

            // update task progress
            int prog = voiceCloneTaskInfoJson.getInt("progress");
            JSONArray texts = voiceCloneTaskInfoJson.getJSONArray("texts");
            updateCurTaskInfo(prog % texts.length());
            if (prog < texts.length() && prog >= 0) {
                setResultText("Get task info success!\nRecord task unfinished.\nGo to check environment", true);
                switchStatus(ActivityStatus.BEFORE_CHECK_ENV);
            } else {
                setResultText("Get task info success!\nRecord task finished!\nGo to submit task or query train status.", true);
                switchStatus(ActivityStatus.AFTER_SUBMIT);
            }
        } catch (JSONException e) {
            setResultText(stdData + "\nJSON parse failed!");
            e.printStackTrace();
        }
    }

    private void onMsgCheckEnvResult(String stdData) {
        try {
            JSONObject jsonObj = new JSONObject(stdData);
            int status = jsonObj.getInt("status");
            if (status > 0) {
                setResultText("Checking...\nCurrent status: " + status + "\nCurrent noise: " + jsonObj.getDouble("noise"));
            } else if (status < 0) {
                setResultText("Check failed! status: " + status);
                switchStatus(ActivityStatus.BEFORE_CHECK_ENV);
            } else {
                setResultText("Check success! status: " + status);
                switchStatus(ActivityStatus.BEFORE_RECORD);
            }
        } catch (JSONException e) {
            setResultText(stdData + "\nJSON parse failed!");
            e.printStackTrace();
        }
    }

    private void onMsgRecordVoiceResult(String stdData) {
        try {
            JSONObject jsonObj = new JSONObject(stdData);
            int status = jsonObj.getInt("status");
            if (status > 0) {
            } else if (status < 0) {
                setResultText("Check failed! status: " + status + ", wrong_index: " + jsonObj.getJSONArray("wrong_index").toString());
                switchStatus(ActivityStatus.BEFORE_RECORD);
            } else {
                setResultText("Check success! status: " + status);
                JSONArray textArr = voiceCloneTaskInfoJson.getJSONArray("texts");
                if (textArr.length() != 0 && voiceCloneCurTextSeq + 1 < textArr.length()) {
                    setResultText("Text " + voiceCloneCurTextSeq + " success! status: " + status);
                    switchStatus(ActivityStatus.BEFORE_RECORD);
                } else {
                    setResultText("Voice record task: " + + voiceCloneTaskInfoJson.getInt("task_id") + " finished!\nGo to submit task!");
                    switchStatus(ActivityStatus.BEFORE_SUBMIT);
                }
            }
        } catch (JSONException e) {
            setResultText(stdData + "\nJSON parse failed!");
            e.printStackTrace();
        }
    }

    private void onMsgQueryStatusResult(String stdData) {
        try {
            setResultText("");
            JSONArray jsonArray = new JSONArray(stdData);
            if (jsonArray.length() <= 0) {
                setResultText("Result empty!");
                return;
            }
            for (int i = 0; i < jsonArray.length(); ++i) {
                JSONObject item = jsonArray.getJSONObject(i);
                StringBuilder stringBuilder = new StringBuilder();
                stringBuilder.append(item.getString("uid"))
                        .append(": status: ").append(item.getInt("status"))
                        .append("; task_id: ").append(item.getInt("task_id"))
                        .append("; extra: ").append(item.getString("extra")).append("\n");
                setResultText(stringBuilder.toString(), true);
            }
        } catch (JSONException e) {
            setResultText(stdData + "\nJSON parse failed!");
            e.printStackTrace();
        }
    }

    private void onMsgSubmitTaskResult(String stdData) {
        try {
            JSONObject jsonObject = new JSONObject(stdData);
            String voiceType = jsonObject.getString("voice_type");
            setResultText("Task submit success, voice type: " + voiceType);
        } catch (JSONException e) {
            setResultText(stdData + "\nJSON parse failed!");
            e.printStackTrace();
        }
        switchStatus(ActivityStatus.AFTER_SUBMIT);
    }

    private void onMsgDeleteDataResult(String stdData) {
        setResultText("Train data del sucess");
    }

    private void initEngine() {
        if (mSpeechEngine == null) {
            mSpeechEngine = SpeechEngineGenerator.getInstance();
            mSpeechEngine.createEngine();
            mSpeechEngine.setContext(getApplicationContext());
        }

        Log.d(SpeechDemoDefines.TAG, "SDK version: " + mSpeechEngine.getVersion());
        Log.d(SpeechDemoDefines.TAG, "Debug path:" + getDebugPath());

        // common
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_LOG_LEVEL_STRING, SpeechEngineDefines.LOG_LEVEL_TRACE);
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_DEBUG_PATH_STRING, getDebugPath());
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_APP_ID_STRING, mSettings.getString(R.string.config_app_id));
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_APP_TOKEN_STRING, mSettings.getString(R.string.config_token));
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_RECORDER_TYPE_STRING, mSettings.getOptionsValue(R.string.config_recorder_type, this));
        mSpeechEngine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_VOICECLONE_ENABLE_DUMP_BOOL, true);
        mSpeechEngine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_SAMPLE_RATE_INT, mSettings.getInt(R.string.config_sample_rate));
        mSpeechEngine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_RECORDER_PRESET_INT, mSettings.getInt(R.string.config_recorder_preset));
        if (mSettings.getOptionsValue(R.string.config_recorder_type, this).equals(SpeechEngineDefines.RECORDER_TYPE_STREAM)) {
            if (mStreamRecorder.GetStreamSampleRate() != mSettings.getInt(R.string.config_sample_rate)) {
                mSpeechEngine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_ENABLE_RESAMPLER_BOOL, true);
            }
        }

        // VoiceClone
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_VOICECLONE_REC_PATH_STRING, getDebugPath());
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_ENGINE_NAME_STRING, SpeechEngineDefines.VOICECLONE_ENGINE);
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_VOICECLONE_ADDRESS_STRING, mSettings.getString(R.string.config_voiceclone_address));
        mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_VOICECLONE_STREAM_ADDRESS_STRING, mSettings.getString(R.string.config_voiceclone_stream_address));

        long startInitTimestamp = System.currentTimeMillis();
        int ret = mSpeechEngine.initEngine();
        if (ret != SpeechEngineDefines.ERR_NO_ERROR) {
            String errMessage = "Init Engine Failed: " + ret;
            Log.e(SpeechDemoDefines.TAG, errMessage);
            speechEngineInitFailed(errMessage);
            return;
        }
        long cost = System.currentTimeMillis() - startInitTimestamp;
        speechEngineInitOk(cost);
    }

    private void uninitEngine() {
        if (mSpeechEngine != null) {
            mSpeechEngine.destroyEngine();
            mSpeechEngine = null;
        }
    }

    public void speechEngineInitOk(long initCost) {
        Log.i(SpeechDemoDefines.TAG, "Speech engine init OK!");
        Log.d(SpeechDemoDefines.TAG, String.format("Engine init cost: %d", initCost));
        mSpeechEngine.setListener(this);
        mStreamRecorder.SetSpeechEngine(SpeechDemoDefines.ASR_VIEW, mSpeechEngine);
        this.runOnUiThread(() -> {
            mEngineStatus.setText(R.string.hint_ready);
            setResultText("Init cost: " + initCost);
            mEngineInited = true;
            switchStatus(ActivityStatus.BEFORE_GET_TASK);
        });
    }

    public void speechEngineInitFailed(String tipText) {
        Log.e(SpeechDemoDefines.TAG, "Speech engine init failed!");
        this.runOnUiThread(() -> {
            mEngineStatus.setText(R.string.hint_setup_failure);
            mEngineInited = false;
            switchStatus(ActivityStatus.BEFORE_INIT);
            setResultText(tipText);
        });
    }

    private void updateCurTaskInfo() {
        if (voiceCloneTaskInfoJson != null) {
            updateCurTaskInfo(voiceCloneTaskInfoJson.optInt("progress", 0));
        } else {
            updateCurTaskInfo(0);
        }
    }

    private void updateCurTaskInfo(int text_seq) {
        if (voiceCloneTaskInfoJson == null) {
            voiceCloneCurTaskId = mSettings.getInt(R.string.config_voiceclone_task_id);
            voiceCloneCurText = "";
            voiceCloneCurTextSeq = 0;
        } else {
            try {
                voiceCloneCurTaskId = voiceCloneTaskInfoJson.getInt("task_id");
                voiceCloneCurText = voiceCloneTaskInfoJson.getJSONArray("texts").getString(text_seq);
                voiceCloneCurTextSeq = text_seq;
            } catch (JSONException e) {
                e.printStackTrace();
            }
        }
        // update refer text
        this.runOnUiThread(() -> {
            mReferText.setText("Current task: " + voiceCloneCurTaskId +
                    "\nCurrent task sequence: " + voiceCloneCurTextSeq +
                    "\nCurrent text: " + voiceCloneCurText);
        });
    }

    public void setResultText(final String text) {
        setResultText(text, false);
    }

    public void setResultText(final String text, final boolean append) {
        this.runOnUiThread(() -> {
            if (append) {
                mResultText.append("\n" + text);
            } else {
                mResultText.setText(text);
            }
        });
    }

    private boolean checkRecorder() {
        if (mSettings.getOptionsValue(R.string.config_recorder_type, this).equals(SpeechEngineDefines.RECORDER_TYPE_STREAM)) {
            mSpeechEngine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_CUSTOM_SAMPLE_RATE_INT, mStreamRecorder.GetStreamSampleRate());
            mSpeechEngine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_CUSTOM_CHANNEL_INT, mStreamRecorder.GetStreamChannel());
            if (!mStreamRecorder.Start()) {
                requestPermission(VOICECLONE_PERMISSIONS);
                return false;
            }
        } else if (mSettings.getOptionsValue(R.string.config_recorder_type, this).equals(SpeechEngineDefines.RECORDER_TYPE_FILE)) {
            String test_file_path = getDebugPath() + "/voiceclone_rec_file.pcm";
            Log.d(SpeechDemoDefines.TAG, "test file path: " + test_file_path);
            mSpeechEngine.setOptionString(SpeechEngineDefines.PARAMS_KEY_RECORDER_FILE_STRING, test_file_path);
        }
        return true;
    }

    private void switchStatus(ActivityStatus status) {
        runOnUiThread(() -> {
            preActivityStatus = curActivityStatus;
            curActivityStatus = status;
            switch (status) {
                case BEFORE_INIT:
                    engineSwitchBtn.setText(R.string.init_engine_title);
                    setButton(engineSwitchBtn, true);
                    setButton(getTaskBtn, false);
                    setButton(checkEnvBtn, false);
                    setButton(voiceRecordBtn, false);
                    setButton(finishTalkingBtn, false);
                    setButton(getTrainStatusBtn, false);
                    setButton(submitTaskBtn, false);
                    setButton(delTrainDataBtn, false);
                    setButton(nextRecordTaskBtn, false);
                    break;
                case INITING:
                    engineSwitchBtn.setText(R.string.init_engine_title);
                    setButton(engineSwitchBtn, false);
                    setButton(getTaskBtn, false);
                    setButton(checkEnvBtn, false);
                    setButton(voiceRecordBtn, false);
                    setButton(finishTalkingBtn, false);
                    setButton(getTrainStatusBtn, false);
                    setButton(submitTaskBtn, false);
                    setButton(delTrainDataBtn, false);
                    setButton(nextRecordTaskBtn, false);
                    break;
                case RECORDING:
                    engineSwitchBtn.setText(R.string.uninit_engine_title);
                    setButton(engineSwitchBtn, false);
                    setButton(getTaskBtn, false);
                    setButton(checkEnvBtn, false);
                    setButton(voiceRecordBtn, false);
                    setButton(finishTalkingBtn, true);
                    setButton(getTrainStatusBtn, false);
                    setButton(submitTaskBtn, false);
                    setButton(delTrainDataBtn, false);
                    setButton(nextRecordTaskBtn, false);
                    break;
                case BEFORE_GET_TASK:
                case BEFORE_CHECK_ENV:
                case BEFORE_RECORD:
                case BEFORE_SUBMIT:
                case AFTER_SUBMIT:
                    engineSwitchBtn.setText(R.string.uninit_engine_title);
                    setButton(engineSwitchBtn, true);
                    setButton(getTaskBtn, true);
                    setButton(checkEnvBtn, true);
                    setButton(voiceRecordBtn, true);
                    setButton(finishTalkingBtn, false);
                    setButton(getTrainStatusBtn, true);
                    setButton(submitTaskBtn, true);
                    setButton(delTrainDataBtn, true);
                    setButton(nextRecordTaskBtn, true);
                    break;
                default:
                    break;
            }
        });
    }
}
