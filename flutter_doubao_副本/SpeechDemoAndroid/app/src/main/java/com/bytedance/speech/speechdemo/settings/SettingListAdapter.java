// Copyright 2021 Bytedance Inc. All Rights Reserved.
// Author: chengzihao.ds@bytedance.com (chengzihao.ds)

package com.bytedance.speech.speechdemo.settings;

import android.content.Context;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.BaseAdapter;
import android.widget.CompoundButton;
import android.widget.EditText;
import android.widget.Spinner;
import android.widget.Switch;
import android.widget.TextView;

import com.bytedance.speech.speechdemo.R;

public class SettingListAdapter extends BaseAdapter {

    private Context context;
    private Settings settings;

    public SettingListAdapter(Context context, Settings settings) {
        this.context = context;
        this.settings = settings;
    }

    @Override
    public int getCount() {
        return settings.configs.size();
    }

    @Override
    public Object getItem(int i) {
        return null;
    }

    @Override
    public long getItemId(int i) {
        return 0;
    }

    @Override
    public int getItemViewType(int position) {
        return settings.configs.get(position).type;
    }

    @Override
    public int getViewTypeCount() {
        return SettingItem.TYPE_TOTAL_NUM;
    }

    @Override
    public View getView(int i, View view, ViewGroup viewGroup) {
        SettingItem item = settings.configs.get(i);
        final int pos = i;
        switch (item.type) {
            case SettingItem.Type.GROUP:
                GroupViewHolder groupViewHolder;
                if (view == null) {
                    view = LayoutInflater.from(context).inflate(R.layout.settings_item_group, null);
                    groupViewHolder = new GroupViewHolder();
                    groupViewHolder.itemTv = view.findViewById(R.id.item_text_view);
                    view.setTag(groupViewHolder);
                } else {
                    groupViewHolder = (GroupViewHolder) view.getTag();
                }
                groupViewHolder.itemTv.setText(item.id);
                break;
            case SettingItem.Type.BOOL:
                BoolViewHolder boolViewHolder;
                if (view == null) {
                    view = LayoutInflater.from(context).inflate(R.layout.settings_item_bool, null);
                    boolViewHolder = new BoolViewHolder();
                    boolViewHolder.itemSwt = view.findViewById(R.id.item_switch);
                    view.setTag(boolViewHolder);
                } else {
                    boolViewHolder = (BoolViewHolder) view.getTag();
                }
                boolViewHolder.itemSwt.setText(item.id);
                boolViewHolder.itemSwt.setChecked((Boolean) item.value);
                boolViewHolder.itemSwt.setOnClickListener((switchBtn) -> {
                    settings.set(settings.configs.get(pos).id, ((Switch) switchBtn).isChecked());
                });
                break;
            case SettingItem.Type.NUMBER:
                NumberViewHolder numberViewHolder;
                if (view == null) {
                    view = LayoutInflater.from(context).inflate(R.layout.settings_item_number, null);
                    numberViewHolder = new NumberViewHolder();
                    numberViewHolder.itemIdTv = view.findViewById(R.id.item_key_text_view);
                    numberViewHolder.itemValEt = view.findViewById(R.id.item_value_edit_text);
                    numberViewHolder.itemValEt.setTag(pos);
                    view.setTag(numberViewHolder);
                    numberViewHolder.itemValEt.addTextChangedListener(new AttachPosTextWatch(numberViewHolder.itemValEt) {
                        @Override
                        public void onAttachPosTextChanged(String text, int pos) {
                            Number num = null;
                            try {
                                num = Integer.parseInt(text);
                            } catch (Exception parseIntException) {
                                try {
                                    num = Double.parseDouble(text);
                                } catch (Exception parseDoubleException) {
                                }
                            }
                            settings.set(settings.configs.get(pos).id, num);
                        }
                    });
                } else {
                    numberViewHolder = (NumberViewHolder) view.getTag();
                    numberViewHolder.itemValEt.setTag(pos);
                }
                numberViewHolder.itemIdTv.setText(item.id);
                if (item.value != null) {
                    numberViewHolder.itemValEt.setText(item.value.toString());
                }
                numberViewHolder.itemValEt.setHint(item.hint);
                break;
            case SettingItem.Type.STRING:
                StringViewHolder stringViewHolder;
                if (view == null) {
                    view = LayoutInflater.from(context).inflate(R.layout.settings_item_string, null);
                    stringViewHolder = new StringViewHolder();
                    stringViewHolder.itemIdTv = view.findViewById(R.id.item_key_text_view);
                    stringViewHolder.itemValEt = view.findViewById(R.id.item_value_edit_text);
                    stringViewHolder.itemValEt.setTag(pos);
                    view.setTag(stringViewHolder);
                    stringViewHolder.itemValEt.addTextChangedListener(new AttachPosTextWatch(stringViewHolder.itemValEt) {
                        @Override
                        public void onAttachPosTextChanged(String text, int pos) {
                            settings.set(settings.configs.get(pos).id, text);
                        }
                    });
                } else {
                    stringViewHolder = (StringViewHolder) view.getTag();
                    stringViewHolder.itemValEt.setTag(pos);
                }
                stringViewHolder.itemIdTv.setText(item.id);
                stringViewHolder.itemValEt.setText((String) item.value);
                stringViewHolder.itemValEt.setHint(item.hint);
                break;
            case SettingItem.Type.OPTIONS:
                OptionsViewHolder optionsViewHolder;
                if (view == null) {
                    view = LayoutInflater.from(context).inflate(R.layout.settings_item_options, null);
                    optionsViewHolder = new OptionsViewHolder();
                    optionsViewHolder.itemIdTv = view.findViewById(R.id.item_key_text_view);
                    optionsViewHolder.itemOptSp = view.findViewById(R.id.item_options_spinner);
                    view.setTag(optionsViewHolder);
                } else {
                    optionsViewHolder = (OptionsViewHolder) view.getTag();
                }
                SettingItem.Options itemOpt = (SettingItem.Options) item.value;
                optionsViewHolder.itemIdTv.setText(item.id);
                if (itemOpt.arrayObj != null) {
                    optionsViewHolder.itemOptSp.setAdapter(new ArrayAdapter<>(context, android.R.layout.simple_list_item_activated_1,
                            itemOpt.arrayObj));
                } else {
                    optionsViewHolder.itemOptSp.setAdapter(new ArrayAdapter<>(context, android.R.layout.simple_list_item_activated_1,
                            context.getResources().getStringArray(itemOpt.arrayId)));
                }
                optionsViewHolder.itemOptSp.setSelection(itemOpt.chooseIdx);
                optionsViewHolder.itemOptSp.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
                    @Override
                    public void onItemSelected(AdapterView<?> adapterView, View view, int i, long l) {
                        SettingItem.Options itemOpt = (SettingItem.Options) settings.configs.get(pos).value;
                        itemOpt.chooseIdx = i;
                        settings.set(settings.configs.get(pos).id, itemOpt);
                    }

                    @Override
                    public void onNothingSelected(AdapterView<?> adapterView) {

                    }
                });
                break;
        }
        if (view != null) {
            view.setId(item.id);
        }
        return view;
    }

    static class GroupViewHolder {
        TextView itemTv;
    }

    static class BoolViewHolder {
        Switch itemSwt;
    }

    static class NumberViewHolder {
        TextView itemIdTv;
        EditText itemValEt;
    }

    static class StringViewHolder {
        TextView itemIdTv;
        EditText itemValEt;
    }

    static class OptionsViewHolder {
        TextView itemIdTv;
        Spinner itemOptSp;
    }

    /**
     * When ListView reuse EditText, the real position might be changed.
     * Use AttachPosTextWatch to avoid this problem. view.getTag() will record pos
     */
    static abstract class AttachPosTextWatch implements TextWatcher {
        private View attachPosView;

        public AttachPosTextWatch(View apv) {
            attachPosView = apv;
        }

        @Override
        public void beforeTextChanged(CharSequence charSequence, int i, int i1, int i2) {

        }

        @Override
        public void onTextChanged(CharSequence charSequence, int i, int i1, int i2) {
            int pos = (Integer) attachPosView.getTag();
            onAttachPosTextChanged(charSequence.toString(), pos);
        }

        @Override
        public void afterTextChanged(Editable editable) {

        }

        public abstract void onAttachPosTextChanged(String text, int pos);
    }
}
