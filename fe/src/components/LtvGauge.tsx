'use client';

import { ltvColor, ltvToAngle } from '@/lib/utils';

interface LtvGaugeProps {
  ltv: number;
}

export default function LtvGauge({ ltv }: LtvGaugeProps) {
  const angle = ltvToAngle(ltv);
  const color = ltvColor(ltv);

  const ringStyle = {
    background: `conic-gradient(${color} 0deg, ${color} ${angle}deg, var(--border) ${angle}deg, var(--border) 270deg, transparent 270deg)`,
    transform: 'rotate(135deg)',
  };

  return (
    <div className="flex flex-col items-center">
      <div className="w-[140px] h-[140px] rounded-full flex items-center justify-center" style={ringStyle}>
        <div className="w-[112px] h-[112px] rounded-full bg-[var(--bg-secondary)] flex items-center justify-center" style={{ transform: 'rotate(-135deg)' }}>
          <div className="text-center">
            <div className="text-2xl font-bold font-headline" style={{ color }}>
              {ltv > 0 ? `${ltv.toFixed(1)}%` : '—'}
            </div>
            <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide mt-0.5">LTV</div>
          </div>
        </div>
      </div>
      <div className="flex justify-between w-full mt-3 text-[10px] font-headline">
        <span className="text-[var(--green)]">0%</span>
        <span className="text-[var(--text-muted)]">50%</span>
        <span className="text-[var(--gold)]">80%</span>
        <span className="text-[var(--red-text)]">95%</span>
      </div>
    </div>
  );
}
