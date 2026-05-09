// Copyright 2020 Bytedance Inc. All Rights Reserved.
// Author: fengkai.0518@bytedance.com (fengkai.0518)

package com.bytedance.speech.speechdemo;

import android.app.Application;
import android.content.Intent;
import android.os.Bundle;
import android.util.Log;
import android.widget.ListView;

import androidx.appcompat.app.AppCompatActivity;

import com.bytedance.speech.speechdemo.main.MainListAdapter;
import com.bytedance.speech.speechdemo.main.MainSectionItem;
import com.bytedance.speech.speechdemo.test.TestAfpActivity;
import com.bytedance.speech.speechdemo.test.TestAsrOfflineLastPacketCostActivity;
import com.bytedance.speech.speechdemo.test.TestAsrOfflineRtfActivity;
import com.bytedance.speech.speechdemo.test.TestAsrStressActivity;
import com.bytedance.speech.speechdemo.utils.SpeechDemoDefines;
import com.bytedance.speech.speechdemo.utils.SpeechStreamPlayer;
import com.bytedance.speech.speechdemo.utils.SpeechStreamRecorder;
import com.bytedance.speech.speechengine.SpeechEngine;

import com.bytedance.speech.speechengine.SpeechEngineGenerator;

import java.util.ArrayList;

public class MainActivity extends AppCompatActivity {

    private static final ArrayList<MainSectionItem> items;

    // StreamRecorder
    private static SpeechStreamRecorder mStreamRecorder = null;
    private static SpeechStreamPlayer mStreamPlayer = null;

    static {
        items = new ArrayList<>();
        items.add(new MainSectionItem(true, R.string.au_section_name));
        items.add(new MainSectionItem(R.string.vad_name, VadActivity.class));
        items.add(new MainSectionItem(R.string.asr_online_name, AsrActivity.class));
        items.add(new MainSectionItem(R.string.asr_offline_name, AsrOfflineActivity.class));
        items.add(new MainSectionItem(R.string.afp_name, AfpActivity.class));
        items.add(new MainSectionItem(R.string.au_name, AuActivity.class));
        items.add(new MainSectionItem(R.string.bigasr_name, BigAsrActivity.class));
        items.add(new MainSectionItem(true, R.string.bv_section_name));
        items.add(new MainSectionItem(R.string.tts_one_name, TtsNormalActivity.class));
        items.add(new MainSectionItem(R.string.bi_tts_name, BiTtsActivity.class));
        items.add(new MainSectionItem(R.string.uni_tts_name, UniTtsActivity.class));
        items.add(new MainSectionItem(R.string.tts_multi_name, TtsNovelActivity.class));
        items.add(new MainSectionItem(R.string.voiceclone_name, VoiceCloneActivity.class));
        items.add(new MainSectionItem(R.string.voiceconv_name, VoiceConvActivity.class));
        items.add(new MainSectionItem(true, R.string.vi_section_name));
        items.add(new MainSectionItem(R.string.dialog_name, DialogActivity.class));
        items.add(new MainSectionItem(R.string.dialog_delegate_name, DialogDelegateActivity.class));
        items.add(new MainSectionItem(R.string.assistant_name, FulllinkActivity.class));
        items.add(new MainSectionItem(R.string.kws_name, KwsActivity.class));
        items.add(new MainSectionItem(true, R.string.ie_section_name));
        items.add(new MainSectionItem(R.string.capt_name, CaptActivity.class));
        items.add(new MainSectionItem(true, R.string.test_section_name));
        items.add(new MainSectionItem(R.string.test_afp_name, TestAfpActivity.class));
        items.add(new MainSectionItem(R.string.test_asr_offline_rtf_name, TestAsrOfflineRtfActivity.class));
        items.add(new MainSectionItem(R.string.test_asr_offline_last_packet_cost_name, TestAsrOfflineLastPacketCostActivity.class));
        items.add(new MainSectionItem(R.string.test_asr_stress_name, TestAsrStressActivity.class));
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        Log.i(SpeechDemoDefines.TAG, "Main onCreate");

        super.onCreate(savedInstanceState);

        // Avoid the problem of creating to mutilate activity , the cause of intent from launched
        // app store is not similar to launched desktop.
        if (!this.isTaskRoot()) {
            Intent intent = getIntent();
            if (intent != null && intent.hasCategory(Intent.CATEGORY_LAUNCHER) && Intent.ACTION_MAIN.equals(intent.getAction())) {
                Log.e(SpeechDemoDefines.TAG, "Main cur task is not root");
                this.finish();
                return;
            }
        }

        setContentView(R.layout.activity_main);

        SpeechEngineGenerator.PrepareEnvironment(getApplicationContext(), getApplication());

        if (mStreamRecorder == null) {
            mStreamRecorder = new SpeechStreamRecorder();
        }
        if (mStreamPlayer == null) {
            mStreamPlayer = new SpeechStreamPlayer();
        }

        ListView list = (ListView) findViewById(R.id.main_listview);
        MainListAdapter adapter = new MainListAdapter(this, items);
        list.setAdapter(adapter);
        list.setOnItemClickListener((parent, view, position, id) -> {
            if (items.get(position).isSectionHeader()) {
                return;
            }
            Intent intent = new Intent(MainActivity.this, items.get(position).getTarget());
            startActivity(intent);
        });
    }

    @Override
    public void onBackPressed() {
        Log.i(SpeechDemoDefines.TAG, "Main onBackPressed");
        this.finish();
    }

    @Override
    protected void onDestroy() {
        Log.i(SpeechDemoDefines.TAG, "Main onDestroy");
        super.onDestroy();

        if (this.isTaskRoot()) {
            Log.i(SpeechDemoDefines.TAG, "Main killProcess");
            android.os.Process.killProcess(android.os.Process.myPid());
        }
    }


    public static void setStreamRecorder(SpeechStreamRecorder streamRecorder) {
        mStreamRecorder = streamRecorder;
    }

    public static SpeechStreamRecorder getStreamRecorder() {
        return mStreamRecorder;
    }

    public static void setStreamPlayer(SpeechStreamPlayer streamPlayer) {
        mStreamPlayer = streamPlayer;
    }

    public static SpeechStreamPlayer getStreamPlayer() {
        return mStreamPlayer;
    }

}