class EventBus {
    constructor() {
        this.events = new Map();
        this.onceEvents = new Map();
        this.middleware = [];
        this.debug = false;
    }

    on(event, callback, context = null) {
        if (!this.events.has(event)) {
            this.events.set(event, []);
        }
        this.events.get(event).push({ callback, context: context || null });
        
        if (this.debug) {
            console.log(`[EventBus] 📡 注册监听: ${event}`);
        }
        
        return () => this.off(event, callback);
    }

    once(event, callback, context = null) {
        if (!this.onceEvents.has(event)) {
            this.onceEvents.set(event, []);
        }
        this.onceEvents.get(event).push({ callback, context: context || null });
        
        if (this.debug) {
            console.log(`[EventBus] 🔔 注册一次性监听: ${event}`);
        }
    }

    off(event, callback) {
        if (callback) {
            const listeners = this.events.get(event);
            if (listeners) {
                const index = listeners.findIndex(l => l.callback === callback);
                if (index > -1) {
                    listeners.splice(index, 1);
                    if (this.debug) {
                        console.log(`[EventBus] ❌ 移除监听: ${event}`);
                    }
                }
            }
        } else {
            this.events.delete(event);
            if (this.debug) {
                console.log(`[EventBus] 🗑️ 移除所有监听: ${event}`);
            }
        }
    }

    emit(event, data = null) {
        return new Promise((resolve) => {
            if (this.debug) {
                console.log(`[EventBus] ⚡ 触发事件: ${event}`, data);
            }

            const executeMiddleware = async (middleware, index) => {
                if (index >= middleware.length) {
                    await this.executeListeners(event, data);
                    resolve();
                    return;
                }
                
                const mw = middleware[index];
                try {
                    const shouldContinue = await mw(event, data);
                    if (shouldContinue !== false) {
                        await executeMiddleware(middleware, index + 1);
                    } else {
                        resolve();
                    }
                } catch (error) {
                    console.error(`[EventBus] 中间件错误 (${mw.name}):`, error);
                    await executeMiddleware(middleware, index + 1);
                }
            };

            executeMiddleware([...this.middleware], 0);
        });
    }

    async executeListeners(event, data) {
        const listeners = this.events.get(event);
        if (listeners) {
            for (const listener of [...listeners]) {
                try {
                    if (listener.context) {
                        await listener.callback.call(listener.context, data);
                    } else {
                        await listener.callback(data);
                    }
                } catch (error) {
                    console.error(`[EventBus] 监听器错误 (${event}):`, error);
                }
            }
        }

        const onceListeners = this.onceEvents.get(event);
        if (onceListeners && onceListeners.length > 0) {
            for (const listener of onceListeners) {
                try {
                    if (listener.context) {
                        await listener.callback.call(listener.context, data);
                    } else {
                        await listener.callback(data);
                    }
                } catch (error) {
                    console.error(`[EventBus] 一次性监听器错误 (${event}):`, error);
                }
            }
            this.onceEvents.delete(event);
        }
    }

    use(middleware) {
        if (typeof middleware !== 'function') {
            throw new Error('中间件必须是函数');
        }
        this.middleware.push(middleware);
        
        if (this.debug) {
            console.log(`[EventBus] 🔧 添加中间件: ${middleware.name || 'anonymous'}`);
        }
        
        return this;
    }

    clear() {
        this.events.clear();
        this.onceEvents.clear();
        this.middleware = [];
        
        if (this.debug) {
            console.log('[EventBus] 🧹 清理所有事件');
        }
    }

    getListenerCount(event) {
        const regular = this.events.has(event) ? this.events.get(event).length : 0;
        const once = this.onceEvents.has(event) ? this.onceEvents.get(event).length : 0;
        return regular + once;
    }

    hasListener(event) {
        return this.events.has(event) || this.onceEvents.has(event);
    }

    eventNames() {
        const names = new Set([
            ...this.events.keys(),
            ...this.onceEvents.keys()
        ]);
        return Array.from(names);
    }

    setDebug(enabled) {
        this.debug = enabled;
        return this;
    }

    static create(options = {}) {
        const bus = new EventBus();
        if (options.debug) bus.setDebug(true);
        return bus;
    }
}

if (typeof window !== 'undefined') {
    window.EventBus = EventBus;
}
