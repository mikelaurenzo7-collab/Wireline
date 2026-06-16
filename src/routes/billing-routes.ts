import { Router } from 'express';

/**
 * Billing routes placeholder.
 * TODO: Implement proper billing/credits logic.
 */
export const billingRouter = Router();

billingRouter.get('/credits', (req, res) => {
  res.json({ credits: 0, message: 'Billing module placeholder' });
});

export default billingRouter;
