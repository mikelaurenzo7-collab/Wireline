# Homepage static showcase review

The “before” captures are from production at `36d4baac` on 27 October 2026. The “after” captures are from a local production build on 28 October. Both states use the same 390×844 and 1280×900 CSS-pixel viewports. Additional after captures cover 768×1024 and 1440×900.

The revised homepage keeps the hero and two clear actions, then presents three static product cards under “The Bot Gets:”: Phone Number, Email Address, and A Computer. The phone example makes inbound and outbound calls and SMS visible together. The home page no longer has interactive channel tabs, the voice-catalog section, Explore links, or a footer bar.

Playwright and axe report zero violations and no horizontal overflow at 390, 768, 1280, and 1440 pixels. The viewport-flow suite passes at phone, laptop, and desktop sizes. Public-route, static-demo, signup-continuity and pricing-title behavior were also exercised locally; no payment, account creation, email, SMS, outbound call, or voice clone was triggered.

`open-graph-before.png` and `open-graph-after.png` show the social preview before and after metadata alignment. Lighthouse comparison against the historical approximate production scores has not been reproduced in this environment; this evidence does not claim a Lighthouse pass.
