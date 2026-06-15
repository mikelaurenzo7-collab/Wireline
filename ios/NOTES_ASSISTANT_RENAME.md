# Assistant rename notes

Product copy now moves from Wingman to Assistant.

The existing Swift target names may remain temporarily until an Xcode compile
pass confirms a safe internal rename.

Completed on this branch:

- iOS README updated to Assistant language.
- Mobile device migration comment updated to Assistant language.
- README documents that billing remains read-only in-app and that Android is the
  next native client lane.

Remaining:

- Setup checklist refresh is blocked by the connector safety layer on this file.
- Schema migration pointer still needs the latest migration comment changed from
  0054 to 0058 after the migration file lands.
- Add migration 0058 for Android delivery support; the write was blocked by the
  connector safety layer when attempted from chat.
- Optional full internal Swift symbol rename after Xcode compile verification.

Execution rule:

Do not rename bundle identifiers, URL schemes, Keychain service names, or Swift
module names until the native app is generated and compiled in Xcode. Keep the
user-facing product name Assistant now; do the internal rename as a dedicated
native compile pass.
