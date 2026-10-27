# Public storefront review evidence

The “before” home and pricing screenshots were captured from production at `36d4baac` on 27 October 2026. The “after” screenshots were captured from a production build of the candidate at 390×844 and 1280×900 CSS pixels.

The candidate pricing capture uses a local `/api/billing/plans` fixture exposing only the Lite, Starter, and Plus usage-tier IDs so the real plan-card component can render. Stripe is marked unconfigured; no checkout, payment, account creation, message, or call was triggered.

The privacy pair uses the same local candidate and pricing fixture. “Before” renders the base-commit consent component; “after” renders the compact candidate copy. At 390×844, the visible panel measured 156px before (18.5%) and 123px after (14.6%). The earlier owner-reported 21% figure remains the historical production observation.
