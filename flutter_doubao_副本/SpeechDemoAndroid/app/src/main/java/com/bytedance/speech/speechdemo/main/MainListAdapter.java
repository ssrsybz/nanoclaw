package com.bytedance.speech.speechdemo.main;

import android.content.Context;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ArrayAdapter;
import android.widget.TextView;

import com.bytedance.speech.speechdemo.R;

import java.util.ArrayList;

public class MainListAdapter extends ArrayAdapter<MainSectionItem> {
    LayoutInflater inflater;
    public MainListAdapter(Context context, ArrayList<MainSectionItem> items) {
        super(context, 0, items);
        inflater = (LayoutInflater) context.getSystemService(Context.LAYOUT_INFLATER_SERVICE);
    }

    @Override
    public View getView(int position, View convertView, ViewGroup parent) {
        View v;
        MainSectionItem cell = (MainSectionItem) getItem(position);

        //If the cell is a section header we inflate the header layout
        if(cell.isSectionHeader()) {
            v = inflater.inflate(R.layout.main_section_header, null);
            v.setClickable(false);

            TextView header = (TextView) v.findViewById(R.id.main_section_header);
            header.setText(cell.getTitleId());
        } else {
            v = inflater.inflate(R.layout.main_section_item, null);
            TextView content = (TextView) v.findViewById(R.id.main_section_item);
            content.setText(cell.getTitleId());
        }
        return v;
    }
}
