export const EVENT = {
  // RFQ events
  RFQ_CREATED: 'rfq.created',
  RFQ_OFFER_RECEIVED: 'rfq.offer_received',
  RFQ_OFFER_WITHDRAWN: 'rfq.offer_withdrawn',
  RFQ_ACCEPTED: 'rfq.accepted',
  RFQ_EXPIRED: 'rfq.expired',
  RFQ_CANCELLED: 'rfq.cancelled',

  // Loan events
  LOAN_ORIGINATION_READY: 'loan.origination_ready',
  LOAN_ORIGINATION_SIGNED: 'loan.origination_signed',
  LOAN_ACTIVATED: 'loan.activated',
  LOAN_REPAYMENT_PENDING: 'loan.repayment_pending',
  LOAN_REPAID: 'loan.repaid',
  LOAN_IN_DANGER: 'loan.in_danger',
  LOAN_LIQUIDATED: 'loan.liquidated',
  LOAN_GRACE_STARTED: 'loan.grace_started',
  LOAN_DEFAULTED: 'loan.defaulted',
  LOAN_FORFEITURE_PENDING: 'loan.forfeiture_pending',
  LOAN_FORFEITED: 'loan.forfeited',

  // Price events
  PRICE_UPDATED: 'price.updated',
  PRICE_FEED_FAILURE: 'price.feed_failure',

  // Review events
  REVIEW_REQUIRED: 'review.required',
  REVIEW_APPROVED: 'review.approved',
  REVIEW_REJECTED: 'review.rejected',
} as const;
