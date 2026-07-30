# Summary #404 — panel chrome v2

Landed 17b89a64 (merge c951f48d), 95m, 3 spec messages + 1 merge round.
Full spec shipped: two-row chrome, container tabs with close/ellipsis,
full-width window groups with explicit split (never auto-split, never
nested tabs), Invar Agent composable inside terminal containers, pinned
resizable persistent pane list. Builder self-merged CURRENT main
(post-#409) without waiting for the stuck steer — correct behavior.
Bycatch: known flakes only. #405 (kind tables) should now be checked
against the redesigned PanelHost before dispatch.
