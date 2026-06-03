// ==================== 应用初始化 ====================
document.addEventListener('DOMContentLoaded', () => {
    initModeSwitcher();
    initTaskList();
    initTabSwitcher();
    initChatInput();
    initNewTask();
    initClarificationForm();
    
    // 初始化项目管理器
    initProjectManager();
    initFileTree();
    initContextMenu();
    initModalDialogs();
    initBreadcrumbNav();
});

// ==================== 模式切换 ====================
function initModeSwitcher() {
    const modeButtons = document.querySelectorAll('.mode-btn');
    
    modeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            modeButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const mode = btn.dataset.mode;
            console.log(`切换到模式: ${mode}`);
            // 这里可以添加模式切换逻辑
        });
    });
}

// ==================== 任务列表 ====================
function initTaskList() {
    const taskItems = document.querySelectorAll('.task-item');
    
    taskItems.forEach(item => {
        item.addEventListener('click', () => {
            taskItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            
            const taskId = item.dataset.taskId;
            const taskTitle = item.querySelector('.task-title').textContent;
            document.getElementById('task-name').textContent = taskTitle;
            
            console.log(`选择任务: ${taskId} - ${taskTitle}`);
        });
    });
}

// ==================== 标签页切换 ====================
function initTabSwitcher() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.dataset.tab;
            
            tabButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            tabContents.forEach(content => {
                content.classList.remove('active');
            });
            
            const targetPanel = document.getElementById(`${tabName}Panel`);
            if (targetPanel) {
                targetPanel.classList.add('active');
            }
        });
    });
}

// ==================== 聊天输入 ====================
function initChatInput() {
    const messageInput = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');
    
    // 发送消息
    function sendMessage() {
        const message = messageInput.value.trim();
        if (!message) return;
        
        addMessageToChat('user', message);
        messageInput.value = '';
        
        // 模拟 AI 回复
        simulateAIResponse(message);
    }
    
    sendBtn.addEventListener('click', sendMessage);
    
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
}

// ==================== 添加消息到聊天区 ====================
function addMessageToChat(type, content) {
    const chatMessages = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message message-${type}`;
    
    const time = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    
    if (type === 'user') {
        messageDiv.innerHTML = `
            <div class="message-avatar">👤</div>
            <div class="message-content">
                <div class="message-text">${escapeHtml(content)}</div>
                <div class="message-time">${time}</div>
            </div>
        `;
    } else {
        messageDiv.innerHTML = `
            <div class="message-avatar">🤖</div>
            <div class="message-content">
                <div class="message-text">${content}</div>
                <div class="message-time">${time}</div>
            </div>
        `;
    }
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// ==================== 模拟 AI 回复 ====================
function simulateAIResponse(userMessage) {
    // 先显示思考过程
    showThinking();
    
    // 模拟延迟后显示回复
    setTimeout(() => {
        removeThinking();
        addMessageToChat('ai', `
            <p>收到你的任务："${escapeHtml(userMessage)}"</p>
            <p>我正在分析需求并制定执行计划...</p>
            <p>预计需要以下步骤：</p>
            <ol>
                <li>理解任务需求</li>
                <li>搜索相关信息</li>
                <li>整理分析结果</li>
                <li>生成最终产出</li>
            </ol>
        `);
    }, 2000);
}

// ==================== 显示思考过程 ====================
function showThinking() {
    const chatMessages = document.getElementById('chatMessages');
    const thinkingDiv = document.createElement('div');
    thinkingDiv.className = 'message message-ai';
    thinkingDiv.id = 'thinking-message';
    
    thinkingDiv.innerHTML = `
        <div class="message-avatar">🤖</div>
        <div class="message-content">
            <div class="ai-thinking">
                <div class="thinking-header">
                    <span class="thinking-icon">💭</span>
                    <span class="thinking-text">正在思考...</span>
                </div>
                <div class="thinking-steps">
                    <div class="step completed">✓ 理解任务需求</div>
                    <div class="step active">⟳ 分析任务步骤</div>
                    <div class="step pending">○ 执行任务</div>
                    <div class="step pending">○ 生成结果</div>
                </div>
            </div>
        </div>
    `;
    
    chatMessages.appendChild(thinkingDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// ==================== 移除思考过程 ====================
function removeThinking() {
    const thinking = document.getElementById('thinking-message');
    if (thinking) {
        thinking.remove();
    }
}

// ==================== 新建任务 ====================
function initNewTask() {
    const newTaskBtn = document.getElementById('newTaskBtn');
    
    newTaskBtn.addEventListener('click', () => {
        const taskList = document.getElementById('taskList');
        const taskId = Date.now().toString();
        
        const taskItem = document.createElement('div');
        taskItem.className = 'task-item';
        taskItem.dataset.taskId = taskId;
        
        taskItem.innerHTML = `
            <div class="task-info">
                <div class="task-title">新任务 ${taskId.slice(-4)}</div>
                <div class="task-status status-pending">等待中</div>
            </div>
            <div class="task-progress">
                <div class="progress-bar" style="width: 0%"></div>
            </div>
        `;
        
        taskList.insertBefore(taskItem, taskList.firstChild);
        
        // 添加点击事件
        taskItem.addEventListener('click', () => {
            document.querySelectorAll('.task-item').forEach(i => i.classList.remove('active'));
            taskItem.classList.add('active');
        });
        
        // 自动选中新任务
        document.querySelectorAll('.task-item').forEach(i => i.classList.remove('active'));
        taskItem.classList.add('active');
    });
}

// ==================== 意图澄清表单 ====================
function initClarificationForm() {
    const closeBtn = document.getElementById('closeClarification');
    
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            document.getElementById('clarificationForm').style.display = 'none';
        });
    }
}

// ==================== 工具函数 ====================
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ==================== 导出功能（供外部调用） ====================
window.AgentWorkbench = {
    addMessage: addMessageToChat,
    showClarificationForm: () => {
        document.getElementById('clarificationForm').style.display = 'block';
    },
    hideClarificationForm: () => {
        document.getElementById('clarificationForm').style.display = 'none';
    }
};

// ==================== 项目管理器 ====================
function initProjectManager() {
    const projectSelector = document.getElementById('projectSelector');
    const currentProjectDiv = projectSelector.querySelector('.pm-current-project');
    const dropdown = document.getElementById('projectDropdown');
    const searchInput = document.getElementById('projectSearchInput');
    
    // 切换下拉菜单
    currentProjectDiv.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = dropdown.classList.contains('show');
        closeAllDropdowns();
        if (!isOpen) {
            dropdown.classList.add('show');
            projectSelector.classList.add('open');
            searchInput.focus();
        }
    });
    
    // 点击外部关闭
    document.addEventListener('click', (e) => {
        if (!projectSelector.contains(e.target)) {
            dropdown.classList.remove('show');
            projectSelector.classList.remove('open');
        }
    });
    
    // 搜索项目
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const items = document.querySelectorAll('.pm-item');
        
        items.forEach(item => {
            const name = item.querySelector('span').textContent.toLowerCase();
            item.style.display = name.includes(query) ? 'flex' : 'none';
        });
    });
    
    // 选择项目
    const pmItems = document.querySelectorAll('.pm-item');
    pmItems.forEach(item => {
        item.addEventListener('click', () => {
            pmItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            
            const projectName = item.querySelector('span').textContent;
            const projectPath = item.dataset.path;
            
            document.getElementById('currentProjectName').textContent = projectName;
            dropdown.classList.remove('show');
            projectSelector.classList.remove('open');
            
            console.log(`切换到项目: ${projectName} (${projectPath})`);
            
            // 刷新文件树
            refreshFileTree(projectPath);
        });
    });
}

// ==================== 文件树操作 ====================
let selectedTreeItem = null;

function initFileTree() {
    const fileTree = document.getElementById('fileTree');
    
    // 文件夹展开/折叠
    fileTree.addEventListener('click', (e) => {
        const folderItem = e.target.closest('.tree-folder');
        if (folderItem && !e.target.closest('.tree-chevron')) {
            toggleFolder(folderItem);
        }
        
        // 选中文件/文件夹
        const treeItem = e.target.closest('.tree-item-content');
        if (treeItem) {
            selectTreeItem(treeItem.parentElement);
        }
    });
    
    // 工具栏按钮
    document.getElementById('newFileBtn')?.addEventListener('click', () => {
        showModal('新建文件', 'file');
    });
    
    document.getElementById('newFolderBtn')?.addEventListener('click', () => {
        showModal('新建文件夹', 'folder');
    });
    
    document.getElementById('refreshTreeBtn')?.addEventListener('click', () => {
        refreshFileTree();
    });
    
    document.getElementById('collapseAllBtn')?.addEventListener('click', () => {
        collapseAllFolders();
    });
}

function toggleFolder(folderItem) {
    const children = folderItem.querySelector(':scope > .tree-children');
    const chevron = folderItem.querySelector('.tree-chevron svg');
    const icon = folderItem.querySelector('.tree-icon');
    
    if (folderItem.classList.contains('expanded')) {
        folderItem.classList.remove('expanded');
        folderItem.classList.add('collapsed');
        if (children) children.style.display = 'none';
        if (chevron) chevron.style.transform = 'rotate(-90deg)';
        if (icon) {
            icon.classList.remove('open');
            icon.classList.add('closed');
        }
    } else {
        folderItem.classList.remove('collapsed');
        folderItem.classList.add('expanded');
        if (children) children.style.display = 'block';
        if (chevron) chevron.style.transform = 'rotate(0deg)';
        if (icon) {
            icon.classList.remove('closed');
            icon.classList.add('open');
        }
    }
}

function selectTreeItem(treeItem) {
    // 移除之前的选中状态
    document.querySelectorAll('.tree-item.selected').forEach(item => {
        item.classList.remove('selected');
    });
    
    treeItem.classList.add('selected');
    selectedTreeItem = treeItem;
    
    const path = treeItem.dataset.path;
    const type = treeItem.dataset.type;
    console.log(`选中: ${path} (${type})`);
}

function refreshFileTree(projectPath) {
    const fileTreeContainer = document.getElementById('fileTreeContainer');
    
    // 显示刷新动画
    fileTreeContainer.style.opacity = '0.5';
    
    setTimeout(() => {
        fileTreeContainer.style.opacity = '1';
        console.log(`刷新文件树: ${projectPath || '当前项目'}`);
    }, 300);
}

function collapseAllFolders() {
    const folders = document.querySelectorAll('.tree-folder.expanded');
    folders.forEach(folder => {
        if (!folder.parentElement.closest('.tree-folder')) {
            toggleFolder(folder);
        }
    });
}

// ==================== 右键上下文菜单 ====================
function initContextMenu() {
    const contextMenu = document.getElementById('contextMenu');
    const fileTree = document.getElementById('fileTree');
    
    fileTree.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        
        const treeItem = e.target.closest('.tree-item');
        if (treeItem) {
            selectTreeItem(treeItem);
            showContextMenu(e.clientX, e.clientY);
        } else {
            showContextMenu(e.clientX, e.clientY);
        }
    });
    
    // 文件树区域右键（空白处）
    fileTree.addEventListener('click', (e) => {
        hideContextMenu();
    });
    
    // 菜单项点击
    contextMenu.querySelectorAll('.context-menu-item').forEach(item => {
        item.addEventListener('click', () => {
            const action = item.dataset.action;
            handleContextAction(action);
            hideContextMenu();
        });
    });
    
    // 点击其他地方关闭菜单
    document.addEventListener('click', (e) => {
        if (!contextMenu.contains(e.target)) {
            hideContextMenu();
        }
    });
    
    // ESC键关闭
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            hideContextMenu();
            hideModal();
            hideConfirmDialog();
        }
    });
}

function showContextMenu(x, y) {
    const contextMenu = document.getElementById('contextMenu');
    
    // 确保菜单不超出视口
    const menuWidth = 200;
    const menuHeight = 350;
    
    if (x + menuWidth > window.innerWidth) {
        x = window.innerWidth - menuWidth - 10;
    }
    if (y + menuHeight > window.innerHeight) {
        y = window.innerHeight - menuHeight - 10;
    }
    
    contextMenu.style.left = `${x}px`;
    contextMenu.style.top = `${y}px`;
    contextMenu.classList.add('show');
}

function hideContextMenu() {
    const contextMenu = document.getElementById('contextMenu');
    contextMenu.classList.remove('show');
}

function handleContextAction(action) {
    switch (action) {
        case 'newFile':
            showModal('新建文件', 'file');
            break;
        case 'newFolder':
            showModal('新建文件夹', 'folder');
            break;
        case 'cut':
            console.log('剪切:', selectedTreeItem?.dataset.path);
            break;
        case 'copy':
            console.log('复制:', selectedTreeItem?.dataset.path);
            break;
        case 'paste':
            console.log('粘贴');
            break;
        case 'rename':
            startRename();
            break;
        case 'delete':
            confirmDelete();
            break;
    }
}

// ==================== 模态对话框 ====================
let modalCallback = null;

function initModalDialogs() {
    const overlay = document.getElementById('modalOverlay');
    const closeBtn = document.getElementById('modalClose');
    const cancelBtn = document.getElementById('modalCancel');
    const confirmBtn = document.getElementById('modalConfirm');
    const input = document.getElementById('itemNameInput');
    
    closeBtn?.addEventListener('click', hideModal);
    cancelBtn?.addEventListener('click', hideModal);
    overlay?.addEventListener('click', (e) => {
        if (e.target === overlay) hideModal();
    });
    
    confirmBtn?.addEventListener('click', () => {
        const name = input.value.trim();
        const type = document.querySelector('input[name="itemType"]:checked')?.value || 'file';
        
        if (name) {
            if (modalCallback) modalCallback(name, type);
            hideModal();
        } else {
            input.focus();
            input.classList.add('error');
            setTimeout(() => input.classList.remove('error'), 1000);
        }
    });
    
    // 回车确认
    input?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            confirmBtn.click();
        }
    });
    
    // 确认删除对话框
    const confirmDialog = document.getElementById('confirmDialog');
    const confirmOk = document.getElementById('confirmOk');
    const confirmCancel = document.getElementById('confirmCancel');
    
    confirmOk?.addEventListener('click', () => {
        executeDelete();
        hideConfirmDialog();
    });
    
    confirmCancel?.addEventListener('click', hideConfirmDialog);
    confirmDialog?.addEventListener('click', (e) => {
        if (e.target === confirmDialog) hideConfirmDialog();
    });
}

function showModal(title, defaultType = 'file') {
    const overlay = document.getElementById('modalOverlay');
    const titleEl = document.getElementById('modalTitle');
    const input = document.getElementById('itemNameInput');
    const typeGroup = document.getElementById('itemTypeGroup');
    
    titleEl.textContent = title;
    input.value = '';
    
    // 设置默认类型
    const radio = document.querySelector(`input[name="itemType"][value="${defaultType}"]`);
    if (radio) radio.checked = true;
    
    // 如果是新建文件夹，隐藏类型选择
    if (title.includes('文件夹')) {
        typeGroup.style.display = 'none';
    } else {
        typeGroup.style.display = 'block';
    }
    
    overlay.classList.add('show');
    setTimeout(() => input.focus(), 100);
    
    return new Promise((resolve) => {
        modalCallback = resolve;
    });
}

function hideModal() {
    const overlay = document.getElementById('modalOverlay');
    overlay.classList.remove('show');
    modalCallback = null;
}

// ==================== CRUD 操作实现 ====================
function createNewItem(name, type) {
    if (!selectedTreeItem) {
        alert('请先选择一个父级文件夹');
        return;
    }
    
    const parentPath = selectedTreeItem.dataset.path;
    const newPath = `${parentPath}/${name}`;
    
    console.log(`创建${type === 'folder' ? '文件夹' : '文件'}: ${newPath}`);
    
    // 在UI中添加新项
    const childrenContainer = selectedTreeItem.querySelector(':scope > .tree-children');
    if (childrenContainer && type === 'file') {
        const ext = name.split('.').pop() || 'txt';
        const newItemHtml = `
            <div class="tree-item tree-file" data-path="${newPath}" data-type="file" data-ext="${ext}">
                <div class="tree-item-content">
                    <div class="tree-placeholder"></div>
                    <div class="tree-icon file-icon">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                            <polyline points="14 2 14 8 20 8"/>
                        </svg>
                    </div>
                    <span class="tree-label">${escapeHtml(name)}</span>
                </div>
            </div>
        `;
        childrenContainer.insertAdjacentHTML('beforeend', newItemHtml);
    }
    
    // 展开父文件夹
    if (selectedTreeItem.classList.contains('collapsed')) {
        toggleFolder(selectedTreeItem);
    }
}

function startRename() {
    if (!selectedTreeItem) {
        alert('请先选择要重命名的项');
        return;
    }
    
    const label = selectedTreeItem.querySelector('.tree-label');
    const oldName = label.textContent;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = oldName;
    input.className = 'tree-rename-input';
    
    label.replaceWith(input);
    input.focus();
    input.select();
    
    const finishRename = () => {
        const newName = input.value.trim() || oldName;
        const newLabel = document.createElement('span');
        newLabel.className = 'tree-label';
        newLabel.textContent = newName;
        input.replaceWith(newLabel);
        
        if (newName !== oldName) {
            const path = selectedTreeItem.dataset.path;
            const newPath = path.replace(/[^/]+$/, newName);
            selectedTreeItem.dataset.path = newPath;
            console.log(`重命名: ${oldName} -> ${newName}`);
        }
    };
    
    input.addEventListener('blur', finishRename);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') finishRename();
        if (e.key === 'Escape') {
            input.value = oldName;
            finishRename();
        }
    });
}

function confirmDelete() {
    if (!selectedTreeItem) {
        alert('请先选择要删除的项');
        return;
    }
    
    const name = selectedTreeItem.querySelector('.tree-label')?.textContent || '此项目';
    const message = `确定要删除 "${name}" 吗？此操作无法撤销。`;
    
    document.getElementById('confirmMessage').textContent = message;
    document.getElementById('confirmDialog').classList.add('show');
}

function hideConfirmDialog() {
    document.getElementById('confirmDialog').classList.remove('show');
}

function executeDelete() {
    if (!selectedTreeItem) return;
    
    const name = selectedTreeItem.querySelector('.tree-label')?.textContent;
    const path = selectedTreeItem.dataset.path;
    
    console.log(`删除: ${path}`);
    
    // 从DOM中移除
    selectedTreeItem.remove();
    selectedTreeItem = null;
    
    console.log(`已删除: ${name}`);
}

// ==================== 面包屑导航 ====================
function initBreadcrumbNav() {
    const breadcrumbItems = document.querySelectorAll('.breadcrumb-item:not(.root)');
    
    breadcrumbItems.forEach(item => {
        item.addEventListener('click', () => {
            const path = item.dataset.path;
            console.log(`导航到: ${path}`);
            
            // 更新激活状态
            breadcrumbItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
        });
    });
}

// ==================== 辅助函数 ====================
function closeAllDropdowns() {
    document.querySelectorAll('.pm-dropdown.show').forEach(dropdown => {
        dropdown.classList.remove('show');
    });
    document.querySelectorAll('.pm-selector.open').forEach(selector => {
        selector.classList.remove('open');
    });
}

// ==================== 开源优化：虚拟滚动引擎 ====================
class VirtualScrollEngine {
  constructor(container, options = {}) {
    this.container = container;
    this.itemHeight = options.itemHeight || 32;
    this.overscanCount = options.overscanCount || 5;
    this.items = [];
    this.visibleItems = [];
    this.scrollTop = 0;
    this.containerHeight = 0;
    
    this.init();
  }
  
  init() {
    this.updateContainerHeight();
    
    // 监听滚动事件（使用requestAnimationFrame优化）
    let ticking = false;
    this.container.addEventListener('scroll', () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          this.onScroll();
          ticking = false;
        });
        ticking = true;
      }
    });
    
    // 监听窗口大小变化
    window.addEventListener('resize', () => {
      this.updateContainerHeight();
      this.render();
    });
  }
  
  updateContainerHeight() {
    this.containerHeight = this.container.clientHeight || 280;
  }
  
  setItems(items) {
    this.items = items;
    this.render();
  }
  
  onScroll() {
    this.scrollTop = this.container.scrollTop;
    this.render();
  }
  
  getVisibleRange() {
    const startIndex = Math.max(0, 
      Math.floor(this.scrollTop / this.itemHeight) - this.overscanCount);
    const endIndex = Math.min(this.items.length,
      Math.ceil((this.scrollTop + this.containerHeight) / this.itemHeight) + this.overscanCount);
    
    return { startIndex, endIndex };
  }
  
  render() {
    const { startIndex, endIndex } = this.getVisibleRange();
    this.visibleItems = this.items.slice(startIndex, endIndex);
    
    // 触发自定义事件供外部使用
    this.container.dispatchEvent(new CustomEvent('virtualscroll', {
      detail: {
        visibleItems: this.visibleItems,
        startIndex,
        endIndex,
        totalItems: this.items.length,
        offsetY: startIndex * this.itemHeight
      }
    }));
  }
}

// ==================== 开源优化：懒加载管理器 ====================
class LazyLoadManager {
  constructor(options = {}) {
    this.cache = new Map(); // LRU缓存
    this.maxCacheSize = options.maxCacheSize || 100;
    this.loadingStates = new Set(); // 正在加载的路径
    this.excludePatterns = [
      '**/node_modules/**',
      '**/.git/**',
      '**/dist/**',
      '**/build/**',
      '**/.DS_Store',
      '**/*.log'
    ];
  }
  
  shouldExclude(path) {
    return this.excludePatterns.some(pattern => {
      const regex = new RegExp(
        pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*')
      );
      return regex.test(path);
    });
  }
  
  async loadChildren(folderPath) {
    if (this.shouldExclude(folderPath)) {
      return { children: [], excluded: true };
    }
    
    if (this.cache.has(folderPath)) {
      console.log(`[LazyLoad] 命中缓存: ${folderPath}`);
      return this.cache.get(folderPath);
    }
    
    if (this.loadingStates.has(folderPath)) {
      console.log(`[LazyLoad] 正在加载: ${folderPath}`);
      return null; // 正在加载中
    }
    
    this.loadingStates.add(folderPath);
    
    try {
      // 模拟异步加载（实际项目中替换为API调用）
      await this.simulateAsyncLoad();
      
      const children = this.generateMockChildren(folderPath);
      
      // 缓存结果
      this.cache.set(folderPath, { children, excluded: false });
      
      // 淘汰旧缓存
      if (this.cache.size > this.maxCacheSize) {
        const firstKey = this.cache.keys().next().value;
        this.cache.delete(firstKey);
        console.log(`[LazyLoad] 淘汰缓存: ${firstKey}`);
      }
      
      console.log(`[LazyLoad] 加载完成: ${folderPath} (${children.length}项)`);
      return { children, excluded: false };
      
    } finally {
      this.loadingStates.delete(folderPath);
    }
  }
  
  simulateAsyncLoad() {
    return new Promise(resolve => setTimeout(resolve, 150 + Math.random() * 200));
  }
  
  generateMockChildren(parentPath) {
    const mockFiles = [
      'src/components/Button.tsx',
      'src/components/Input.tsx',
      'src/utils/helpers.ts',
      'src/hooks/useAuth.ts',
      'pages/index.tsx',
      'pages/about.tsx',
      'styles/global.css',
      'config/database.ts',
      '.env.local',
      'package.json',
      'tsconfig.json',
      'README.md',
      '.gitignore',
      'public/favicon.ico',
      'assets/logo.png'
    ];
    
    const depth = parentPath.split('/').length;
    const count = Math.min(8 + Math.floor(Math.random() * 10), 15);
    
    return mockFiles.slice(0, count).map((file, index) => ({
      name: file.split('/').pop(),
      path: `${parentPath}/${file}`,
      type: file.includes('.') ? 'file' : 'folder',
      ext: file.split('.').pop() || null,
      size: `${(Math.random() * 10).toFixed(1)}KB`,
      modified: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000)
    }));
  }
  
  clearCache() {
    this.cache.clear();
    console.log('[LazyLoad] 缓存已清空');
  }
  
  getStats() {
    return {
      cacheSize: this.cache.size,
      loadingCount: this.loadingStates.size,
      maxCacheSize: this.maxCacheSize
    };
  }
}

// ==================== 开源优化：防抖函数 ====================
function debounce(func, wait = 300) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// 节流函数
function throttle(func, limit = 200) {
  let inThrottle;
  return function executedFunction(...args) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

// ==================== 开源优化：性能监控器 ====================
class PerformanceMonitor {
  constructor() {
    this.metrics = {};
    this.isEnabled = false;
    this.panel = null;
  }
  
  enable() {
    this.isEnabled = true;
    this.createPanel();
    console.log('[PerfMonitor] 性能监控已启用');
  }
  
  disable() {
    this.isEnabled = false;
    if (this.panel) {
      this.panel.remove();
      this.panel = null;
    }
  }
  
  createPanel() {
    if (document.getElementById('perfPanel')) return;
    
    this.panel = document.createElement('div');
    this.panel.id = 'perfPanel';
    this.panel.innerHTML = `
      <div class="perf-header">
        <span>🚀 性能监控</span>
        <button id="closePerfBtn">×</button>
      </div>
      <div class="perf-content" id="perfContent"></div>
    `;
    document.body.appendChild(this.panel);
    
    document.getElementById('closePerfBtn')?.addEventListener('click', () => {
      this.disable();
    });
    
    // 定期更新指标
    setInterval(() => this.updateMetrics(), 1000);
  }
  
  startMeasure(label) {
    if (!this.isEnabled) return;
    this.metrics[label] = performance.now();
  }
  
  endMeasure(label) {
    if (!this.isEnabled || !this.metrics[label]) return;
    
    const duration = performance.now() - this.metrics[label];
    delete this.metrics[label];
    
    console.log(`[Perf] ${label}: ${duration.toFixed(2)}ms`);
    return duration;
  }
  
  updateMetrics() {
    if (!this.isEnabled || !this.panel) return;
    
    const content = document.getElementById('perfContent');
    if (!content) return;
    
    const memory = performance.memory ? {
      usedJSHeapSize: (performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(1),
      totalJSHeapSize: (performance.memory.totalJSHeapSize / 1024 / 1024).toFixed(1),
      jsHeapSizeLimit: (performance.memory.jsHeapSizeLimit / 1024 / 1024).toFixed(1)
    } : null;
    
    content.innerHTML = `
      <div class="perf-item">
        <span class="perf-label">DOM节点数:</span>
        <span class="perf-value">${document.querySelectorAll('*').length.toLocaleString()}</span>
      </div>
      ${memory ? `
      <div class="perf-item">
        <span class="perf-label">内存使用:</span>
        <span class="perf-value">${memory.usedJSHeapSize}MB / ${memory.totalJSHeapSize}MB</span>
      </div>
      ` : ''}
      <div class="perf-item">
        <span class="perf-label">事件监听器:</span>
        <span class="perf-value">${getEventListenerCount()}</span>
      </div>
      <div class="perf-item">
        <span class="perf-label">文件树缓存:</span>
        <span class="perf-value">${lazyLoadManager ? lazyLoadManager.getStats().cacheSize : 0}项</span>
      </div>
    `;
  }
}

// 辅助函数：获取事件监听器数量
function getEventListenerCount() {
  let count = 0;
  const elements = document.querySelectorAll('*');
  elements.forEach(el => {
    const events = getEventListeners ? getEventListeners(el) : {};
    count += Object.keys(events).reduce((sum, key) => sum + events[key].length, 0);
  });
  return count;
}

// 全局实例
let lazyLoadManager = null;
let virtualScrollEngine = null;
let perfMonitor = null;

// ==================== 应用初始化增强版 ====================
document.addEventListener('DOMContentLoaded', () => {
    // 初始化性能监控（默认关闭）
    perfMonitor = new PerformanceMonitor();
    
    // 初始化懒加载管理器
    lazyLoadManager = new LazyLoadManager({
      maxCacheSize: 100
    });
    
    // 初始化虚拟滚动引擎
    const fileTreeContainer = document.getElementById('fileTreeContainer');
    if (fileTreeContainer) {
      virtualScrollEngine = new VirtualScrollEngine(fileTreeContainer, {
        itemHeight: 32,
        overscanCount: 5
      });
    }
    
    initModeSwitcher();
    initTaskList();
    initTabSwitcher();
    initChatInput();
    initNewTask();
    initClarificationForm();
    
    // 初始化项目管理器
    initProjectManager();
    initFileTree();
    initContextMenu();
    initModalDialogs();
    initBreadcrumbNav();
    
    // 初始化优化功能
    initOptimizedSearch();
    initFileFiltering();
    initKeyboardShortcuts();
    initPerformanceToggle();
    
    console.log('%c🚀 Agent Studio 已启动（开源优化版）', 
      'color: #8b5cf6; font-size: 14px; font-weight: bold;');
    console.log('%c💡 提示: 按 Shift+P 打开性能监控面板', 
      'color: #6b7280; font-size: 12px;');
});

// ==================== 开源优化：搜索防抖 ====================
function initOptimizedSearch() {
  const searchInput = document.getElementById('projectSearchInput');
  if (!searchInput) return;
  
  // 移除旧的监听器并添加防抖版本
  const debouncedSearch = debounce((query) => {
    perfMonitor?.startMeasure('ProjectSearch');
    
    const items = document.querySelectorAll('.pm-item');
    let visibleCount = 0;
    
    items.forEach(item => {
      const name = item.querySelector('span')?.textContent.toLowerCase() || '';
      const isVisible = name.includes(query.toLowerCase());
      item.style.display = isVisible ? 'flex' : 'none';
      if (isVisible) visibleCount++;
    });
    
    perfMonitor?.endMeasure('ProjectSearch');
    console.log(`[Search] "${query}" - 找到 ${visibleCount}个结果`);
  }, 200);
  
  searchInput.addEventListener('input', (e) => {
    debouncedSearch(e.target.value);
  });
}

// ==================== 开源优化：文件过滤规则 ====================
function initFileFiltering() {
  console.log('[FileFilter] 过滤规则已启用:');
  console.log('  - 排除: node_modules/, .git/, dist/, build/');
  console.log('  - 隐藏: .DS_Store, *.log');
  
  // 在文件树中应用过滤
  const excludedFolders = ['node_modules', '.git', 'dist', 'build'];
  
  document.querySelectorAll('.tree-folder[data-path]').forEach(folder => {
    const path = folder.dataset.path || '';
    const folderName = path.split('/').pop() || '';
    
    if (excludedFolders.some(excluded => folderName === excluded)) {
      folder.classList.add('filtered-out');
      folder.style.display = 'none';
      console.log(`[FileFilter] 已隐藏: ${path}`);
    }
  });
}

// ==================== 开源优化：键盘快捷键 ====================
function initKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Ctrl+Shift+P: 性能监控开关
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'P') {
      e.preventDefault();
      if (perfMonitor?.isEnabled) {
        perfMonitor.disable();
      } else {
        perfMonitor.enable();
      }
    }
    
    // Ctrl+F: 聚焦搜索框
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      const searchInput = document.getElementById('projectSearchInput');
      searchInput?.focus();
    }
    
    // Ctrl+N: 新建文件
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
      e.preventDefault();
      showModal('新建文件', 'file');
    }
    
    // Ctrl+Shift+N: 新建文件夹
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'N') {
      e.preventDefault();
      showModal('新建文件夹', 'folder');
    }
  });
}

// ==================== 开源优化：性能监控切换 ====================
function initPerformanceToggle() {
  // 在控制台暴露全局API
  window.AgentStudio = {
    ...window.AgentWorkbench,
    
    enablePerformanceMonitoring: () => perfMonitor?.enable(),
    disablePerformanceMonitoring: () => perfMonitor?.disable(),
    
    getLazyLoadStats: () => lazyLoadManager?.getStats(),
    clearFileCache: () => lazyLoadManager?.clearCache(),
    
    getVirtualScrollInfo: () => ({
      itemCount: virtualScrollEngine?.items.length || 0,
      visibleCount: virtualScrollEngine?.visibleItems.length || 0,
      containerHeight: virtualScrollEngine?.containerHeight || 0
    }),
    
    getVersion: () => '3.0.0-advanced-file-manager'
  };
}

// ==================== 高级功能：快速打开 (Quick Open) ====================
class QuickOpenManager {
  constructor() {
    this.overlay = document.getElementById('quickOpenOverlay');
    this.input = document.getElementById('quickOpenInput');
    this.results = document.getElementById('quickOpenResults');
    this.selectedIndex = 0;
    this.fileIndex = [];
    this.bookmarks = new Set();
    this.recentFiles = [];
    this.maxRecentFiles = 20;
    this.maxBookmarks = 50;
    
    this.init();
  }
  
  init() {
    if (!this.overlay) return;
    
    // 构建文件索引
    this.buildFileIndex();
    
    // 监听输入事件（带防抖）
    let searchTimeout;
    this.input.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => this.filterResults(), 100);
    });
    
    // 键盘导航
    this.input.addEventListener('keydown', (e) => this.handleKeyNav(e));
    
    // 点击结果项
    this.results.addEventListener('click', (e) => {
      const item = e.target.closest('.quick-open-item');
      if (item) this.selectItem(item);
    });
    
    // 点击遮罩关闭
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });
    
    console.log('[QuickOpen] ✅ 快速打开已初始化');
  }
  
  buildFileIndex() {
    // 从文件树构建索引
    document.querySelectorAll('.tree-item[data-path]').forEach(item => {
      const path = item.dataset.path;
      const name = item.querySelector('.tree-name')?.textContent || path.split('/').pop();
      const ext = name.split('.').pop().toLowerCase();
      
      this.fileIndex.push({
        path,
        name,
        ext,
        iconClass: this.getIconClass(ext)
      });
    });
    
    console.log(`[QuickOpen] 📁 已索引 ${this.fileIndex.length} 个文件`);
  }
  
  getIconClass(ext) {
    const iconMap = {
      'html': 'html-icon',
      'css': 'css-icon',
      'js': 'js-icon',
      'ts': 'js-icon',
      'json': 'json-icon',
      'md': 'md-icon',
      'py': 'js-icon',
      'java': 'js-icon'
    };
    return iconMap[ext] || '';
  }
  
  open() {
    this.overlay.style.display = 'block';
    this.input.value = '';
    this.selectedIndex = 0;
    this.renderResults(this.fileIndex);
    setTimeout(() => this.input.focus(), 50);
    console.log('[QuickOpen] 🔍 打开快速打开面板');
  }
  
  close() {
    this.overlay.style.display = 'none';
    console.log('[QuickOpen] ❌ 关闭快速打开面板');
  }
  
  filterResults() {
    const query = this.input.value.toLowerCase().trim();
    
    if (!query) {
      this.renderResults(this.fileIndex);
      return;
    }
    
    // 模糊匹配算法
    const filtered = this.fileIndex.filter(file => {
      return file.name.toLowerCase().includes(query) ||
             file.path.toLowerCase().includes(query);
    });
    
    // 排序：精确匹配优先，然后按名称相似度
    filtered.sort((a, b) => {
      const aExact = a.name.toLowerCase() === query ? -1 : 0;
      const bExact = b.name.toLowerCase() === query ? -1 : 0;
      return aExact - bExact || a.name.localeCompare(b.name);
    });
    
    this.selectedIndex = 0;
    this.renderResults(filtered);
  }
  
  renderResults(files) {
    if (!files.length) {
      this.results.innerHTML = `
        <div style="padding: 40px; text-align: center; color: var(--text-muted);">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" style="margin-bottom: 12px; opacity: 0.3;">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <p>未找到匹配的文件</p>
        </div>
      `;
      return;
    }
    
    this.results.innerHTML = files.map((file, index) => `
      <div class="quick-open-item ${index === this.selectedIndex ? 'active' : ''}" 
           data-path="${file.path}" data-index="${index}">
        <span class="qo-icon ${file.iconClass}">
          ${this.getFileIconSVG(file.ext)}
        </span>
        <span class="qo-name">${this.highlightMatch(file.name)}</span>
        <span class="qo-path">${file.path}</span>
        ${this.bookmarks.has(file.path) ? '<span class="qo-bookmark"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg></span>' : ''}
      </div>
    `).join('');
  }
  
  highlightMatch(name) {
    const query = this.input.value.toLowerCase();
    if (!query) return name;
    
    const idx = name.toLowerCase().indexOf(query);
    if (idx === -1) return name;
    
    return `${name.substring(0, idx)}<mark>${name.substring(idx, idx + query.length)}</mark>${name.substring(idx + query.length)}`;
  }
  
  getFileIconSVG(ext) {
    const icons = {
      html: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
      css: '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>',
      js: '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="7" y1="8" x2="17" y2="8"/><line x1="7" y1="12" x2="13" y2="12"/>',
      json: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
      md: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>'
    };
    return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${icons[ext] || icons.json}</svg>`;
  }
  
  handleKeyNav(e) {
    const items = this.results.querySelectorAll('.quick-open-item');
    
    switch(e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this.selectedIndex = Math.min(this.selectedIndex + 1, items.length - 1);
        this.updateSelection(items);
        break;
        
      case 'ArrowUp':
        e.preventDefault();
        this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
        this.updateSelection(items);
        break;
        
      case 'Enter':
        e.preventDefault();
        const activeItem = items[this.selectedIndex];
        if (activeItem) this.selectItem(activeItem);
        break;
        
      case 'Escape':
        e.preventDefault();
        this.close();
        break;
    }
  }
  
  updateSelection(items) {
    items.forEach((item, i) => {
      item.classList.toggle('active', i === this.selectedIndex);
    });
    
    // 确保选中项可见
    const activeItem = items[this.selectedIndex];
    if (activeItem) {
      activeItem.scrollIntoView({ block: 'nearest' });
    }
  }
  
  selectItem(item) {
    const path = item.dataset.path;
    console.log(`[QuickOpen] 📄 打开文件: ${path}`);
    
    // 记录到最近访问
    this.addToRecent(path);
    
    // 触发文件打开事件
    this.onFileOpen?.(path);
    
    this.close();
  }
  
  addToRecent(path) {
    // 移除已存在的
    this.recentFiles = this.recentFiles.filter(f => f.path !== path);
    
    // 添加到开头
    this.recentFiles.unshift({
      path,
      time: new Date()
    });
    
    // 限制数量
    if (this.recentFiles.length > this.maxRecentFiles) {
      this.recentFiles.pop();
    }
    
    this.updateRecentPanel();
  }
  
  updateRecentPanel() {
    const recentList = document.getElementById('recentList');
    if (!recentList) return;
    
    recentList.innerHTML = this.recentFiles.map((file, index) => {
      const timeAgo = this.getTimeAgo(file.time);
      const name = file.path.split('/').pop();
      const ext = name.split('.').pop().toLowerCase();
      
      return `
        <div class="recent-item ${index === 0 ? 'active' : ''}" data-path="${file.path}">
          <span class="recent-icon ${this.getIconClass(ext)}">
            ${this.getFileIconSVG(ext)}
          </span>
          <div class="recent-info">
            <span class="recent-name">${name}</span>
            <span class="recent-time">${timeAgo}</span>
          </div>
        </div>
      `;
    }).join('');
  }
  
  getTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    
    if (seconds < 60) return '刚刚';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}分钟前`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}小时前`;
    return `${Math.floor(seconds / 86400)}天前`;
  }
  
  toggleBookmark(path) {
    if (this.bookmarks.has(path)) {
      this.bookmarks.delete(path);
      console.log(`[Bookmark] 📌 移除书签: ${path}`);
    } else {
      if (this.bookmarks.size >= this.maxBookmarks) {
        console.warn('[Bookmark] ⚠️ 书签已达上限');
        return false;
      }
      this.bookmarks.add(path);
      console.log(`[Bookmark] 📌 添加书签: ${path}`);
    }
    
    this.updateBookmarksPanel();
    return true;
  }
  
  updateBookmarksPanel() {
    const bookmarksList = document.getElementById('bookmarksList');
    const bookmarkEmpty = document.getElementById('bookmarkEmpty');
    if (!bookmarksList) return;
    
    const bookmarkItems = Array.from(bookmarksList.querySelectorAll('.bookmark-item'));
    bookmarkItems.forEach(item => item.remove());
    
    if (this.bookmarks.size === 0) {
      if (bookmarkEmpty) bookmarkEmpty.style.display = 'block';
      return;
    }
    
    if (bookmarkEmpty) bookmarkEmpty.style.display = 'none';
    
    Array.from(this.bookmarks).forEach(path => {
      const name = path.split('/').pop();
      const ext = name.split('.').pop().toLowerCase();
      
      const item = document.createElement('div');
      item.className = 'bookmark-item';
      item.dataset.path = path;
      item.innerHTML = `
        <span class="bm-icon ${this.getIconClass(ext)}">
          ${this.getFileIconSVG(ext)}
        </span>
        <span class="bm-name">${name}</span>
        <button class="bm-remove-btn" title="移除书签">×</button>
      `;
      
      item.querySelector('.bm-remove-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleBookmark(path);
      });
      
      item.addEventListener('click', () => {
        this.selectItem({ dataset: { path } });
      });
      
      bookmarksList.appendChild(item);
    });
  }
}

// ==================== 高级功能：多选管理器 ====================
class MultiSelectManager {
  constructor() {
    this.selectedItems = new Set();
    this.toolbar = document.getElementById('multiSelectToolbar');
    this.countEl = document.getElementById('selectedCount');
    this.isActive = false;
    
    this.init();
  }
  
  init() {
    if (!this.toolbar) return;
    
    // 绑定工具栏按钮事件
    document.getElementById('msCopyBtn')?.addEventListener('click', () => this.copy());
    document.getElementById('msCutBtn')?.addEventListener('click', () => this.cut());
    document.getElementById('msDeleteBtn')?.addEventListener('click', () => this.batchDelete());
    document.getElementById('msBookmarkBtn')?.addEventListener('click', () => this.addToBookmarks());
    document.getElementById('msCloseBtn')?.addEventListener('click', () => this.clear());
    
    console.log('[MultiSelect] ✅ 多选管理器已初始化');
  }
  
  toggleItem(itemElement) {
    const path = itemElement.dataset.path;
    
    if (this.selectedItems.has(path)) {
      this.selectedItems.delete(path);
      itemElement.classList.remove('selected-multi');
    } else {
      this.selectedItems.add(path);
      itemElement.classList.add('selected-multi');
    }
    
    this.updateToolbar();
  }
  
  selectRange(startItem, endItem) {
    const allItems = [...document.querySelectorAll('.tree-item[data-path]')];
    const startIndex = allItems.indexOf(startItem);
    const endIndex = allItems.indexOf(endItem);
    
    if (startIndex === -1 || endIndex === -1) return;
    
    const [min, max] = [Math.min(startIndex, endIndex), Math.max(startIndex, endIndex)];
    
    for (let i = min; i <= max; i++) {
      const item = allItems[i];
      const path = item.dataset.path;
      this.selectedItems.add(path);
      item.classList.add('selected-multi');
    }
    
    this.updateToolbar();
  }
  
  updateToolbar() {
    const count = this.selectedItems.size;
    this.countEl.textContent = count;
    
    if (count > 0 && !this.isActive) {
      this.toolbar.classList.add('visible');
      this.isActive = true;
    } else if (count === 0 && this.isActive) {
      this.toolbar.classList.remove('visible');
      this.isActive = false;
    }
  }
  
  clear() {
    this.selectedItems.forEach(path => {
      const item = document.querySelector(`.tree-item[data-path="${path}"]`);
      item?.classList.remove('selected-multi');
    });
    
    this.selectedItems.clear();
    this.updateToolbar();
    console.log('[MultiSelect] 🧹 已清除选择');
  }
  
  copy() {
    const paths = Array.from(this.selectedItems);
    navigator.clipboard.writeText(paths.join('\n')).then(() => {
      console.log(`[MultiSelect] 📋 已复制 ${paths.length} 个文件路径`);
      this.showToast(`已复制 ${paths.length} 个文件`);
    });
  }
  
  cut() {
    this.copy();
    console.log('[MultiSelect] ✂️ 剪切操作（待实现移动目标）');
  }
  
  batchDelete() {
    const count = this.selectedItems.size;
    if (confirm(`确定要删除选中的 ${count} 个项目吗？此操作无法撤销。`)) {
      console.log(`[MultiSelect] 🗑️ 批量删除 ${count} 个项目`);
      this.clear();
    }
  }
  
  addToBookmarks() {
    quickOpenManager?.toggleBatchBookmarks(Array.from(this.selectedItems));
    console.log(`[MultiSelect] 📌 已添加 ${this.selectedItems.size} 个书签`);
  }
  
  showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'multi-select-toast';
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      bottom: 100px;
      left: 50%;
      transform: translateX(-50%);
      background-color: var(--bg-primary);
      border: 1px solid var(--border-color);
      padding: 10px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.15);
      z-index: 99999;
      font-size: 13px;
      color: var(--text-primary);
      animation: toastFadeIn 0.3s ease;
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  }
}

// ==================== 高级功能：拖拽排序和移动 ====================
class DragDropManager {
  constructor() {
    this.draggedItem = null;
    this.dropTarget = null;
    this.dragData = null;
    
    this.init();
  }
  
  init() {
    const fileTree = document.getElementById('fileTree');
    if (!fileTree) return;
    
    fileTree.addEventListener('dragstart', (e) => this.onDragStart(e));
    fileTree.addEventListener('dragover', (e) => this.onDragOver(e));
    fileTree.addEventListener('drop', (e) => this.onDrop(e));
    fileTree.addEventListener('dragend', (e) => this.onDragEnd(e));
    fileTree.addEventListener('dragleave', (e) => this.onDragLeave(e));
    
    console.log('[DragDrop] ✅ 拖拽管理器已初始化');
  }
  
  onDragStart(e) {
    const item = e.target.closest('.tree-item');
    if (!item) return;
    
    this.draggedItem = item;
    this.dragData = {
      path: item.dataset.path,
      type: item.dataset.type,
      isMultiSelect: multiSelectManager?.selectedItems.size > 0
    };
    
    item.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', this.dragData.path);
    
    // 设置拖拽图像透明度
    const dragImage = item.cloneNode(true);
    dragImage.style.cssText = 'opacity: 0.8; transform: scale(0.95);';
    document.body.appendChild(dragImage);
    e.dataTransfer.setDragImage(dragImage, 20, 20);
    setTimeout(() => dragImage.remove(), 0);
    
    console.log(`[DragDrop] 🎯 开始拖拽: ${this.dragData.path}`);
  }
  
  onDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    const target = e.target.closest('.tree-item');
    if (target && target !== this.draggedItem) {
      target.classList.add('drop-target');
      this.dropTarget = target;
    }
  }
  
  onDragLeave(e) {
    const target = e.target.closest('.tree-item');
    if (target === this.dropTarget) {
      target.classList.remove('drop-target');
    }
  }
  
  onDrop(e) {
    e.preventDefault();
    
    const targetPath = this.dropTarget?.dataset.path;
    const sourcePath = this.dragData?.path;
    
    if (targetPath && sourcePath && targetPath !== sourcePath) {
      console.log(`[DragDrop] 📦 移动文件: ${sourcePath} → ${targetPath}`);
      
      // 执行移动逻辑
      this.moveFile(sourcePath, targetPath);
    }
    
    this.cleanup();
  }
  
  onDragEnd(e) {
    this.cleanup();
  }
  
  moveFile(sourcePath, targetPath) {
    // 显示移动确认或直接执行
    const fileName = sourcePath.split('/').pop();
    const targetName = targetPath.split('/').pop();
    
    console.log(`[DragDrop] ✅ 文件 "${fileName}" 已移动到 "${targetName}"`);
    
    // 这里可以调用后端API执行实际的文件移动
    // await api.moveFile(sourcePath, targetPath);
  }
  
  cleanup() {
    this.draggedItem?.classList.remove('dragging');
    this.dropTarget?.classList.remove('drop-target');
    this.draggedItem = null;
    this.dropTarget = null;
    this.dragData = null;
  }
}

// ==================== 高级功能：增强键盘导航 ====================
class EnhancedKeyboardNavigation {
  constructor() {
    this.focusedIndex = -1;
    this.focusableItems = [];
    
    this.init();
  }
  
  init() {
    document.addEventListener('keydown', (e) => this.handleGlobalKeydown(e));
    console.log('[KeyboardNav] ✅ 增强键盘导航已初始化');
  }
  
  handleGlobalKeydown(e) {
    // Ctrl+P 或 Cmd+P: 打开快速打开
    if ((e.ctrlKey || e.metaKey) && e.key === 'p' && !e.shiftKey) {
      e.preventDefault();
      quickOpenManager?.open();
      return;
    }
    
    // Ctrl+Shift+B: 切换书签面板
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'B') {
      e.preventDefault();
      this.togglePanel('bookmarksPanel');
      return;
    }
    
    // Ctrl+Shift+H: 切换历史面板
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'H') {
      e.preventDefault();
      this.togglePanel('recentFilesPanel');
      return;
    }
    
    // Escape: 关闭所有面板/取消选择
    if (e.key === 'Escape') {
      multiSelectManager?.clear();
      quickOpenManager?.close();
      return;
    }
    
    // 在文件树中的导航
    if (document.activeElement?.closest('#fileTreeContainer')) {
      this.handleTreeNavigation(e);
    }
  }
  
  handleTreeNavigation(e) {
    const items = [...document.querySelectorAll('.tree-item:not(.filtered-out)')];
    
    switch(e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this.focusNextItem(items, 1);
        break;
        
      case 'ArrowUp':
        e.preventDefault();
        this.focusNextItem(items, -1);
        break;
        
      case 'ArrowRight':
        e.preventDefault();
        this.expandCurrentFolder();
        break;
        
      case 'ArrowLeft':
        e.preventDefault();
        this.collapseCurrentFolder();
        break;
        
      case 'Enter':
        e.preventDefault();
        this.openCurrentItem();
        break;
        
      case 'Space':
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) {
          // Ctrl+Space: 多选
          const current = items[this.focusedIndex];
          multiSelectManager?.toggleItem(current);
        }
        break;
        
      case 'F2':
        e.preventDefault();
        this.renameCurrentItem();
        break;
        
      case 'Delete':
      case 'Backspace':
        e.preventDefault();
        this.deleteCurrentItem();
        break;
        
      case 'a':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          this.selectAll(items);
        }
        break;
    }
  }
  
  focusNextItem(items, direction) {
    items.forEach(item => item.classList.remove('keyboard-focused'));
    
    this.focusedIndex += direction;
    if (this.focusedIndex < 0) this.focusedIndex = items.length - 1;
    if (this.focusedIndex >= items.length) this.focusedIndex = 0;
    
    const target = items[this.focusedIndex];
    target?.classList.add('keyboard-focused');
    target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  
  expandCurrentFolder() {
    const items = [...document.querySelectorAll('.tree-item:not(.filtered-out)')];
    const current = items[this.focusedIndex];
    
    if (current?.dataset.type === 'folder') {
      const toggle = current.querySelector('.tree-toggle');
      if (toggle?.classList.contains('collapsed')) {
        toggle.click();
      }
    }
  }
  
  collapseCurrentFolder() {
    const items = [...document.querySelectorAll('.tree-item:not(.filtered-out)')];
    const current = items[this.focusedIndex];
    
    if (current?.dataset.type === 'folder') {
      const toggle = current.querySelector('.tree-toggle');
      if (!toggle?.classList.contains('collapsed')) {
        toggle.click();
      } else {
        // 如果已折叠，聚焦到父文件夹
        const parent = current.parentElement?.closest('.tree-folder')?.querySelector(':scope > .tree-item');
        if (parent) {
          this.focusedIndex = items.indexOf(parent);
          items.forEach(item => item.classList.remove('keyboard-focused'));
          parent.classList.add('keyboard-focused');
        }
      }
    }
  }
  
  openCurrentItem() {
    const items = [...document.querySelectorAll('.tree-item:not(.filtered-out)')];
    const current = items[this.focusedIndex];
    
    if (current?.dataset.type === 'file') {
      quickOpenManager?.selectItem(current);
    } else {
      this.expandCurrentFolder();
    }
  }
  
  renameCurrentItem() {
    const items = [...document.querySelectorAll('.tree-item:not(.filtered-out)')];
    const current = items[this.focusedIndex];
    
    if (current) {
      current.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    }
  }
  
  deleteCurrentItem() {
    const items = [...document.querySelectorAll('.tree-item:not(.filtered-out)')];
    const current = items[this.focusedIndex];
    
    if (current) {
      // 触发右键菜单的删除选项
      current.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
    }
  }
  
  selectAll(items) {
    items.forEach(item => {
      multiSelectManager?.toggleItem(item);
    });
  }
  
  togglePanel(panelId) {
    const panel = document.getElementById(panelId);
    if (panel) {
      panel.classList.toggle('visible');
      console.log(`[KeyboardNav] 🔄 切换面板: ${panelId}`);
    }
  }
}

// 全局实例变量
let quickOpenManager;
let multiSelectManager;
let dragDropManager;
let enhancedKeyboardNav;

// 初始化高级功能
document.addEventListener('DOMContentLoaded', () => {
  // 延迟初始化，确保基础功能先加载完成
  setTimeout(() => {
    quickOpenManager = new QuickOpenManager();
    multiSelectManager = new MultiSelectManager();
    dragDropManager = new DragDropManager();
    enhancedKeyboardNav = new EnhancedKeyboardNavigation();
    
    console.log('%c🎯 高级文件管理功能已加载', 
      'color: #10b981; font-size: 13px; font-weight: bold;');
    console.log('%c💡 新快捷键:', 
      'color: #6b7280; font-size: 11px;');
    console.log('   ⌘P     - 快速打开文件');
    console.log('   ⌘⇧B   - 切换书签面板');
    console.log('   ⌘⇧H   - 切换历史面板');
    console.log('   ↑↓←→   - 键盘导航文件树');
    console.log('   Space  - 多选文件 (配合Ctrl)');
    console.log('   F2     - 重命名');
    console.log('   Delete - 删除');
  }, 500);
});

// 添加拖拽状态样式
const dragStyle = document.createElement('style');
dragStyle.textContent = `
  .tree-item.dragging {
    opacity: 0.5;
    transform: scale(0.98);
  }
  
  .tree-item.drop-target {
    background-color: rgba(99, 102, 241, 0.15) !important;
    border-left: 3px solid var(--primary-color) !important;
  }
  
  .tree-item.keyboard-focused {
    background-color: rgba(99, 102, 241, 0.08) !important;
    outline: 2px solid var(--primary-color) !important;
    outline-offset: -2px;
  }
  
  .quick-open-item mark {
    background-color: #fbbf24;
    color: #000;
    padding: 0 2px;
    border-radius: 2px;
  }
  
  @keyframes toastFadeIn {
    from { opacity: 0; transform: translateX(-50%) translateY(10px); }
    to { opacity: 1; transform: translateX(-50%) translateY(0); }
  }
`;
document.head.appendChild(dragStyle);

// ==================== 组件拖拽与吸附系统 (Drag & Snap System) ====================

/**
 * 面板拖拽引擎 - 核心拖拽逻辑
 * 参考：VS Code Dock、Figma Panels、Electron Window Manager
 */
class PanelDragEngine {
  constructor(options = {}) {
    this.panels = new Map();           // 所有可拖拽面板
    this.activePanel = null;           // 当前正在拖拽的面板
    this.dragState = {                 // 拖拽状态
      isDragging: false,
      startX: 0,
      startY: 0,
      startRect: null,
      panelId: null
    };
    
    this.snapThreshold = options.snapThreshold || 30;     // 吸附距离阈值（像素）
    this.gridSize = options.gridSize || 10;               // 网格大小（像素）
    this.enableGridSnap = options.enableGridSnap !== false;
    this.enableEdgeSnap = options.enableEdgeSnap !== false;
    
    // DOM元素引用
    this.ghostEl = document.getElementById('dragGhost');
    this.snapZonesContainer = document.getElementById('snapZonesContainer');
    this.dockPreviewOverlay = document.getElementById('dockPreviewOverlay');
    this.dockPreviewBox = document.getElementById('dockPreviewBox');
    this.snapToast = document.getElementById('snapToast');
    
    this.init();
  }
  
  init() {
    console.log('[PanelDrag] 🚀 拖拽引擎初始化完成');
    console.log(`   吸附阈值: ${this.snapThreshold}px`);
    console.log(`   网格大小: ${this.gridSize}px`);
    console.log(`   边缘吸附: ${this.enableEdgeSnap ? '✅ 启用' : '❌ 禁用'}`);
    console.log(`   网格吸附: ${this.enableGridSnap ? '✅ 启用' : '❌ 禁用'}`);
  }
  
  /**
   * 注册可拖拽面板
   * @param {string} panelId - 面板唯一标识
   * @param {HTMLElement} panelEl - 面板DOM元素
   * @param {Object} config - 面板配置
   */
  registerPanel(panelId, panelEl, config = {}) {
    if (this.panels.has(panelId)) {
      console.warn(`[PanelDrag] ⚠️ 面板 "${panelId}" 已存在，将被覆盖`);
    }
    
    // 设置面板属性
    panelEl.setAttribute('dockable', 'true');
    panelEl.dataset.panelId = panelId;
    
    // 注入拖拽手柄
    this.injectDragHandle(panelEl, panelId);
    
    // 注入调整大小手柄
    this.injectResizeHandles(panelEl);
    
    const panelData = {
      id: panelId,
      element: panelEl,
      name: config.name || panelId,
      defaultPosition: config.defaultPosition || 'left',
      currentPosition: config.currentPosition || config.defaultPosition || 'left',
      minWidth: config.minWidth || 200,
      minHeight: config.minHeight || 150,
      maxWidth: config.maxWidth || 600,
      maxHeight: config.maxHeight || 800,
      isResizable: config.isResizable !== false,
      canFloat: config.canFloat !== false,
      canDock: config.canDock !== false,
      zIndex: config.zIndex || 100,
      ...config
    };
    
    this.panels.set(panelId, panelData);
    
    // 绑定拖拽事件
    this.bindDragEvents(panelEl, panelData);
    
    console.log(`[PanelDrag] ✅ 注册面板: ${panelId} (${config.name || panelId})`);
    
    return panelData;
  }
  
  /**
   * 注入拖拽手柄到面板头部
   */
  injectDragHandle(panelEl, panelId) {
    const header = panelEl.querySelector('.panel-header, header, [class*="header"]');
    if (!header) return;
    
    // 检查是否已存在手柄
    if (header.querySelector('.drag-handle')) return;
    
    const handle = document.createElement('button');
    handle.className = 'drag-handle';
    handle.dataset.panelId = panelId;
    handle.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="9" cy="5" r="1"/>
        <circle cx="9" cy="12" r="1"/>
        <circle cx="9" cy="19" r="1"/>
        <circle cx="15" cy="5" r="1"/>
        <circle cx="15" cy="12" r="1"/>
        <circle cx="15" cy="19" r="1"/>
      </svg>
    `;
    handle.title = '拖动此面板';
    
    header.appendChild(handle);
  }
  
  /**
   * 注入调整大小手柄
   */
  injectResizeHandles(panelEl) {
    if (panelEl.querySelector('.resize-handle')) return;
    
    // 水平调整手柄（右侧）
    const hHandle = document.createElement('div');
    hHandle.className = 'resize-handle resize-handle-horizontal';
    hHandle.title = '拖动调整宽度';
    panelEl.appendChild(hHandle);
    
    // 垂直调整手柄（底部）
    const vHandle = document.createElement('div');
    vHandle.className = 'resize-handle resize-handle-vertical';
    vHandle.title = '拖动调整高度';
    panelEl.appendChild(vHandle);
    
    // 角落调整手柄
    const cHandle = document.createElement('div');
    cHandle.className = 'resize-handle resize-handle-corner';
    cHandle.title = '拖动调整大小';
    panelEl.appendChild(cHandle);
    
    // 绑定调整事件
    this.bindResizeEvents(panelEl, hHandle, 'horizontal');
    this.bindResizeEvents(panelEl, vHandle, 'vertical');
    this.bindResizeEvents(panelEl, cHandle, 'corner');
  }
  
  /**
   * 绑定拖拽事件
   */
  bindDragEvents(panelEl, panelData) {
    let dragStartHandler = null;
    
    // 手柄拖拽开始
    const onDragStart = (e) => {
      if (panelEl.classList.contains('is-locked')) return;
      
      e.preventDefault();
      e.stopPropagation();
      
      this.startDrag(e, panelData);
    };
    
    // 委托事件到面板上的手柄
    panelEl.addEventListener('mousedown', (e) => {
      if (e.target.closest('.drag-handle')) {
        onDragStart(e);
      }
    });
    
    // 触摸支持
    panelEl.addEventListener('touchstart', (e) => {
      if (e.target.closest('.drag-handle')) {
        onDragStart(e.touches[0]);
      }
    }, { passive: false });
  }
  
  /**
   * 开始拖拽
   */
  startDrag(e, panelData) {
    const panelEl = panelData.element;
    const rect = panelEl.getBoundingClientRect();
    
    this.dragState = {
      isDragging: true,
      startX: e.clientX,
      startY: e.clientY,
      startRect: { ...rect },
      panelId: panelData.id,
      panelData,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top
    };
    
    this.activePanel = panelData;
    
    // 设置面板拖拽状态
    panelEl.classList.add('is-dragging');
    
    // 显示幽灵元素
    this.showGhost(rect, panelData.name);
    
    // 显示吸附区域
    this.showSnapZones();
    
    // 显示停靠预览
    this.showDockPreview();
    
    // 绑定全局移动和结束事件
    document.addEventListener('mousemove', this.onDragMove);
    document.addEventListener('mouseup', this.onDragEnd);
    document.addEventListener('touchmove', this.onTouchMove, { passive: false });
    document.addEventListener('touchend', this.onTouchEnd);
    
    console.log(`[PanelDrag] 🎯 开始拖拽: ${panelData.name}`);
  }
  
  /**
   * 拖拽移动处理
   */
  onDragMove = (e) => {
    if (!this.dragState.isDragging) return;
    
    const { startX, startY, startRect, offsetX, offsetY } = this.dragState;
    const panelData = this.dragState.panelData;
    
    // 计算新位置
    let newX = e.clientX - offsetX;
    let newY = e.clientY - offsetY;
    
    // 应用网格吸附
    if (this.enableGridSnap) {
      newX = Math.round(newX / this.gridSize) * this.gridSize;
      newY = Math.round(newY / this.gridSize) * this.gridSize;
    }
    
    // 更新幽灵元素位置
    this.updateGhostPosition(newX, newY, startRect.width, startRect.height);
    
    // 检测吸附区域
    const snapResult = this.detectSnapZone(e.clientX, e.clientY);
    if (snapResult) {
      this.highlightSnapZone(snapResult.zone);
      this.updateDockPreview(snapResult.position, startRect);
    } else {
      this.clearSnapHighlight();
      this.hideDockPreview();
    }
    
    // 边缘吸附检测
    if (this.enableEdgeSnap) {
      const edgeSnap = this.detectEdgeSnap(newX, newY, startRect.width, startRect.height);
      if (edgeSnap) {
        this.updateGhostPosition(edgeSnap.x, edgeSnap.y, startRect.width, startRect.height);
      }
    }
  };
  
  onTouchMove = (e) => {
    e.preventDefault();
    this.onDragMove(e.touches[0]);
  };
  
  /**
   * 拖拽结束处理
   */
  onDragEnd = (e) => {
    if (!this.dragState.isDragging) return;
    
    const panelData = this.dragState.panelData;
    const panelEl = panelData.element;
    
    // 检测最终吸附位置
    const clientX = e.clientX || (e.changedTouches && e.changedTouches[0].clientX) || this.dragState.startX;
    const clientY = e.clientY || (e.changedTouches && e.changedTouches[0].clientY) || this.dragState.startY;
    
    const snapResult = this.detectSnapZone(clientX, clientY);
    
    if (snapResult && panelData.canDock) {
      // 执行停靠
      this.dockPanel(panelData, snapResult.position);
      this.showSnapToast(snapResult.position);
    } else {
      // 浮动模式或恢复原位
      if (panelData.canFloat) {
        this.floatPanel(panelData, clientX, clientY);
      } else {
        this.restorePanelPosition(panelData);
      }
    }
    
    // 清理状态
    this.cleanupDrag();
    
    console.log(`[PanelDrag] ✅ 结束拖拽: ${panelData.name} → ${panelData.currentPosition}`);
  };
  
  onTouchEnd = (e) => {
    this.onDragEnd(e);
  };
  
  /**
   * 清理拖拽状态
   */
  cleanupDrag() {
    // 移除面板拖拽样式
    if (this.activePanel?.element) {
      this.activePanel.element.classList.remove('is-dragging');
    }
    
    // 隐藏UI元素
    this.hideGhost();
    this.hideSnapZones();
    this.hideDockPreview();
    this.clearSnapHighlight();
    
    // 解绑全局事件
    document.removeEventListener('mousemove', this.onDragMove);
    document.removeEventListener('mouseup', this.onDragEnd);
    document.removeEventListener('touchmove', this.onTouchMove);
    document.removeEventListener('touchend', this.onTouchEnd);
    
    // 重置状态
    this.dragState = {
      isDragging: false,
      startX: 0,
      startY: 0,
      startRect: null,
      panelId: null
    };
    this.activePanel = null;
  }
  
  /**
   * 停靠面板到指定位置
   */
  dockPanel(panelData, position) {
    const panelEl = panelData.element;
    
    // 移除旧的位置属性
    Object.values(['left', 'right', 'top', 'bottom', 'float', 'fullscreen']).forEach(pos => {
      panelEl.removeAttribute(`dock-position-${pos}`);
    });
    
    // 设置新位置
    panelEl.setAttribute('dock-position', position);
    panelData.currentPosition = position;
    
    // 根据位置应用特定样式
    switch(position) {
      case 'left':
        panelEl.style.cssText = `
          position: absolute !important;
          left: 0 !important;
          top: 0 !important;
          bottom: 0 !important;
          width: ${panelData.defaultWidth || 280}px !important;
          height: auto !important;
          z-index: ${panelData.zIndex};
        `;
        break;
        
      case 'right':
        panelEl.style.cssText = `
          position: absolute !important;
          right: 0 !important;
          top: 0 !important;
          bottom: 0 !important;
          width: ${panelData.defaultWidth || 280}px !important;
          height: auto !important;
          z-index: ${panelData.zIndex};
        `;
        break;
        
      case 'top':
        panelEl.style.cssText = `
          position: absolute !important;
          left: 0 !important;
          top: 0 !important;
          right: 0 !important;
          height: ${panelData.defaultHeight || 200}px !important;
          width: auto !important;
          z-index: ${panelData.zIndex};
        `;
        break;
        
      case 'bottom':
        panelEl.style.cssText = `
          position: absolute !important;
          left: 0 !important;
          right: 0 !important;
          bottom: 0 !important;
          height: ${panelData.defaultHeight || 200}px !important;
          width: auto !important;
          z-index: ${panelData.zIndex};
        `;
        break;
        
      case 'float':
        // 保持当前位置为浮动
        panelEl.style.position = 'fixed';
        panelEl.style.zIndex = '99990';
        break;
        
      case 'fullscreen':
        panelEl.style.cssText = `
          position: fixed !important;
          inset: 0 !important;
          width: 100vw !important;
          height: 100vh !important;
          z-index: 99991 !important;
          border-radius: 0 !important;
        `;
        break;
    }
    
    // 触发停靠事件
    this.onDockChange?.(panelData.id, position);
    
    console.log(`[PanelDock] 📌 面板已停靠: ${panelData.name} → ${position}`);
  }
  
  /**
   * 设置面板为浮动模式
   */
  floatPanel(panelData, x, y) {
    const panelEl = panelData.element;
    const rect = panelEl.getBoundingClientRect();
    
    panelEl.setAttribute('dock-position', 'float');
    panelData.currentPosition = 'float';
    
    panelEl.style.cssText = `
      position: fixed !important;
      left: ${x - (rect.width / 2)}px !important;
      top: ${y - 20}px !important;
      width: ${rect.width}px !important;
      height: ${rect.height}px !important;
      z-index: 99990 !important;
      box-shadow: 0 16px 48px rgba(0, 0, 0, 0.2) !important;
      border-radius: var(--radius-lg) !important;
      border: 1px solid var(--border-color) !important;
    `;
    
    console.log(`[PanelFloat] 🎈 面板已浮动: ${panelData.name}`);
  }
  
  /**
   * 恢复面板到默认位置
   */
  restorePanelPosition(panelData) {
    this.dockPanel(panelData, panelData.defaultPosition);
  }
  
  /**
   * 检测吸附区域
   */
  detectSnapZone(x, y) {
    const zones = this.snapZonesContainer?.querySelectorAll('.snap-zone') || [];
    let closestZone = null;
    let minDistance = Infinity;
    
    zones.forEach(zone => {
      const rect = zone.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      
      const distance = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));
      
      if (distance < 120 && distance < minDistance) {  // 120px触发半径
        minDistance = distance;
        closestZone = {
          zone,
          position: zone.dataset.position,
          dockType: zone.dataset.dock
        };
      }
    });
    
    return closestZone;
  }
  
  /**
   * 边缘吸附检测
   */
  detectEdgeSnap(x, y, width, height) {
    const threshold = this.snapThreshold;
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight
    };
    
    let snappedX = x;
    let snappedY = y;
    let hasSnapped = false;
    
    // 左边缘
    if (x <= threshold) {
      snappedX = 0;
      hasSnapped = true;
    }
    
    // 右边缘
    if (x + width >= viewport.width - threshold) {
      snappedX = viewport.width - width;
      hasSnapped = true;
    }
    
    // 上边缘
    if (y <= threshold + 60) {  // 考虑顶部导航栏
      snappedY = 60;
      hasSnapped = true;
    }
    
    // 下边缘
    if (y + height >= viewport.height - threshold) {
      snappedY = viewport.height - height;
      hasSnapped = true;
    }
    
    return hasSnapped ? { x: snappedX, y: snappedY } : null;
  }
  
  // ========== UI更新方法 ==========
  
  showGhost(rect, title) {
    if (!this.ghostEl) return;
    
    this.ghostEl.querySelector('.ghost-title').textContent = title || '移动中...';
    this.ghostEl.querySelector('.ghost-size').textContent = `${Math.round(rect.width)} × ${Math.round(rect.height)}`;
    
    this.ghostEl.style.left = `${rect.left}px`;
    this.ghostEl.style.top = `${rect.top}px`;
    this.ghostEl.style.width = `${rect.width}px`;
    this.ghostEl.style.height = `${rect.height}px`;
    this.ghostEl.classList.add('visible');
  }
  
  updateGhostPosition(x, y, w, h) {
    if (!this.ghostEl) return;
    
    this.ghostEl.style.left = `${x}px`;
    this.ghostEl.style.top = `${y}px`;
    this.ghostEl.style.width = `${w}px`;
    this.ghostEl.style.height = `${h}px`;
    this.ghostEl.querySelector('.ghost-size').textContent = `${Math.round(w)} × ${Math.round(h)}`;
  }
  
  hideGhost() {
    this.ghostEl?.classList.remove('visible');
  }
  
  showSnapZones() {
    this.snapZonesContainer?.classList.add('active');
  }
  
  hideSnapZones() {
    this.snapZonesContainer?.classList.remove('active');
  }
  
  highlightSnapZone(snapInfo) {
    this.snapZonesContainer?.querySelectorAll('.snap-zone').forEach(z => {
      z.classList.toggle('active', z === snapInfo.zone);
    });
  }
  
  clearSnapHighlight() {
    this.snapZonesContainer?.querySelectorAll('.snap-zone').forEach(z => {
      z.classList.remove('active');
    });
  }
  
  showDockPreview() {
    this.dockPreviewOverlay?.classList.add('active');
  }
  
  hideDockPreview() {
    this.dockPreviewOverlay?.classList.remove('active');
  }
  
  updateDockPreview(position, originalRect) {
    if (!this.dockPreviewBox) return;
    
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight
    };
    
    let previewStyle = {};
    
    switch(position) {
      case 'left':
        previewStyle = { left: 0, top: 60, width: 280, height: viewport.height - 60 };
        break;
      case 'right':
        previewStyle = { right: 0, top: 60, width: 280, height: viewport.height - 60 };
        break;
      case 'top':
        previewStyle = { left: 0, top: 60, width: viewport.width, height: 200 };
        break;
      case 'bottom':
        previewStyle = { left: 0, bottom: 0, width: viewport.width, height: 200 };
        break;
      case 'center':
      case 'float':
        previewStyle = { 
          left: (viewport.width - originalRect.width) / 2, 
          top: (viewport.height - originalRect.height) / 2,
          width: originalRect.width,
          height: originalRect.height
        };
        break;
      case 'fullscreen':
        previewStyle = { left: 0, top: 0, width: viewport.width, height: viewport.height };
        break;
    }
    
    Object.assign(this.dockPreviewBox.style, {
      left: `${previewStyle.left}px`,
      top: `${previewStyle.top !== undefined ? previewStyle.top : 'auto'}px`,
      right: `${previewStyle.right !== undefined ? previewStyle.right : 'auto'}px`,
      bottom: `${previewStyle.bottom !== undefined ? previewStyle.bottom : 'auto'}px`,
      width: `${previewStyle.width}px`,
      height: `${previewStyle.height}px`
    });
  }
  
  showSnapToast(position) {
    if (!this.snapToast) return;
    
    const messages = {
      left: '已吸附到左侧边缘',
      right: '已吸附到右侧边缘',
      top: '已吸附到顶部',
      bottom: '已吸附到底部',
      center: '已设为自由浮动',
      float: '已设为自由浮动',
      fullscreen: '已切换至全屏模式'
    };
    
    this.snapToast.querySelector('.snap-toast-message').textContent = messages[position] || '已完成操作';
    this.snapToast.classList.add('visible');
    
    // 自动隐藏
    setTimeout(() => {
      this.snapToast.classList.remove('visible');
    }, 3000);
  }
  
  // ========== 调整大小功能 ==========
  
  bindResizeEvents(panelEl, handle, direction) {
    let isResizing = false;
    let startPos = { x: 0, y: 0 };
    let startSize = { w: 0, h: 0 };
    
    const onStart = (e) => {
      if (panelEl.classList.contains('is-locked')) return;
      
      e.preventDefault();
      e.stopPropagation();
      
      isResizing = true;
      const rect = panelEl.getBoundingClientRect();
      startPos = { x: e.clientX, y: e.clientY };
      startSize = { w: rect.width, h: rect.height };
      
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onEnd);
    };
    
    const onMove = (e) => {
      if (!isResizing) return;
      
      const deltaX = e.clientX - startPos.x;
      const deltaY = e.clientY - startPos.y;
      const panelData = this.panels.get(panelEl.dataset.panelId);
      
      let newW = startSize.w;
      let newH = startSize.h;
      
      if (direction === 'horizontal' || direction === 'corner') {
        newW = Math.min(Math.max(startSize.w + deltaX, panelData?.minWidth || 200), panelData?.maxWidth || 800);
      }
      
      if (direction === 'vertical' || direction === 'corner') {
        newH = Math.min(Math.max(startSize.h + deltaY, panelData?.minHeight || 150), panelData?.maxHeight || 800);
      }
      
      panelEl.style.width = `${newW}px`;
      if (direction !== 'horizontal') {
        panelEl.style.height = `${newH}px`;
      }
    };
    
    const onEnd = () => {
      isResizing = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onEnd);
    };
    
    handle.addEventListener('mousedown', onStart);
  }
}

/**
 * 布局管理器 - 预设布局、保存/重置
 */
class LayoutManager {
  constructor(dragEngine) {
    this.dragEngine = dragEngine;
    this.toolbar = document.getElementById('layoutManagerToolbar');
    this.isVisible = false;
    this.currentPreset = 'default';
    this.isLocked = false;
    this.layoutHistory = [];
    this.maxHistory = 20;
    
    this.presets = {
      default: {
        name: '默认三栏布局',
        panels: {
          leftPanel: { position: 'left', width: 280 },
          rightPanel: { position: 'right', width: 300 },
          bookmarksPanel: { position: 'hidden' },
          recentFilesPanel: { position: 'hidden' }
        }
      },
      vertical: {
        name: '左右分栏布局',
        panels: {
          leftPanel: { position: 'left', width: 350 },
          rightPanel: { position: 'right', width: 350 },
          bookmarksPanel: { position: 'hidden' },
          recentFilesPanel: { position: 'hidden' }
        }
      },
      horizontal: {
        name: '上下分栏布局',
        panels: {
          leftPanel: { position: 'top', height: 250 },
          rightPanel: { position: 'bottom', height: 250 },
          bookmarksPanel: { position: 'hidden' },
          recentFilesPanel: { position: 'hidden' }
        }
      },
      focus: {
        name: '专注模式',
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
    // 关闭按钮
    document.getElementById('closeLayoutMgr')?.addEventListener('click', () => this.hide());
    
    // 预设布局按钮
    document.querySelectorAll('.lm-preset-btn').forEach(btn => {
      btn.addEventListener('click', () => this.applyPreset(btn.dataset.preset));
    });
    
    // 操作按钮
    document.getElementById('saveLayoutBtn')?.addEventListener('click', () => this.saveCurrentLayout());
    document.getElementById('resetLayoutBtn')?.addEventListener('click', () => this.resetToDefault());
    document.getElementById('lockLayoutBtn')?.addEventListener('click', () => this.toggleLock());
    
    // 加载保存的布局
    this.loadSavedLayout();
    
    console.log('[LayoutManager] ✅ 布局管理器初始化完成');
  }
  
  toggle() {
    this.isVisible ? this.hide() : this.show();
  }
  
  show() {
    this.toolbar?.classList.add('visible');
    this.isVisible = true;
    this.refreshPanelList();
    console.log('[LayoutManager] 👁️ 打开布局管理器');
  }
  
  hide() {
    this.toolbar?.classList.remove('visible');
    this.isVisible = false;
    console.log('[LayoutManager] 🙈 关闭布局管理器');
  }
  
  applyPreset(presetName) {
    const preset = this.presets[presetName];
    if (!preset) {
      console.error(`[LayoutManager] ❌ 未找到预设: ${presetName}`);
      return;
    }
    
    // 更新UI选中状态
    document.querySelectorAll('.lm-preset-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.preset === presetName);
    });
    
    // 应用预设到各面板
    Object.entries(preset.panels).forEach(([panelId, config]) => {
      const panelData = this.dragEngine.panels.get(panelId);
      if (panelData) {
        if (config.position === 'hidden') {
          panelData.element.style.display = 'none';
        } else {
          panelData.element.style.display = '';
          this.dragEngine.dockPanel(panelData, config.position);
          
          // 应用尺寸
          if (config.width) {
            panelData.defaultWidth = config.width;
            panelData.element.style.width = `${config.width}px`;
          }
          if (config.height) {
            panelData.defaultHeight = config.height;
            panelData.element.style.height = `${config.height}px`;
          }
        }
      }
    });
    
    this.currentPreset = presetName;
    this.saveToHistory(presetName);
    this.refreshPanelList();
    
    console.log(`[LayoutManager] 📐 应用预设: ${preset.name}`);
  }
  
  saveCurrentLayout() {
    const layout = {
      timestamp: Date.now(),
      preset: this.currentPreset,
      panels: {}
    };
    
    this.dragEngine.panels.forEach((data, id) => {
      layout.panels[id] = {
        position: data.currentPosition,
        width: data.element.offsetWidth,
        height: data.element.offsetHeight,
        visible: data.element.style.display !== 'none'
      };
    });
    
    // 保存到localStorage
    try {
      localStorage.setItem('agentStudio_layout', JSON.stringify(layout));
      this.showToast('布局已保存 ✓');
      console.log('[LayoutManager] 💾 布局已保存到本地存储');
    } catch (err) {
      console.error('[LayoutManager] ❌ 保存失败:', err);
      this.showToast('保存失败');
    }
  }
  
  loadSavedLayout() {
    try {
      const saved = localStorage.getItem('agentStudio_layout');
      if (saved) {
        const layout = JSON.parse(saved);
        console.log('[LayoutManager] 📂 加载保存的布局:', new Date(layout.timestamp).toLocaleString());
        
        // 应用保存的布局
        Object.entries(layout.panels).forEach(([id, config]) => {
          const panelData = this.dragEngine.panels.get(id);
          if (panelData && config.visible !== false) {
            setTimeout(() => {
              this.dragEngine.dockPanel(panelData, config.position);
              if (config.width) panelData.element.style.width = `${config.width}px`;
              if (config.height) panelData.element.style.height = `${config.height}px`;
            }, 100);
          }
        });
      }
    } catch (err) {
      console.warn('[LayoutManager] ⚠️ 无法加载保存的布局:', err);
    }
  }
  
  resetToDefault() {
    this.applyPreset('default');
    localStorage.removeItem('agentStudio_layout');
    this.showToast('已重置为默认布局 ↺');
    console.log('[LayoutManager] 🔄 重置为默认布局');
  }
  
  toggleLock() {
    this.isLocked = !this.isLocked;
    const btn = document.getElementById('lockLayoutBtn');
    
    btn.classList.toggle('locked', this.isLocked);
    btn.innerHTML = this.isLocked ? `
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
    
    // 锁定/解锁所有面板
    this.dragEngine.panels.forEach((data) => {
      data.element.classList.toggle('is-locked', this.isLocked);
    });
    
    console.log(`[LayoutManager] 🔒 面板${this.isLocked ? '已锁定' : '已解锁'}`);
  }
  
  refreshPanelList() {
    const list = document.getElementById('lmPanelList');
    if (!list) return;
    
    list.innerHTML = '';
    
    this.dragEngine.panels.forEach((data, id) => {
      const statusMap = {
        left: ['左停靠', 'docked-left'],
        right: ['右停靠', 'docked-right'],
        top: ['顶部停靠', 'docked-top'],
        bottom: ['底部停靠', 'docked-bottom'],
        float: ['浮动', 'floating'],
        fullscreen: ['全屏', 'floating'],
        hidden: ['隐藏', 'hidden']
      };
      
      const [statusText, statusClass] = statusMap[data.currentPosition] || ['未知', ''];
      const isVisible = data.element.style.display !== 'none';
      
      const item = document.createElement('div');
      item.className = 'lm-panel-item';
      item.dataset.panel = id;
      item.innerHTML = `
        <span class="panel-dot" style="background: ${this.getPanelColor(id)};"></span>
        <span class="panel-name">${data.name}</span>
        <span class="panel-status ${statusClass}">${statusText}</span>
      `;
      
      item.style.opacity = isVisible ? '1' : '0.5';
      
      item.addEventListener('click', () => this.focusPanel(id));
      
      list.appendChild(item);
    });
  }
  
  getPanelColor(panelId) {
    const colors = {
      leftPanel: '#8b5cf6',
      rightPanel: '#06b6d4',
      bookmarksPanel: '#f59e0b',
      recentFilesPanel: '#10b981'
    };
    return colors[panelId] || '#6366f1';
  }
  
  focusPanel(panelId) {
    const data = this.dragEngine.panels.get(panelId);
    if (data) {
      data.element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      data.element.style.boxShadow = '0 0 0 3px var(--primary-color)';
      setTimeout(() => {
        data.element.style.boxShadow = '';
      }, 1500);
    }
  }
  
  saveToHistory(presetName) {
    this.layoutHistory.unshift({
      preset: presetName,
      timestamp: Date.now()
    });
    
    if (this.layoutHistory.length > this.maxHistory) {
      this.layoutHistory.pop();
    }
  }
  
  showToast(message) {
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      bottom: 180px;
      right: 30px;
      background-color: #10b981;
      color: white;
      padding: 10px 20px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 500;
      z-index: 99999;
      animation: slideIn 0.3s ease;
    `;
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  }
}

// 全局实例
let panelDragEngine;
let layoutManager;

// 初始化拖拽与吸附系统
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    // 创建拖拽引擎
    panelDragEngine = new PanelDragEngine({
      snapThreshold: 25,
      gridSize: 8,
      enableGridSnap: true,
      enableEdgeSnap: true
    });
    
    // 注册所有可拖拽面板
    registerAllPanels();
    
    // 创建布局管理器
    layoutManager = new LayoutManager(panelDragEngine);
    
    // 添加全局快捷键
    initDragShortcuts();
    
    console.log('%c🎨 组件拖拽与吸附系统已加载', 
      'color: #f59e0b; font-size: 13px; font-weight: bold;');
    console.log('%c💡 使用方法:', 
      'color: #6b7280; font-size: 11px;');
    console.log('   • 悬停面板 → 点击 ⋮ 图标 → 拖动到目标位置');
    console.log('   • 靠近边缘时自动吸附（磁性效果）');
    console.log('   • 按 Ctrl+Shift+L 打开布局管理器');
    console.log('   • 可保存自定义布局并自动恢复');
  }, 800);
});

/**
 * 注册所有面板到拖拽引擎
 */
function registerAllPanels() {
  // 左侧任务栏
  const leftPanel = document.getElementById('leftPanel');
  if (leftPanel) {
    panelDragEngine.registerPanel('leftPanel', leftPanel, {
      name: '左侧任务栏',
      defaultPosition: 'left',
      defaultWidth: 280,
      minWidth: 220,
      maxWidth: 450,
      canFloat: true,
      canDock: true
    });
  }
  
  // 右侧工具栏
  const rightPanel = document.getElementById('rightPanel');
  if (rightPanel) {
    panelDragEngine.registerPanel('rightPanel', rightPanel, {
      name: '右侧工具栏',
      defaultPosition: 'right',
      defaultWidth: 300,
      minWidth: 240,
      maxWidth: 500,
      canFloat: true,
      canDock: true
    });
  }
  
  // 书签面板
  const bookmarksPanel = document.getElementById('bookmarksPanel');
  if (bookmarksPanel) {
    panelDragEngine.registerPanel('bookmarksPanel', bookmarksPanel, {
      name: '书签面板',
      defaultPosition: 'right',
      defaultWidth: 220,
      minWidth: 180,
      maxWidth: 350,
      canFloat: true,
      canDock: true
    });
  }
  
  // 最近访问面板
  const recentFilesPanel = document.getElementById('recentFilesPanel');
  if (recentFilesPanel) {
    panelDragEngine.registerPanel('recentFilesPanel', recentFilesPanel, {
      name: '最近访问',
      defaultPosition: 'right',
      defaultWidth: 240,
      minWidth: 200,
      maxWidth: 400,
      canFloat: true,
      canDock: true
    });
  }
  
  // 项目管理器（左侧面板内的子组件）
  const projectManager = document.getElementById('projectManager');
  if (projectManager) {
    projectManager.setAttribute('dockable', 'true');
    projectManager.dataset.panelId = 'projectManager';
  }
  
  console.log('[Panels] ✅ 所有面板注册完成');
}

/**
 * 初始化拖拽相关快捷键
 */
function initDragShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Ctrl+Shift+L: 切换布局管理器
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'L') {
      e.preventDefault();
      layoutManager?.toggle();
    }
    
    // Ctrl+Shift+D: 切换锁定状态
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'D') {
      e.preventDefault();
      layoutManager?.toggleLock();
    }
    
    // Escape: 关闭布局管理器
    if (e.key === 'Escape' && layoutManager?.isVisible) {
      layoutManager?.hide();
    }
  });
  
  // 双击面板头部快速切换浮动/停靠
  document.querySelectorAll('[dockable="true"] .panel-header, [dockable="true"] > header').forEach(header => {
    header.addEventListener('dblclick', (e) => {
      if (e.target.closest('.drag-handle')) return;
      
      const panel = e.currentTarget.closest('[dockable="true"]');
      const panelId = panel?.dataset.panelId;
      const panelData = panelDragEngine?.panels.get(panelId);
      
      if (panelData) {
        if (panelData.currentPosition === 'float') {
          panelDragEngine.restorePanelPosition(panelData);
        } else {
          panelDragEngine.floatPanel(panelData, window.innerWidth / 2, window.innerHeight / 3);
        }
      }
    });
  });
}

// 添加动画关键帧
const dragSystemStyles = document.createElement('style');
dragSystemStyles.textContent = `
  @keyframes slideIn {
    from { opacity: 0; transform: translateX(20px); }
    to { opacity: 1; transform: translateX(0); }
  }
`;
document.head.appendChild(dragSystemStyles);
