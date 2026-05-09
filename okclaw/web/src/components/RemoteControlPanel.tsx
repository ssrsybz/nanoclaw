import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';

interface RemoteControlConfig {
  enabled: boolean;
  version: string;
  cloudRelayUrl: string;
  terminalServiceUrl: string;
  localCloudRelayUrl: string;
  localTerminalServiceUrl: string;
  apps: {
    ios: { name: string; url: string; appId: string };
    android: { name: string; url: string; appId: string };
  };
  buildInstructions?: {
    flutterProject: string;
    commands: {
      android: string;
      ios: string;
    };
  };
  steps: { step: number; title: string; description: string }[];
}

interface ServiceStatus {
  cloudRelay: 'online' | 'offline';
  terminalService: 'online' | 'offline';
  overall: 'online' | 'partial' | 'offline';
}

export default function RemoteControlPanel({ onClose }: { onClose: () => void }) {
  const [config, setConfig] = useState<RemoteControlConfig | null>(null);
  const [status, setStatus] = useState<ServiceStatus | null>(null);
  const [activeStep, setActiveStep] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 获取配置
    fetch('/api/remote-control/config')
      .then(r => r.json())
      .then(setConfig)
      .catch(console.error);

    // 获取状态
    fetch('/api/remote-control/status')
      .then(r => r.json())
      .then(setStatus)
      .catch(console.error)
      .finally(() => setLoading(false));

    // 定时刷新状态
    const interval = setInterval(() => {
      fetch('/api/remote-control/status')
        .then(r => r.json())
        .then(setStatus)
        .catch(console.error);
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-[#1e1e2e] rounded-lg p-8 text-white">
          加载中...
        </div>
      </div>
    );
  }

  const qrData = config ? JSON.stringify({
    type: 'claude-remote-control',
    version: config.version,
    cloudRelayUrl: config.cloudRelayUrl,
    terminalServiceUrl: config.terminalServiceUrl
  }) : '';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[#1e1e2e] rounded-lg w-full max-w-2xl max-h-[90vh] overflow-auto text-white">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-xl font-bold">远程控制</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl"
          >
            ×
          </button>
        </div>

        {/* Status */}
        <div className="p-4 border-b border-gray-700">
          <div className="flex items-center gap-4">
            <span className="text-gray-400">服务状态：</span>
            <span className={`flex items-center gap-1 ${
              status?.overall === 'online' ? 'text-green-400' :
              status?.overall === 'partial' ? 'text-yellow-400' : 'text-red-400'
            }`}>
              <span className={`w-2 h-2 rounded-full ${
                status?.overall === 'online' ? 'bg-green-400' :
                status?.overall === 'partial' ? 'bg-yellow-400' : 'bg-red-400'
              }`}></span>
              {status?.overall === 'online' ? '在线' :
               status?.overall === 'partial' ? '部分在线' : '离线'}
            </span>
            <span className="text-sm text-gray-500">
              (云服务: {status?.cloudRelay || '离线'}, 终端: {status?.terminalService || '离线'})
            </span>
          </div>
        </div>

        {/* Steps */}
        <div className="p-4">
          <div className="flex gap-2 mb-6">
            {[1, 2, 3].map(step => (
              <button
                key={step}
                onClick={() => setActiveStep(step)}
                className={`flex-1 py-2 px-4 rounded text-sm font-medium transition-colors ${
                  activeStep === step
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {step}. {config?.steps[step - 1]?.title || `步骤 ${step}`}
              </button>
            ))}
          </div>

          {/* Step Content */}
          <div className="bg-[#2a2a3e] rounded-lg p-6">
            {activeStep === 1 && (
              <div className="text-center">
                <h3 className="text-lg font-bold mb-4">下载 OKClaw Remote App</h3>
                <p className="text-gray-400 mb-6">
                  在手机上安装 OKClaw Remote 控制端
                </p>

                {/* Build Instructions */}
                <div className="bg-gray-800 rounded-lg p-4 mb-6 text-left">
                  <h4 className="font-bold text-sm text-blue-400 mb-2">构建 App</h4>
                  <div className="text-sm text-gray-300 space-y-2">
                    <div>
                      <span className="text-gray-500">项目目录：</span>
                      <code className="bg-gray-700 px-2 py-1 rounded text-xs">
                        {config?.buildInstructions?.flutterProject || './flutter_doubao_副本/flutter_doubao_app'}
                      </code>
                    </div>
                    <div className="mt-3 space-y-1">
                      <div className="text-gray-500">Android APK：</div>
                      <code className="block bg-gray-900 p-2 rounded text-xs text-green-400">
                        {config?.buildInstructions?.commands.android || 'flutter build apk --release'}
                      </code>
                    </div>
                    <div className="mt-2 space-y-1">
                      <div className="text-gray-500">iOS：</div>
                      <code className="block bg-gray-900 p-2 rounded text-xs text-green-400">
                        {config?.buildInstructions?.commands.ios || 'flutter build ios --release'}
                      </code>
                    </div>
                  </div>
                </div>

                <div className="flex justify-center gap-4">
                  <a
                    href={config?.apps.android.url}
                    className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded"
                  >
                    <span className="text-2xl">🤖</span>
                    <div className="text-left">
                      <div className="text-xs text-gray-400">Android</div>
                      <div className="font-medium">下载 APK</div>
                    </div>
                  </a>
                  <a
                    href={config?.apps.ios.url}
                    className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded"
                  >
                    <span className="text-2xl">🍎</span>
                    <div className="text-left">
                      <div className="text-xs text-gray-400">iOS</div>
                      <div className="font-medium">构建指南</div>
                    </div>
                  </a>
                </div>
                <button
                  onClick={() => setActiveStep(2)}
                  className="mt-6 bg-blue-600 hover:bg-blue-500 px-6 py-2 rounded"
                >
                  下一步
                </button>
              </div>
            )}

            {activeStep === 2 && (
              <div className="text-center">
                <h3 className="text-lg font-bold mb-4">扫码连接</h3>
                <p className="text-gray-400 mb-4">
                  使用 OKClaw Remote App 扫描下方二维码连接电脑
                </p>
                {status?.overall !== 'online' && (
                  <div className="bg-yellow-900/50 border border-yellow-600 rounded p-3 mb-4 text-yellow-400 text-sm">
                    ⚠️ 服务未完全启动，请先运行启动脚本
                  </div>
                )}
                <div className="inline-block bg-white p-4 rounded-lg">
                  <QRCodeSVG value={qrData} size={200} />
                </div>
                <div className="mt-4 text-sm text-gray-500">
                  <p>云服务: {config?.cloudRelayUrl}</p>
                  <p>终端服务: {config?.terminalServiceUrl}</p>
                </div>
                <button
                  onClick={() => setActiveStep(3)}
                  className="mt-6 bg-blue-600 hover:bg-blue-500 px-6 py-2 rounded"
                >
                  下一步
                </button>
              </div>
            )}

            {activeStep === 3 && (
              <div className="text-center">
                <h3 className="text-lg font-bold mb-4">测试验证</h3>
                <p className="text-gray-400 mb-6">
                  验证远程控制功能是否正常工作
                </p>
                <div className="space-y-3 text-left">
                  <div className="flex items-center justify-between bg-gray-700 rounded p-3">
                    <span>云服务连接</span>
                    <span className={status?.cloudRelay === 'online' ? 'text-green-400' : 'text-red-400'}>
                      {status?.cloudRelay === 'online' ? '✅ 在线' : '❌ 离线'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between bg-gray-700 rounded p-3">
                    <span>终端服务连接</span>
                    <span className={status?.terminalService === 'online' ? 'text-green-400' : 'text-red-400'}>
                      {status?.terminalService === 'online' ? '✅ 在线' : '❌ 离线'}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => {
                    fetch('/api/remote-control/status').then(r => r.json()).then(setStatus);
                  }}
                  className="mt-6 bg-gray-700 hover:bg-gray-600 px-6 py-2 rounded"
                >
                  🔄 刷新状态
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
