class TaskManager {
    constructor(eventBus, stateManager) {
        this.eventBus = eventBus;
        this.stateManager = stateManager;
        this.container = null;
        this.tasks = [];
        this.activeTaskId = null;
    }

    async init() {
        this.container = document.getElementById('taskList');
        if (!this.container) {
            console.error('[TaskManager] 找不到任务列表容器');
            return false;
        }

        this.bindEvents();
        this.loadInitialTasks();
        
        console.log('[TaskManager] ✅ 初始化完成');
        return true;
    }

    bindEvents() {
        const newTaskBtn = document.getElementById('newTaskBtn');
        if (newTaskBtn) {
            newTaskBtn.addEventListener('click', () => this.createNewTask());
        }

        if (this.container) {
            this.container.addEventListener('click', (e) => {
                const taskItem = e.target.closest('.task-item');
                if (taskItem) {
                    this.selectTask(taskItem.dataset.taskId);
                }
            });
        }

        this.eventBus.on('task:refresh', () => this.renderTasks());
        this.eventBus.on('task:complete', ({ taskId }) => this.completeTask(taskId));
        this.eventBus.on('task:delete', ({ taskId }) => this.deleteTask(taskId));
    }

    loadInitialTasks() {
        const savedTasks = localStorage.getItem('agentStudio_tasks');
        if (savedTasks) {
            try {
                this.tasks = JSON.parse(savedTasks);
                this.stateManager.set('tasks', this.tasks);
                this.renderTasks();
            } catch (error) {
                console.error('[TaskManager] 加载任务失败:', error);
                this.createDefaultTasks();
            }
        } else {
            this.createDefaultTasks();
        }
    }

    createDefaultTasks() {
        this.tasks = [
            {
                id: '1',
                title: '生成调研报告',
                status: 'running',
                progress: 65,
                time: '约 5 分钟',
                createdAt: Date.now()
            },
            {
                id: '2',
                title: '创建前端页面',
                status: 'completed',
                progress: 100,
                time: '刚刚',
                createdAt: Date.now() - 3600000
            },
            {
                id: '3',
                title: '数据分析任务',
                status: 'pending',
                progress: 0,
                time: '排队中',
                createdAt: Date.now()
            }
        ];

        this.saveTasks();
        this.renderTasks();
    }

    createNewTask() {
        const newTask = {
            id: Utils.generateId('task_'),
            title: `新任务 ${Date.now().toString().slice(-4)}`,
            status: 'pending',
            progress: 0,
            time: '刚刚创建',
            createdAt: Date.now()
        };

        this.tasks.unshift(newTask);
        this.saveTasks();
        this.renderTasks();
        this.selectTask(newTask.id);

        this.eventBus.emit('task:created', { task: newTask });
    }

    selectTask(taskId) {
        const task = this.tasks.find(t => t.id === taskId);
        if (!task) return;

        this.activeTaskId = taskId;

        document.querySelectorAll('.task-item').forEach(item => {
            item.classList.toggle('active', item.dataset.taskId === taskId);
        });

        this.stateManager.set('selectedTask', task);
        this.eventBus.emit('task:selected', { taskId, task });
    }

    completeTask(taskId) {
        const task = this.tasks.find(t => t.id === taskId);
        if (task) {
            task.status = 'completed';
            task.progress = 100;
            task.time = '刚刚完成';
            this.saveTasks();
            this.renderTasks();
        }
    }

    deleteTask(taskId) {
        this.tasks = this.tasks.filter(t => t.id !== taskId);
        this.saveTasks();
        this.renderTasks();

        if (this.activeTaskId === taskId) {
            this.activeTaskId = this.tasks.length > 0 ? this.tasks[0].id : null;
            if (this.activeTaskId) {
                this.selectTask(this.activeTaskId);
            }
        }
    }

    renderTasks() {
        if (!this.container) return;

        this.container.innerHTML = this.tasks.map(task => this.createTaskHTML(task)).join('');
        this.stateManager.set('tasks', [...this.tasks]);
    }

    createTaskHTML(task) {
        const statusClass = `status-${task.status}`;
        const iconClass = `task-${task.status}`;
        const isActive = task.id === this.activeTaskId;

        let progressHTML = '';
        if (task.status === 'completed') {
            progressHTML = `
                <svg width="32" height="32" viewBox="0 0 36 36">
                    <circle cx="18" cy="18" r="15" fill="none" stroke="#e5e7eb" stroke-width="3"/>
                    <circle cx="18" cy="18" r="15" fill="none" stroke="#10b981" stroke-width="3" 
                        stroke-dasharray="100" stroke-dashoffset="0" transform="rotate(-90 18 18)"/>
                </svg>
                <span>✓</span>
            `;
        } else if (task.status === 'running' && task.progress > 0) {
            progressHTML = `
                <svg width="32" height="32" viewBox="0 0 36 36">
                    <circle cx="18" cy="18" r="15" fill="none" stroke="#e5e7eb" stroke-width="3"/>
                    <circle cx="18" cy="18" r="15" fill="none" stroke="#8b5cf6" stroke-width="3" 
                        stroke-dasharray="100" stroke-dashoffset="${100 - task.progress}" transform="rotate(-90 18 18)"/>
                </svg>
                <span>${task.progress}%</span>
            `;
        } else {
            progressHTML = `
                <svg width="32" height="32" viewBox="0 0 36 36">
                    <circle cx="18" cy="18" r="15" fill="none" stroke="#e5e7eb" stroke-width="3"/>
                </svg>
                <span>-</span>
            `;
        }

        const icons = {
            running: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
            completed: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`,
            pending: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
        };

        return `
            <div class="task-item ${isActive ? 'active' : ''}" data-task-id="${task.id}">
                <div class="task-icon ${iconClass}">
                    ${icons[task.status]}
                </div>
                <div class="task-info">
                    <div class="task-title">${Utils.escapeHtml(task.title)}</div>
                    <div class="task-meta">
                        <span class="task-status ${statusClass}">${this.getStatusText(task.status)}</span>
                        <span class="task-time">${task.time}</span>
                    </div>
                </div>
                <div class="task-progress-ring">
                    ${progressHTML}
                </div>
            </div>
        `;
    }

    getStatusText(status) {
        const texts = {
            running: '运行中',
            completed: '已完成',
            pending: '等待中'
        };
        return texts[status] || status;
    }

    saveTasks() {
        try {
            localStorage.setItem('agentStudio_tasks', JSON.stringify(this.tasks));
        } catch (error) {
            console.error('[TaskManager] 保存任务失败:', error);
        }
    }

    getActiveTask() {
        return this.tasks.find(t => t.id === this.activeTaskId);
    }

    getAllTasks() {
        return [...this.tasks];
    }

    updateTaskProgress(taskId, progress) {
        const task = this.tasks.find(t => t.id === taskId);
        if (task) {
            task.progress = Utils.clamp(progress, 0, 100);
            if (task.progress >= 100) {
                task.status = 'completed';
            }
            this.saveTasks();
            this.renderTasks();
        }
    }

    destroy() {
        this.container = null;
        this.tasks = [];
        this.activeTaskId = null;
        console.log('[TaskManager] 🔴 已销毁');
    }
}

if (typeof window !== 'undefined') {
    window.TaskManager = TaskManager;
}
