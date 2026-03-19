import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import LtvGauge from './LtvGauge';

describe('LtvGauge', () => {
  it('should render dash when LTV is 0', () => {
    render(<LtvGauge ltv={0} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('should render LTV percentage when LTV > 0', () => {
    render(<LtvGauge ltv={43.9} />);
    expect(screen.getByText('43.9%')).toBeInTheDocument();
  });

  it('should render the LTV label', () => {
    render(<LtvGauge ltv={50} />);
    expect(screen.getByText('LTV')).toBeInTheDocument();
  });

  it('should render scale labels (0%, 50%, 80%, 95%)', () => {
    render(<LtvGauge ltv={0} />);
    expect(screen.getByText('0%')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('80%')).toBeInTheDocument();
    expect(screen.getByText('95%')).toBeInTheDocument();
  });

  it('should apply red color style at LTV >= 80%', () => {
    render(<LtvGauge ltv={85} />);
    const ltvText = screen.getByText('85.0%');
    expect(ltvText).toHaveStyle({ color: 'var(--red-text)' });
  });

  it('should apply green color style at LTV < 50%', () => {
    render(<LtvGauge ltv={30} />);
    const ltvText = screen.getByText('30.0%');
    expect(ltvText).toHaveStyle({ color: 'var(--green)' });
  });

  it('should apply gold color style at LTV 70–80%', () => {
    render(<LtvGauge ltv={75} />);
    const ltvText = screen.getByText('75.0%');
    expect(ltvText).toHaveStyle({ color: 'var(--gold)' });
  });
});
