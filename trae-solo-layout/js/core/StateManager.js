class StateManager {
    constructor(initialState = {}) {
        this.state = { ...initialState };
        this.listeners = new Map();
        this.history = [];
        this.maxHistory = 50;
        this.isBatching = false;
        this.batchQueue = [];
        this.debug = false;
    }

    get(path) {
        if (!path) return this.state;

        const keys = path.split('.');
        let current = this.state;

        for (const key of keys) {
            if (current === undefined || current === null) {
                return undefined;
            }
            current = current[key];
        }

        return current;
    }

    set(path, value, options = {}) {
        const oldValue = this.get(path);

        if (oldValue === value && !options.force) {
            return;
        }

        const keys = path.split('.');
        let current = this.state;

        for (let i = 0; i < keys.length - 1; i++) {
            const key = keys[i];
            if (!(key in current) || typeof current[key] !== 'object') {
                current[key] = {};
            }
            current = current[key];
        }

        const lastKey = keys[keys.length - 1];
        current[lastKey] = value;

        if (this.debug) {
            console.log(`[StateManager] ✏️ 状态更新: ${path}`, { oldValue, newValue: value });
        }

        if (options.silent !== true) {
            this.notifyListeners(path, value, oldValue);
            
            if (options.history !== false) {
                this.addToHistory({ path, oldValue, newValue: value, timestamp: Date.now() });
            }
        }

        if (this.isBatching) {
            this.batchQueue.push({ path, value, oldValue });
        }
    }

    subscribe(path, callback, options = {}) {
        if (!this.listeners.has(path)) {
            this.listeners.set(path, new Map());
        }

        const id = this.generateId();
        const listener = {
            id,
            callback,
            immediate: options.immediate || false,
            deep: options.deep || false
        };

        this.listeners.get(path).set(id, listener);

        if (listener.immediate) {
            const currentValue = this.get(path);
            try {
                callback(currentValue, undefined, path);
            } catch (error) {
                console.error(`[StateManager] 即时回调错误 (${path}):`, error);
            }
        }

        if (this.debug) {
            console.log(`[StateManager] 👂 注册订阅: ${path} (#${id})`);
        }

        return () => this.unsubscribe(path, id);
    }

    unsubscribe(path, id) {
        const pathListeners = this.listeners.get(path);
        if (pathListeners && id) {
            pathListeners.delete(id);
            if (this.debug) {
                console.log(`[StateManager] 取消订阅: ${path} (#${id})`);
            }
        } else if (pathListeners && !id) {
            pathListeners.clear();
            if (this.debug) {
                console.log(`[StateManager] 清空订阅: ${path}`);
            }
        }
    }

    notifyListeners(path, newValue, oldValue) {
        const directListeners = this.listeners.get(path);
        if (directListeners) {
            for (const [id, listener] of directListeners) {
                try {
                    listener.callback(newValue, oldValue, path);
                } catch (error) {
                    console.error(`[StateManager] 监听器错误 (${path}, #${id}):`, error);
                }
            }
        }

        const wildcardListeners = this.listeners.get('*');
        if (wildcardListeners) {
            for (const [id, listener] of wildcardListeners) {
                try {
                    listener.callback({ path, newValue, oldValue });
                } catch (error) {
                    console.error(`[StateManager] 通配符监听器错误 (#${id}):`, error);
                }
            }
        }

        const keys = path.split('.');
        for (let i = keys.length - 1; i > 0; i--) {
            const parentPath = keys.slice(0, i).join('.');
            const parentListeners = this.listeners.get(parentPath);
            if (parentListeners) {
                for (const [id, listener] of parentListeners) {
                    if (listener.deep) {
                        try {
                            listener.callback(this.get(parentPath), this.get(parentPath), parentPath);
                        } catch (error) {
                            console.error(`[StateManager] 深度监听器错误 (${parentPath}, #${id}):`, error);
                        }
                    }
                }
            }
        }
    }

    batch(callback) {
        this.isBatching = true;
        this.batchQueue = [];

        try {
            callback();
        } finally {
            this.isBatching = false;

            if (this.batchQueue.length > 0) {
                const batchData = [...this.batchQueue];
                this.batchQueue = [];

                const batchListeners = this.listeners.get('__batch__');
                if (batchListeners) {
                    for (const [id, listener] of batchListeners) {
                        try {
                            listener.callback(batchData);
                        } catch (error) {
                            console.error(`[StateManager] 批量监听器错误 (#${id}):`, error);
                        }
                    }
                }
            }
        }
    }

    reset(newState = {}) {
        const oldState = { ...this.state };
        this.state = { ...newState };

        if (this.debug) {
            console.log('[StateManager] 🔄 重置状态');
        }

        for (const [path, listeners] of this.listeners) {
            if (path !== '*') {
                for (const [id, listener] of listeners) {
                    try {
                        listener.callback(this.get(path), oldState[path], path);
                    } catch (error) {
                        console.error(`[StateManager] 重置回调错误 (${path}, #${id}):`, error);
                    }
                }
            }
        }
    }

    addToHistory(entry) {
        this.history.push(entry);
        if (this.history.length > this.maxHistory) {
            this.history.shift();
        }
    }

    getHistory(limit = 10) {
        return this.history.slice(-limit);
    }

    undo() {
        if (this.history.length === 0) {
            console.warn('[StateManager] 没有可撤销的操作');
            return false;
        }

        const lastEntry = this.history.pop();
        this.set(lastEntry.path, lastEntry.oldValue, { history: false });

        if (this.debug) {
            console.log(`[EventBus] ↩️ 撤销: ${lastEntry.path}`);
        }

        return true;
    }

    export() {
        return JSON.stringify(this.state, null, 2);
    }

    import(jsonString) {
        try {
            const newState = JSON.parse(jsonString);
            this.reset(newState);
            return true;
        } catch (error) {
            console.error('[StateManager] 导入失败:', error);
            return false;
        }
    }

    generateId() {
        return Math.random().toString(36).substr(2, 9);
    }

    setDebug(enabled) {
        this.debug = enabled;
        return this;
    }

    getState() {
        return { ...this.state };
    }

    has(path) {
        return this.get(path) !== undefined;
    }

    delete(path) {
        this.set(path, undefined);
    }

    merge(partialState) {
        Object.keys(partialState).forEach(key => {
            this.set(key, partialState[key]);
        });
    }

    static create(initialState = {}, options = {}) {
        const manager = new StateManager(initialState);
        if (options.debug) manager.setDebug(true);
        return manager;
    }
}

if (typeof window !== 'undefined') {
    window.StateManager = StateManager;
}
