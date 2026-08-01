# Summary #439 — what actually happened

Landed ed401644, 48m dispatch-to-landing, over the pre-existing #436 red.

- The user's cascade (close Displaced -> task terminals die, Database in
  Terminal) had ONE production cause: folderOpen launched before panel
  restore, and restore replaced the live groups. Fixed by ordering.
- Notices never persist; load sanitization drops legacy notice panes;
  Displaced report suppressed for labels the config redeclares.
- The builder REFUTED both of the conductor's probe findings (list
  auto-close, inert close control): the conductor's toggle click on an
  already-pinned list caused them. Pre-satisfied gesture; lesson in
  conductor family 1.
- Bycatch converted: #440 (panelListGeometry impossible coords), #441
  (contentIds/labels pairing drift).
- Left undone: #440, #441, and the #436 red itself.
