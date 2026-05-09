package com.bytedance.speech.speechdemo;

import android.content.Context;
import android.util.Log;

import com.bytedance.speech.speechdemo.utils.SpeechDemoDefines;
import com.bytedance.speech.speechengine.SpeechEngine;
import com.bytedance.speech.speechengine.SpeechEngineDefines;
import com.bytedance.speech.speechengine.SpeechEngineGenerator;

import java.util.ArrayList;
import java.util.List;

public class MultiSpeechEngine {

    public String getVersion() {
        return mEngines.get(0).getVersion();
    }

    public List<SpeechEngine> getEngineList() {
        return mEngines;
    }

    public synchronized void setListener(SpeechEngine.SpeechListener listener) {
        mEngines.get(0).setListener(listener);
    }

    public synchronized void setContext(Context context) {
        for (int j = 0; j < mEngines.size(); ++j) {
            mEngines.get(j).setContext(context);
        }
    }

    public synchronized int createEngine(long num) {
        if (mEngines == null) {
            mEngines = new ArrayList<>();
        } else {
            mEngines.clear();
        }
        Log.i(SpeechDemoDefines.TAG, "The number of speech engine instance: " + num);
        if (num <= 0) {
            return SpeechEngineDefines.ERR_INVALID_ARGUMENTS;
        }
        for (int j = 0; j < num; ++j) {
            SpeechEngine engine = SpeechEngineGenerator.getInstance();
            engine.createEngine();
            mEngines.add(engine);
        }
        return SpeechEngineDefines.ERR_NO_ERROR;
    }

    public synchronized void destroyEngine() {
        for (int j = 0; j < mEngines.size(); ++j) {
            mEngines.get(j).destroyEngine();
        }
        mEngines.clear();
    }

    public synchronized void setOptionString(String key, String value) {
        Log.d(SpeechDemoDefines.TAG, "key: " + key + ", value: " + value);
        for (int j = 0; j < mEngines.size(); ++j) {
            mEngines.get(j).setOptionString(key, value);
        }
    }

    public synchronized void setOptionString(int index, String key, String value) {
        Log.d(SpeechDemoDefines.TAG, "key: " + key + ", value: " + value);
        if (index >= 0 && index < mEngines.size()) {
            mEngines.get(index).setOptionString(key, value);
        }
    }

    public synchronized void setOptionBoolean(String key, boolean value) {
        Log.d(SpeechDemoDefines.TAG, "key: " + key + ", value: " + value);
        for (int j = 0; j < mEngines.size(); ++j) {
            mEngines.get(j).setOptionBoolean(key, value);
        }
    }

    public synchronized void setOptionInt(String key, int value) {
        Log.d(SpeechDemoDefines.TAG, "key: " + key + ", value: " + value);
        for (int j = 0; j < mEngines.size(); ++j) {
            mEngines.get(j).setOptionInt(key, value);
        }
    }

    public synchronized void setOptionDouble(String key, Double value) {
        Log.d(SpeechDemoDefines.TAG, "key: " + key + ", value: " + value);
        for (int j = 0; j < mEngines.size(); ++j) {
            mEngines.get(j).setOptionDouble(key, value);
        }
    }

    public synchronized int initEngine() {
        int ret = SpeechEngineDefines.ERR_NO_ERROR;
        int j = 0;
        for (; j < mEngines.size(); ++j) {
            ret = mEngines.get(j).initEngine();
            if (ret != SpeechEngineDefines.ERR_NO_ERROR) {
                Log.e(SpeechDemoDefines.TAG, "Send directive to " + j + "th engine failed, ret: " + ret);
                break;
            }
        }
        if (ret != SpeechEngineDefines.ERR_NO_ERROR) {
            for (int i = 0; i < j; ++i) {
                mEngines.get(i).destroyEngine();
            }
        }
        return ret;
    }

    public synchronized int sendDirective(int type, String data) {
        Log.d(SpeechDemoDefines.TAG, "type: " + type + ", data: " + data);
        int ret = SpeechEngineDefines.ERR_NO_ERROR;
        for (int j = 0; j < mEngines.size(); ++j) {
            ret = mEngines.get(j).sendDirective(type, data);
            if (ret != SpeechEngineDefines.ERR_NO_ERROR) {
                Log.e(SpeechDemoDefines.TAG, "Send directive to " + j + "th engine failed, ret: " + ret);
                break;
            }
        }
        return ret;
    }

    List<SpeechEngine> mEngines = null;
}
