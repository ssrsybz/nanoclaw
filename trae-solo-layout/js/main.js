class App {
    constructor() {
        this.version = '2.0.0';
        this.name = 'AI Agent 工作台';
        this.isInitialized = false;
        this.modules = {};
        
        this.eventBus = null;
        this.stateManager = null;
    }

    async init() {
        try {
            console.log(`%c🚀 ${this.name} v${this.version}`, 
                'color: #8b5cf6; font-size: 20px; font-weight: bold;');
            console.log('%c⏳ 正在初始化应用...', 'color: #6b7280; font-size: 12px;');

            this.initCore();
            await this.initModules();
            await this.initUI();
            this.bindGlobalEvents();
            this.registerPanels();
            
            this.isInitialized = true;

            console.log('%c✅ 应用初始化完成！', 
                'color: #10b981; font-size: 14px; font-weight: bold;');
            this.printWelcomeMessage();

            this.eventBus.emit('app:ready', { version: this.version });
            
            return true;
        } catch (error) {
            console.error('❌ 应用初始化失败:', error);
            return false;
        }
    }

    initCore() {
        console.log('[App] 📦 初始化核心基础设施...');

        this.eventBus = EventBus.create({ debug: false });
        this.stateManager = StateManager.create(this.getInitialState(), { debug: false });

        this.eventBus.use(async (event, data) => {
            if (data && data.error) {
                console.error(`[EventBus] 事件错误 (${event}):`, data.error);
            }
            return true;
        });

        console.log('[App] ✅ 核心基础设施就绪');
    }

    getInitialState() {
        return {
            app: {
                version: this.version,
                name: this.name,
                initialized: false
            },
            selectedTask: null,
            selectedFile: null,
            currentProject: {
                id: 'proj_1',
                name: 'okclaw总项目',
                path: '/Users/frank/Downloads/3月工作/编程/okclaw总项目'
            },
            tasks: [],
            chatMessages: [],
            layout: {
                preset: 'default',
                isLocked: false
            },
            ui: {
                theme: 'light',
                sidebarOpen: true
            }
        };
    }

    async initModules() {
        console.log('[App] 🔧 初始化业务模块...');

        const moduleConfigs = [
            { key: 'taskManager', ModuleClass: TaskManager, required: true },
            { key: 'chatManager', ModuleClass: ChatManager, required: true },
            { key: 'projectManager', ModuleClass: ProjectManager, required: true },
            { key: 'fileManager', ModuleClass: FileManager, required: true },
            { key: 'dragEngine', ModuleClass: DragEngine, required: false },
            { key: 'layoutManager', ModuleClass: LayoutManager, required: false }
        ];

        for (const config of moduleConfigs) {
            try {
                const instance = new config.ModuleClass(
                    this.eventBus,
                    this.stateManager,
                    config.key === 'dragEngine' ? {} : undefined,
                    config.key === 'layoutManager' ? this.modules.dragEngine : undefined
                );

                const success = await instance.init();
                
                if (success) {
                    this.modules[config.key] = instance;
                    console.log(`[App] ✅ ${config.key} 模块已加载`);
                } else if (config.required) {
                    throw new Error(`${config.key} 模块初始化失败`);
                } else {
                    console.warn(`[App] ⚠️ ${config.key} 模块可选，跳过`);
                }
            } catch (error) {
                if (config.required) {
                    throw error;
                } else {
                    console.warn(`[App] ⚠️ ${config.key} 初始化失败:`, error.message);
                }
            }
        }

        console.log('[App] ✅ 所有业务模块已加载');
    }

    async initUI() {
        console.log('[App] 🎨 初始化UI组件...');

        const uiComponents = [
            { key: 'modal', ComponentClass: Modal },
            { key: 'contextMenu', ComponentClass: ContextMenuComponent },
            { key: 'toast', ComponentClass: Toast },
            { key: 'confirmDialog', ComponentClass: ConfirmDialog }
        ];

        for (const config of uiComponents) {
            try {
                const instance = new config.ComponentClass(this.eventBus);
                await instance.init();
                this.modules[config.key] = instance;
                console.log(`[App] ✅ ${config.key} 组件已加载`);
            } catch (error) {
                console.warn(`[App] ⚠️ ${config.key} 组件加载失败:`, error.message);
            }
        }

        console.log('[App] ✅ UI组件已加载');
    }

    registerPanels() {
        if (!this.modules.dragEngine) return;

        console.log('[App] 📐 注册可拖拽面板...');

        const panels = [
            { id: 'leftPanel', elementId: 'leftPanel', options: { position: 'left', width: 280 } },
            { id: 'rightPanel', elementId: 'rightPanel', options: { position: 'right', width: 300 } },
            { id: 'bookmarksPanel', elementId: 'bookmarksPanel', options: { position: 'hidden' } },
            { id: 'recentFilesPanel', elementId: 'recentFilesPanel', options: { position: 'hidden' } }
        ];

        panels.forEach(({ id, elementId, options }) => {
            const element = document.getElementById(elementId);
            if (element) {
                this.modules.dragEngine.registerPanel(id, element, options);
            }
        });

        setTimeout(() => {
            this.modules.dragEngine?.loadLayout();
        }, 500);

        console.log('[App] ✅ 面板注册完成');
    }

    bindGlobalEvents() {
        document.addEventListener('keydown', (e) => {
            this.handleKeyboardShortcuts(e);
        });

        window.addEventListener('beforeunload', () => {
            this.cleanup();
        });

        window.addEventListener('resize', Utils.debounce(() => {
            this.eventBus.emit('window:resize', {
                width: window.innerWidth,
                height: window.innerHeight
            });
        }, 250));

        this.eventBus.on('app:error', ({ error, context }) => {
            this.handleError(error, context);
        });

        console.log('[App] ✅ 全局事件绑定完成');
    }

    handleKeyboardShortcuts(e) {
        const isCtrlOrCmd = e.ctrlKey || e.metaKey;
        const isShift = e.shiftKey;

        if (isCtrlOrCmd && isShift && e.key === 'L') {
            e.preventDefault();
            this.modules.layoutManager?.toggle();
        }

        if (isCtrlOrCmd && isShift && e.key === 'D') {
            e.preventDefault();
            this.modules.dragEngine?.toggleLock 
                ? this.modules.dragEngine.toggleLock()
                : this.modules.layoutManager?.toggleLock();
        }

        if (isCtrlOrCmd && e.key === 'p') {
            e.preventDefault();
            this.eventBus.emit('file:quickOpen');
        }

        if (e.key === 'Escape') {
            this.modules.modal?.hide();
            this.modules.contextMenu?.hide();
        }
    }

    handleError(error, context = '') {
        console.error(`[App] ❌ 错误 (${context}):`, error);
        
        this.modules.toast?.error(`发生错误: ${error.message || '未知错误'}`);
        
        this.eventBus.emit('error:handled', { error, context });
    }

    printWelcomeMessage() {
        const messages = [
            '',
            '🎨欢迎使用 AI Agent 工作台',
            '',
            '💡 快捷键:',
            '   • Ctrl+Shift+L - 打开布局管理器',
            '   • Ctrl+P - 快速打开文件',
            '   • Esc - 关闭弹窗/菜单',
            '',
            '🖱️ 操作提示:',
            '   • 悬停面板 → 点击 ⋮ 图标 → 拖动到目标位置',
            '   • 靠近边缘时自动吸附（磁性效果）',
            '   • 双击面板头部 → 切换浮动/停靠状态',
            ''
        ];

        messages.forEach(msg => {
            console.log(`%c${msg}`, 'color: #6b7280; font-size: 11px;');
        });
    }

    cleanup() {
        console.log('[App] 🧹 清理资源...');

        Object.values(this.modules).forEach(module => {
            if (module && typeof module.destroy === 'function') {
                module.destroy();
            }
        });

        this.eventBus.clear();
        this.isInitialized = false;

        console.log('[App] ✅ 资源清理完成');
    }

    getModule(key) {
        return this.modules[key];
    }

    getState(path) {
        return this.stateManager.get(path);
    }

    setState(path, value) {
        this.stateManager.set(path, value);
    }

    emit(event, data) {
        return this.eventBus.emit(event, data);
    }

    on(event, callback) {
        return this.eventBus.on(event, callback);
    }

    getVersion() {
        return this.version;
    }

    isReady() {
        return this.isInitialized;
    }
}

let appInstance = null;

async function initializeApp() {
    if (appInstance) {
        console.warn('[App] 应用已经初始化');
        return appInstance;
    }

    appInstance = new App();
    await appInstance.init();
    
    window.App = appInstance;
    window.AgentWorkbench = {
        addMessage: (type, content) => appInstance.modules.chatManager?.addMessage(type, content),
        showClarificationForm: () => appInstance.emit('clarification:show'),
        hideClarificationForm: () => appInstance.emit('clarification:hide'),
        getApp: () => appInstance,
        getEventBus: () => appInstance.eventBus,
        getStateManager: () => appInstance.stateManager
    };

    return appInstance;
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}

// 导出给全局使用（已通过 window.App 暴露）
