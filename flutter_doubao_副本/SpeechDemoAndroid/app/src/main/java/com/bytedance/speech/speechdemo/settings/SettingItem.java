// Copyright 2021 Bytedance Inc. All Rights Reserved.
// Author: chengzihao.ds@bytedance.com (chengzihao.ds)

package com.bytedance.speech.speechdemo.settings;

import java.util.List;

public class SettingItem {
    public static final int TYPE_TOTAL_NUM = 5;
    public static class Type {
        public static final int GROUP = 0;      // group: means followed-items construct a group
        public static final int BOOL = 1;
        public static final int NUMBER = 2;
        public static final int STRING = 3;
        public static final int OPTIONS = 4;
    }

    public static class Options {
        public int arrayId;
        public List<String> arrayObj;
        public int chooseIdx;

        public Options(int id, int idx) {
            this.arrayId = id;
            this.arrayObj = null;
            this.chooseIdx = idx;
        }

        public Options(List<String> obj, int idx) {
            this.arrayId = 0;
            this.arrayObj = obj;
            this.chooseIdx = idx;
        }
    }

    // id must be resource id: R.string.config_xxx, will be used for TextView.setText()
    public int id;
    // type must be one of SettingItem.Type
    public int type;
    // value must correspond to type
    public Object value;
    // hint must be resource id: can be R.string.nohint, will be used for TextView.setHint()
    public int hint;

    public SettingItem(int t, int i, Object v, int h) {
        type = t;
        id = i;
        value = v;
        hint = h;
    }
}
