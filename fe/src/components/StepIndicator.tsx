'use client';

import clsx from 'clsx';

interface StepIndicatorProps {
  currentStep: 1 | 2 | 3;
}

export default function StepIndicator({ currentStep }: StepIndicatorProps) {
  const steps = [
    { num: 1, label: 'RFQ' },
    { num: 2, label: 'Offers' },
    { num: 3, label: 'Sign' },
  ];

  return (
    <div className="flex items-center gap-2 mb-6 text-xs text-[var(--text-muted)] max-w-[320px]">
      {steps.map((step, i) => (
        <div key={step.num} className="contents">
          <div
            className={clsx(
              'w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold border',
              step.num < currentStep && 'bg-[var(--green-deep)] text-[var(--parchment)] border-[var(--green-deep)]',
              step.num === currentStep && 'bg-[var(--gold-dark)] text-[var(--parchment)] border-[var(--gold-dark)]',
              step.num > currentStep && 'border-[var(--border)] text-[var(--text-muted)]',
            )}
          >
            {step.num}
          </div>
          <span className="text-[11px] text-[var(--text-muted)] mr-1">{step.label}</span>
          {i < steps.length - 1 && <div className="flex-1 h-px bg-[var(--border)]" />}
        </div>
      ))}
    </div>
  );
}
