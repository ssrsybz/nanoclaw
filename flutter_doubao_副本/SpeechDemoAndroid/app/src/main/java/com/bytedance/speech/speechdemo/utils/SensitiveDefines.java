package com.bytedance.speech.speechdemo.utils;

/**
 * SensitiveDefines
 * Defines in this class should be different for different business,
 * please contact with @Bytedance AILab about what value should be set before use it.
 */
public class SensitiveDefines {

    // User Info
    public static final String UID = "YOUR USER ID";

    // Device Info
    public static final String DID = "YOUR DEVICE ID";

    // Online & Resource Authorization
    public static final String APPID = "YOUR APPID";
    public static final String APPKEY = "YOUR APPKEY";
    public static final String TOKEN = "YOUR TOKEN";
    public static final String APP_VERSION = "YOUR APP VERSION";

    // Offline Authorization
    public static final String AUTHENTICATE_ADDRESS = "AUTHENTICAT ADDRESS";
    public static final String AUTHENTICATE_URI = "AUTHENTICATE URI";
    public static final String LICENSE_NAME = "YOUR LICENSE NAME";
    public static final String LICENSE_BUSI_ID = "YOUR LICENSE BUSI_ID";
    public static final String SECRET = "YOUR SECRET";
    public static final String BUSINESS_KEY = "YOUR BUSINESS KEY";

    // Address
    public static final String DEFAULT_ADDRESS = "wss://openspeech.bytedance.com";
    public static final String DEFAULT_HTTP_ADDRESS = "https://openspeech.bytedance.com";

    // ASR
    public static final String ASR_DEFAULT_URI = "/api/v2/asr";
    public static final String ASR_DEFAULT_CLUSTER = "YOUR ASR CLUSTER";
    public static final String ASR_DEFAULT_MODEL_NAME = "YOUR ASR MODEL NAME";

    // BigASR
    public static final String BIGASR_DEFAULT_APPID = "YOUR APPID";
    public static final String BIGASR_DEFAULT_TOKEN = "YOUR TOKEN";
    public static final String BIGASR_DEFAULT_RESOURCE_ID = "YOUR RESOURCE ID";
    public static final String BIGASR_DEFAULT_URI = "/api/v3/sauc/bigmodel";

    // AU
    public static final String AU_DEFAULT_APP_ID = APPID;
    public static final String AU_DEFAULT_ADDRESS = DEFAULT_ADDRESS;
    public static final String AU_DEFAULT_URI = "/api/v1/sauc";
    public static final String AU_DEFAULT_CLUSTER = "YOUR AU CLUSTER";

    // TTS
    public static final String TTS_DEFAULT_URI = "/api/v1/tts/ws_binary";
    public static final String TTS_DEFAULT_CLUSTER = "YOUR TTS CLUSTER";
    public static final String TTS_DEFAULT_BACKEND_CLUSTER = "YOUR TTS BACKEND CLUSTER";
    public static final String TTS_DEFAULT_ONLINE_VOICE = "TTS ONLINE VOICE";
    public static final String TTS_DEFAULT_ONLINE_VOICE_TYPE = "TTS ONLINE VOICE TYPE";
    public static final String TTS_DEFAULT_OFFLINE_VOICE = "TTS OFFLINE VOICE";
    public static final String TTS_DEFAULT_OFFLINE_VOICE_TYPE = "TTS OFFLINE VOICE TYPE";
    public static final String TTS_DEFAULT_ONLINE_LANGUAGE = "TTS ONLINE LANGUAGE";
    public static final String TTS_DEFAULT_OFFLINE_LANGUAGE = "TTS OFFLINE LANGUAGE";
    public static final String[] TTS_DEFAULT_DOWNLOAD_OFFLINE_VOICES = new String[]{};

    // VoiceClone
    public static final String VOICECLONE_DEFAULT_UIDS = "uid_1;uid_2";
    public static final int VOICECLONE_DEFAULT_TASK_ID = -1;

    // VoiceConv
    public static final String VOICECONV_DEFAULT_URI = "/api/v1/voice_conv/ws";
    public static final String VOICECONV_DEFAULT_CLUSTER = "YOUR VOICECONV CLUSTER";
    public static final String VOICECONV_DEFAULT_VOICE = "VOICECONV VOICE";
    public static final String VOICECONV_DEFAULT_VOICE_TYPE = "VOICECONV VOICE TYPE";

    // Fulllink
    public static final String FULLLINK_DEFAULT_URI = "FULLLINK URI";

    // Dialog
    public static final String DIALOG_DEFAULT_URI = "/api/v3/realtime/dialogue";
    public static final String DIALOG_DEFAULT_RESOURCE_ID = "DIALOG RESOURCE ID";

    // Bi TTS
    public static final String BITTS_DEFAULT_APP_ID = "BITTS APP ID";
    public static final String BITTS_DEFAULT_TOKEN = "BITTS APP TOKEN";
    public static final String BITTS_DEFAULT_URI = "/api/v3/tts/bidirection";
    public static final String BITTS_DEFAULT_RESOURCE_ID = "BITTS RESOURCE ID";

    // Uni TTS
    public static final String UNITTS_DEFAULT_APP_ID = "UNITTS APP ID";
    public static final String UNITTS_DEFAULT_TOKEN = "UNITTS APP TOKEN";
    public static final String UNITTS_DEFAULT_URI = "/api/v3/tts/unidirectional/stream";
    public static final String UNITTS_DEFAULT_RESOURCE_ID = "UNITTS RESOURCE ID";

    // CAPT
    public static final String CAPT_DEFAULT_MDD_URI = "CAPT MDD URI";
    public static final String CAPT_DEFAULT_CLUSTER = "YOUR CAPT CLUSTER";

}
