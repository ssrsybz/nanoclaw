// Copyright 2021 Bytedance Inc. All Rights Reserved.
// Author: chengzihao.ds@bytedance.com (chengzihao.ds)

package com.bytedance.speech.speechdemo;

import android.annotation.SuppressLint;
import android.content.Intent;
import android.os.Bundle;
import android.util.Log;
import android.widget.ListView;

import com.bytedance.speech.speechdemo.settings.SettingItem;
import com.bytedance.speech.speechdemo.settings.SettingListAdapter;
import com.bytedance.speech.speechdemo.settings.Settings;
import com.bytedance.speech.speechdemo.utils.SensitiveDefines;
import com.bytedance.speech.speechdemo.utils.SpeechDemoDefines;

import java.util.Arrays;

public class SettingsActivity extends BaseActivity {
    public static final String BUNDLE_KEY_VIEW_ID = "VIEW_ID";

    private static final Settings asrSettings;
    private static final Settings asrOfflineSettings;
    private static final Settings auSettings;
    private static final Settings bigAsrSettings;
    private static final Settings afpSettings;
    private static final Settings captSettings;
    private static final Settings fulllinkSettings;
    private static final Settings ttsSettings;
    private static final Settings bittsSettings;
    private static final Settings uniTtsSettings;
    private static final Settings voiceCloneSettings;
    private static final Settings voiceConvSettings;
    private static final Settings dialogSettings;
    private static final Settings dialogDelegateSettings;
    private static final Settings kwsSettings;
    private static final Settings testAfpSettings;
    private static final Settings testAsrOfflineRtfSettings;
    private static final Settings testAsrOfflineLastPacketCostSettings;
    private static final Settings testAsrStressSettings;

    static {
        // Asr settings
        asrSettings = new Settings();
        asrSettings.register(Arrays.asList(
                // common
                new SettingItem(SettingItem.Type.GROUP, R.string.common_setting_title, null, R.string.no_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_app_id, SensitiveDefines.APPID, R.string.app_id_setting_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_token, SensitiveDefines.TOKEN, R.string.token_setting_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_cluster, SensitiveDefines.ASR_DEFAULT_CLUSTER, R.string.cluster_setting_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_address, SensitiveDefines.DEFAULT_ADDRESS, R.string.address_setting_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_uri, SensitiveDefines.ASR_DEFAULT_URI, R.string.uri_setting_hint),
                new SettingItem(SettingItem.Type.BOOL, R.string.config_get_volume, false, R.string.no_hint),
                new SettingItem(SettingItem.Type.OPTIONS, R.string.config_recorder_type, new SettingItem.Options(R.array.recorder_type, 0), R.string.no_hint),
                new SettingItem(SettingItem.Type.NUMBER, R.string.config_recorder_preset, 1, R.string.no_hint),
                new SettingItem(SettingItem.Type.BOOL, R.string.config_disable_recorder_reuse, false, R.string.no_hint),
                new SettingItem(SettingItem.Type.NUMBER, R.string.config_sample_rate, 16000, R.string.no_hint),
                new SettingItem(SettingItem.Type.NUMBER, R.string.config_channel, 1, R.string.no_hint),
                new SettingItem(SettingItem.Type.NUMBER, R.string.config_vad_max_speech_duration, 60000, R.string.no_hint),
                new SettingItem(SettingItem.Type.NUMBER, R.string.config_stream_package_duration, 3000, R.string.no_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_request_headers, "{\"custom_header_key0\": \"custom_header_value0\",\"custom_header_key1\": \"custom_header_value1\"}", R.string.no_hint),

                // asr
                new SettingItem(SettingItem.Type.GROUP, R.string.asr_setting_title, null, R.string.no_hint),
                new SettingItem(SettingItem.Type.BOOL, R.string.config_asr_rec_save, false, R.string.no_hint),
                new SettingItem(SettingItem.Type.BOOL, R.string.config_asr_enable_ddc, false, R.string.no_hint),
                new SettingItem(SettingItem.Type.BOOL, R.string.config_asr_enable_itn, false, R.string.no_hint),
                new SettingItem(SettingItem.Type.BOOL, R.string.config_asr_enable_nlu_punctuation, true, R.string.no_hint),
                new SettingItem(SettingItem.Type.BOOL, R.string.config_asr_disable_end_punctuation, false, R.string.no_hint),
                new SettingItem(SettingItem.Type.BOOL, R.string.config_asr_keep_recording, false, R.string.no_hint),
                new SettingItem(SettingItem.Type.BOOL, R.string.config_asr_show_lang, false, R.string.no_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_asr_language, "en-US", R.string.asr_language_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_asr_hotwords, "{\"hotwords\":[{\"word\":\"过秦论\",\"scale\":2.0}]}", R.string.asr_hotwords_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_asr_correct_words, "{\"古爱玲\":\"谷爱凌\",\"古埃宁\":\"谷爱凌\",\"谷爱玲\":\"谷爱凌\",\"谷埃宁\":\"谷爱凌\"}", R.string.asr_correct_words_hint),
                new SettingItem(SettingItem.Type.NUMBER, R.string.config_asr_vad_start_silence_time, 0, R.string.no_hint),
                new SettingItem(SettingItem.Type.NUMBER, R.string.config_asr_vad_end_silence_time, 0, R.string.no_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_asr_vad_mode, "", R.string.no_hint),
                new SettingItem(SettingItem.Type.OPTIONS, R.string.config_asr_result_type, new SettingItem.Options(R.array.asr_result_type, 0), R.string.no_hint),
                new SettingItem(SettingItem.Type.NUMBER, R.string.config_asr_max_retry_times, 0, R.string.no_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_asr_req_params, "", R.string.asr_req_params_hint)
        ));

        // Asr offline settins
        asrOfflineSettings = new Settings();
        asrOfflineSettings.register(Arrays.asList(
                // common
                new SettingItem(SettingItem.Type.GROUP, R.string.common_setting_title, null, R.string.no_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_app_id, SensitiveDefines.APPID, R.string.app_id_setting_hint),
                new SettingItem(SettingItem.Type.OPTIONS, R.string.config_recorder_type, new SettingItem.Options(R.array.recorder_type, 0), R.string.no_hint),
                new SettingItem(SettingItem.Type.NUMBER, R.string.config_vad_max_speech_duration, 5000, R.string.no_hint),
                new SettingItem(SettingItem.Type.OPTIONS, R.string.config_authenticate_type, new SettingItem.Options(R.array.authentication_type, 1), R.string.no_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_license_name, SensitiveDefines.LICENSE_NAME, R.string.license_name_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_license_busi_id, SensitiveDefines.LICENSE_BUSI_ID, R.string.license_busi_id_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_business_key, SensitiveDefines.BUSINESS_KEY, R.string.business_key_setting_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_authenticate_secret, SensitiveDefines.SECRET, R.string.authenticate_secret_setting_hint),

                // asr
                new SettingItem(SettingItem.Type.GROUP, R.string.asr_setting_title, null, R.string.no_hint),
                new SettingItem(SettingItem.Type.BOOL, R.string.config_asr_enable_resource_download, false, R.string.no_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_asr_model_name, SensitiveDefines.ASR_DEFAULT_MODEL_NAME, R.string.no_hint),
                new SettingItem(SettingItem.Type.BOOL, R.string.config_asr_rec_save, false, R.string.no_hint),
                new SettingItem(SettingItem.Type.BOOL, R.string.config_asr_enable_itn, false, R.string.no_hint),
                new SettingItem(SettingItem.Type.BOOL, R.string.config_asr_show_lang, false, R.string.no_hint)
        ));

        // Au settings
        auSettings = new Settings();
        auSettings.register(Arrays.asList(
                // common
                new SettingItem(SettingItem.Type.GROUP, R.string.common_setting_title, null, R.string.no_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_app_id, SensitiveDefines.AU_DEFAULT_APP_ID, R.string.app_id_setting_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_token, SensitiveDefines.TOKEN, R.string.token_setting_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_cluster, SensitiveDefines.AU_DEFAULT_CLUSTER, R.string.cluster_setting_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_address, SensitiveDefines.AU_DEFAULT_ADDRESS, R.string.address_setting_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_uri, SensitiveDefines.AU_DEFAULT_URI, R.string.uri_setting_hint),
                new SettingItem(SettingItem.Type.OPTIONS, R.string.config_recorder_type, new SettingItem.Options(R.array.recorder_type, 0), R.string.no_hint),
                new SettingItem(SettingItem.Type.NUMBER, R.string.config_recorder_preset, 1, R.string.no_hint),
                new SettingItem(SettingItem.Type.BOOL, R.string.config_disable_recorder_reuse, false, R.string.no_hint),

                // au
                new SettingItem(SettingItem.Type.GROUP, R.string.au_setting_title, null, R.string.no_hint),
                new SettingItem(SettingItem.Type.OPTIONS, R.string.config_au_ability, new SettingItem.Options(R.array.au_ability, 2), R.string.no_hint),
                new SettingItem(SettingItem.Type.BOOL, R.string.config_au_rec_save, false, R.string.no_hint),
                new SettingItem(SettingItem.Type.NUMBER, R.string.config_au_process_timeout, 3000, R.string.no_hint),
                new SettingItem(SettingItem.Type.NUMBER, R.string.config_au_audio_packet_duration, 80, R.string.no_hint),
                new SettingItem(SettingItem.Type.NUMBER, R.string.config_au_empty_packet_interval, 500, R.string.no_hint),
                new SettingItem(SettingItem.Type.NUMBER, R.string.config_vad_max_speech_duration, 60000, R.string.no_hint),
                new SettingItem(SettingItem.Type.NUMBER, R.string.config_vad_max_music_duration, 12000, R.string.no_hint),

                // asr
                new SettingItem(SettingItem.Type.GROUP, R.string.asr_setting_title, null, R.string.no_hint),
                new SettingItem(SettingItem.Type.BOOL, R.string.config_asr_enable_ddc, false, R.string.no_hint),
                new SettingItem(SettingItem.Type.BOOL, R.string.config_asr_enable_itn, false, R.string.no_hint),
                new SettingItem(SettingItem.Type.BOOL, R.string.config_asr_enable_nlu_punctuation, true, R.string.no_hint),
                new SettingItem(SettingItem.Type.BOOL, R.string.config_asr_show_lang, false, R.string.no_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_asr_language, "en-US", R.string.asr_language_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_asr_hotwords, "{\"hotwords\":[{\"word\":\"过秦论\",\"scale\":\"2.0\"}]}", R.string.asr_hotwords_hint),
                new SettingItem(SettingItem.Type.NUMBER, R.string.config_asr_vad_start_silence_time, 0, R.string.no_hint),
                new SettingItem(SettingItem.Type.NUMBER, R.string.config_asr_vad_end_silence_time, 0, R.string.no_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_asr_vad_mode, "", R.string.no_hint),
                new SettingItem(SettingItem.Type.OPTIONS, R.string.config_asr_result_type, new SettingItem.Options(R.array.asr_result_type, 0), R.string.no_hint)
        ));

        // BigAsr settings
        bigAsrSettings = new Settings();
        bigAsrSettings.register(Arrays.asList(
                // common
                new SettingItem(SettingItem.Type.GROUP, R.string.common_setting_title, null, R.string.no_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_app_id, SensitiveDefines.BIGASR_DEFAULT_APPID, R.string.app_id_setting_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_token, SensitiveDefines.BIGASR_DEFAULT_TOKEN, R.string.token_setting_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_resource_id, SensitiveDefines.BIGASR_DEFAULT_RESOURCE_ID, R.string.resourceid_setting_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_address, SensitiveDefines.DEFAULT_ADDRESS, R.string.address_setting_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_uri, SensitiveDefines.BIGASR_DEFAULT_URI, R.string.uri_setting_hint),
                new SettingItem(SettingItem.Type.BOOL, R.string.config_get_volume, false, R.string.no_hint),
                new SettingItem(SettingItem.Type.OPTIONS, R.string.config_recorder_type, new SettingItem.Options(R.array.recorder_type, 0), R.string.no_hint),
                new SettingItem(SettingItem.Type.NUMBER, R.string.config_recorder_preset, 1, R.string.no_hint),
                new SettingItem(SettingItem.Type.BOOL, R.string.config_disable_recorder_reuse, false, R.string.no_hint),
                new SettingItem(SettingItem.Type.NUMBER, R.string.config_sample_rate, 16000, R.string.no_hint),
                new SettingItem(SettingItem.Type.NUMBER, R.string.config_channel, 1, R.string.no_hint),
                new SettingItem(SettingItem.Type.NUMBER, R.string.config_vad_max_speech_duration, 60000, R.string.no_hint),
                // asr
                new SettingItem(SettingItem.Type.GROUP, R.string.asr_setting_title, null, R.string.no_hint),
                new SettingItem(SettingItem.Type.BOOL, R.string.config_asr_rec_save, false, R.string.no_hint),
                new SettingItem(SettingItem.Type.BOOL, R.string.config_asr_enable_ddc, false, R.string.no_hint),
                new SettingItem(SettingItem.Type.BOOL, R.string.config_asr_enable_itn, false, R.string.no_hint),
                new SettingItem(SettingItem.Type.BOOL, R.string.config_asr_enable_nlu_punctuation, true, R.string.no_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_asr_req_params, "", R.string.asr_req_params_hint)
        ));

        // Afp settings
        afpSettings = new Settings();
        afpSettings.register(Arrays.asList(
                // afp
                new SettingItem(SettingItem.Type.GROUP, R.string.afp_setting_title, null, R.string.no_hint),
                new SettingItem(SettingItem.Type.OPTIONS, R.string.config_music_engine_name, new SettingItem.Options(R.array.music_engine_name, 0), R.string.no_hint),
                new SettingItem(SettingItem.Type.OPTIONS, R.string.config_afp_result_type, new SettingItem.Options(R.array.afp_resut_type, 0), R.string.no_hint)
        ));

        // Capt settings
        captSettings = new Settings();
        captSettings.register(Arrays.asList(
                // common
                new SettingItem(SettingItem.Type.GROUP, R.string.common_setting_title, null, R.string.no_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_cluster, "", R.string.cluster_setting_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_address, "", R.string.address_setting_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_uri, "", R.string.uri_setting_hint),
                new SettingItem(SettingItem.Type.BOOL, R.string.config_get_volume, false, R.string.no_hint),
                new SettingItem(SettingItem.Type.OPTIONS, R.string.config_recorder_type, new SettingItem.Options(R.array.recorder_type, 0), R.string.no_hint),
                new SettingItem(SettingItem.Type.NUMBER, R.string.config_recorder_preset, 1, R.string.no_hint),
                new SettingItem(SettingItem.Type.BOOL, R.string.config_disable_recorder_reuse, false, R.string.no_hint),
                new SettingItem(SettingItem.Type.NUMBER, R.string.config_vad_max_speech_duration, 15000, R.string.no_hint),

                // capt
                new SettingItem(SettingItem.Type.GROUP, R.string.capt_setting_title, null, R.string.no_hint),
                new SettingItem(SettingItem.Type.BOOL, R.string.config_capt_rec_save, false, R.string.no_hint),
                new SettingItem(SettingItem.Type.OPTIONS, R.string.config_capt_core_type, new SettingItem.Options(R.array.capt_core_type, 0), R.string.no_hint),
                new SettingItem(SettingItem.Type.BOOL, R.string.config_capt_offline, false, R.string.no_hint),
                new SettingItem(SettingItem.Type.BOOL, R.string.config_capt_streaming, false, R.string.no_hint),
                new SettingItem(SettingItem.Type.NUMBER, R.string.config_capt_difficulty, 2, R.string.capt_input_difficulty_hint)
        ));

        // Fulllink settings
        fulllinkSettings = new Settings();
        fulllinkSettings.register(Arrays.asList(
                // common
                new SettingItem(SettingItem.Type.GROUP, R.string.common_setting_title, null, R.string.no_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_cluster, "", R.string.cluster_setting_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_address, "", R.string.address_setting_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_uri, "", R.string.uri_setting_hint),
                new SettingItem(SettingItem.Type.BOOL, R.string.config_enable_ppe_env, false, R.string.no_hint),

                new SettingItem(SettingItem.Type.BOOL, R.string.config_get_volume, false, R.string.no_hint),
                new SettingItem(SettingItem.Type.NUMBER, R.string.config_sample_rate, 16000, R.string.no_hint),
                new SettingItem(SettingItem.Type.OPTIONS, R.string.config_recorder_type, new SettingItem.Options(R.array.recorder_type, 0), R.string.no_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_file_or_directory_name, "", R.string.no_hint),
                new SettingItem(SettingItem.Type.BOOL, R.string.config_disable_check_record_permission, false, R.string.no_hint),
                new SettingItem(SettingItem.Type.NUMBER, R.string.config_compression_rate, 10, R.string.no_hint),
                new SettingItem(SettingItem.Type.NUMBER, R.string.config_complexity, 8, R.string.no_hint),
                new SettingItem(SettingItem.Type.BOOL, R.string.config_no_variable_bitrate, false, R.string.no_hint),
                new SettingItem(SettingItem.Type.BOOL, R.string.config_disable_upload_client_vad, false, R.string.no_hint),

                // fulllink
                new SettingItem(SettingItem.Type.GROUP, R.string.fulllink_setting_title, null, R.string.no_hint),
                new SettingItem(SettingItem.Type.OPTIONS, R.string.config_fulllink_engine_type, new SettingItem.Options(R.array.fulllink_engine_type, 0), R.string.no_hint),
                new SettingItem(SettingItem.Type.BOOL, R.string.config_traffic_for_test, true, R.string.no_hint),
                new SettingItem(SettingItem.Type.BOOL, R.string.config_rec_dump, false, R.string.no_hint),
                new SettingItem(SettingItem.Type.BOOL, R.string.config_kws_dump, false, R.string.no_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_scene_id, "general", R.string.no_hint),
                new SettingItem(SettingItem.Type.OPTIONS, R.string.config_wakeup_mode, new SettingItem.Options(R.array.wakeup_mode, 0), R.string.no_hint),
                new SettingItem(SettingItem.Type.OPTIONS, R.string.config_kws_work_mode, new SettingItem.Options(R.array.kws_work_mode, 0), R.string.no_hint),
                new SettingItem(SettingItem.Type.BOOL, R.string.config_only_asr, false, R.string.no_hint),
                new SettingItem(SettingItem.Type.BOOL, R.string.config_asr_auto_stop, true, R.string.no_hint),
                new SettingItem(SettingItem.Type.BOOL, R.string.config_disable_semantic_vad, false, R.string.no_hint),
                new SettingItem(SettingItem.Type.NUMBER, R.string.config_vad_head_wait_time, 6000, R.string.no_hint),
                new SettingItem(SettingItem.Type.NUMBER, R.string.config_max_valid_speech_duration, 10000, R.string.no_hint),
                new SettingItem(SettingItem.Type.BOOL, R.string.config_disable_tts, false, R.string.no_hint),
                new SettingItem(SettingItem.Type.BOOL, R.string.config_disable_auto_play, false, R.string.no_hint),
                new SettingItem(SettingItem.Type.BOOL, R.string.config_disable_signal, false, R.string.no_hint),
                new SettingItem(SettingItem.Type.BOOL, R.string.config_disable_send_asr_info_to_signal, false, R.string.no_hint),
                new SettingItem(SettingItem.Type.NUMBER, R.string.config_kws_worker_num, 0, R.string.no_hint),
                new SettingItem(SettingItem.Type.OPTIONS, R.string.config_device_type, new SettingItem.Options(R.array.device_type, 0), R.string.no_hint),
                new SettingItem(SettingItem.Type.NUMBER, R.string.signal_thread_priority_title, -10, R.string.no_hint)

        ));

        // Tts settings
        ttsSettings = new Settings();
        ttsSettings.register(Arrays.asList(
            // common
            new SettingItem(SettingItem.Type.GROUP, R.string.common_setting_title, null, R.string.no_hint),
            new SettingItem(SettingItem.Type.STRING, R.string.config_app_id, SensitiveDefines.APPID, R.string.app_id_setting_hint),
            new SettingItem(SettingItem.Type.STRING, R.string.config_token, SensitiveDefines.TOKEN, R.string.token_setting_hint),
            new SettingItem(SettingItem.Type.STRING, R.string.config_cluster, SensitiveDefines.TTS_DEFAULT_CLUSTER, R.string.cluster_setting_hint),
            new SettingItem(SettingItem.Type.STRING, R.string.config_address, SensitiveDefines.DEFAULT_ADDRESS, R.string.address_setting_hint),
            new SettingItem(SettingItem.Type.STRING, R.string.config_uri, SensitiveDefines.TTS_DEFAULT_URI, R.string.uri_setting_hint),
            new SettingItem(SettingItem.Type.STRING, R.string.config_voice_online, SensitiveDefines.TTS_DEFAULT_ONLINE_VOICE, R.string.voice_online_setting_hint),
            new SettingItem(SettingItem.Type.STRING, R.string.config_voice_type_online, SensitiveDefines.TTS_DEFAULT_ONLINE_VOICE_TYPE, R.string.voice_type_online_setting_hint),
            new SettingItem(SettingItem.Type.STRING, R.string.config_voice_offline, SensitiveDefines.TTS_DEFAULT_OFFLINE_VOICE, R.string.voice_online_setting_hint),
            new SettingItem(SettingItem.Type.STRING, R.string.config_voice_type_offline, SensitiveDefines.TTS_DEFAULT_OFFLINE_VOICE_TYPE, R.string.voice_type_online_setting_hint),
            new SettingItem(SettingItem.Type.OPTIONS, R.string.config_authenticate_type, new SettingItem.Options(R.array.authentication_type, 0), R.string.no_hint),
            new SettingItem(SettingItem.Type.STRING, R.string.config_license_name, SensitiveDefines.LICENSE_NAME, R.string.license_name_hint),
            new SettingItem(SettingItem.Type.STRING, R.string.config_license_busi_id, SensitiveDefines.LICENSE_BUSI_ID, R.string.license_busi_id_hint),
            new SettingItem(SettingItem.Type.STRING, R.string.config_business_key, SensitiveDefines.BUSINESS_KEY, R.string.business_key_setting_hint),
            new SettingItem(SettingItem.Type.STRING, R.string.config_authenticate_secret, SensitiveDefines.SECRET, R.string.authenticate_secret_setting_hint),
            new SettingItem(SettingItem.Type.BOOL, R.string.disable_ws_reconnect, false, R.string.no_hint),
            new SettingItem(SettingItem.Type.BOOL, R.string.config_disable_player_reuse, false, R.string.no_hint),
            new SettingItem(SettingItem.Type.NUMBER, R.string.config_audio_fadeout_duration, 0, R.string.audio_fadeout_duration_hint),
            new SettingItem(SettingItem.Type.NUMBER, R.string.config_player_stream_type, 3, R.string.player_stream_type_hint),

            // tts
            new SettingItem(SettingItem.Type.GROUP, R.string.tts_setting_title, null, R.string.no_hint),
            new SettingItem(SettingItem.Type.OPTIONS, R.string.tts_work_mode_title, new SettingItem.Options(R.array.tts_work_mode, 0), R.string.no_hint),
            new SettingItem(SettingItem.Type.OPTIONS, R.string.tts_text_type_title, new SettingItem.Options(R.array.tts_text_type, 0), R.string.no_hint),
            new SettingItem(SettingItem.Type.BOOL, R.string.config_tts_enable_resume_from_breakpoint, true, R.string.no_hint),
            new SettingItem(SettingItem.Type.BOOL, R.string.config_sdk_player, true, R.string.no_hint),
            new SettingItem(SettingItem.Type.BOOL, R.string.config_demo_player, false, R.string.no_hint),
            new SettingItem(SettingItem.Type.BOOL, R.string.config_tts_dump, false, R.string.no_hint),
            new SettingItem(SettingItem.Type.BOOL, R.string.config_tts_data_callback, false, R.string.no_hint),
            new SettingItem(SettingItem.Type.BOOL, R.string.config_tts_enable_word_level_progress_update, true, R.string.no_hint),
            new SettingItem(SettingItem.Type.NUMBER, R.string.config_tts_silence_duration, 0, R.string.tts_silence_duration_hint),
            new SettingItem(SettingItem.Type.NUMBER, R.string.config_tts_speak_speed, 1.0, R.string.tts_speak_speed_hint),
            new SettingItem(SettingItem.Type.NUMBER, R.string.config_tts_audio_volume, 1.0, R.string.tts_audio_volume_hint),
            new SettingItem(SettingItem.Type.NUMBER, R.string.config_tts_audio_pitch, 1.0, R.string.tts_audio_pitch_hint),
            new SettingItem(SettingItem.Type.NUMBER, R.string.config_tts_sample_rate, 24000, R.string.tts_sample_rate_hint),

            new SettingItem(SettingItem.Type.BOOL, R.string.enable_cache, false, R.string.no_hint),
            new SettingItem(SettingItem.Type.BOOL, R.string.config_tts_with_intent, false, R.string.no_hint),
            new SettingItem(SettingItem.Type.STRING, R.string.config_tts_language_online, SensitiveDefines.TTS_DEFAULT_ONLINE_LANGUAGE, R.string.tts_language_online_setting_hint),
            new SettingItem(SettingItem.Type.STRING, R.string.config_tts_emotion, "", R.string.tts_emotion_hint),
            new SettingItem(SettingItem.Type.BOOL, R.string.config_tts_use_voiceclone, false, R.string.no_hint),
            new SettingItem(SettingItem.Type.STRING, R.string.config_backend_cluster, SensitiveDefines.TTS_DEFAULT_BACKEND_CLUSTER, R.string.backend_cluster_setting_hint),
            new SettingItem(SettingItem.Type.STRING, R.string.config_tts_request_id, "", R.string.no_hint),
            new SettingItem(SettingItem.Type.STRING, R.string.config_tts_request_params, "", R.string.no_hint),

            new SettingItem(SettingItem.Type.OPTIONS, R.string.tts_offline_resource_format_title, new SettingItem.Options(R.array.tts_offline_resource_formats, 0), R.string.no_hint),
            new SettingItem(SettingItem.Type.STRING, R.string.config_tts_language_offline, SensitiveDefines.TTS_DEFAULT_OFFLINE_LANGUAGE, R.string.tts_language_offline_setting_hint),
            new SettingItem(SettingItem.Type.STRING, R.string.config_tts_model_name, "aispeech_tts", R.string.tts_model_name_setting_hint),
            new SettingItem(SettingItem.Type.BOOL, R.string.tts_limit_cpu_usage, false, R.string.no_hint)
        ));

        // Bi tts settings
        bittsSettings = new Settings();
        bittsSettings.register(Arrays.asList(
                // common
                new SettingItem(SettingItem.Type.GROUP, R.string.common_setting_title, null, R.string.no_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_app_id, SensitiveDefines.BITTS_DEFAULT_APP_ID, R.string.no_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_token, SensitiveDefines.BITTS_DEFAULT_TOKEN, R.string.no_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_resource_id, SensitiveDefines.BITTS_DEFAULT_RESOURCE_ID, R.string.no_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_address, SensitiveDefines.DEFAULT_ADDRESS, R.string.address_setting_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_uri, SensitiveDefines.BITTS_DEFAULT_URI, R.string.uri_setting_hint),

                // bi tts
                new SettingItem(SettingItem.Type.GROUP, R.string.bi_tts_setting_title, null, R.string.no_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_request_headers, "{}", R.string.no_hint),
                new SettingItem(SettingItem.Type.BOOL, R.string.config_enable_player,true,R.string.no_hint),
                new SettingItem(SettingItem.Type.BOOL, R.string.enable_dump_title, false, R.string.no_hint),
                new SettingItem(SettingItem.Type.BOOL, R.string.config_enable_player_audio_callback,true,R.string.no_hint),
                new SettingItem(SettingItem.Type.NUMBER,R.string.config_tts_conn_timeout,100000,R.string.no_hint)
        ));

        // Uni tts settings
        uniTtsSettings = new Settings();
        uniTtsSettings.register(Arrays.asList(
                // common
                new SettingItem(SettingItem.Type.GROUP, R.string.common_setting_title, null, R.string.no_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_app_id, SensitiveDefines.UNITTS_DEFAULT_APP_ID, R.string.no_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_token, SensitiveDefines.UNITTS_DEFAULT_TOKEN, R.string.no_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_resource_id, SensitiveDefines.UNITTS_DEFAULT_RESOURCE_ID, R.string.no_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_address, SensitiveDefines.DEFAULT_ADDRESS, R.string.address_setting_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_uri, SensitiveDefines.UNITTS_DEFAULT_URI, R.string.uri_setting_hint),

                // uni tts
                new SettingItem(SettingItem.Type.GROUP, R.string.uni_tts_setting_title, null, R.string.no_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_request_headers, "{}", R.string.no_hint),
                new SettingItem(SettingItem.Type.BOOL, R.string.config_enable_player,true,R.string.no_hint),
                new SettingItem(SettingItem.Type.BOOL, R.string.enable_dump_title, false, R.string.no_hint),
                new SettingItem(SettingItem.Type.BOOL, R.string.config_enable_player_audio_callback,true,R.string.no_hint),
                new SettingItem(SettingItem.Type.NUMBER,R.string.config_tts_conn_timeout,100000,R.string.no_hint)
        ));

        // VoiceClone settings
        voiceCloneSettings = new Settings();
        voiceCloneSettings.register(Arrays.asList(
                // common
                new SettingItem(SettingItem.Type.GROUP, R.string.common_setting_title, null, R.string.no_hint),
                new SettingItem(SettingItem.Type.NUMBER, R.string.config_sample_rate, 44100, R.string.no_hint),
                new SettingItem(SettingItem.Type.NUMBER, R.string.config_recorder_preset, 1, R.string.no_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_app_id, SensitiveDefines.APPID, R.string.no_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_token, SensitiveDefines.TOKEN, R.string.no_hint),
                new SettingItem(SettingItem.Type.OPTIONS, R.string.config_recorder_type, new SettingItem.Options(R.array.recorder_type, 0), R.string.no_hint),

                // voiceclone
                new SettingItem(SettingItem.Type.GROUP, R.string.voiceclone_setting_title, null, R.string.no_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_voiceclone_address, SensitiveDefines.DEFAULT_HTTP_ADDRESS, R.string.no_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_voiceclone_stream_address, SensitiveDefines.DEFAULT_ADDRESS, R.string.no_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_voiceclone_uid, SensitiveDefines.UID, R.string.voiceclone_uid_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_voiceclone_query_uids, SensitiveDefines.VOICECLONE_DEFAULT_UIDS, R.string.voiceclone_query_uids_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_voiceclone_voice_type, "", R.string.voiceclone_voice_type_hint),
                new SettingItem(SettingItem.Type.BOOL, R.string.config_voiceclone_gender, false, R.string.no_hint),
                new SettingItem(SettingItem.Type.NUMBER, R.string.config_voiceclone_task_id, SensitiveDefines.VOICECLONE_DEFAULT_TASK_ID, R.string.no_hint)
        ));

        // VoiceConv settings
        voiceConvSettings = new Settings();
        voiceConvSettings.register(Arrays.asList(
                // common
                new SettingItem(SettingItem.Type.GROUP, R.string.common_setting_title, null, R.string.no_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_voice, SensitiveDefines.VOICECONV_DEFAULT_VOICE, R.string.voice_online_setting_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_voice_type, SensitiveDefines.VOICECONV_DEFAULT_VOICE_TYPE, R.string.voice_type_online_setting_hint),
                new SettingItem(SettingItem.Type.BOOL, R.string.config_get_volume, false, R.string.no_hint),
                new SettingItem(SettingItem.Type.OPTIONS, R.string.config_recorder_type, new SettingItem.Options(R.array.recorder_type, 0), R.string.no_hint),
                new SettingItem(SettingItem.Type.NUMBER, R.string.config_recorder_preset, 1, R.string.no_hint),

                // voiceconv
                new SettingItem(SettingItem.Type.GROUP, R.string.voiceconv_setting_title, null, R.string.no_hint),
                new SettingItem(SettingItem.Type.NUMBER, R.string.config_voiceconv_result_sample_rate, 24000, R.string.no_hint),
                new SettingItem(SettingItem.Type.BOOL, R.string.config_voiceconv_enable_record_dump, true, R.string.no_hint),
                new SettingItem(SettingItem.Type.BOOL, R.string.config_voiceconv_enable_result_dump, true, R.string.no_hint),
                new SettingItem(SettingItem.Type.NUMBER, R.string.config_voiceconv_request_interval, 200, R.string.no_hint)
        ));

        // Kws settings
        kwsSettings = new Settings();
        kwsSettings.register(Arrays.asList(
                // common
                new SettingItem(SettingItem.Type.GROUP, R.string.common_setting_title, null, R.string.no_hint),
                new SettingItem(SettingItem.Type.BOOL, R.string.config_get_volume, false, R.string.no_hint),
                new SettingItem(SettingItem.Type.OPTIONS, R.string.config_recorder_type, new SettingItem.Options(R.array.recorder_type, 0), R.string.no_hint),
                new SettingItem(SettingItem.Type.NUMBER, R.string.config_recorder_preset, 1, R.string.no_hint),
                new SettingItem(SettingItem.Type.BOOL, R.string.config_rec_save, false, R.string.no_hint),
                new SettingItem(SettingItem.Type.OPTIONS, R.string.config_rec_file_type, new SettingItem.Options(R.array.rec_file_type, 0), R.string.no_hint),

                // kws
                new SettingItem(SettingItem.Type.GROUP, R.string.kws_setting_title, null, R.string.no_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_kws_custom_words, "{\"word_list\":[{\"name\":\"大力大力\",\"keyword_type\":0,\"min_dur\":0.15,\"max_dur\":3,\"threshold\":-3.6}]}", R.string.no_hint)
        ));

        // Dialog settings
        dialogSettings = new Settings();
        dialogSettings.register(Arrays.asList(
                // common
                new SettingItem(SettingItem.Type.GROUP, R.string.common_setting_title, null, R.string.no_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_app_id, SensitiveDefines.APPID, R.string.app_id_setting_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_app_key, SensitiveDefines.APPKEY, R.string.app_id_setting_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_token, SensitiveDefines.TOKEN, R.string.token_setting_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_resource_id, SensitiveDefines.DIALOG_DEFAULT_RESOURCE_ID, R.string.resourceid_setting_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_address, SensitiveDefines.DEFAULT_ADDRESS, R.string.address_setting_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_uri, SensitiveDefines.DIALOG_DEFAULT_URI, R.string.uri_setting_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_request_headers, "", R.string.no_hint),

                // dialog
                new SettingItem(SettingItem.Type.GROUP, R.string.dialog_setting_title, null, R.string.no_hint),
                new SettingItem(SettingItem.Type.BOOL, R.string.config_dialog_enable_player, true, R.string.no_hint),
                new SettingItem(SettingItem.Type.BOOL, R.string.config_dialog_enable_recorder_dump, false, R.string.no_hint),
                new SettingItem(SettingItem.Type.BOOL, R.string.config_dialog_enable_player_dump, false, R.string.no_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_dialog_bot_name, "豆包", R.string.no_hint)
        ));

        // Dialog delegate settings
        dialogDelegateSettings = new Settings();
        dialogDelegateSettings.register(Arrays.asList(
                // common
                new SettingItem(SettingItem.Type.GROUP, R.string.common_setting_title, null, R.string.no_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_app_id, SensitiveDefines.APPID, R.string.app_id_setting_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_app_key, SensitiveDefines.APPKEY, R.string.app_id_setting_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_token, SensitiveDefines.TOKEN, R.string.token_setting_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_resource_id, SensitiveDefines.DIALOG_DEFAULT_RESOURCE_ID, R.string.resourceid_setting_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_address, SensitiveDefines.DEFAULT_ADDRESS, R.string.address_setting_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_uri, SensitiveDefines.DIALOG_DEFAULT_URI, R.string.uri_setting_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_request_headers, "", R.string.no_hint),

                // dialog
                new SettingItem(SettingItem.Type.GROUP, R.string.dialog_setting_title, null, R.string.no_hint),
                new SettingItem(SettingItem.Type.BOOL, R.string.config_dialog_delegate_chat_tts_text, true, R.string.no_hint),
                new SettingItem(SettingItem.Type.BOOL, R.string.config_dialog_enable_recorder_dump, false, R.string.no_hint),
                new SettingItem(SettingItem.Type.BOOL, R.string.config_dialog_enable_player_dump, false, R.string.no_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_dialog_bot_name, "豆包", R.string.no_hint)
        ));

        // Test Afp settings
        testAfpSettings = new Settings();
        testAfpSettings.register(Arrays.asList(
                // afp
                new SettingItem(SettingItem.Type.GROUP, R.string.afp_setting_title, null, R.string.no_hint),
                new SettingItem(SettingItem.Type.OPTIONS, R.string.config_afp_result_type, new SettingItem.Options(R.array.afp_resut_type, 0), R.string.no_hint),
                new SettingItem(SettingItem.Type.NUMBER, R.string.config_afp_instance_number, 10, R.string.no_hint)
        ));

        // Test: asr offline rtf settins
        testAsrOfflineRtfSettings = new Settings();
        testAsrOfflineRtfSettings.register(Arrays.asList(
                // common
                new SettingItem(SettingItem.Type.GROUP, R.string.common_setting_title, null, R.string.no_hint),
                new SettingItem(SettingItem.Type.NUMBER, R.string.config_stream_package_duration, 20000, R.string.no_hint),

                // asr
                new SettingItem(SettingItem.Type.GROUP, R.string.asr_setting_title, null, R.string.no_hint),
                new SettingItem(SettingItem.Type.BOOL, R.string.config_asr_rec_save, false, R.string.no_hint),
                new SettingItem(SettingItem.Type.BOOL, R.string.config_asr_enable_itn, false, R.string.no_hint),
                new SettingItem(SettingItem.Type.BOOL, R.string.config_asr_show_lang, false, R.string.no_hint)
        ));

        // Test: asr offline last packet cost settins
        testAsrOfflineLastPacketCostSettings = new Settings();
        testAsrOfflineLastPacketCostSettings.register(Arrays.asList(
                // common
                new SettingItem(SettingItem.Type.GROUP, R.string.common_setting_title, null, R.string.no_hint),
                new SettingItem(SettingItem.Type.NUMBER, R.string.config_stream_package_duration, 200, R.string.no_hint),

                // asr
                new SettingItem(SettingItem.Type.GROUP, R.string.asr_setting_title, null, R.string.no_hint),
                new SettingItem(SettingItem.Type.BOOL, R.string.config_asr_rec_save, false, R.string.no_hint),
                new SettingItem(SettingItem.Type.BOOL, R.string.config_asr_enable_itn, false, R.string.no_hint),
                new SettingItem(SettingItem.Type.BOOL, R.string.config_asr_show_lang, false, R.string.no_hint)
        ));

        // Test: asr stress settings
        testAsrStressSettings = new Settings();
        testAsrStressSettings.register(Arrays.asList(
                // stress
                new SettingItem(SettingItem.Type.GROUP, R.string.stress_setting_title, null, R.string.no_hint),
                new SettingItem(SettingItem.Type.OPTIONS, R.string.config_asr_stress_scendid, new SettingItem.Options(R.array.asr_stress_type, 0), R.string.no_hint),

                // common
                new SettingItem(SettingItem.Type.GROUP, R.string.common_setting_title, null, R.string.no_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_app_id, SensitiveDefines.APPID, R.string.app_id_setting_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_token, SensitiveDefines.TOKEN, R.string.token_setting_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_cluster, SensitiveDefines.ASR_DEFAULT_CLUSTER, R.string.cluster_setting_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_address, SensitiveDefines.DEFAULT_ADDRESS, R.string.address_setting_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_uri, SensitiveDefines.ASR_DEFAULT_URI, R.string.uri_setting_hint),
                new SettingItem(SettingItem.Type.BOOL, R.string.config_get_volume, false, R.string.no_hint),
                new SettingItem(SettingItem.Type.OPTIONS, R.string.config_recorder_type, new SettingItem.Options(R.array.recorder_type, 0), R.string.no_hint),
                new SettingItem(SettingItem.Type.NUMBER, R.string.config_recorder_preset, 1, R.string.no_hint),
                new SettingItem(SettingItem.Type.BOOL, R.string.config_disable_recorder_reuse, false, R.string.no_hint),
                new SettingItem(SettingItem.Type.NUMBER, R.string.config_vad_max_speech_duration, 15000, R.string.no_hint),
                new SettingItem(SettingItem.Type.BOOL, R.string.config_rec_save, false, R.string.no_hint),
                new SettingItem(SettingItem.Type.OPTIONS, R.string.config_rec_file_type, new SettingItem.Options(R.array.rec_file_type, 0), R.string.no_hint),

                // asr
                new SettingItem(SettingItem.Type.GROUP, R.string.asr_setting_title, null, R.string.no_hint),
                new SettingItem(SettingItem.Type.OPTIONS, R.string.config_asr_scenario_type, new SettingItem.Options(R.array.asr_scenario_type, 0), R.string.no_hint),
                new SettingItem(SettingItem.Type.BOOL, R.string.config_asr_rec_save, false, R.string.no_hint),
                new SettingItem(SettingItem.Type.BOOL, R.string.config_asr_enable_ddc, false, R.string.no_hint),
                new SettingItem(SettingItem.Type.BOOL, R.string.config_asr_enable_itn, false, R.string.no_hint),
                new SettingItem(SettingItem.Type.BOOL, R.string.config_asr_enable_nlu_punctuation, true, R.string.no_hint),
                new SettingItem(SettingItem.Type.BOOL, R.string.config_asr_keep_recording, false, R.string.no_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_asr_language, "en-US", R.string.asr_language_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_asr_hotwords, "{\"hotwords\":[{\"word\":\"过秦论\",\"scale\":2.0}]}", R.string.asr_hotwords_hint),
                new SettingItem(SettingItem.Type.NUMBER, R.string.config_asr_vad_start_silence_time, 0, R.string.no_hint),
                new SettingItem(SettingItem.Type.NUMBER, R.string.config_asr_vad_end_silence_time, 0, R.string.no_hint),
                new SettingItem(SettingItem.Type.STRING, R.string.config_asr_vad_mode, "", R.string.no_hint),
                new SettingItem(SettingItem.Type.OPTIONS, R.string.config_asr_result_type, new SettingItem.Options(R.array.asr_result_type, 0), R.string.no_hint)
        ));
    }

    public static Settings getSettings(String viewId) {
        switch (viewId) {
            case SpeechDemoDefines.ASR_VIEW:
                return asrSettings;
            case SpeechDemoDefines.ASR_OFFLINE_VIEW:
                return asrOfflineSettings;
            case SpeechDemoDefines.CAPT_VIEW:
                return captSettings;
            case SpeechDemoDefines.FULLLINK_VIEW:
                return fulllinkSettings;
            case SpeechDemoDefines.TTS_VIEW:
                return ttsSettings;
            case SpeechDemoDefines.BI_TTS_VIEW:
                return bittsSettings;
            case SpeechDemoDefines.UNI_TTS_VIEW:
                return uniTtsSettings;
            case SpeechDemoDefines.VOICECLONE_VIEW:
                return voiceCloneSettings;
            case SpeechDemoDefines.VOICECONV_VIEW:
                return voiceConvSettings;
            case SpeechDemoDefines.DIALOG_VIEW:
                return dialogSettings;
            case SpeechDemoDefines.DIALOG_DELEGATE_VIEW:
                return dialogDelegateSettings;
            case SpeechDemoDefines.AU_VIEW:
                return auSettings;
            case SpeechDemoDefines.BIGASR_VIEW:
                return bigAsrSettings;
            case SpeechDemoDefines.KWS_VIEW:
                return kwsSettings;
            case SpeechDemoDefines.AFP_VIEW:
                return afpSettings;
            case SpeechDemoDefines.TEST_AFP_VIEW:
                return testAfpSettings;
            case SpeechDemoDefines.TEST_ASR_OFFLINE_RTF_VIEW:
                return testAsrOfflineRtfSettings;
            case SpeechDemoDefines.TEST_ASR_OFFLINE_LAST_PACKET_COST_VIEW:
                return testAsrOfflineLastPacketCostSettings;
            case SpeechDemoDefines.TEST_ASR_STRESS_VIEW:
                return testAsrStressSettings;
            default:
                return new Settings();
        }
    }

    @SuppressLint("ResourceType")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        Log.i(SpeechDemoDefines.TAG, "Settings onCreate");

        super.onCreate(savedInstanceState);
        setContentView(R.layout.settings_main);
        setTitleBar(R.string.title_activity_settings);

        // choose settings
        String viewId = null;
        Intent intent = getIntent();
        if (intent != null) {
            viewId = intent.getStringExtra(BUNDLE_KEY_VIEW_ID);
        }
        if (viewId == null) {
            viewId = "";
        }

        // show settings
        ListView settingsLv = findViewById(R.id.settings_container);
        SettingListAdapter adapter = new SettingListAdapter(this, getSettings(viewId));
        settingsLv.setAdapter(adapter);
    }
}
