class ProjectManager {
    constructor(eventBus, stateManager) {
        this.eventBus = eventBus;
        this.stateManager = stateManager;
        this.selector = null;
        this.dropdown = null;
        this.searchInput = null;
        this.projectList = null;
        this.currentProject = null;
        this.projects = [];
        this.isOpen = false;
    }

    async init() {
        this.selector = document.getElementById('projectSelector');
        this.dropdown = document.getElementById('projectDropdown');
        this.searchInput = document.getElementById('projectSearchInput');
        this.projectList = document.getElementById('projectList');

        if (!this.selector || !this.dropdown) {
            console.error('[ProjectManager] 找不到项目选择器元素');
            return false;
        }

        this.bindEvents();
        this.loadProjects();
        
        console.log('[ProjectManager] ✅ 初始化完成');
        return true;
    }

    bindEvents() {
        const currentProjectDiv = this.selector.querySelector('.pm-current-project');
        if (currentProjectDiv) {
            currentProjectDiv.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleDropdown();
            });
        }

        if (this.searchInput) {
            this.searchInput.addEventListener('input', Utils.debounce((e) => {
                this.filterProjects(e.target.value);
            }, 200));

            this.searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    this.closeDropdown();
                }
            });
        }

        if (this.dropdown) {
            this.dropdown.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        }

        document.addEventListener('click', (e) => {
            if (this.isOpen && !this.selector.contains(e.target)) {
                this.closeDropdown();
            }
        });

        const openFolderBtn = document.getElementById('openFolderBtn');
        if (openFolderBtn) {
            openFolderBtn.addEventListener('click', () => this.openFolderPicker());
        }

        const addWorkspaceBtn = document.getElementById('addWorkspaceBtn');
        if (addWorkspaceBtn) {
            addWorkspaceBtn.addEventListener('click', () => this.addWorkspace());
        }

        this.eventBus.on('project:switch', ({ project }) => this.switchProject(project));
        this.eventBus.on('project:add', ({ project }) => this.addProject(project));
        this.eventBus.on('project:remove', ({ projectId }) => this.removeProject(projectId));
        this.eventBus.on('file:refresh', () => this.refreshFileTree());
    }

    toggleDropdown() {
        if (this.isOpen) {
            this.closeDropdown();
        } else {
            this.openDropdown();
        }
    }

    openDropdown() {
        this.dropdown.classList.add('show');
        this.selector.classList.add('open');
        this.isOpen = true;

        if (this.searchInput) {
            setTimeout(() => this.searchInput.focus(), 100);
        }

        this.eventBus.emit('dropdown:opened', { type: 'project' });
    }

    closeDropdown() {
        this.dropdown.classList.remove('show');
        this.selector.classList.remove('open');
        this.isOpen = false;

        if (this.searchInput) {
            this.searchInput.value = '';
            this.filterProjects('');
        }

        this.eventBus.emit('dropdown:closed', { type: 'project' });
    }

    loadProjects() {
        const savedProjects = localStorage.getItem('agentStudio_projects');
        if (savedProjects) {
            try {
                this.projects = JSON.parse(savedProjects);
            } catch (error) {
                console.error('[ProjectManager] 加载项目列表失败:', error);
                this.projects = this.getDefaultProjects();
            }
        } else {
            this.projects = this.getDefaultProjects();
        }

        this.currentProject = this.projects.find(p => p.isActive) || this.projects[0];
        this.updateCurrentProjectUI();
        this.renderProjectList();
    }

    getDefaultProjects() {
        return [
            {
                id: 'proj_1',
                name: 'okclaw总项目',
                path: '/Users/frank/Downloads/3月工作/编程/okclaw总项目',
                isActive: true
            },
            {
                id: 'proj_2',
                name: 'web-app',
                path: '/Users/frank/Projects/web-app',
                isActive: false
            },
            {
                id: 'proj_3',
                name: 'api-server',
                path: '/Users/frank/Projects/api-server',
                isActive: false
            }
        ];
    }

    renderProjectList() {
        if (!this.projectList) return;

        this.projectList.innerHTML = this.projects.map(project => `
            <div class="pm-item ${project.id === this.currentProject?.id ? 'active' : ''}" 
                 data-path="${Utils.escapeHtml(project.path)}" 
                 data-id="${project.id}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
                <span>${Utils.escapeHtml(project.name)}</span>
                <span class="pm-item-path">${this.formatPath(project.path)}</span>
            </div>
        `).join('');

        this.bindProjectItemEvents();
    }

    bindProjectItemEvents() {
        if (!this.projectList) return;

        const items = this.projectList.querySelectorAll('.pm-item');
        items.forEach(item => {
            item.addEventListener('click', () => {
                const projectId = item.dataset.id;
                const project = this.projects.find(p => p.id === projectId);
                if (project) {
                    this.selectProject(project);
                }
            });
        });
    }

    selectProject(project) {
        this.currentProject = project;
        
        this.projects.forEach(p => {
            p.isActive = p.id === project.id;
        });

        this.updateCurrentProjectUI();
        this.renderProjectList();
        this.closeDropdown();
        this.saveProjects();

        this.stateManager.set('currentProject', { ...project });
        this.eventBus.emit('project:selected', { project });
        this.eventBus.emit('file:refresh', { projectPath: project.path });
    }

    switchProject(project) {
        const existingProject = this.projects.find(p => p.id === project?.id || p.path === project?.path);
        if (existingProject) {
            this.selectProject(existingProject);
        } else if (project) {
            this.addProject(project);
            this.selectProject(project);
        }
    }

    addProject(project) {
        const exists = this.projects.some(p => p.path === project.path);
        if (exists) {
            console.warn('[ProjectManager] 项目已存在:', project.name);
            return;
        }

        const newProject = {
            id: project.id || Utils.generateId('proj_'),
            name: project.name,
            path: project.path,
            isActive: false,
            addedAt: Date.now()
        };

        this.projects.push(newProject);
        this.saveProjects();
        this.renderProjectList();

        this.eventBus.emit('project:added', { project: newProject });
    }

    removeProject(projectId) {
        const index = this.projects.findIndex(p => p.id === projectId);
        if (index === -1) return;

        const removed = this.projects.splice(index, 1)[0];
        
        if (this.currentProject?.id === projectId) {
            this.currentProject = this.projects[0] || null;
            if (this.currentProject) {
                this.updateCurrentProjectUI();
            }
        }

        this.saveProjects();
        this.renderProjectList();

        this.eventBus.emit('project:removed', { project: removed });
    }

    filterProjects(query) {
        if (!this.projectList) return;

        const items = this.projectList.querySelectorAll('.pm-item');
        const lowerQuery = query.toLowerCase();

        items.forEach(item => {
            const name = item.querySelector('span').textContent.toLowerCase();
            const path = item.querySelector('.pm-item-path').textContent.toLowerCase();
            const matches = name.includes(lowerQuery) || path.includes(lowerQuery);
            item.style.display = matches ? 'flex' : 'none';
        });
    }

    openFolderPicker() {
        const input = document.createElement('input');
        input.type = 'file';
        input.webkitdirectory = true;
        input.directory = true;
        input.multiple = false;

        input.addEventListener('change', (e) => {
            const files = e.target.files;
            if (files && files.length > 0) {
                const firstFile = files[0];
                const path = firstFile.webkitRelativePath.split('/')[0];
                const fullPath = `${firstFile.path.replace(firstFile.name, '')}${path}`;
                
                this.addProject({
                    name: path,
                    path: fullPath
                });
            }
        });

        input.click();
    }

    addWorkspace() {
        this.eventBus.emit('modal:show', {
            type: 'workspace',
            title: '添加工作区'
        });
    }

    updateCurrentProjectUI() {
        const projectNameEl = document.getElementById('currentProjectName');
        if (projectNameEl && this.currentProject) {
            projectNameEl.textContent = this.currentProject.name;
        }
    }

    refreshFileTree() {
        this.eventBus.emit('file:tree:refresh', { 
            projectPath: this.currentProject?.path 
        });
    }

    formatPath(path) {
        if (!path) return '';
        const homeDir = '/Users/' + (process.env.USER || 'frank');
        return path.replace(homeDir, '~');
    }

    saveProjects() {
        try {
            localStorage.setItem('agentStudio_projects', JSON.stringify(this.projects));
        } catch (error) {
            console.error('[ProjectManager] 保存项目列表失败:', error);
        }
    }

    getCurrentProject() {
        return this.currentProject ? { ...this.currentProject } : null;
    }

    getProjects() {
        return [...this.projects];
    }

    destroy() {
        this.closeDropdown();
        this.selector = null;
        this.dropdown = null;
        this.searchInput = null;
        this.projectList = null;
        this.currentProject = null;
        this.projects = [];
        this.isOpen = false;
        
        console.log('[ProjectManager] 🔴 已销毁');
    }
}

if (typeof window !== 'undefined') {
    window.ProjectManager = ProjectManager;
}
