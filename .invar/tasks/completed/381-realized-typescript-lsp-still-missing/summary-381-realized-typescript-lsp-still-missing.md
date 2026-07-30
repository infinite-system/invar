# Summary #381 — TS LSP outside the launch workspace

Landed d8526062 (branch 9647aa72), 35m. Cause: compiled binary lacked
bun's PATH augmentation — discovery found no server outside the launch
workspace. Fix: app-root node_modules/.bin added to discovery between
workspace-local and PATH. Driven on the real realized repo. #294's
"does not reproduce" verdict explained: source-mode fixture was green
while every packaged run was broken — fixture blind spot (family 5).
Landed over a starvation-class editor-smoke red under the narrow rule
(two-file lsp diff, ALL-PASS twice standalone).
