import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import BorrowInputForm from './BorrowInputForm';

const defaultProps = {
  btcPrice: 91000,
  btcBalance: 1.0,
  maxLtv: 80,
  minLoanAmount: 100,
  minTermDays: 30,
  originationFeePct: 0.2,
  onRequestQuotes: vi.fn(),
};

function fillForm(collateral: string, amount: string, term: string) {
  // Collateral — unique placeholder '0.00'
  fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: collateral } });
  // Amount and Term both have placeholder '0' — select by surrounding label text
  const inputs = screen.getAllByPlaceholderText('0');
  // inputs[0] = loan amount text input, inputs[1] = term text input
  // (range slider is type=range, not text, so not included)
  fireEvent.change(inputs[0], { target: { value: amount } });
  fireEvent.change(inputs[1], { target: { value: term } });
}

describe('BorrowInputForm', () => {
  describe('initial state', () => {
    it('should render all three inputs', () => {
      render(<BorrowInputForm {...defaultProps} />);
      expect(screen.getByPlaceholderText('0.00')).toBeInTheDocument(); // collateral
      expect(screen.getAllByPlaceholderText('0').length).toBeGreaterThanOrEqual(2); // amount + term
    });

    it('should show btcBalance in the available label', () => {
      render(<BorrowInputForm {...defaultProps} />);
      expect(screen.getByText(/1 BTC/i)).toBeInTheDocument();
    });

    it('should have Request Quotes button disabled initially', () => {
      render(<BorrowInputForm {...defaultProps} />);
      expect(screen.getByRole('button', { name: /request quotes/i })).toBeDisabled();
    });
  });

  describe('validation', () => {
    it('should show error when loan amount is below minimum', () => {
      render(<BorrowInputForm {...defaultProps} />);
      fillForm('0.5', '50', '90'); // amount 50 < minLoanAmount 100
      expect(screen.getByText(/minimum loan amount/i)).toBeInTheDocument();
    });

    it('should show error when term is below minimum', () => {
      render(<BorrowInputForm {...defaultProps} />);
      fillForm('0.5', '20000', '10'); // term 10 < minTermDays 30
      expect(screen.getByText(/minimum loan term/i)).toBeInTheDocument();
    });

    it('should show error when LTV exceeds maxLtv', () => {
      render(<BorrowInputForm {...defaultProps} />);
      // 0.1 BTC * 91000 = $9100, borrow $8000 → LTV ≈ 87.9% > 80%
      fillForm('0.1', '8000', '90');
      expect(screen.getByText(/ltv too high/i)).toBeInTheDocument();
    });

    it('should show error when collateral exceeds balance', () => {
      render(<BorrowInputForm {...defaultProps} btcBalance={0.3} />);
      fillForm('0.5', '20000', '90'); // 0.5 > balance 0.3
      expect(screen.getByText(/insufficient btc balance/i)).toBeInTheDocument();
    });

    it('should keep button disabled when there are validation errors', () => {
      render(<BorrowInputForm {...defaultProps} />);
      fillForm('0.1', '8000', '90'); // LTV too high
      expect(screen.getByRole('button', { name: /request quotes/i })).toBeDisabled();
    });
  });

  describe('valid state', () => {
    it('should enable button when all inputs are valid', () => {
      render(<BorrowInputForm {...defaultProps} />);
      // 0.5 BTC * 91000 = $45500, borrow $20000 → LTV ≈ 43.9% — well under 80%
      fillForm('0.5', '20000', '90');
      expect(screen.getByRole('button', { name: /request quotes/i })).not.toBeDisabled();
    });

    it('should call onRequestQuotes with correct values when submitted', () => {
      const onRequestQuotes = vi.fn();
      render(<BorrowInputForm {...defaultProps} onRequestQuotes={onRequestQuotes} />);
      fillForm('0.5', '20000', '90');
      fireEvent.click(screen.getByRole('button', { name: /request quotes/i }));
      expect(onRequestQuotes).toHaveBeenCalledWith(0.5, 20000, 90);
    });
  });

  describe('MAX button', () => {
    it('should fill collateral input with btcBalance when MAX is clicked', () => {
      render(<BorrowInputForm {...defaultProps} btcBalance={0.75} />);
      fireEvent.click(screen.getByRole('button', { name: /max/i }));
      expect(screen.getByPlaceholderText('0.00')).toHaveValue('0.75');
    });
  });

  describe('LTV display', () => {
    it('should show LTV gauge in the context panel', () => {
      render(<BorrowInputForm {...defaultProps} />);
      expect(screen.getByText('LTV')).toBeInTheDocument();
    });

    it('should show dash in LTV gauge when no values entered', () => {
      render(<BorrowInputForm {...defaultProps} />);
      // Multiple '—' exist (detail rows also show '—'), check at least one is in the gauge
      const dashes = screen.getAllByText('—');
      expect(dashes.length).toBeGreaterThan(0);
    });

    it('should update LTV gauge when collateral and amount are filled', () => {
      render(<BorrowInputForm {...defaultProps} />);
      fillForm('0.5', '20000', '90');
      // LTV ≈ 43.9% — gauge should show a percentage, not a dash
      expect(screen.queryByText('—')).not.toBeInTheDocument();
    });
  });
});
