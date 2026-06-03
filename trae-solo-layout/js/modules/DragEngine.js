class DragEngine {
    constructor(eventBus, stateManager, options = {}) {
        this.eventBus = eventBus;
        this.stateManager = stateManager;
        
        this.panels = new Map();
        this.activePanel = null;
        this.dragState = {
            isDragging: false,
            startX: 0,
            startY: 0,
            startRect: null,
            panelId: null
        };
        
        this.config = {
            snapThreshold: options.snapThreshold || 25,
            gridSize: options.gridSize || 8,
            enableGridSnap: options.enableGridSnap !== false,
            enableEdgeSnap: options.enableEdgeSnap !== false,
            minPanelWidth: options.minPanelWidth || 220,
            maxPanelWidth: options.maxPanelWidth || 800,
            minPanelHeight: options.minPanelHeight || 150,
            maxPanelHeight: options.maxPanelHeight || 800
        };

        this.ghostEl = document.getElementById('dragGhost');
        this.snapZonesContainer = document.getElementById('snapZonesContainer');
        this.dockPreviewOverlay = document.getElementById('dockPreviewOverlay');
        this.dockPreviewBox = document.getElementById('dockPreviewBox');
        this.snapToast = document.getElementById('snapToast');

        this.activeZone = null;
        this.resizeHandle = null;

        this.init();
    }

    init() {
        this.bindGlobalEvents();
        this.initResizeHandles();
        
        console.log('[DragEngine] ✅ 初始化完成', {
            snapThreshold: this.config.snapThreshold,
            gridSize: this.config.gridSize,
            edgeSnap: this.config.enableEdgeSnap,
            gridSnap: this.config.enableGridSnap
        });
    }

    registerPanel(panelId, element, options = {}) {
        if (!element) {
            console.warn(`[DragEngine] 面板元素不存在: ${panelId}`);
            return false;
        }

        const panelConfig = {
            id: panelId,
            element,
            position: options.position || 'static',
            width: options.width || element.offsetWidth,
            height: options.height || element.offsetHeight,
            dockable: options.dockable !== false,
            resizable: options.resizable !== false,
            minWidth: options.minWidth || this.config.minPanelWidth,
            maxWidth: options.maxWidth || this.config.maxPanelWidth,
            minHeight: options.minHeight || this.config.minPanelHeight,
            maxHeight: options.maxHeight || this.config.maxPanelHeight,
            locked: options.locked || false
        };

        this.panels.set(panelId, panelConfig);
        this.injectDragHandle(element, panelId);
        this.applyDockPosition(element, panelConfig.position);

        console.log(`[DragEngine] ✅ 注册面板: ${panelId}`, panelConfig);
        
        this.eventBus.emit('panel:registered', { panelId, config: panelConfig });
        return true;
    }

    injectDragHandle(element, panelId) {
        if (element.querySelector('.drag-handle')) return;

        const header = element.querySelector('.panel-header');
        if (!header) return;

        const handle = document.createElement('button');
        handle.className = 'drag-handle';
        handle.dataset.panelId = panelId;
        handle.title = '拖动面板';
        handle.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="9" cy="5" r="1"/><circle cx="15" cy="5" r="1"/>
                <circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/>
                <circle cx="9" cy="19" r="1"/><circle cx="15" cy="19" r="1"/>
            </svg>
        `;

        handle.addEventListener('mousedown', (e) => this.startDrag(e, panelId));
        header.appendChild(handle);

        header.addEventListener('dblclick', () => this.toggleFloat(panelId));
    }

    startDrag(e, panelId) {
        const panel = this.panels.get(panelId);
        if (!panel || panel.locked) return;

        e.preventDefault();
        this.activePanel = panel;
        this.dragState = {
            isDragging: true,
            startX: e.clientX,
            startY: e.clientY,
            startRect: panel.element.getBoundingClientRect(),
            panelId
        };

        panel.element.classList.add('dragging');
        this.showGhost(panel);
        this.showSnapZones();
        this.updateDockPreview(e.clientX, e.clientY);

        this.eventBus.emit('drag:start', { panelId, position: { x: e.clientX, y: e.clientY } });
    }

    onDrag(e) {
        if (!this.dragState.isDragging || !this.activePanel) return;

        const deltaX = e.clientX - this.dragState.startX;
        const deltaY = e.clientY - this.dragState.startY;

        this.moveGhost(e.clientX, e.clientY);
        this.updateDockPreview(e.clientX, e.clientY);

        this.eventBus.emit('drag:move', {
            panelId: this.dragState.panelId,
            delta: { x: deltaX, y: deltaY },
            position: { x: e.clientX, y: e.clientY }
        });
    }

    endDrag(e) {
        if (!this.dragState.isDragging || !this.activePanel) return;

        const snappedZone = this.detectSnapZone(e.clientX, e.clientY);
        
        if (snappedZone) {
            this.dockToZone(this.activePanel.id, snappedZone);
            this.showSnapToast(snappedZone);
        } else {
            let newX = e.clientX - this.dragState.startRect.width / 2;
            let newY = e.clientY - this.dragState.startRect.height / 2;

            if (this.config.enableGridSnap) {
                newX = Math.round(newX / this.config.gridSize) * this.config.gridSize;
                newY = Math.round(newY / this.config.gridSize) * this.config.gridSize;
            }

            this.floatToPosition(this.activePanel.id, newX, newY);
        }

        this.activePanel.element.classList.remove('dragging');
        this.hideGhost();
        this.hideSnapZones();
        this.hideDockPreview();

        this.eventBus.emit('drag:end', {
            panelId: this.dragState.panelId,
            snappedTo: snappedZone || null
        });

        this.activePanel = null;
        this.dragState = {
            isDragging: false,
            startX: 0,
            startY: 0,
            startRect: null,
            panelId: null
        };
    }

    detectSnapZone(x, y) {
        const zones = ['left', 'right', 'top', 'bottom', 'center', 'fullscreen'];
        const viewport = {
            width: window.innerWidth,
            height: window.innerHeight
        };

        const zonePositions = {
            left: { x: viewport.width * 0.15, y: viewport.height * 0.5 },
            right: { x: viewport.width * 0.85, y: viewport.height * 0.5 },
            top: { x: viewport.width * 0.5, y: viewport.height * 0.2 },
            bottom: { x: viewport.width * 0.5, y: viewport.height * 0.85 },
            center: { x: viewport.width * 0.5, y: viewport.height * 0.5 },
            fullscreen: { x: viewport.width * 0.95, y: viewport.height * 0.08 }
        };

        let closestZone = null;
        let minDistance = Infinity;

        for (const zone of zones) {
            const pos = zonePositions[zone];
            const distance = Math.sqrt(Math.pow(x - pos.x, 2) + Math.pow(y - pos.y, 2));

            if (distance < 120 && distance < minDistance) {
                minDistance = distance;
                closestZone = zone;
            }
        }

        if (this.config.enableEdgeSnap && !closestZone) {
            if (x <= this.config.snapThreshold) closestZone = 'left';
            else if (x >= viewport.width - this.config.snapThreshold) closestZone = 'right';
            else if (y <= 80) closestZone = 'top';
            else if (y >= viewport.height - this.config.snapThreshold) closestZone = 'bottom';
        }

        return closestZone;
    }

    dockToZone(panelId, zone) {
        const panel = this.panels.get(panelId);
        if (!panel) return;

        panel.position = zone;
        this.applyDockPosition(panel.element, zone);
        this.panels.set(panelId, panel);

        this.stateManager.set(`layout.panels.${panelId}.position`, zone);
        this.eventBus.emit('panel:docked', { panelId, zone });
        this.saveLayout();
    }

    applyDockPosition(element, position) {
        element.removeAttribute('dock-position');
        
        switch (position) {
            case 'left':
                element.setAttribute('dock-position', 'left');
                break;
            case 'right':
                element.setAttribute('dock-position', 'right');
                break;
            case 'top':
                element.setAttribute('dock-position', 'top');
                break;
            case 'bottom':
                element.setAttribute('dock-position', 'bottom');
                break;
            case 'float':
                element.setAttribute('dock-position', 'float');
                break;
            case 'fullscreen':
                element.setAttribute('dock-position', 'fullscreen');
                break;
            default:
                break;
        }
    }

    floatToPosition(panelId, x, y) {
        const panel = this.panels.get(panelId);
        if (!panel) return;

        panel.position = 'float';
        panel.floatX = x;
        panel.floatY = y;

        panel.element.style.position = 'fixed';
        panel.element.style.left = `${x}px`;
        panel.element.style.top = `${y}px`;
        panel.element.style.zIndex = '99990';
        panel.element.setAttribute('dock-position', 'float');

        this.panels.set(panelId, panel);
        this.eventBus.emit('panel:floated', { panelId, x, y });
        this.saveLayout();
    }

    toggleFloat(panelId) {
        const panel = this.panels.get(panelId);
        if (!panel) return;

        if (panel.position === 'float') {
            this.dockToZone(panelId, 'left');
        } else {
            const rect = panel.element.getBoundingClientRect();
            this.floatToPosition(panelId, rect.left, rect.top);
        }
    }

    showGhost(panel) {
        if (!this.ghostEl || !panel) return;

        const ghostTitle = this.ghostEl.querySelector('.ghost-title');
        const ghostSize = this.ghostEl.querySelector('.ghost-size');

        if (ghostTitle) ghostTitle.textContent = panel.element.querySelector('h3, h4')?.textContent || '面板';
        if (ghostSize) ghostSize.textContent = `${this.dragState.startRect.width} × ${this.dragState.startRect.height}`;

        this.ghostEl.classList.add('visible');
    }

    moveGhost(x, y) {
        if (!this.ghostEl) return;

        const halfWidth = this.dragState.startRect.width / 2;
        const halfHeight = this.dragState.startRect.height / 2;

        this.ghostEl.style.left = `${x - halfWidth}px`;
        this.ghostEl.style.top = `${y - halfHeight}px`;
    }

    hideGhost() {
        if (this.ghostEl) {
            this.ghostEl.classList.remove('visible');
        }
    }

    showSnapZones() {
        if (this.snapZonesContainer) {
            this.snapZonesContainer.classList.add('active');
        }
    }

    hideSnapZones() {
        if (this.snapZonesContainer) {
            this.snapZonesContainer.classList.remove('active');
        }
        this.clearActiveZone();
    }

    clearActiveZone() {
        if (this.activeZone) {
            this.activeZone.classList.remove('active');
            this.activeZone = null;
        }
    }

    updateDockPreview(x, y) {
        const zone = this.detectSnapZone(x, y);
        
        if (zone) {
            this.highlightZone(zone);
            this.showDockPreviewForZone(zone);
        } else {
            this.clearActiveZone();
            this.hideDockPreview();
        }
    }

    highlightZone(zone) {
        this.clearActiveZone();
        
        if (this.snapZonesContainer) {
            this.activeZone = this.snapZonesContainer.querySelector(`[data-dock="${zone}"]`);
            if (this.activeZone) {
                this.activeZone.classList.add('active');
            }
        }
    }

    showDockPreviewForZone(zone) {
        if (!this.dockPreviewOverlay || !this.dockPreviewBox) return;

        const previewRects = {
            left: { left: 0, top: 60, width: 280, height: window.innerHeight - 60 },
            right: { right: 0, top: 60, width: 280, height: window.innerHeight - 60 },
            top: { left: 0, top: 60, width: window.innerWidth, height: 200 },
            bottom: { left: 0, bottom: 0, width: window.innerWidth, height: 200 },
            center: { left: '30%', top: '30%', width: '40%', height: '40%' },
            fullscreen: { left: 0, top: 0, width: '100vw', height: '100vh' }
        };

        const rect = previewRects[zone];
        if (rect) {
            Object.assign(this.dockPreviewBox.style, rect);
            this.dockPreviewOverlay.classList.add('active');
        }
    }

    hideDockPreview() {
        if (this.dockPreviewOverlay) {
            this.dockPreviewOverlay.classList.remove('active');
        }
    }

    showSnapToast(zone) {
        if (!this.snapToast) return;

        const messages = {
            left: '已吸附到左侧边缘',
            right: '已吸附到右侧边缘',
            top: '已吸附到顶部边缘',
            bottom: '已吸附到底部边缘',
            center: '已设为自由浮动',
            fullscreen: '已切换为全屏显示'
        };

        const toastMessage = this.snapToast.querySelector('.snap-toast-message');
        if (toastMessage) {
            toastMessage.textContent = messages[zone] || '已完成停靠';
        }

        this.snapToast.classList.add('visible');

        setTimeout(() => {
            this.snapToast.classList.remove('visible');
        }, 3000);

        const undoBtn = document.getElementById('snapToastUndo');
        if (undoBtn) {
            undoBtn.onclick = () => this.undoLastDock();
        }
    }

    undoLastDock() {
        if (!this.activePanel) return;
        this.dockToZone(this.activePanel.id, 'center');
        this.snapToast.classList.remove('visible');
    }

    initResizeHandles() {
        document.querySelectorAll('[dockable="true"]').forEach(panel => {
            this.createResizeHandles(panel);
        });
    }

    createResizeHandles(panel) {
        const positions = [
            { className: 'resize-handle-horizontal', cursor: 'ew-resize', direction: 'horizontal' },
            { className: 'resize-handle-vertical', cursor: 'ns-resize', direction: 'vertical' },
            { className: 'resize-handle-corner', cursor: 'nwse-resize', direction: 'corner' }
        ];

        positions.forEach(pos => {
            const handle = document.createElement('div');
            handle.className = `resize-handle ${pos.className}`;
            handle.style.cursor = pos.cursor;

            handle.addEventListener('mousedown', (e) => this.startResize(e, panel, pos.direction));
            panel.appendChild(handle);
        });
    }

    startResize(e, panel, direction) {
        e.preventDefault();
        e.stopPropagation();

        const rect = panel.getBoundingClientRect();
        this.resizeHandle = {
            panel,
            direction,
            startX: e.clientX,
            startY: e.clientY,
            startWidth: rect.width,
            startHeight: rect.height,
            startLeft: rect.left,
            startTop: rect.top
        };

        document.addEventListener('mousemove', this.onResize.bind(this));
        document.addEventListener('mouseup', this.endResize.bind(this));
    }

    onResize(e) {
        if (!this.resizeHandle) return;

        const { panel, direction, startX, startY, startWidth, startHeight } = this.resizeHandle;
        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;

        let newWidth = startWidth;
        let newHeight = startHeight;

        switch (direction) {
            case 'horizontal':
                newWidth = Utils.clamp(startWidth + deltaX, this.config.minPanelWidth, this.config.maxPanelWidth);
                break;
            case 'vertical':
                newHeight = Utils.clamp(startHeight + deltaY, this.config.minPanelHeight, this.config.maxPanelHeight);
                break;
            case 'corner':
                newWidth = Utils.clamp(startWidth + deltaX, this.config.minPanelWidth, this.config.maxPanelWidth);
                newHeight = Utils.clamp(startHeight + deltaY, this.config.minPanelHeight, this.config.maxPanelHeight);
                break;
        }

        panel.style.width = `${newWidth}px`;
        if (direction !== 'horizontal') {
            panel.style.height = `${newHeight}px`;
        }

        this.eventBus.emit('panel:resizing', {
            panelId: panel.id,
            width: newWidth,
            height: newHeight
        });
    }

    endResize() {
        if (this.resizeHandle) {
            this.eventBus.emit('panel:resized', {
                panelId: this.resizeHandle.panel.id,
                width: this.resizeHandle.panel.offsetWidth,
                height: this.resizeHandle.panel.offsetHeight
            });
        }

        this.resizeHandle = null;
        document.removeEventListener('mousemove', this.onResize.bind(this));
        document.removeEventListener('mouseup', this.endResize.bind(this));
        this.saveLayout();
    }

    lockPanel(panelId) {
        const panel = this.panels.get(panelId);
        if (panel) {
            panel.locked = true;
            panel.element.classList.add('is-locked');
            this.panels.set(panelId, panel);
            this.eventBus.emit('panel:locked', { panelId });
        }
    }

    unlockPanel(panelId) {
        const panel = this.panels.get(panelId);
        if (panel) {
            panel.locked = false;
            panel.element.classList.remove('is-locked');
            this.panels.set(panelId, panel);
            this.eventBus.emit('panel:unlocked', { panelId });
        }
    }

    lockAllPanels() {
        this.panels.forEach((panel, id) => this.lockPanel(id));
    }

    unlockAllPanels() {
        this.panels.forEach((panel, id) => this.unlockPanel(id));
    }

    saveLayout() {
        const layoutData = {
            timestamp: Date.now(),
            panels: {}
        };

        this.panels.forEach((panel, id) => {
            layoutData.panels[id] = {
                position: panel.position,
                width: panel.element.offsetWidth,
                height: panel.element.offsetHeight,
                floatX: panel.floatX,
                floatY: panel.floatY,
                locked: panel.locked
            };
        });

        try {
            localStorage.setItem('agentStudio_layout', JSON.stringify(layoutData));
            this.stateManager.set('layout', layoutData);
        } catch (error) {
            console.error('[DragEngine] 保存布局失败:', error);
        }
    }

    loadLayout() {
        try {
            const savedLayout = localStorage.getItem('agentStudio_layout');
            if (savedLayout) {
                const layoutData = JSON.parse(savedLayout);
                
                Object.entries(layoutData.panels).forEach(([panelId, config]) => {
                    const panel = this.panels.get(panelId);
                    if (panel && config.position) {
                        this.dockToZone(panelId, config.position);
                        
                        if (config.floatX !== undefined && config.floatY !== undefined) {
                            this.floatToPosition(panelId, config.floatX, config.floatY);
                        }
                        
                        if (config.locked) {
                            this.lockPanel(panelId);
                        }
                    }
                });

                this.stateManager.set('layout', layoutData);
                console.log('[DragEngine] 已加载保存的布局');
                return true;
            }
        } catch (error) {
            console.error('[DragEngine] 加载布局失败:', error);
        }
        return false;
    }

    resetLayout() {
        this.panels.forEach((panel, id) => {
            this.dockToZone(id, panel.defaultPosition || 'static');
            this.unlockPanel(id);
        });

        localStorage.removeItem('agentStudio_layout');
        this.eventBus.emit('layout:reset');
        console.log('[DragEngine] 布局已重置');
    }

    getPanels() {
        const panelsInfo = {};
        this.panels.forEach((panel, id) => {
            panelsInfo[id] = {
                position: panel.position,
                locked: panel.locked,
                width: panel.element.offsetWidth,
                height: panel.element.offsetHeight
            };
        });
        return panelsInfo;
    }

    bindGlobalEvents() {
        document.addEventListener('mousemove', Utils.throttle((e) => this.onDrag(e), 16));
        document.addEventListener('mouseup', (e) => this.endDrag(e));
        document.addEventListener('mouseleave', () => {
            if (this.dragState.isDragging) {
                this.endDrag({ clientX: 0, clientY: 0 });
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.dragState.isDragging) {
                this.endDrag({ clientX: 0, clientY: 0 });
            }
        });
    }

    destroy() {
        this.hideGhost();
        this.hideSnapZones();
        this.hideDockPreview();
        
        this.panels.clear();
        this.activePanel = null;
        this.dragState = {
            isDragging: false,
            startX: 0,
            startY: 0,
            startRect: null,
            panelId: null
        };

        console.log('[DragEngine] 🔴 已销毁');
    }
}

if (typeof window !== 'undefined') {
    window.DragEngine = DragEngine;
}
