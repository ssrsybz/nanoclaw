class FileManager {
    constructor(eventBus, stateManager) {
        this.eventBus = eventBus;
        this.stateManager = stateManager;
        this.fileTree = null;
        this.selectedItem = null;
        this.contextMenu = null;
        this.clipboard = null;
        this.fileStructure = [];
        this.expandedFolders = new Set();
    }

    async init() {
        this.fileTree = document.getElementById('fileTree');
        this.contextMenu = document.getElementById('contextMenu');

        if (!this.fileTree) {
            console.error('[FileManager] 找不到文件树容器');
            return false;
        }

        this.bindEvents();
        this.loadFileStructure();
        
        console.log('[FileManager] ✅ 初始化完成');
        return true;
    }

    bindEvents() {
        if (this.fileTree) {
            this.fileTree.addEventListener('click', (e) => {
                const folderItem = e.target.closest('.tree-folder');
                if (folderItem && !e.target.closest('.tree-chevron')) {
                    this.toggleFolder(folderItem);
                }

                const treeItem = e.target.closest('.tree-item-content');
                if (treeItem) {
                    this.selectItem(treeItem.parentElement);
                }
            });

            this.fileTree.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                const treeItem = e.target.closest('.tree-item');
                if (treeItem) {
                    this.selectItem(treeItem);
                }
                this.showContextMenu(e.clientX, e.clientY, treeItem);
            });

            this.fileTree.addEventListener('dblclick', (e) => {
                const fileItem = e.target.closest('.tree-file');
                if (fileItem) {
                    this.openFile(fileItem.dataset.path);
                }
            });
        }

        document.getElementById('newFileBtn')?.addEventListener('click', () => {
            this.eventBus.emit('modal:show', { type: 'new', defaultType: 'file' });
        });

        document.getElementById('newFolderBtn')?.addEventListener('click', () => {
            this.eventBus.emit('modal:show', { type: 'new', defaultType: 'folder' });
        });

        document.getElementById('refreshTreeBtn')?.addEventListener('click', () => {
            this.refreshTree();
        });

        document.getElementById('collapseAllBtn')?.addEventListener('click', () => {
            this.collapseAllFolders();
        });

        if (this.contextMenu) {
            this.contextMenu.querySelectorAll('.context-menu-item').forEach(item => {
                item.addEventListener('click', () => {
                    const action = item.dataset.action;
                    this.handleContextAction(action);
                    this.hideContextMenu();
                });
            });
        }

        document.addEventListener('click', () => this.hideContextMenu());
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hideContextMenu();
            }
        });

        this.eventBus.on('file:tree:refresh', ({ projectPath }) => this.refreshTree(projectPath));
        this.eventBus.on('modal:confirm', ({ name, type }) => this.createNewItem(name, type));
    }

    loadFileStructure() {
        const savedStructure = localStorage.getItem('agentStudio_file_structure');
        if (savedStructure) {
            try {
                this.fileStructure = JSON.parse(savedStructure);
                this.renderFileTree();
            } catch (error) {
                console.error('[FileManager] 加载文件结构失败:', error);
                this.createDefaultStructure();
            }
        } else {
            this.createDefaultStructure();
        }
    }

    createDefaultStructure() {
        this.fileStructure = [
            {
                name: 'trae-solo-layout',
                path: '/Users/frank/Downloads/3月工作/编程/okclaw总项目/trae-solo-layout',
                type: 'folder',
                expanded: true,
                children: [
                    { name: 'index.html', path: 'index.html', type: 'file', ext: 'html' },
                    { name: 'styles.css', path: 'styles.css', type: 'file', ext: 'css' },
                    { name: 'app.js', path: 'app.js', type: 'file', ext: 'js' },
                    {
                        name: 'assets',
                        path: 'assets',
                        type: 'folder',
                        expanded: false,
                        children: [
                            { name: 'logo.svg', path: 'assets/logo.svg', type: 'file', ext: 'svg' },
                            { name: 'icons', path: 'assets/icons', type: 'folder', expanded: false, children: [] }
                        ]
                    },
                    {
                        name: 'js',
                        path: 'js',
                        type: 'folder',
                        expanded: true,
                        children: [
                            { name: 'main.js', path: 'js/main.js', type: 'file', ext: 'js' },
                            { name: 'utils.js', path: 'js/utils.js', type: 'file', ext: 'js' }
                        ]
                    }
                ]
            }
        ];

        this.saveFileStructure();
        this.renderFileTree();
    }

    renderFileTree() {
        if (!this.fileTree) return;

        this.fileTree.innerHTML = this.fileStructure.map(item => this.renderTreeNode(item)).join('');
    }

    renderTreeNode(item, level = 0) {
        const isFolder = item.type === 'folder';
        const isExpanded = item.expanded || this.expandedFolders.has(item.path);

        let iconSVG = '';
        if (isFolder) {
            iconSVG = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
            `;
        } else {
            iconSVG = this.getFileIcon(item.ext || '');
        }

        const chevronIcon = isFolder ? `
            <div class="tree-chevron" style="transform: ${isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)'}">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="9 18 15 12 9 6"/>
                </svg>
            </div>
        ` : '<div class="tree-placeholder"></div>';

        const folderClass = isFolder ? `tree-folder ${isExpanded ? 'expanded' : 'collapsed'}` : 'tree-file';

        let html = `
            <div class="tree-item ${folderClass}" 
                 data-path="${Utils.escapeHtml(item.path)}" 
                 data-type="${item.type}"
                 data-ext="${item.ext || ''}"
                 style="padding-left: ${level * 16 + 8}px">
                <div class="tree-item-content">
                    ${chevronIcon}
                    <div class="tree-icon ${isFolder ? 'folder-icon ' + (isExpanded ? 'open' : 'closed') : 'file-icon'}">
                        ${iconSVG}
                    </div>
                    <span class="tree-label">${Utils.escapeHtml(item.name)}</span>
                </div>
        `;

        if (isFolder && item.children && item.children.length > 0 && isExpanded) {
            html += `<div class="tree-children">`;
            item.children.forEach(child => {
                html += this.renderTreeNode(child, level + 1);
            });
            html += `</div>`;
        } else if (isFolder) {
            html += `<div class="tree-children"></div>`;
        }

        html += `</div>`;

        return html;
    }

    getFileIcon(ext) {
        const icons = {
            html: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#e44d26" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="4 10 10 10 10 4"/></svg>',
            css: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#264de4" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><circle cx="9" cy="13" r="2"/></svg>',
            js: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f7df1e" stroke-width="2"><path d="M3 3h18a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><text x="6" y="17" font-size="12" font-weight="bold" fill="#f7df1e">JS</text></svg>',
            json: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5a5a5a" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
            md: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#083fa1" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
            svg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ffb13b" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>'
        };

        return icons[ext.toLowerCase()] || `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
            </svg>
        `;
    }

    toggleFolder(folderElement) {
        const path = folderElement.dataset.path;
        const isCurrentlyExpanded = folderElement.classList.contains('expanded');

        if (isCurrentlyExpanded) {
            folderElement.classList.remove('expanded');
            folderElement.classList.add('collapsed');
            this.expandedFolders.delete(path);
        } else {
            folderElement.classList.remove('collapsed');
            folderElement.classList.add('expanded');
            this.expandedFolders.add(path);
        }

        const childrenContainer = folderElement.querySelector(':scope > .tree-children');
        if (childrenContainer) {
            childrenContainer.style.display = isCurrentlyExpanded ? 'none' : 'block';
        }

        const chevron = folderElement.querySelector('.tree-chevron');
        if (chevron) {
            chevron.style.transform = isCurrentlyExpanded ? 'rotate(-90deg)' : 'rotate(0deg)';
        }

        const icon = folderElement.querySelector('.tree-icon');
        if (icon) {
            icon.classList.remove('open', 'closed');
            icon.classList.add(isCurrentlyExpanded ? 'closed' : 'open');
        }

        this.updateFileStructureState(path, !isCurrentlyExpanded);
    }

    selectItem(itemElement) {
        document.querySelectorAll('.tree-item.selected').forEach(el => {
            el.classList.remove('selected');
        });

        itemElement.classList.add('selected');
        this.selectedItem = {
            element: itemElement,
            path: itemElement.dataset.path,
            type: itemElement.dataset.type
        };

        this.stateManager.set('selectedFile', { ...this.selectedItem });
        this.eventBus.emit('file:selected', { ...this.selectedItem });
    }

    showContextMenu(x, y, treeItem) {
        if (!this.contextMenu) return;

        const menuWidth = 200;
        const menuHeight = 350;

        x = Math.min(x, window.innerWidth - menuWidth - 10);
        y = Math.min(y, window.innerHeight - menuHeight - 10);

        this.contextMenu.style.left = `${x}px`;
        this.contextMenu.style.top = `${y}px`;
        this.contextMenu.classList.add('show');

        this.updateContextMenuItems(!!treeItem);
    }

    hideContextMenu() {
        if (this.contextMenu) {
            this.contextMenu.classList.remove('show');
        }
    }

    updateContextMenuItems(hasSelection) {
        if (!this.contextMenu) return;

        const items = this.contextMenu.querySelectorAll('.context-menu-item[data-action]');
        items.forEach(item => {
            const action = item.dataset.action;
            const requiresSelection = ['cut', 'copy', 'rename', 'delete'].includes(action);
            item.style.display = (!hasSelection && requiresSelection) ? 'none' : 'block';
        });
    }

    handleContextAction(action) {
        switch (action) {
            case 'newFile':
                this.eventBus.emit('modal:show', { type: 'new', defaultType: 'file' });
                break;
            case 'newFolder':
                this.eventBus.emit('modal:show', { type: 'new', defaultType: 'folder' });
                break;
            case 'cut':
                this.cutItem();
                break;
            case 'copy':
                this.copyItem();
                break;
            case 'paste':
                this.pasteItem();
                break;
            case 'rename':
                this.startRename();
                break;
            case 'delete':
                this.confirmDelete();
                break;
        }
    }

    createNewItem(name, type) {
        if (!this.selectedItem) {
            this.eventBus.emit('toast:show', { message: '请先选择一个父级文件夹', type: 'warning' });
            return;
        }

        const parentPath = this.selectedItem.path;
        const newPath = `${parentPath}/${name}`;

        const newItem = {
            name,
            path: newPath,
            type,
            ...(type === 'file' ? { ext: Utils.getFileExtension(name) } : {}),
            expanded: type === 'folder',
            children: type === 'folder' ? [] : undefined
        };

        this.addToParent(parentPath, newItem);
        this.saveFileStructure();
        this.renderFileTree();

        this.eventBus.emit(`file:${type}:created`, { item: newItem, parentPath });
        this.eventBus.emit('toast:show', { message: `已创建${type === 'folder' ? '文件夹' : '文件'}: ${name}`, type: 'success' });
    }

    addToParent(parentPath, newItem) {
        const findAndAdd = (items) => {
            for (let i = 0; i < items.length; i++) {
                if (items[i].path === parentPath) {
                    if (!items[i].children) {
                        items[i].children = [];
                    }
                    items[i].children.push(newItem);
                    items[i].expanded = true;
                    return true;
                }
                if (items[i].children && findAndAdd(items[i].children)) {
                    return true;
                }
            }
            return false;
        };

        findAndAdd(this.fileStructure);
    }

    cutItem() {
        if (!this.selectedItem) return;
        this.clipboard = { action: 'cut', item: { ...this.selectedItem } };
        this.eventBus.emit('toast:show', { message: '已剪切到剪贴板', type: 'info' });
    }

    copyItem() {
        if (!this.selectedItem) return;
        this.clipboard = { action: 'copy', item: { ...this.selectedItem } };
        this.eventBus.emit('toast:show', { message: '已复制到剪贴板', type: 'info' });
    }

    pasteItem() {
        if (!this.clipboard || !this.selectedItem) return;

        const parentPath = this.selectedItem.path;
        const newItem = { ...this.clipboard.item };

        if (this.clipboard.action === 'cut') {
            this.removeFromPath(newItem.path);
        }

        newItem.path = `${parentPath}/${newItem.path.split('/').pop()}`;
        this.addToParent(parentPath, newItem);

        this.saveFileStructure();
        this.renderFileTree();

        this.eventBus.emit('toast:show', { 
            message: this.clipboard.action === 'cut' ? '已移动' : '已复制', 
            type: 'success' 
        });
        this.clipboard = null;
    }

    startRename() {
        if (!this.selectedItem) return;

        const label = this.selectedItem.element.querySelector('.tree-label');
        if (!label) return;

        const currentName = label.textContent;
        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentName;
        input.className = 'tree-rename-input';

        label.replaceWith(input);
        input.focus();
        input.select();

        const finishRename = () => {
            const newName = input.value.trim();
            if (newName && newName !== currentName) {
                this.renameItem(this.selectedItem.path, newName);
            } else {
                input.replaceWith(label);
            }
        };

        input.addEventListener('blur', finishRename);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') finishRename();
            if (e.key === 'Escape') input.replaceWith(label);
        });
    }

    renameItem(oldPath, newName) {
        const updatePath = (items) => {
            for (const item of items) {
                if (item.path === oldPath) {
                    item.name = newName;
                    item.path = oldPath.substring(0, oldPath.lastIndexOf('/') + 1) + newName;
                    return true;
                }
                if (item.children && updatePath(item.children)) return true;
            }
            return false;
        };

        updatePath(this.fileStructure);
        this.saveFileStructure();
        this.renderFileTree();

        this.eventBus.emit('file:renamed', { oldPath, newName });
        this.eventBus.emit('toast:show', { message: `已重命名为: ${newName}`, type: 'success' });
    }

    confirmDelete() {
        if (!this.selectedItem) return;

        this.eventBus.emit('dialog:confirm', {
            title: '确认删除',
            message: `确定要删除 "${this.selectedItem.path}" 吗？此操作不可撤销。`,
            onConfirm: () => this.executeDelete()
        });
    }

    executeDelete() {
        if (!this.selectedItem) return;

        const pathToDelete = this.selectedItem.path;
        this.removeFromPath(pathToDelete);
        this.saveFileStructure();
        this.renderFileTree();

        this.eventBus.emit('file:deleted', { path: pathToDelete });
        this.eventBus.emit('toast:show', { message: '已删除', type: 'success' });
        this.selectedItem = null;
    }

    removeFromPath(path) {
        const removeFromArray = (items) => {
            for (let i = 0; i < items.length; i++) {
                if (items[i].path === path) {
                    items.splice(i, 1);
                    return true;
                }
                if (items[i].children && removeFromArray(items[i].children)) return true;
            }
            return false;
        };

        removeFromArray(this.fileStructure);
    }

    openFile(path) {
        this.eventBus.emit('file:opened', { path });
        console.log(`[FileManager] 打开文件: ${path}`);
    }

    refreshTree(projectPath) {
        const container = document.getElementById('fileTreeContainer');
        if (container) {
            container.style.opacity = '0.5';
            
            setTimeout(() => {
                container.style.opacity = '1';
                this.loadFileStructure();
                console.log(`[FileManager] 刷新文件树: ${projectPath || '当前项目'}`);
            }, 300);
        }
    }

    collapseAllFolders() {
        const folders = this.fileTree.querySelectorAll('.tree-folder.expanded');
        folders.forEach(folder => {
            if (!folder.parentElement.closest('.tree-folder')) {
                this.toggleFolder(folder);
            }
        });
    }

    updateFileStructureState(path, expanded) {
        const update = (items) => {
            for (const item of items) {
                if (item.path === path) {
                    item.expanded = expanded;
                    return true;
                }
                if (item.children && update(item.children)) return true;
            }
            return false;
        };

        update(this.fileStructure);
    }

    saveFileStructure() {
        try {
            localStorage.setItem('agentStudio_file_structure', JSON.stringify(this.fileStructure));
        } catch (error) {
            console.error('[FileManager] 保存文件结构失败:', error);
        }
    }

    getSelectedItem() {
        return this.selectedItem ? { ...this.selectedItem } : null;
    }

    destroy() {
        this.hideContextMenu();
        this.fileTree = null;
        this.selectedItem = null;
        this.contextMenu = null;
        this.clipboard = null;
        this.fileStructure = [];
        this.expandedFolders.clear();
        
        console.log('[FileManager] 🔴 已销毁');
    }
}

if (typeof window !== 'undefined') {
    window.FileManager = FileManager;
}
