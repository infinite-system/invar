# ROUND 3 (dispatch ONLY if round 2 missed it) — third stale probe

`smoke: agent-permissions harness` also went hard red on the chrome-wave gate
(run 1327127), retried and failed again:

    Timed out waiting for grid condition:
    snapshot.findText("bypass permissions on") !== null

Cause is the same class as the other two: the footer previously contained the
literal text `bypass permissions on`; the reduction the user asked for shortened
it to `perm: bypass`. The probe matches a copy string that no longer exists.

This is chrome-wave-caused. It is NOT task #109's independent quiet-tail
intermittent, and the two must not be conflated: #109 is a race in the
permission-resolution path that reproduces on main, while this is a stale
literal in the probe. Fixing one does not fix the other.

Fix by locating the permission state through its semantic owner / published
status key rather than by rendered copy. Same rule as the other two: do not
re-key to the NEW string — that just reschedules the failure.
