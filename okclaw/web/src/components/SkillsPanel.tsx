import { useState, useEffect, useMemo } from 'react';
import { useStore, type Skill, type SkillType, type SkillSource } from '../store';
import EditModal from './EditModal';
import ContextTab from './resources/ContextTab';
import ProjectFilesTab from './resources/ProjectFilesTab';

// --- Skill type/source badge config ---
const SKILL_TYPE_CONFIG: Record<SkillType, { label: string; color: string }> = {
  builtin: { label: '内置', color: 'bg-gray-200 text-gray-700' },
  operational: { label: '指令', color: 'bg-emerald-100 text-emerald-700' },
  utility: { label: '工具', color: 'bg-blue-100 text-blue-700' },
  feature: { label: '功能', color: 'bg-orange-100 text-orange-700' },
  workspace: { label: '空间', color: 'bg-purple-100 text-purple-700' },
};

const SOURCE_CONFIG: Record<SkillSource, { label: string }> = {
  builtin: { label: 'SDK' },
  system: { label: '系统' },
  workspace: { label: '工作空间' },
  marketplace: { label: '市场' },
};

// Section config for the grouped skill panel
interface SectionConfig {
  key: string;
  title: string;
  icon: string;
  filter: (s: Skill) => boolean;
  canToggle: boolean; // Whether skills in this section can be enabled/disabled
  canEdit: boolean;   // Whether skills in this section can be edited
  canInstall: boolean; // Whether skills in this section can be installed via chat
  defaultExpanded: boolean;
}

const SECTIONS: SectionConfig[] = [
  {
    key: 'system',
    title: '系统技能',
    icon: '⚙️',
    filter: (s) => s.source === 'system' || (s.isSystem === true && s.isBuiltin !== true),
    canToggle: false,
    canEdit: false,
    canInstall: false,
    defaultExpanded: true,
  },
  {
    key: 'installable',
    title: '可安装技能',
    icon: '📦',
    // Feature skills from .claude/skills/ that haven't been installed yet
    filter: (s) => s.skillType === 'feature',
    canToggle: false,
    canEdit: false,
    canInstall: true,
    defaultExpanded: true,
  },
  {
    key: 'workspace',
    title: '工作空间技能',
    icon: '📁',
    filter: (s) => s.source === 'workspace' || (s.isBuiltin !== true && s.isSystem !== true && s.skillType !== 'feature'),
    canToggle: true,
    canEdit: true,
    canInstall: false,
    defaultExpanded: true,
  },
  {
    key: 'builtin',
    title: '内置能力',
    icon: '🔌',
    filter: (s) => s.source === 'builtin' || s.isBuiltin === true,
    canToggle: false,
    canEdit: false,
    canInstall: false,
    defaultExpanded: false,
  },
];

// --- Sub-components ---

function SkillTypeBadge({ skillType }: { skillType?: SkillType }) {
  if (!skillType) return null;
  const config = SKILL_TYPE_CONFIG[skillType];
  if (!config) return null;
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${config.color}`}>
      {config.label}
    </span>
  );
}

function SkillCard({
  skill,
  canToggle,
  canEdit,
  canInstall,
  onView,
  onInstall,
}: {
  skill: Skill;
  canToggle: boolean;
  canEdit: boolean;
  canInstall: boolean;
  onView: (skill: Skill) => void;
  onInstall: (skill: Skill) => void;
}) {
  const toggleSkill = useStore((s) => s.toggleSkill);

  return (
    <div className="flex items-start gap-2 px-2 py-2 rounded-md hover:bg-black/5 transition-colors group">
      {/* Toggle or icon */}
      <div className="flex-shrink-0 mt-0.5">
        {canToggle ? (
          <input
            type="checkbox"
            checked={skill.enabled}
            onChange={() => toggleSkill(skill.name)}
            className="w-3.5 h-3.5 rounded border-line bg-transparent accent-accent cursor-pointer"
          />
        ) : (
          <span className="text-sm">{skill.icon || '📌'}</span>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm text-ink truncate">
            {skill.nameZh || skill.name}
          </span>
          <SkillTypeBadge skillType={skill.skillType} />
          {skill.source && SOURCE_CONFIG[skill.source] && (
            <span className="text-[10px] px-1 py-0.5 rounded bg-black/5 text-ink-faint">
              {SOURCE_CONFIG[skill.source].label}
            </span>
          )}
        </div>
        {skill.description && (
          <div className="text-xs text-ink-sub mt-0.5 line-clamp-2">{skill.description}</div>
        )}
        {skill.allowedTools && skill.allowedTools.length > 0 && (
          <div className="text-[10px] text-ink-faint mt-0.5">
            工具: {skill.allowedTools.length}
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex-shrink-0 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {canInstall && (
          <button
            onClick={() => onInstall(skill)}
            className="text-xs px-2 py-0.5 rounded bg-accent-soft text-accent hover:bg-accent/20 transition-colors"
          >
            安装
          </button>
        )}
        {skill.hasSkillMd && (
          <button
            onClick={() => onView(skill)}
            className="text-xs text-accent hover:text-accent-hover transition-colors"
          >
            {canEdit ? '编辑' : '查看'}
          </button>
        )}
      </div>
    </div>
  );
}

function SkillSection({
  section,
  skills,
  onView,
  onInstall,
}: {
  section: SectionConfig;
  skills: Skill[];
  onView: (skill: Skill) => void;
  onInstall: (skill: Skill) => void;
}) {
  const [expanded, setExpanded] = useState(section.defaultExpanded);

  if (skills.length === 0) return null;

  return (
    <div className="border-b border-line-soft">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-black/5 transition-colors"
      >
        <span className="text-sm">{section.icon}</span>
        <span className="text-xs font-semibold text-ink-sub uppercase tracking-wider flex-1">
          {section.title}
        </span>
        <span className="text-xs text-ink-faint">({skills.length})</span>
        <span className="text-ink-faint text-xs">{expanded ? '▼' : '▶'}</span>
      </button>
      {expanded && (
        <div className="px-2 pb-2">
          {skills.map((skill) => (
            <SkillCard
              key={skill.name}
              skill={skill}
              canToggle={section.canToggle}
              canEdit={section.canEdit}
              canInstall={section.canInstall}
              onView={onView}
              onInstall={onInstall}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// --- Channel awareness indicator ---

function ChannelAwarenessIndicator() {
  // The web channel is always active for the web app
  return (
    <div className="px-4 py-2 border-b border-line-soft">
      <div className="flex items-center gap-2 text-[10px] text-ink-faint">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
        <span>Web 格式化已自动激活</span>
      </div>
    </div>
  );
}

// --- Skill detail view ---

function SkillDetail({
  skill,
  onBack,
  onEdit,
  onInstall,
}: {
  skill: Skill;
  onBack: () => void;
  onEdit?: () => void;
  onInstall?: () => void;
}) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const fetchContent = async () => {
      try {
        const source = skill.source || (skill.isBuiltin ? 'builtin' : skill.isSystem ? 'system' : skill.skillType === 'feature' ? 'system' : 'workspace');
        if (source === 'builtin' || !skill.hasSkillMd) {
          setContent(null);
          return;
        }

        const params = new URLSearchParams({
          source,
          name: skill.name,
        });
        // Add workspaceId for workspace skills
        const activeWorkspaceId = useStore.getState().activeWorkspaceId;
        if (source === 'workspace' && activeWorkspaceId) {
          params.set('workspaceId', activeWorkspaceId);
        }

        const res = await fetch(`/api/skills/content?${params}`);
        if (res.ok) {
          const data = await res.json();
          setContent(data.content);
        } else {
          setContent(null);
        }
      } catch {
        setContent(null);
      } finally {
        setLoading(false);
      }
    };
    fetchContent();
  }, [skill]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-line">
        <button
          onClick={onBack}
          className="text-xs text-accent hover:text-accent-hover mb-2 flex items-center gap-1"
        >
          ← 返回技能列表
        </button>
        <div className="flex items-center gap-2">
          <span className="text-base">{skill.icon || '📌'}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-ink">
                {skill.nameZh || skill.name}
              </span>
              <SkillTypeBadge skillType={skill.skillType} />
            </div>
            {skill.name !== skill.nameZh && skill.nameZh && (
              <div className="text-[10px] text-ink-faint font-mono">/{skill.name}</div>
            )}
          </div>
          {onInstall && (
            <button
              onClick={onInstall}
              className="text-xs px-2 py-1 rounded bg-accent-soft text-accent hover:bg-accent/20 transition-colors"
            >
              安装
            </button>
          )}
          {onEdit && (
            <button
              onClick={onEdit}
              className="text-xs px-2 py-1 rounded bg-accent-soft text-accent hover:bg-accent/20 transition-colors"
            >
              编辑
            </button>
          )}
        </div>
      </div>

      {/* Metadata */}
      <div className="px-4 py-2 border-b border-line-soft text-xs space-y-1">
        {skill.description && (
          <div className="text-ink-sub">{skill.description}</div>
        )}
        <div className="flex flex-wrap gap-2">
          {skill.source && (
            <span className="text-ink-faint">
              来源: {SOURCE_CONFIG[skill.source]?.label || skill.source}
            </span>
          )}
          {skill.category && (
            <span className="text-ink-faint">分类: {skill.category}</span>
          )}
          {skill.allowedTools && skill.allowedTools.length > 0 && (
            <span className="text-ink-faint">
              工具: {skill.allowedTools.join(', ')}
            </span>
          )}
          {skill.dependencies && skill.dependencies.length > 0 && (
            <span className="text-ink-faint">
              依赖: {skill.dependencies.join(', ')}
            </span>
          )}
          {skill.version && (
            <span className="text-ink-faint">版本: {skill.version}</span>
          )}
        </div>
      </div>

      {/* Content preview */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {loading ? (
          <div className="text-ink-faint text-xs">加载中...</div>
        ) : content ? (
          <pre className="text-xs text-ink-sub whitespace-pre-wrap font-mono leading-relaxed max-h-[60vh] overflow-y-auto">
            {content}
          </pre>
        ) : (
          <div className="text-ink-faint text-xs">
            {skill.isBuiltin ? '内置工具能力，无 SKILL.md 文件' : '暂无技能内容'}
          </div>
        )}
      </div>
    </div>
  );
}

// --- Main SkillsPanel ---

export default function SkillsPanel() {
  const {
    workspaces,
    activeWorkspaceId,
    skills,
    skillsByCategory,
    fetchSkills,
    discoverSkills,
    resourcePanelTab,
    setResourcePanelTab,
  } = useStore();

  const [editTarget, setEditTarget] = useState<string | null>(null); // null = CLAUDE.md, string = skill name
  const [showEdit, setShowEdit] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);

  // Fetch skills when workspace changes
  useEffect(() => {
    if (activeWorkspaceId) {
      fetchSkills();
      discoverSkills();
    }
  }, [activeWorkspaceId, fetchSkills, discoverSkills]);

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);

  // Merge all skills for section grouping
  const allSkills = useMemo(() => {
    const map = new Map<string, Skill>();
    // Add from discovery (which includes builtin + system + workspace + .claude/skills)
    for (const cat of Object.values(skillsByCategory)) {
      for (const s of cat || []) {
        map.set(s.name, s);
      }
    }
    // Add workspace skills (may overlap but have more details)
    for (const s of skills) {
      map.set(s.name, { ...map.get(s.name), ...s });
    }
    return Array.from(map.values());
  }, [skillsByCategory, skills]);

  const openClaudeMd = () => {
    setEditTarget(null);
    setShowEdit(true);
  };

  const handleViewSkill = (skill: Skill) => {
    setSelectedSkill(skill);
  };

  const handleInstallSkill = (skill: Skill) => {
    // Insert the skill name as a slash command into the chat input
    // This triggers the skill installation flow via chat
    const event = new CustomEvent('okclaw-insert-text', {
      detail: { text: `/${skill.name} ` },
    });
    window.dispatchEvent(event);
  };

  const handleEditSkill = () => {
    if (selectedSkill) {
      setEditTarget(selectedSkill.name);
      setShowEdit(true);
    }
  };

  const handleSaved = () => {
    fetchSkills();
  };

  if (!activeWorkspace) {
    return (
      <div className="w-80 flex-shrink-0 flex items-center justify-center bg-panel border-l border-line">
        <p className="text-ink-faint text-sm">选择工作空间</p>
      </div>
    );
  }

  // If a skill is selected, show detail view
  if (selectedSkill) {
    const canEdit = selectedSkill.source === 'workspace' && !selectedSkill.readOnly;
    const canInstall = selectedSkill.skillType === 'feature';
    return (
      <>
        <div className="w-80 flex-shrink-0 flex flex-col bg-panel border-l border-line">
          <SkillDetail
            skill={selectedSkill}
            onBack={() => setSelectedSkill(null)}
            onEdit={canEdit ? handleEditSkill : undefined}
            onInstall={canInstall ? () => handleInstallSkill(selectedSkill) : undefined}
          />
        </div>
        {showEdit && activeWorkspaceId && (
          <EditModal
            workspaceId={activeWorkspaceId}
            skillName={editTarget}
            onClose={() => setShowEdit(false)}
            onSaved={handleSaved}
          />
        )}
      </>
    );
  }

  return (
    <>
      <div className="w-80 flex-shrink-0 flex flex-col bg-panel border-l border-line">
        {/* Header */}
        <div className="px-4 py-3 border-b border-line">
          <div className="font-semibold text-sm text-ink truncate">{activeWorkspace.name}</div>
          <div className="text-xs text-ink-faint truncate mt-0.5">{activeWorkspace.path}</div>
        </div>

        <div className="px-2 py-2 border-b border-line-soft">
          <div className="grid grid-cols-3 gap-1 rounded-lg bg-black/5 p-1" role="tablist">
            {([
              ['skills', '技能'],
              ['files', '项目文件'],
              ['context', '上下文'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setResourcePanelTab(key)}
                role="tab"
                aria-selected={resourcePanelTab === key}
                className={`px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  resourcePanelTab === key
                    ? 'bg-surface text-accent shadow-sm'
                    : 'text-ink-faint hover:text-ink hover:bg-black/5'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {resourcePanelTab === 'skills' && (
          <>
            <div className="flex-1 overflow-y-auto">
              {/* CLAUDE.md section */}
              <div className="px-4 py-3 border-b border-line-soft">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">📄</span>
                    <span className="text-sm text-ink-sub">CLAUDE.md</span>
                  </div>
                  <button
                    onClick={openClaudeMd}
                    className="text-xs text-accent hover:text-accent-hover transition-colors"
                  >
                    编辑
                  </button>
                </div>
              </div>

              {/* Channel awareness indicator */}
              <ChannelAwarenessIndicator />

              {/* Skill sections */}
              {SECTIONS.map((section) => (
                <SkillSection
                  key={section.key}
                  section={section}
                  skills={allSkills.filter(section.filter)}
                  onView={handleViewSkill}
                  onInstall={handleInstallSkill}
                />
              ))}

              {/* Empty state */}
              {allSkills.length === 0 && (
                <div className="px-4 py-6 text-center text-ink-faint text-xs">
                  暂无技能可用
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-2 border-t border-line-soft text-[10px] text-ink-faint">
              共 {allSkills.length} 个技能 · 输入 / 调用技能
            </div>
          </>
        )}

        {resourcePanelTab === 'files' && (
          <div className="flex-1 min-h-0 overflow-hidden">
            <ProjectFilesTab workspaceId={activeWorkspaceId!} />
          </div>
        )}

        {resourcePanelTab === 'context' && (
          <div className="flex-1 min-h-0 overflow-hidden">
            <ContextTab />
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {showEdit && activeWorkspaceId && (
        <EditModal
          workspaceId={activeWorkspaceId}
          skillName={editTarget}
          onClose={() => setShowEdit(false)}
          onSaved={handleSaved}
        />
      )}
    </>
  );
}
