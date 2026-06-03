class LayoutManager {
    constructor(eventBus, stateManager, dragEngine) {
        this.eventBus = eventBus;
        this.stateManager = stateManager;
        this.dragEngine = dragEngine;
        
        this.toolbar = null;
        this.isVisible = false;
        this.currentPreset = 'default';
        this.isLocked = false;
        this.layoutHistory = [];
        this.maxHistory = 20;

        this.presets = {
            default: {
                name: '默认三栏布局',
                icon: 'default',
                panels: {
                    leftPanel: { position: 'left', width: 280 },
                    rightPanel: { position: 'right', width: 300 },
                    bookmarksPanel: { position: 'hidden' },
                    recentFilesPanel: { position: 'hidden' }
                }
            },
            vertical: {
                name: '左右分栏布局',
                icon: 'vertical',
                panels: {
                    leftPanel: { position: 'left', width: 350 },
                    rightPanel: { position: 'right', width: 350 },
                    bookmarksPanel: { position: 'hidden' },
                    recentFilesPanel: { position: 'hidden' }
                }
            },
            horizontal: {
                name: '上下分栏布局',
                icon: 'horizontal',
                panels: {
                    leftPanel: { position: 'top', height: 250, width: '100%' },
                    rightPanel: { position: 'bottom', height: 250, width: '100%' },
                    bookmarksPanel: { position: 'hidden' },
                    recentFilesPanel: { position: 'hidden' }
                }
            },
            focus: {
                name: '专注模式（全屏）',
                icon: 'focus',
                panels: {
                    leftPanel: { position: 'hidden' },
                    rightPanel: { position: 'hidden' },
                    bookmarksPanel: { position: 'hidden' },
                    recentFilesPanel: { position: 'hidden' }
                }
            }
        };

        this.init();
    }

    init() {
        this.toolbar = document.getElementById('layoutManagerToolbar');
        
        if (this.toolbar) {
            this.bindToolbarEvents();
        }

        this.loadCurrentPreset();
        this.bindGlobalEvents();

        console.log('[LayoutManager] ✅ 初始化完成');
    }

    bindToolbarEvents() {
        const closeBtn = document.getElementById('closeLayoutMgr');
        const saveBtn = document.getElementById('saveLayoutBtn');
        const resetBtn = document.getElementById('resetLayoutBtn');
        const lockBtn = document.getElementById('lockLayoutBtn');

        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.toggle());
        }

        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.saveLayout());
        }

        if (resetBtn) {
            resetBtn.addEventListener('click', () => this.resetToPreset(this.currentPreset));
        }

        if (lockBtn) {
            lockBtn.addEventListener('click', () => this.toggleLock());
        }

        const presetButtons = this.toolbar.querySelectorAll('.lm-preset-btn');
        presetButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const presetName = btn.dataset.preset;
                this.applyPreset(presetName);
            });
        });
    }

    bindGlobalEvents() {
        this.eventBus.on('layout:toggle', () => this.toggle());
        this.eventBus.on('layout:apply-preset', ({ preset }) => this.applyPreset(preset));
        this.eventBus.on('panel:docked', ({ panelId, zone }) => this.updatePanelListUI());
        this.eventBus.on('panel:floated', ({ panelId }) => this.updatePanelListUI());
        this.eventBus.on('layout:reset', () => this.resetToPreset('default'));
    }

    toggle() {
        if (this.toolbar) {
            this.isVisible = !this.isVisible;
            this.toolbar.classList.toggle('visible', this.isVisible);
            
            if (this.isVisible) {
                this.updatePanelListUI();
            }

            this.eventBus.emit('layout:manager-toggled', { visible: this.isVisible });
        }
    }

    show() {
        if (this.toolbar && !this.isVisible) {
            this.toggle();
        }
    }

    hide() {
        if (this.toolbar && this.isVisible) {
            this.toggle();
        }
    }

    applyPreset(presetName) {
        const preset = this.presets[presetName];
        if (!preset) {
            console.error(`[LayoutManager] 预设不存在: ${presetName}`);
            return false;
        }

        this.currentPreset = presetName;
        this.addToHistory({ type: 'preset', name: presetName, timestamp: Date.now() });

        Object.entries(preset.panels).forEach(([panelId, config]) => {
            if (config.position === 'hidden') {
                this.hidePanel(panelId);
            } else if (this.dragEngine) {
                this.dragEngine.dockToZone(panelId, config.position);
                
                if (config.width) {
                    const panel = this.dragEngine.panels.get(panelId);
                    if (panel) {
                        panel.element.style.width = `${config.width}px`;
                    }
                }
                
                if (config.height) {
                    const panel = this.dragEngine.panels.get(panelId);
                    if (panel) {
                        panel.element.style.height = `${config.height}px`;
                    }
                }
            }
        });

        this.updateActivePresetButton(presetName);
        this.updatePanelListUI();
        this.saveCurrentState();

        this.eventBus.emit('layout:preset-applied', { preset: presetName, config: preset });
        console.log(`[LayoutManager] 已应用预设: ${preset.name}`);

        return true;
    }

    resetToPreset(presetName) {
        return this.applyPreset(presetName || this.currentPreset || 'default');
    }

    hidePanel(panelId) {
        const panelElement = document.getElementById(panelId);
        if (panelElement) {
            panelElement.style.display = 'none';
        }
        
        this.eventBus.emit('panel:hidden', { panelId });
    }

    showPanel(panelId) {
        const panelElement = document.getElementById(panelId);
        if (panelElement) {
            panelElement.style.display = '';
        }
        
        this.eventBus.emit('panel:shown', { panelId });
    }

    updateActivePresetButton(activePreset) {
        if (!this.toolbar) return;

        const buttons = this.toolbar.querySelectorAll('.lm-preset-btn');
        buttons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.preset === activePreset);
        });
    }

    updatePanelListUI() {
        const panelListEl = document.getElementById('lmPanelList');
        if (!panelListEl || !this.dragEngine) return;

        const panelsInfo = this.dragEngine.getPanels();
        
        let html = '';
        Object.entries(panelsInfo).forEach(([panelId, info]) => {
            const displayName = this.getPanelDisplayName(panelId);
            const statusText = this.getPanelStatusText(info.position);
            const statusClass = `docked-${info.position}`;
            const color = this.getPanelColor(panelId);

            html += `
                <div class="lm-panel-item" data-panel="${panelId}">
                    <span class="panel-dot" style="background: ${color};"></span>
                    <span class="panel-name">${displayName}</span>
                    <span class="panel-status ${statusClass}">${statusText}</span>
                </div>
            `;
        });

        panelListEl.innerHTML = html;
    }

    getPanelDisplayName(panelId) {
        const names = {
            leftPanel: '左侧任务栏',
            rightPanel: '右侧工具栏',
            centerPanel: '中间内容区',
            bookmarksPanel: '书签面板',
            recentFilesPanel: '最近访问'
        };
        return names[panelId] || panelId;
    }

    getPanelStatusText(position) {
        const texts = {
            left: '左停靠',
            right: '右停靠',
            top: '顶停靠',
            bottom: '底停靠',
            float: '浮动',
            fullscreen: '全屏',
            hidden: '隐藏',
            static: '静态'
        };
        return texts[position] || position;
    }

    getPanelColor(panelId) {
        const colors = {
            leftPanel: '#8b5cf6',
            rightPanel: '#06b6d4',
            centerPanel: '#10b981',
            bookmarksPanel: '#f59e0b',
            recentFilesPanel: '#ef4444'
        };
        return colors[panelId] || '#6b7280';
    }

    toggleLock() {
        this.isLocked = !this.isLocked;

        if (this.dragEngine) {
            if (this.isLocked) {
                this.dragEngine.lockAllPanels();
            } else {
                this.dragEngine.unlockAllPanels();
            }
        }

        const lockBtn = document.getElementById('lockLayoutBtn');
        if (lockBtn) {
            lockBtn.innerHTML = this.isLocked ? `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
                解锁面板
            ` : `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
                锁定面板
            `;
        }

        this.eventBus.emit('layout:locked', { locked: this.isLocked });
    }

    saveLayout() {
        if (!this.dragEngine) return;

        this.dragEngine.saveLayout();
        
        const customLayout = {
            name: `自定义布局_${Utils.formatDate(new Date(), 'YYYYMMDD_HHmmss')}`,
            timestamp: Date.now(),
            preset: this.currentPreset,
            isCustom: true,
            panels: {}
        };

        this.dragEngine.panels.forEach((panel, id) => {
            customLayout.panels[id] = {
                position: panel.position,
                width: panel.element.offsetWidth,
                height: panel.element.offsetHeight,
                locked: panel.locked
            };
        });

        this.addToHistory(customLayout);

        this.eventBus.emit('layout:saved', customLayout);
        this.eventBus.emit('toast:show', { 
            message: '布局已保存', 
            type: 'success',
            duration: 2000 
        });

        console.log('[LayoutManager] 布局已保存:', customLayout.name);
    }

    saveCurrentState() {
        try {
            const state = {
                currentPreset: this.currentPreset,
                isLocked: this.isLocked,
                timestamp: Date.now()
            };
            localStorage.setItem('agentStudio_layout_state', JSON.stringify(state));
            this.stateManager.set('layoutManager', state);
        } catch (error) {
            console.error('[LayoutManager] 保存状态失败:', error);
        }
    }

    loadCurrentPreset() {
        try {
            const savedState = localStorage.getItem('agentStudio_layout_state');
            if (savedState) {
                const state = JSON.parse(savedState);
                this.currentPreset = state.currentPreset || 'default';
                this.isLocked = state.isLocked || false;

                if (this.isLocked && this.dragEngine) {
                    setTimeout(() => this.dragEngine.lockAllPanels(), 500);
                }

                console.log(`[LayoutManager] 已加载状态: ${this.currentPreset}`);
            }
        } catch (error) {
            console.error('[LayoutManager] 加载状态失败:', error);
        }
    }

    addToHistory(entry) {
        this.layoutHistory.push(entry);
        if (this.layoutHistory.length > this.maxHistory) {
            this.layoutHistory.shift();
        }
    }

    getHistory(limit = 10) {
        return this.layoutHistory.slice(-limit);
    }

    undo() {
        if (this.layoutHistory.length === 0) {
            console.warn('[LayoutManager] 没有可撤销的操作');
            return false;
        }

        const lastEntry = this.layoutHistory.pop();
        
        if (lastEntry.type === 'preset') {
            const previousEntry = this.layoutHistory[this.layoutHistory.length - 1];
            if (previousEntry && previousEntry.type === 'preset') {
                this.applyPreset(previousEntry.name);
            } else {
                this.applyPreset('default');
            }
        }

        this.eventBus.emit('layout:undone', { entry: lastEntry });
        console.log('[LayoutManager] 已撤销');

        return true;
    }

    exportLayout() {
        if (!this.dragEngine) return null;

        const layoutData = {
            version: '1.0.0',
            exportDate: new Date().toISOString(),
            currentPreset: this.currentPreset,
            isLocked: this.isLocked,
            panels: {}
        };

        this.dragEngine.panels.forEach((panel, id) => {
            layoutData.panels[id] = {
                position: panel.position,
                width: panel.element.offsetWidth,
                height: panel.element.offsetHeight,
                floatX: panel.floatX,
                floatY: panel.floatY,
                locked: panel.locked
            };
        });

        return layoutData;
    }

    importLayout(layoutData) {
        if (!layoutData || !layoutData.panels) {
            console.error('[LayoutManager] 无效的布局数据');
            return false;
        }

        Object.entries(layoutData.panels).forEach(([panelId, config]) => {
            if (this.dragEngine && this.dragEngine.panels.has(panelId)) {
                if (config.position) {
                    this.dragEngine.dockToZone(panelId, config.position);
                    
                    if (config.floatX !== undefined && config.floatY !== undefined) {
                        this.dragEngine.floatToPosition(panelId, config.floatX, config.floatY);
                    }
                    
                    if (config.locked) {
                        this.dragEngine.lockPanel(panelId);
                    }
                }
            }
        });

        if (layoutData.currentPreset) {
            this.currentPreset = layoutData.currentPreset;
        }

        if (layoutData.isLocked !== undefined) {
            this.isLocked = layoutData.isLocked;
        }

        this.updateActivePresetButton(this.currentPreset);
        this.updatePanelListUI();

        this.eventBus.emit('layout:imported', layoutData);
        console.log('[LayoutManager] 布局已导入');

        return true;
    }

    getCurrentPreset() {
        return this.currentPreset;
    }

    getPresets() {
        return { ...this.presets };
    }

    addPreset(name, config) {
        if (this.presets[name]) {
            console.warn(`[LayoutManager] 预设已存在: ${name}`);
            return false;
        }

        this.presets[name] = config;
        this.eventBus.emit('layout:preset-added', { name, config });
        
        return true;
    }

    removePreset(name) {
        if (!this.presets[name]) {
            console.warn(`[LayoutManager] 预设不存在: ${name}`);
            return false;
        }

        delete this.presets[name];
        this.eventBus.emit('layout:preset-removed', { name });
        
        return true;
    }

    isVisible() {
        return this.isVisible;
    }

    isLocked() {
        return this.isLocked;
    }

    destroy() {
        this.hide();
        this.toolbar = null;
        this.layoutHistory = [];
        
        console.log('[LayoutManager] 🔴 已销毁');
    }
}

if (typeof window !== 'undefined') {
    window.LayoutManager = LayoutManager;
}
