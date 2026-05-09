import { useState, useEffect } from 'react';
import { useStore } from '../store';

export default function LLMConfigPanel() {
  const { llmConfig, fetchLLMConfig, updateLLMConfig } = useStore();
  const [isOpen, setIsOpen] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (isOpen) {
      fetchLLMConfig();
    }
  }, [isOpen, fetchLLMConfig]);

  useEffect(() => {
    if (llmConfig?.config) {
      setApiKey(llmConfig.config.apiKey);
      setBaseUrl(llmConfig.config.baseUrl);
      setModel(llmConfig.config.model);
    }
  }, [llmConfig]);

  const handleSave = async () => {
    setSaving(true);
    setMessage('');

    const config: { apiKey?: string; baseUrl?: string; model?: string } = {};
    if (apiKey && !apiKey.includes('****')) {
      config.apiKey = apiKey;
    }
    if (baseUrl) {
      config.baseUrl = baseUrl;
    }
    if (model) {
      config.model = model;
    }

    const success = await updateLLMConfig(config);
    setSaving(false);

    if (success) {
      setMessage('配置已保存');
      setTimeout(() => setMessage(''), 2000);
    } else {
      setMessage('保存失败');
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setMessage('');
  };

  return (
    <>
      {/* Settings button */}
      <button
        onClick={() => setIsOpen(true)}
        className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-white/10 text-white/50 hover:text-white text-sm transition-colors"
        title="LLM 配置"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={handleClose}>
          <div
            className="w-[440px] bg-[#1a1a2e] border border-white/10 rounded-xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <h2 className="text-white font-semibold text-sm">LLM 配置</h2>
              <button onClick={handleClose} className="text-white/40 hover:text-white text-lg">&times;</button>
            </div>

            {/* Content */}
            <div className="p-5 space-y-4">
              {/* Source indicator */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-white/50">配置来源:</span>
                <span className={`text-xs px-2 py-0.5 rounded ${
                  llmConfig?.source === 'project'
                    ? 'bg-indigo-600/20 text-indigo-400'
                    : 'bg-white/10 text-white/70'
                }`}>
                  {llmConfig?.source === 'project' ? '项目配置' : '全局配置'}
                </span>
              </div>

              {/* API Key */}
              <div>
                <label className="block text-xs text-white/50 mb-1.5">API Key</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="输入 API Key（已保存的会显示遮蔽值）"
                  className="w-full px-3 py-2.5 bg-[#0f0f1a] border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500 placeholder:text-white/20"
                />
              </div>

              {/* Base URL */}
              <div>
                <label className="block text-xs text-white/50 mb-1.5">Base URL</label>
                <input
                  type="text"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="例如: https://api.anthropic.com"
                  className="w-full px-3 py-2.5 bg-[#0f0f1a] border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500 placeholder:text-white/20"
                />
              </div>

              {/* Model */}
              <div>
                <label className="block text-xs text-white/50 mb-1.5">Model</label>
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="例如: claude-sonnet-4-6"
                  className="w-full px-3 py-2.5 bg-[#0f0f1a] border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500 placeholder:text-white/20"
                />
              </div>

              {/* Help text */}
              <div className="text-xs text-white/30 space-y-1">
                <p>• 项目配置会覆盖全局配置（~/.claude/settings.json）</p>
                <p>• 保存后需要重启服务才能生效</p>
              </div>

              {/* Message */}
              {message && (
                <div className="text-xs text-center text-green-400">{message}</div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-white/10">
              <button
                onClick={handleClose}
                className="px-4 py-2 text-xs text-white/50 hover:text-white transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed text-white text-xs font-medium transition-colors"
              >
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
