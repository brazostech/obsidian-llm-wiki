import React, { useState } from "react";
import { Proposal } from "../ai/propose";

interface Props {
  proposal: Proposal;
  onApply: (actions: Proposal["actions"]) => void;
  onCancel: () => void;
}

export const ProposalChecklist: React.FC<Props> = ({
  proposal,
  onApply,
  onCancel,
}) => {
  const [actions, setActions] = useState(
    proposal.actions.map((a) => ({ ...a, checked: true }))
  );

  const toggleAction = (index: number) => {
    setActions((prev) =>
      prev.map((a, i) => (i === index ? { ...a, checked: !a.checked } : a))
    );
  };

  const handleApply = () => {
    const approved = actions
      .filter((a) => a.checked)
      .map(({ checked, ...rest }) => rest);
    onApply(approved);
  };

  return (
    <div className="llm-wiki-proposal">
      <h3>Proposed Actions</h3>
      <div className="llm-wiki-proposal-list">
        {actions.map((action, i) => (
          <div key={i} className="llm-wiki-proposal-item">
            <input
              type="checkbox"
              checked={action.checked}
              onChange={() => toggleAction(i)}
            />
            <span
              className={`llm-wiki-badge llm-wiki-badge-${action.type.toLowerCase()}`}
            >
              {action.type}
            </span>
            <span className="llm-wiki-proposal-path">{action.path}</span>
            <span className="llm-wiki-proposal-desc">
              {action.description}
            </span>
          </div>
        ))}
      </div>
      <div className="llm-wiki-proposal-actions">
        <button onClick={onCancel}>Back to Chat</button>
        <button onClick={handleApply}>Apply Approved</button>
      </div>
    </div>
  );
};
