/**
 * Tool metadata generator for enhanced UI display
 * Generates friendly display text and icons for tool calls
 */

import { ToolMeta } from './types.js';

/**
 * Generate metadata for a tool call to display in the UI
 */
export function getToolMeta(name: string, input: unknown): ToolMeta | undefined {
  const inp = input as Record<string, unknown>;

  switch (name) {
    // ============ File Tools ============
    case 'Read': {
      const filePath = String(inp.file_path || '');
      const filename = filePath.split('/').pop() || filePath;
      const limit = inp.limit as number | undefined;
      const offset = inp.offset as number | undefined;
      let detail = '';
      if (offset !== undefined && limit !== undefined) {
        detail = `第 ${offset}-${offset + limit} 行`;
      } else if (limit !== undefined) {
        detail = `${limit} 行`;
      }
      return {
        icon: '📖',
        displayText: `读取 ${filename}`,
        status: 'running',
        detail: detail || undefined,
      };
    }

    case 'Write': {
      const filePath = String(inp.file_path || '');
      const filename = filePath.split('/').pop() || filePath;
      return {
        icon: '📝',
        displayText: `写入 ${filename}`,
        status: 'running',
      };
    }

    case 'Edit': {
      const filePath = String(inp.file_path || '');
      const filename = filePath.split('/').pop() || filePath;
      const oldStr = inp.old_string as string | undefined;
      const newStr = inp.new_string as string | undefined;
      const detail = oldStr && newStr
        ? `${oldStr.slice(0, 20)}${oldStr.length > 20 ? '...' : ''} → ${newStr.slice(0, 20)}${newStr.length > 20 ? '...' : ''}`
        : undefined;
      return {
        icon: '✏️',
        displayText: `编辑 ${filename}`,
        status: 'running',
        detail,
      };
    }

    case 'Glob': {
      const pattern = String(inp.pattern || '*');
      return {
        icon: '🔍',
        displayText: `搜索文件`,
        status: 'running',
        detail: pattern,
      };
    }

    case 'Grep': {
      const pattern = String(inp.pattern || '');
      const path = inp.path as string | undefined;
      return {
        icon: '🔎',
        displayText: `搜索内容`,
        status: 'running',
        detail: `'${pattern.slice(0, 30)}${pattern.length > 30 ? '...' : ''}'`,
      };
    }

    // ============ Execution Tools ============
    case 'Bash': {
      const command = String(inp.command || '');
      const truncated = command.slice(0, 50) + (command.length > 50 ? '...' : '');
      return {
        icon: '⚡',
        displayText: truncated,
        status: 'running',
      };
    }

    case 'Task': {
      const description = inp.description as string | undefined;
      return {
        icon: '📋',
        displayText: description ? `任务: ${description}` : '启动子任务',
        status: 'running',
      };
    }

    case 'TaskOutput': {
      return {
        icon: '📤',
        displayText: '获取任务输出',
        status: 'running',
      };
    }

    case 'TaskStop': {
      return {
        icon: '🛑',
        displayText: '停止任务',
        status: 'running',
      };
    }

    // ============ Network Tools ============
    case 'WebSearch': {
      const query = String(inp.query || '');
      return {
        icon: '🌐',
        displayText: `搜索: ${query.slice(0, 40)}${query.length > 40 ? '...' : ''}`,
        status: 'running',
      };
    }

    case 'WebFetch': {
      const url = String(inp.url || '');
      const shortened = url.replace(/^https?:\/\//, '').slice(0, 40);
      return {
        icon: '🌐',
        displayText: `获取: ${shortened}${url.length > 50 ? '...' : ''}`,
        status: 'running',
      };
    }

    // ============ Team Tools ============
    case 'TeamCreate': {
      const teamName = inp.team_name as string | undefined;
      return {
        icon: '👥',
        displayText: teamName ? `创建团队: ${teamName}` : '创建团队',
        status: 'running',
      };
    }

    case 'TeamDelete': {
      return {
        icon: '👥',
        displayText: '解散团队',
        status: 'running',
      };
    }

    case 'SendMessage': {
      return {
        icon: '💬',
        displayText: '发送消息',
        status: 'running',
      };
    }

    case 'TodoWrite': {
      return {
        icon: '📝',
        displayText: '更新任务列表',
        status: 'running',
      };
    }

    case 'Skill': {
      const skill = inp.skill as string | undefined;
      return {
        icon: '🎯',
        displayText: skill ? `执行技能: ${skill}` : '执行技能',
        status: 'running',
      };
    }

    case 'NotebookEdit': {
      return {
        icon: '📓',
        displayText: '编辑 Notebook',
        status: 'running',
      };
    }

    // ============ AskUserQuestion - Skip rendering ============
    case 'AskUserQuestion': {
      // Return undefined to skip tool card rendering
      // The question dialog is handled separately via QuestionDialog component
      return undefined;
    }

    // ============ MCP Tools ============
    case 'mcp__okclaw__send_message': {
      return {
        icon: '💬',
        displayText: '发送消息',
        status: 'running',
      };
    }

    case 'mcp__okclaw__schedule_task': {
      return {
        icon: '⏰',
        displayText: '调度任务',
        status: 'running',
      };
    }

    case 'mcp__okclaw__list_tasks': {
      return {
        icon: '📋',
        displayText: '列出任务',
        status: 'running',
      };
    }

    case 'mcp__okclaw__pause_task': {
      return {
        icon: '⏸️',
        displayText: '暂停任务',
        status: 'running',
      };
    }

    case 'mcp__okclaw__resume_task': {
      return {
        icon: '▶️',
        displayText: '恢复任务',
        status: 'running',
      };
    }

    case 'mcp__okclaw__cancel_task': {
      return {
        icon: '🚫',
        displayText: '取消任务',
        status: 'running',
      };
    }

    case 'mcp__okclaw__update_task': {
      return {
        icon: '🔄',
        displayText: '更新任务',
        status: 'running',
      };
    }

    case 'mcp__okclaw__register_group': {
      return {
        icon: '➕',
        displayText: '注册群组',
        status: 'running',
      };
    }

    // ============ Pencil Design Tools ============
    case 'mcp__pencil__get_active_editor':
    case 'mcp__pencil__get_guidelines':
    case 'mcp__pencil__get_selection':
    case 'mcp__pencil__get_screenshot':
    case 'mcp__pencil__get_variables':
    case 'mcp__pencil__list_design_nodes':
    case 'mcp__pencil__read_design_nodes':
    case 'mcp__pencil__search_design_nodes':
    case 'mcp__pencil__snapshot_layout':
    case 'mcp__pencil__find_empty_space_around_node': {
      return {
        icon: '🎨',
        displayText: '设计工具',
        status: 'running',
        detail: name.replace('mcp__pencil__', '').replace(/_/g, ' '),
      };
    }

    case 'mcp__pencil__insert_design_nodes':
    case 'mcp__pencil__copy_design_nodes':
    case 'mcp__pencil__move_design_nodes':
    case 'mcp__pencil__update_design_nodes_properties':
    case 'mcp__pencil__replace_design_node':
    case 'mcp__pencil__delete_design_nodes':
    case 'mcp__pencil__replace_all_matching_properties':
    case 'mcp__pencil__search_all_unique_properties':
    case 'mcp__pencil__set_variables': {
      return {
        icon: '✏️',
        displayText: '编辑设计',
        status: 'running',
        detail: name.replace('mcp__pencil__', '').replace(/_/g, ' '),
      };
    }

    case 'mcp__pencil__generate_image': {
      return {
        icon: '🖼️',
        displayText: '生成图片',
        status: 'running',
        detail: inp.prompt ? String(inp.prompt).slice(0, 30) : undefined,
      };
    }

    // ============ Tavily Tools ============
    case 'mcp__tavily__tavily_search': {
      const query = String(inp.query || '');
      return {
        icon: '🔍',
        displayText: `Tavily 搜索`,
        status: 'running',
        detail: query.slice(0, 40) + (query.length > 40 ? '...' : ''),
      };
    }

    case 'mcp__tavily__tavily_extract': {
      return {
        icon: '📄',
        displayText: 'Tavily 提取',
        status: 'running',
      };
    }

    case 'mcp__tavily__tavily_crawl': {
      return {
        icon: '🕷️',
        displayText: 'Tavily 爬取',
        status: 'running',
      };
    }

    case 'mcp__tavily__tavily_map': {
      return {
        icon: '🗺️',
        displayText: 'Tavily 映射',
        status: 'running',
      };
    }

    case 'mcp__tavily__tavily_research': {
      return {
        icon: '🔬',
        displayText: 'Tavily 研究',
        status: 'running',
      };
    }

    // ============ Unknown Tools ============
    default: {
      // Handle other MCP tools (mcp__server__tool_name format)
      if (name.startsWith('mcp__')) {
        const parts = name.split('__');
        const serverName = parts[1] || '';
        const toolName = parts.slice(2).join('_') || name;
        return {
          icon: '🔧',
          displayText: toolName.replace(/_/g, ' '),
          status: 'running',
          detail: serverName,
        };
      }

      // Unknown tool - return undefined to use default rendering
      return undefined;
    }
  }
}

/**
 * Generate metadata for a tool result
 */
export function getToolResultMeta(name: string, output: string, isError: boolean): ToolMeta {
  const toolMeta = getToolMeta(name, {});
  return {
    icon: toolMeta?.icon || '📋',
    displayText: toolMeta?.displayText || name,
    status: isError ? 'error' : 'complete',
    detail: isError ? '执行失败' : `${output.length} 字符`,
  };
}
