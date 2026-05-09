// Copyright 2021 Bytedance Inc. All Rights Reserved.
// Author: chengzihao.ds@bytedance.com (chengzihao.ds)

package com.bytedance.speech.speechdemo.settings;

import android.content.Context;
import android.content.res.Resources;
import android.util.Log;

import com.bytedance.speech.speechdemo.R;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

public class Settings {
    // TODO: can be optimized here, use hashmap + arraylist to accelerate
    public List<SettingItem> configs;

    public Settings() {
        configs = new ArrayList<>();
    }

    public void register(SettingItem item) {
        for (int i = 0; i < configs.size(); ++i) {
            if (configs.get(i).id == item.id) {
                configs.set(i, item);
                return;
            }
        }
        configs.add(item);
    }

    public void register(List<SettingItem> items) {
        for (SettingItem item : items) {
            register(item);
        }
    }

    public void set(String key, boolean val, Context context) {
        set(key, val, SettingItem.Type.BOOL, context);
    }

    public void set(int id, boolean val) {
        set(id, val, SettingItem.Type.BOOL);
    }

    public void set(String key, Number val, Context context) {
        set(key, val, SettingItem.Type.NUMBER, context);
    }

    public void set(int id, Number val) {
        set(id, val, SettingItem.Type.NUMBER);
    }

    public void set(String key, String val, Context context) {
        set(key, val, SettingItem.Type.STRING, context);
    }

    public void set(int id, String val) {
        set(id, val, SettingItem.Type.STRING);
    }

    public void set(String key, SettingItem.Options val, Context context) {
        set(key, val, SettingItem.Type.OPTIONS, context);
    }

    public void set(int id, SettingItem.Options val) {
        set(id, val, SettingItem.Type.OPTIONS);
    }

    private void set(String key, Object val, int type, Context context) {
        for (int i = 0; i < configs.size(); ++i) {
            SettingItem item = configs.get(i);
            if (Objects.equals(context.getString(item.id), key)) {
                item.type = type;
                item.value = val;
                configs.set(i, item);
                return;
            }
        }
    }

    private void set(int id, Object val, int type) {
        for (int i = 0; i < configs.size(); ++i) {
            SettingItem item = configs.get(i);
            if (item.id == id) {
                if (item.type == type) {
                    item.value = val;
                    configs.set(i, item);
                }
                return;
            }
        }
        // not found
        register(new SettingItem(type, id, val, R.string.no_hint));
    }

    public boolean getBoolean(int id) {
        return getBoolean(id, false);
    }

    public boolean getBoolean(int id, boolean def) {
        SettingItem item = get(id, SettingItem.Type.BOOL);
        if (item != null) {
            return (Boolean) item.value;
        }
        return def;
    }

    public int getInt(int id) {
        return getInt(id, 0);
    }

    public int getInt(int id, int def) {
        SettingItem item = get(id, SettingItem.Type.NUMBER);
        if (item != null && item.value != null) {
            return ((Number) item.value).intValue();
        }
        return def;
    }


    public Double getDouble(int id) {
        return getDouble(id, 0.);
    }

    public Double getDouble(int id, Double def) {
        SettingItem item = get(id, SettingItem.Type.NUMBER);
        if (item != null && item.value != null) {
            return ((Number) item.value).doubleValue();
        }
        return def;
    }

    public String getString(int id) {
        return getString(id, "");
    }

    public String getString(int id, String def) {
        SettingItem item = get(id, SettingItem.Type.STRING);
        if (item != null) {
            return (String) item.value;
        }
        return def;
    }

    public SettingItem.Options getOptions(int id) {
        return getOptions(id, new SettingItem.Options(0, 0));
    }

    public SettingItem.Options getOptions(int id, SettingItem.Options def) {
        SettingItem item = get(id, SettingItem.Type.OPTIONS);
        if (item != null) {
            return (SettingItem.Options) item.value;
        }
        return def;
    }

    public String getOptionsValue(int id, Context context) {
        SettingItem.Options options = getOptions(id);
        try {
            String[] array = context.getResources().getStringArray(options.arrayId);
            if (array == null) {
                return "";
            }
            if (array.length <= options.chooseIdx) {
                return "";
            }
            return array[options.chooseIdx];
        } catch (Resources.NotFoundException e) {
            return "";
        }
    }

    public String getOptionsValue(int id) {
        SettingItem.Options options = getOptions(id);
        List<String> array = options.arrayObj;
        if (array == null) {
            return "";
        }
        if (array.size() <= options.chooseIdx) {
            return "";
        }
        return array.get(options.chooseIdx);
    }

    private SettingItem get(int id, int type) {
        for (SettingItem item : configs) {
            if (item.id == id) {
                if (item.type == type) {
                    return item;
                }
                return null;
            }
        }
        return null;
    }
}
