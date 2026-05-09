/**
 * 权限弹窗组件
 */

import React, { useState } from 'react';
import { PermissionRequest } from '../../shared/protocols/permission';
import { TOOL_PERMISSIONS } from '../../shared/protocols/permission';

interface PermissionDialogProps {
  request: PermissionRequest;
  onAllow: (remember: boolean) => void;
  onDeny: (remember: boolean) => void;
}

export const PermissionDialog: React.FC<PermissionDialogProps> = ({
  request,
  onAllow,
  onDeny
}) => {
  const [remember, setRemember] = useState(false);

  const toolConfig = TOOL_PERMISSIONS[request.tool_name] || {
    risk_level: 'medium',
    description: request.tool_name,
    requires_confirmation: true
  };

  return (
    <div className="permission-dialog-overlay">
      <div className="permission-dialog">
        <div className="permission-header">
          <h3>Permission Request</h3>
          <span className={`risk-badge risk-${toolConfig.risk_level}`}>
            {toolConfig.risk_level}
          </span>
        </div>

        <div className="permission-content">
          <div className="tool-info">
            <strong>Tool:</strong> {request.tool_name}
          </div>

          <div className="tool-description">
            {toolConfig.description}
          </div>

          {request.title && (
            <div className="request-title">{request.title}</div>
          )}

          {request.description && (
            <div className="request-description">{request.description}</div>
          )}

          {request.context && (
            <div className="request-context">
              {request.context.file_path && (
                <div><strong>File:</strong> {request.context.file_path}</div>
              )}
              {request.context.command && (
                <div><strong>Command:</strong> {request.context.command}</div>
              )}
              {request.context.url && (
                <div><strong>URL:</strong> {request.context.url}</div>
              )}
            </div>
          )}

          <div className="remember-choice">
            <label>
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              Remember this choice
            </label>
          </div>
        </div>

        <div className="permission-actions">
          <button className="btn-deny" onClick={() => onDeny(remember)}>
            Deny
          </button>
          <button className="btn-allow" onClick={() => onAllow(remember)}>
            Allow
          </button>
        </div>
      </div>

      <style>{`
        .permission-dialog-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .permission-dialog {
          background: white;
          border-radius: 12px;
          padding: 24px;
          max-width: 400px;
          width: 90%;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
        }

        .permission-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .permission-header h3 {
          margin: 0;
        }

        .risk-badge {
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 0.8em;
          font-weight: bold;
          text-transform: uppercase;
        }

        .risk-low { background: #c8e6c9; color: #2e7d32; }
        .risk-medium { background: #fff9c4; color: #f57f17; }
        .risk-high { background: #ffcdd2; color: #c62828; }

        .permission-content {
          margin-bottom: 20px;
        }

        .tool-info {
          margin-bottom: 8px;
        }

        .tool-description {
          color: #666;
          font-size: 0.9em;
          margin-bottom: 12px;
        }

        .request-title {
          font-weight: bold;
          margin-bottom: 8px;
        }

        .request-description {
          color: #666;
          margin-bottom: 12px;
        }

        .request-context {
          background: #f5f5f5;
          padding: 12px;
          border-radius: 6px;
          font-size: 0.9em;
          margin-bottom: 12px;
        }

        .remember-choice {
          margin-top: 12px;
        }

        .remember-choice label {
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
        }

        .permission-actions {
          display: flex;
          gap: 12px;
        }

        .permission-actions button {
          flex: 1;
          padding: 12px;
          border: none;
          border-radius: 6px;
          font-size: 1em;
          cursor: pointer;
          font-weight: 500;
        }

        .btn-allow {
          background: #1976d2;
          color: white;
        }

        .btn-deny {
          background: #f5f5f5;
          color: #333;
        }

        .btn-allow:hover { background: #1565c0; }
        .btn-deny:hover { background: #e0e0e0; }
      `}</style>
    </div>
  );
};
