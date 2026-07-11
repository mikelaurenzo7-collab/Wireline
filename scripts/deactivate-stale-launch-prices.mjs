#!/usr/bin/env node
/**
 * Backward-compatible entry point for catalog cleanup.
 *
 * The Founder reconciler validates canonical products and prices first, then
 * deactivates superseded Wireline prices only when no subscription, payment
 * link, or open checkout depends on them.
 */
import "./setup-stripe-catalog.mjs";
