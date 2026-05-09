/**
 * Question Dialog Component for AskUserQuestion tool
 * Displays a modal dialog with questions from the agent
 */
import { useState, useEffect } from 'react';
import { useStore, type Question, type QuestionOption } from '../store';

export default function QuestionDialog() {
  const pendingQuestion = useStore((s) => s.pendingQuestion);
  const submitQuestionAnswer = useStore((s) => s.submitQuestionAnswer);

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [multiSelectAnswers, setMultiSelectAnswers] = useState<Record<string, string[]>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});

  // Reset state when question changes
  useEffect(() => {
    if (pendingQuestion) {
      const initialAnswers: Record<string, string> = {};
      const initialMultiSelect: Record<string, string[]> = {};

      for (const q of pendingQuestion.questions) {
        if (q.multiSelect) {
          initialMultiSelect[q.question] = [];
        } else {
          initialAnswers[q.question] = '';
        }
      }

      setAnswers(initialAnswers);
      setMultiSelectAnswers(initialMultiSelect);
      setNotes({});
    }
  }, [pendingQuestion]);

  if (!pendingQuestion) return null;

  const handleSubmit = () => {
    // Convert multi-select answers to comma-separated strings
    const finalAnswers: Record<string, string> = { ...answers };
    for (const [question, selected] of Object.entries(multiSelectAnswers)) {
      finalAnswers[question] = selected.join(', ');
    }

    submitQuestionAnswer(
      pendingQuestion.toolUseId,
      pendingQuestion.conversationId,
      finalAnswers,
      notes ? Object.fromEntries(
        Object.entries(notes).filter(([, v]) => v).map(([k, v]) => [k, { notes: v }])
      ) : undefined
    );
  };

  const handleCancel = () => {
    // Send cancel response to backend
    submitQuestionAnswer(
      pendingQuestion.toolUseId,
      pendingQuestion.conversationId,
      {}, // Empty answers indicate cancellation
      undefined,
      true // cancelled flag
    );
  };

  const handleSingleSelect = (question: string, label: string) => {
    setAnswers((prev) => ({ ...prev, [question]: label }));
  };

  const handleMultiSelect = (question: string, label: string, checked: boolean) => {
    setMultiSelectAnswers((prev) => {
      const current = prev[question] || [];
      return {
        ...prev,
        [question]: checked
          ? [...current, label]
          : current.filter((l) => l !== label),
      };
    });
  };

  const canSubmit = () => {
    for (const q of pendingQuestion.questions) {
      if (q.multiSelect) {
        if ((multiSelectAnswers[q.question] || []).length === 0) return false;
      } else {
        if (!answers[q.question]) return false;
      }
    }
    return true;
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[#1a1a2e] border border-white/10 rounded-xl max-w-lg w-full max-h-[80vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 bg-[#1a1a2e] border-b border-white/10 px-6 py-4 flex items-center gap-3">
          <span className="text-2xl">❓</span>
          <h2 className="text-lg font-semibold text-white">需要您的回答</h2>
        </div>

        {/* Questions */}
        <div className="px-6 py-4 space-y-6">
          {pendingQuestion.questions.map((q, idx) => (
            <QuestionCard
              key={idx}
              question={q}
              index={idx + 1}
              selectedAnswer={answers[q.question]}
              selectedMulti={multiSelectAnswers[q.question] || []}
              note={notes[q.question] || ''}
              onSingleSelect={(label) => handleSingleSelect(q.question, label)}
              onMultiSelect={(label, checked) => handleMultiSelect(q.question, label, checked)}
              onNoteChange={(note) => setNotes((prev) => ({ ...prev, [q.question]: note }))}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-[#1a1a2e] border-t border-white/10 px-6 py-4 flex justify-end gap-3">
          <button
            onClick={handleCancel}
            className="px-4 py-2 text-white/60 hover:text-white transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit()}
            className={`px-6 py-2 rounded-lg font-medium transition-colors ${
              canSubmit()
                ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
                : 'bg-white/10 text-white/40 cursor-not-allowed'
            }`}
          >
            提交回答
          </button>
        </div>
      </div>
    </div>
  );
}

interface QuestionCardProps {
  question: Question;
  index: number;
  selectedAnswer: string;
  selectedMulti: string[];
  note: string;
  onSingleSelect: (label: string) => void;
  onMultiSelect: (label: string, checked: boolean) => void;
  onNoteChange: (note: string) => void;
}

function QuestionCard({
  question,
  index,
  selectedAnswer,
  selectedMulti,
  note,
  onSingleSelect,
  onMultiSelect,
  onNoteChange,
}: QuestionCardProps) {
  return (
    <div className="space-y-3">
      {/* Question header */}
      <div className="flex items-start gap-2">
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-indigo-600/30 text-indigo-400 text-sm font-medium shrink-0">
          {index}
        </span>
        <div>
          <p className="text-white font-medium">{question.question}</p>
          <span className="inline-block mt-1 px-2 py-0.5 bg-white/10 rounded text-xs text-white/60">
            {question.header}
          </span>
          {question.multiSelect && (
            <span className="ml-2 text-xs text-indigo-400">（可多选）</span>
          )}
        </div>
      </div>

      {/* Options */}
      <div className="space-y-2 pl-8">
        {question.options.map((opt, optIdx) => (
          <OptionButton
            key={optIdx}
            option={opt}
            multiSelect={question.multiSelect}
            selected={question.multiSelect
              ? selectedMulti.includes(opt.label)
              : selectedAnswer === opt.label}
            onSelect={() => onSingleSelect(opt.label)}
            onToggle={(checked) => onMultiSelect(opt.label, checked)}
          />
        ))}
      </div>

      {/* Notes input */}
      <div className="pl-8">
        <input
          type="text"
          placeholder="添加备注（可选）"
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 text-sm focus:outline-none focus:border-indigo-500"
        />
      </div>
    </div>
  );
}

interface OptionButtonProps {
  option: QuestionOption;
  multiSelect: boolean;
  selected: boolean;
  onSelect: () => void;
  onToggle: (checked: boolean) => void;
}

function OptionButton({
  option,
  multiSelect,
  selected,
  onSelect,
  onToggle,
}: OptionButtonProps) {
  const handleClick = () => {
    if (multiSelect) {
      onToggle(!selected);
    } else {
      onSelect();
    }
  };

  return (
    <button
      onClick={handleClick}
      className={`w-full text-left px-4 py-3 rounded-lg border transition-all ${
        selected
          ? 'bg-indigo-600/20 border-indigo-500 text-white'
          : 'bg-white/5 border-white/10 text-white/80 hover:bg-white/10 hover:border-white/20'
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Selection indicator */}
        <span className={`mt-0.5 shrink-0 w-5 h-5 rounded-full border flex items-center justify-center ${
          selected
            ? 'bg-indigo-600 border-indigo-600'
            : 'border-white/30'
        }`}>
          {selected && (
            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          )}
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-medium">{option.label}</p>
          <p className="text-sm text-white/60 mt-0.5">{option.description}</p>
        </div>
      </div>
    </button>
  );
}
