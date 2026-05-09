package com.bytedance.speech.speechdemo.main;

public class MainSectionItem {
    private final boolean isSectionHeader;
    private final int titleId;
    private Class<?> target;

    public MainSectionItem(int titleId, Class<?> target) {
        this.isSectionHeader = false;
        this.titleId = titleId;
        this.target = target;
    }

    public MainSectionItem(boolean isSectionHeader, int titleId) {
        this.isSectionHeader = isSectionHeader;
        this.titleId = titleId;
    }

    public boolean isSectionHeader() {
        return isSectionHeader;
    }

    public int getTitleId() {
        return titleId;
    }

    public Class<?> getTarget() { return target; }

}
