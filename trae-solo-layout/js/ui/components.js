class Modal {
    constructor(eventBus) {
        this.eventBus = eventBus;
        this.overlay = null;
        this.modalContainer = null;
        this.currentCallback = null;
        this.isOpen = false;
    }

    async init() {
        this.overlay = document.getElementById('modalOverlay');
        this.modalContainer = document.querySelector('.modal-container');

        if (!this.overlay) {
            console.error('[Modal] 找不到模态框容器');
            return false;
        }

        this.bindEvents();
        console.log('[Modal] ✅ 初始化完成');
        return true;
    }

    bindEvents() {
        const closeBtn = document.getElementById('modalClose');
        const cancelBtn = document.getElementById('modalCancel');
        const confirmBtn = document.getElementById('modalConfirm');
        const input = document.getElementById('itemNameInput');

        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.hide());
        }

        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => this.hide());
        }

        if (confirmBtn) {
            confirmBtn.addEventListener('click', () => this.confirm());
        }

        if (input) {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    this.confirm();
                }
            });
        }

        if (this.overlay) {
            this.overlay.addEventListener('click', (e) => {
                if (e.target === this.overlay) {
                    this.hide();
                }
            });
        }

        this.eventBus.on('modal:show', ({ type, title, defaultType }) => {
            this.show(type, title, defaultType);
        });
    }

    show(type = 'new', title = '新建文件', defaultType = 'file') {
        const titleEl = document.getElementById('modalTitle');
        const input = document.getElementById('itemNameInput');
        const typeGroup = document.getElementById('itemTypeGroup');

        if (titleEl) titleEl.textContent = title;
        if (input) {
            input.value = '';
            input.classList.remove('error');
        }

        if (typeGroup) {
            typeGroup.style.display = type.includes('文件夹') ? 'none' : 'block';
        }

        const radio = document.querySelector(`input[name="itemType"][value="${defaultType}"]`);
        if (radio) radio.checked = true;

        this.overlay?.classList.add('show');
        this.isOpen = true;

        setTimeout(() => {
            if (input) input.focus();
        }, 100);

        return new Promise((resolve) => {
            this.currentCallback = resolve;
        });
    }

    hide() {
        this.overlay?.classList.remove('show');
        this.isOpen = false;
        this.currentCallback = null;
    }

    confirm() {
        const input = document.getElementById('itemNameInput');
        const typeRadio = document.querySelector('input[name="itemType"]:checked');
        
        const name = input?.value.trim();
        const type = typeRadio?.value || 'file';

        if (!name) {
            input?.classList.add('error');
            setTimeout(() => input?.classList.remove('error'), 1000);
            return;
        }

        if (this.currentCallback) {
            this.currentCallback({ name, type });
        }

        this.hide();
        this.eventBus.emit('modal:confirm', { name, type });
    }

    showError(message) {
        const errorEl = document.getElementById('modalError');
        if (errorEl) {
            errorEl.textContent = message;
            errorEl.style.display = 'block';
            setTimeout(() => {
                errorEl.style.display = 'none';
            }, 3000);
        }
    }

    isOpen() {
        return this.isOpen;
    }

    destroy() {
        this.hide();
        console.log('[Modal] 🔴 已销毁');
    }
}

class ContextMenuComponent {
    constructor(eventBus) {
        this.eventBus = eventBus;
        this.menu = null;
        this.visible = false;
    }

    async init() {
        this.menu = document.getElementById('contextMenu');
        
        if (!this.menu) {
            console.warn('[ContextMenu] 找不到上下文菜单元素');
            return false;
        }

        console.log('[ContextMenu] ✅ 初始化完成');
        return true;
    }

    show(x, y, items = []) {
        if (!this.menu) return;

        if (items.length > 0) {
            this.renderItems(items);
        }

        const menuWidth = 200;
        const menuHeight = Math.min(items.length * 36 + 20, 400);

        x = Utils.clamp(x, 0, window.innerWidth - menuWidth - 10);
        y = Utils.clamp(y, 0, window.innerHeight - menuHeight - 10);

        this.menu.style.left = `${x}px`;
        this.menu.style.top = `${y}px`;
        this.menu.classList.add('show');
        this.visible = true;
    }

    hide() {
        if (this.menu) {
            this.menu.classList.remove('show');
        }
        this.visible = false;
    }

    renderItems(items) {
        if (!this.menu) return;

        const list = this.menu.querySelector('.context-menu-list');
        if (!list) return;

        list.innerHTML = items.map(item => `
            <div class="context-menu-item" data-action="${item.action}">
                ${item.icon || ''}
                <span>${item.label}</span>
                ${item.shortcut ? `<span class="shortcut">${item.shortcut}</span>` : ''}
                ${item.divider ? '<div class="menu-divider"></div>' : ''}
            </div>
        `).join('');

        list.querySelectorAll('.context-menu-item').forEach(el => {
            el.addEventListener('click', () => {
                const action = el.dataset.action;
                this.eventBus.emit('context-menu:action', { action });
                this.hide();
            });
        });
    }

    isVisible() {
        return this.visible;
    }

    destroy() {
        this.hide();
        console.log('[ContextMenu] 🔴 已销毁');
    }
}

class Toast {
    constructor(eventBus) {
        this.eventBus = eventBus;
        this.container = null;
        this.toasts = [];
        this.maxVisible = 5;
        this.defaultDuration = 3000;
    }

    async init() {
        this.container = document.createElement('div');
        this.container.className = 'toast-container';
        document.body.appendChild(this.container);

        this.bindEvents();
        console.log('[Toast] ✅ 初始化完成');
        return true;
    }

    bindEvents() {
        this.eventBus.on('toast:show', ({ message, type = 'info', duration = this.defaultDuration }) => {
            this.show(message, type, duration);
        });
    }

    show(message, type = 'info', duration = this.defaultDuration) {
        if (this.toasts.length >= this.maxVisible) {
            this.dismiss(this.toasts[0].id);
        }

        const id = Utils.generateId('toast_');
        const toastEl = this.createToastElement(id, message, type);
        
        this.container.appendChild(toastEl);
        this.toasts.push({ id, element: toastEl, timeout: null });

        requestAnimationFrame(() => {
            toastEl.classList.add('visible');
        });

        toastEl.timeout = setTimeout(() => {
            this.dismiss(id);
        }, duration);

        return id;
    }

    createToastElement(id, message, type) {
        const icons = {
            success: '✓',
            error: '✕',
            warning: '⚠',
            info: 'ℹ'
        };

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.dataset.toastId = id;
        toast.innerHTML = `
            <div class="toast-icon">${icons[type] || icons.info}</div>
            <div class="toast-message">${Utils.escapeHtml(message)}</div>
            <button class="toast-close">✕</button>
        `;

        toast.querySelector('.toast-close').addEventListener('click', () => {
            this.dismiss(id);
        });

        return toast;
    }

    dismiss(id) {
        const index = this.toasts.findIndex(t => t.id === id);
        if (index === -1) return;

        const toast = this.toasts[index];
        
        if (toast.timeout) {
            clearTimeout(toast.timeout);
        }

        toast.element.classList.remove('visible');
        
        setTimeout(() => {
            if (toast.element.parentNode) {
                toast.element.parentNode.removeChild(toast.element);
            }
        }, 300);

        this.toasts.splice(index, 1);
    }

    dismissAll() {
        [...this.toasts].forEach(toast => this.dismiss(toast.id));
    }

    success(message, duration) {
        return this.show(message, 'success', duration);
    }

    error(message, duration) {
        return this.show(message, 'error', duration);
    }

    warning(message, duration) {
        return this.show(message, 'warning', duration);
    }

    info(message, duration) {
        return this.show(message, 'info', duration);
    }

    destroy() {
        this.dismissAll();
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
        console.log('[Toast] 🔴 已销毁');
    }
}

class ConfirmDialog {
    constructor(eventBus) {
        this.eventBus = eventBus;
        this.dialog = null;
        this.currentConfirmCallback = null;
    }

    async init() {
        this.dialog = document.getElementById('confirmDialog');
        
        if (!this.dialog) {
            console.warn('[ConfirmDialog] 找不到确认对话框元素');
            return false;
        }

        this.bindEvents();
        console.log('[ConfirmDialog] ✅ 初始化完成');
        return true;
    }

    bindEvents() {
        const okBtn = document.getElementById('confirmOk');
        const cancelBtn = document.getElementById('confirmCancel');

        if (okBtn) {
            okBtn.addEventListener('click', () => this.confirm());
        }

        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => this.cancel());
        }

        if (this.dialog) {
            this.dialog.addEventListener('click', (e) => {
                if (e.target === this.dialog) {
                    this.cancel();
                }
            });
        }

        this.eventBus.on('dialog:confirm', ({ title, message, onConfirm, onCancel }) => {
            this.show(title, message, onConfirm, onCancel);
        });
    }

    show(title = '确认操作', message = '确定要执行此操作吗？', onConfirm = null, onCancel = null) {
        const titleEl = this.dialog?.querySelector('.confirm-title');
        const messageEl = this.dialog?.querySelector('.confirm-message');

        if (titleEl) titleEl.textContent = title;
        if (messageEl) messageEl.textContent = message;

        this.dialog?.classList.add('show');
        this.currentConfirmCallback = onConfirm;
        this.currentCancelCallback = onCancel;
    }

    hide() {
        this.dialog?.classList.remove('show');
        this.currentConfirmCallback = null;
        this.currentCancelCallback = null;
    }

    confirm() {
        if (this.currentConfirmCallback) {
            this.currentConfirmCallback();
        }
        this.hide();
    }

    cancel() {
        if (this.currentCancelCallback) {
            this.currentCancelCallback();
        }
        this.hide();
    }

    destroy() {
        this.hide();
        console.log('[ConfirmDialog] 🔴 已销毁');
    }
}

if (typeof window !== 'undefined') {
    window.Modal = Modal;
    window.ContextMenuComponent = ContextMenuComponent;
    window.Toast = Toast;
    window.ConfirmDialog = ConfirmDialog;
}
