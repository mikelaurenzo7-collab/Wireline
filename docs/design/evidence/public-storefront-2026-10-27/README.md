# Public storefront review evidence

The “before” home and pricing screenshots were captured from production at `36d4baac` on 27 October 2026. The “after” screenshots were captured from the first storefront candidate at 390×844 and 1280×900 CSS pixels. The homepage was subsequently simplified into three static product cards; use the 28 October [homepage evidence](../public-home-static-showcase-2026-10-28/README.md) for the current final before/after comparison. The pricing and privacy captures in this directory remain current for this PR.

The candidate pricing capture uses a local `/api/billing/plans` fixture exposing only the Lite, Starter, and Plus usage-tier IDs so the real plan-card component can render. Stripe is marked unconfigured; no checkout, payment, account creation, message, or call was triggered.

The privacy pair uses the same local candidate and pricing fixture. “Before” renders the base-commit consent component; “after” renders the compact candidate copy. At 390×844, the visible panel measured 156px before (18.5%) and 103px after (12.2%). The shorter message and two-column action row also keep the panel at 103px at 320×844. The earlier owner-reported 21% figure remains the historical production observation.
