class ChatManager {
    constructor(eventBus, stateManager) {
        this.eventBus = eventBus;
        this.stateManager = stateManager;
        this.messagesContainer = null;
        this.inputElement = null;
        this.sendButton = null;
        this.messages = [];
        this.isProcessing = false;
        this.thinkingTimeout = null;
    }

    async init() {
        this.messagesContainer = document.getElementById('chatMessages');
        this.inputElement = document.getElementById('messageInput');
        this.sendButton = document.getElementById('sendBtn');

        if (!this.messagesContainer || !this.inputElement) {
            console.error('[ChatManager] 找不到聊天界面元素');
            return false;
        }

        this.bindEvents();
        this.loadHistory();
        
        console.log('[ChatManager] ✅ 初始化完成');
        return true;
    }

    bindEvents() {
        if (this.sendButton) {
            this.sendButton.addEventListener('click', () => this.sendMessage());
        }

        if (this.inputElement) {
            this.inputElement.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage();
                }
            });

            this.inputElement.addEventListener('input', Utils.debounce(() => {
                this.autoResizeTextarea();
            }, 150));
        }

        this.eventBus.on('task:selected', ({ task }) => {
            this.showTaskContext(task);
        });

        this.eventBus.on('message:send', ({ content }) => {
            this.addMessage('user', content);
        });
    }

    sendMessage() {
        const message = this.inputElement.value.trim();
        if (!message || this.isProcessing) return;

        this.addMessage('user', message);
        this.inputElement.value = '';
        this.autoResizeTextarea();
        this.saveToHistory();

        this.eventBus.emit('message:sent', { 
            content: message, 
            timestamp: Date.now() 
        });

        this.simulateAIResponse(message);
    }

    addMessage(type, content) {
        const message = {
            id: Utils.generateId('msg_'),
            type,
            content: typeof content === 'string' ? content : content,
            timestamp: Date.now(),
            time: Utils.formatDate(new Date(), 'HH:mm')
        };

        this.messages.push(message);
        this.stateManager.set('chatMessages', [...this.messages]);
        this.renderMessage(message);

        this.scrollToBottom();
    }

    renderMessage(message) {
        if (!this.messagesContainer) return;

        const messageDiv = document.createElement('div');
        messageDiv.className = `message message-${message.type}`;
        messageDiv.dataset.messageId = message.id;

        if (message.type === 'user') {
            messageDiv.innerHTML = `
                <div class="message-avatar">👤</div>
                <div class="message-content">
                    <div class="message-text">${typeof message.content === 'string' ? Utils.escapeHtml(message.content) : message.content}</div>
                    <div class="message-time">${message.time}</div>
                </div>
            `;
        } else if (message.type === 'ai') {
            messageDiv.innerHTML = `
                <div class="message-avatar">🤖</div>
                <div class="message-content">
                    <div class="message-text">${message.content}</div>
                    <div class="message-time">${message.time}</div>
                    <div class="message-actions">
                        <button class="msg-action-btn" data-action="copy" title="复制">📋</button>
                        <button class="msg-action-btn" data-action="regenerate" title="重新生成">🔄</button>
                        <button class="msg-action-btn" data-action="like" title="有用">👍</button>
                        <button class="msg-action-btn" data-action="dislike" title="无用">👎</button>
                    </div>
                </div>
            `;
        }

        this.messagesContainer.appendChild(messageDiv);
        this.bindMessageActions(messageDiv);
    }

    showThinking() {
        if (!this.messagesContainer) return;

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

        this.messagesContainer.appendChild(thinkingDiv);
        this.scrollToBottom();
    }

    hideThinking() {
        const thinking = document.getElementById('thinking-message');
        if (thinking) {
            thinking.remove();
        }
    }

    simulateAIResponse(userMessage) {
        this.isProcessing = true;
        this.showThinking();
        this.eventBus.emit('ai:thinking', { userMessage });

        const delay = Utils.getRandomInt(1500, 3000);
        
        this.thinkingTimeout = setTimeout(() => {
            this.hideThinking();
            
            const responseContent = this.generateResponse(userMessage);
            this.addMessage('ai', responseContent);
            
            this.isProcessing = false;
            this.saveToHistory();
            
            this.eventBus.emit('ai:responded', { 
                userMessage, 
                response: responseContent,
                timestamp: Date.now()
            });
        }, delay);
    }

    generateResponse(userMessage) {
        return `
            <p>收到你的任务："${Utils.escapeHtml(userMessage)}"</p>
            <p>我正在分析需求并制定执行计划...</p>
            <p>预计需要以下步骤：</p>
            <ol>
                <li><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"/></svg> 理解任务需求</li>
                <li><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"/></svg> 搜索相关信息</li>
                <li><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"/></svg> 整理分析结果</li>
                <li><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"/></svg> 生成最终产出</li>
            </ol>
        `;
    }

    showTaskContext(task) {
        if (!task) return;
        
        const contextMessage = {
            type: 'system',
            content: `已切换到任务: ${task.title}`,
            timestamp: Date.now()
        };
        
        this.eventBus.emit('chat:context', { task });
    }

    scrollToBottom() {
        if (this.messagesContainer) {
            requestAnimationFrame(() => {
                this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
            });
        }
    }

    autoResizeTextarea() {
        if (this.inputElement) {
            this.inputElement.style.height = 'auto';
            this.inputElement.style.height = Math.min(this.inputElement.scrollHeight, 200) + 'px';
        }
    }

    bindMessageActions(messageDiv) {
        const actionButtons = messageDiv.querySelectorAll('.msg-action-btn');
        actionButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = btn.dataset.action;
                const messageId = messageDiv.dataset.messageId;
                this.handleMessageAction(action, messageId);
            });
        });
    }

    handleMessageAction(action, messageId) {
        const message = this.messages.find(m => m.id === messageId);
        if (!message) return;

        switch (action) {
            case 'copy':
                Utils.copyToClipboard(typeof message.content === 'string' ? message.content : message.content.textContent)
                    .then(() => this.showToast('已复制到剪贴板'))
                    .catch(err => console.error('复制失败:', err));
                break;
                
            case 'regenerate':
                this.regenerateResponse(messageId);
                break;
                
            case 'like':
            case 'dislike':
                this.recordFeedback(action, messageId);
                break;
        }

        this.eventBus.emit('message:action', { action, messageId });
    }

    regenerateResponse(messageId) {
        const index = this.messages.findIndex(m => m.id === messageId);
        if (index <= 0) return;

        const previousUserMessage = this.messages[index - 1];
        if (previousUserMessage && previousUserMessage.type === 'user') {
            this.removeMessage(messageId);
            this.simulateAIResponse(previousUserMessage.content);
        }
    }

    removeMessage(messageId) {
        this.messages = this.messages.filter(m => m.id !== messageId);
        const messageEl = this.messagesContainer.querySelector(`[data-message-id="${messageId}"]`);
        if (messageEl) {
            messageEl.remove();
        }
        this.stateManager.set('chatMessages', [...this.messages]);
    }

    recordFeedback(action, messageId) {
        console.log(`[ChatManager] 用户反馈 (${action}):`, messageId);
    }

    showToast(message) {
        this.eventBus.emit('toast:show', { message, type: 'info', duration: 2000 });
    }

    clearMessages() {
        this.messages = [];
        if (this.messagesContainer) {
            this.messagesContainer.innerHTML = '';
        }
        this.stateManager.set('chatMessages', []);
        this.saveToHistory();
    }

    saveToHistory() {
        try {
            const historyData = {
                messages: this.messages.slice(-50),
                lastUpdated: Date.now()
            };
            localStorage.setItem('agentStudio_chat_history', JSON.stringify(historyData));
        } catch (error) {
            console.error('[ChatManager] 保存历史记录失败:', error);
        }
    }

    loadHistory() {
        try {
            const historyData = localStorage.getItem('agentStudio_chat_history');
            if (historyData) {
                const parsed = JSON.parse(historyData);
                if (parsed.messages && Array.isArray(parsed.messages)) {
                    this.messages = parsed.messages;
                    this.messages.forEach(msg => this.renderMessage(msg));
                    this.stateManager.set('chatMessages', [...this.messages]);
                }
            }
        } catch (error) {
            console.error('[ChatManager] 加载历史记录失败:', error);
        }
    }

    getMessages() {
        return [...this.messages];
    }

    getLastUserMessage() {
        for (let i = this.messages.length - 1; i >= 0; i--) {
            if (this.messages[i].type === 'user') {
                return this.messages[i];
            }
        }
        return null;
    }

    destroy() {
        if (this.thinkingTimeout) {
            clearTimeout(this.thinkingTimeout);
        }
        
        this.messagesContainer = null;
        this.inputElement = null;
        this.sendButton = null;
        this.messages = [];
        this.isProcessing = false;
        
        console.log('[ChatManager] 🔴 已销毁');
    }
}

if (typeof window !== 'undefined') {
    window.ChatManager = ChatManager;
}
