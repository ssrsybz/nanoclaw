import { useState, useEffect } from 'react';
import { useStore } from '../store';
import EditModal from './EditModal';

export default function SkillsPanel() {
  const { workspaces, activeWorkspaceId, skills, fetchSkills, toggleSkill } = useStore();
  const [editTarget, setEditTarget] = useState<string | null>(null); // null = CLAUDE.md, string = skill name
  const [showEdit, setShowEdit] = useState(false);
  const [hoveredSkill, setHoveredSkill] = useState<string | null>(null);

  // Fetch skills when workspace changes
  useEffect(() => {
    if (activeWorkspaceId) {
      fetchSkills();
    }
  }, [activeWorkspaceId, fetchSkills]);

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);

  if (!activeWorkspace) {
    return (
      <div className="w-80 flex-shrink-0 flex items-center justify-center bg-[#16213e] border-l border-white/10">
        <p className="text-white/30 text-sm">Select a workspace</p>
      </div>
    );
  }

  const openClaudeMd = () => {
    setEditTarget(null);
    setShowEdit(true);
  };

  const openSkill = (name: string) => {
    setEditTarget(name);
    setShowEdit(true);
  };

  const handleSaved = () => {
    fetchSkills();
  };

  return (
    <>
      <div className="w-80 flex-shrink-0 flex flex-col bg-[#16213e] border-l border-white/10">
        {/* Header */}
        <div className="px-4 py-3 border-b border-white/10">
          <div className="font-semibold text-sm text-white truncate">{activeWorkspace.name}</div>
          <div className="text-xs text-white/40 truncate mt-0.5">{activeWorkspace.path}</div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* CLAUDE.md section */}
          <div className="px-4 py-3 border-b border-white/5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm">&#128196;</span>
                <span className="text-sm text-white/80">CLAUDE.md</span>
              </div>
              <button
                onClick={openClaudeMd}
                className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                Edit
              </button>
            </div>
          </div>

          {/* Skills section */}
          <div className="px-4 py-3">
            <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">Skills</h3>
            {skills.length === 0 ? (
              <p className="text-white/20 text-xs">No skills found in .claude/skills/</p>
            ) : (
              <div className="space-y-1">
                {skills.map((skill) => (
                  <div
                    key={skill.name}
                    onMouseEnter={() => setHoveredSkill(skill.name)}
                    onMouseLeave={() => setHoveredSkill(null)}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-white/5 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={skill.enabled}
                      onChange={() => toggleSkill(skill.name)}
                      className="w-3.5 h-3.5 rounded border-white/20 bg-transparent accent-indigo-600 cursor-pointer"
                    />
                    <span className="text-sm text-white/70 flex-1 truncate">{skill.name}</span>
                    {skill.hasSkillMd && hoveredSkill === skill.name && (
                      <button
                        onClick={() => openSkill(skill.name)}
                        className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors flex-shrink-0"
                      >
                        View
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      {showEdit && (
        <EditModal
          workspaceId={activeWorkspace.id}
          skillName={editTarget}
          onClose={() => setShowEdit(false)}
          onSaved={handleSaved}
        />
      )}
    </>
  );
}
