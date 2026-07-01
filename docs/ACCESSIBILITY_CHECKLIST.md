# Wireline accessibility checklist

This checklist is the minimum accessibility bar for launch review. It is written for product surfaces that include public marketing pages, auth flows, the workspace shell, Studio, Training, Settings, and the supporting apps.

## Global structure

- Each route has one primary `<main>` landmark when the page has finished loading.
- Each route has a clear page title or first heading.
- Repeated shells expose a visible-on-focus skip link to `#main`.
- The visible keyboard focus ring is clear on links, buttons, inputs, tabs, cards, and menu items.
- Sticky headers, drawers, and bottom bars do not obscure the focused element.

## Forms and auth

- Every input has a visible label or a durable accessible name.
- Helper text is short and connected to the field when it affects completion.
- Errors are shown in text and announced with `role="alert"` when they are inserted after submit.
- Success or loading states that do not move focus use `role="status"` or `aria-live="polite"`.
- Buttons inside forms set `type="button"` or `type="submit"` explicitly.
- Password rules in the UI match Supabase Auth configuration.

## Studio and modals

- Modal dialogs have a title, close affordance, initial focus, Escape behavior, and focus restoration.
- Tab order follows the visual workflow.
- Command bars and composers do not trap focus unless they intentionally open a dialog.
- Cards that behave as buttons are real buttons or links.
- Disabled controls explain why the action is unavailable when that is not obvious.

## Empty states

- Empty states are truthful and describe the missing setup.
- Empty states include one clear next action.
- Empty states do not show seeded customer names, fake contact details, or invented progress.

## Touch and mobile

- Primary tap targets are comfortably sized and spaced.
- Mobile bottom actions do not hide content or focused controls.
- Long headings wrap cleanly without overlap.
- Copy is shorter on mobile than desktop when space is tight.

## Native apps

- iOS supports Dynamic Type on all primary screens.
- iOS labels critical controls for VoiceOver.
- Android labels critical controls for TalkBack.
- Android and iOS use `Run`, `Train`, and `Create` consistently with web.
- Native rows should show real agent state, not universal readiness.

## Test gates

Required before merge:

- `npm run test:e2e` passes.
- Keyboard walk through `/signin`, `/signup`, `/studio`, and `/settings` is clean.
- Public route heading hierarchy is reviewed.
- Auth error messaging is reviewed with invalid credentials and weak-password attempts.
- Vercel preview route smoke passes on the final deployment.

## Manual keyboard script

1. Open `/signin`.
2. Use Tab from the top of the page.
3. Confirm skip link appears and jumps to main content.
4. Complete the form with invalid input.
5. Confirm the error is visible and announced.
6. Navigate to `/studio` after sign-in.
7. Open and close any modal or drawer.
8. Confirm focus returns to the trigger.
9. Navigate to `/settings`.
10. Confirm tabs, controls, and sign-out states remain reachable.
