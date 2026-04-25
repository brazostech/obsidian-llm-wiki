import React from "react";

export type StepStatus = "pending" | "active" | "complete" | "error";

export interface Step {
  id: string;
  label: string;
  status: StepStatus;
  detail?: string;
}

interface Props {
  steps: Step[];
}

const StepIcon: React.FC<{ status: StepStatus }> = ({ status }) => {
  if (status === "active") {
    return <span className="llm-wiki-step-spinner" />;
  }
  const icons: Record<Exclude<StepStatus, "active">, string> = {
    pending: "○",
    complete: "✓",
    error: "✗",
  };
  return <span className="llm-wiki-step-icon">{icons[status as Exclude<StepStatus, "active">]}</span>;
};

export const ProgressSteps: React.FC<Props> = ({ steps }) => {
  return (
    <div className="llm-wiki-progress">
      {steps.map((step) => (
        <div
          key={step.id}
          className={`llm-wiki-step llm-wiki-step-${step.status}`}
        >
          <StepIcon status={step.status} />
          <div className="llm-wiki-step-body">
            <span className="llm-wiki-step-label">{step.label}</span>
            {step.detail && (
              <span className="llm-wiki-step-detail">{step.detail}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
