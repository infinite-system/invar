# READY — verify every UI contract citation, #253

State: READY
Branch: `fleet/253-ui-contract-systematic-citation-sweep`
Commit: `0cea59ba00f3967d465bcdd2f976bc94ba6e4895`
Subject: `contracts: verify UI citations and enforce root paths (#253)`
Files: 46
Tree: clean

## Scope

The sweep covered all 61 records in [src/modules/ui/ui.invariants.md](../../../../src/modules/ui/ui.invariants.md).
It inspected all 244 Scope, Mechanism, Evidence, and Verification fields.
Of these fields, 234 contain one or more code citations.

The sweep also covered [src/modules/ui/ui.lattice.md](../../../../src/modules/ui/ui.lattice.md).
The resolved lattice count stayed at 217 before and after the change.

The checker changed because it accepted file-relative contract paths.
That behavior contradicted the root-relative path convention.

## Result

The contract contains 993 backtick spans in the four inspected field kinds.
It contains 391 artifact path occurrences and 156 unique artifact paths.
Every unique path now exists and resolves to one tracked file.

The AST sweep checked 403 unique identifier-shaped candidates.
It found three stale code names in the contract:

- `renderWorkspaceTabBar` had no AST owner. It is now
  `TabBarRenderer.renderWorkspace`, with 4 AST matches.
- `renderBufferTabBar` had no AST owner. It is now
  `TabBarRenderer.renderBuffer`, with 5 AST matches.
- `ScrollbarSync.applyBarGeometry` had no AST owner. It is now
  `ScrollbarSync.applyBar`, with 5 AST matches.

The known dead verification path now names
`src/modules/keybindings/KeybindingRegistry.test.ts`.
The AST query found 53 `KeybindingRegistry` identifiers across code and tests.

The two `SelectableText` header claims now describe the current mechanism.
`EditorPane.visualRowsWindow` supplies folding-aware and wrapping-aware rows.
`setSelectionRange` writes `lastLocalSelection`, calls
`refreshLocalSelection()`, and requests a render.

The checker is now version `2.2.2`.
It rejects a contract path that resolves only beside the annotated file.
It reports the required root-relative replacement.

This rule exposed 86 short annotations across 43 code files.
The change migrated all 19 UI annotations and all 67 annotations in other modules.
The final checker resolved 1,027 annotations with zero problems.

## Citation census

Each row represents one citation-bearing contract field.
The line pointer identifies the exact field and all citations inside it.
The evidence count states how many backtick spans and artifact paths the field contains.

| Citation | Kind | Verdict | Evidence pointer |
| --- | --- | --- | --- |
| `ui.invariants.md:20` | Mechanism | valid | 12 spans, 0 paths, AST and existence |
| `ui.invariants.md:51` | Scope | valid | 3 spans, 0 paths, AST and existence |
| `ui.invariants.md:54` | Mechanism | valid | 1 spans, 0 paths, AST and existence |
| `ui.invariants.md:61` | Evidence | valid | 5 spans, 4 paths, AST and existence |
| `ui.invariants.md:67` | Verification | valid | 1 spans, 3 paths, AST and existence |
| `ui.invariants.md:80` | Scope | valid | 4 spans, 0 paths, AST and existence |
| `ui.invariants.md:83` | Mechanism | valid | 5 spans, 0 paths, AST and existence |
| `ui.invariants.md:90` | Evidence | valid | 6 spans, 6 paths, AST and existence |
| `ui.invariants.md:96` | Verification | valid | 1 spans, 3 paths, AST and existence |
| `ui.invariants.md:110` | Scope | valid | 4 spans, 0 paths, AST and existence |
| `ui.invariants.md:124` | Mechanism | valid | 14 spans, 1 paths, AST and existence |
| `ui.invariants.md:144` | Evidence | valid | 8 spans, 7 paths, AST and existence |
| `ui.invariants.md:158` | Verification | valid | 1 spans, 4 paths, AST and existence |
| `ui.invariants.md:173` | Scope | valid | 1 spans, 0 paths, AST and existence |
| `ui.invariants.md:176` | Mechanism | valid | 11 spans, 0 paths, AST and existence |
| `ui.invariants.md:195` | Evidence | valid | 4 spans, 4 paths, AST and existence |
| `ui.invariants.md:203` | Verification | valid | 1 spans, 2 paths, AST and existence |
| `ui.invariants.md:215` | Scope | valid | 2 spans, 0 paths, AST and existence |
| `ui.invariants.md:219` | Mechanism | valid | 3 spans, 0 paths, AST and existence |
| `ui.invariants.md:232` | Evidence | valid | 3 spans, 3 paths, AST and existence |
| `ui.invariants.md:241` | Verification | valid | 1 spans, 4 paths, AST and existence |
| `ui.invariants.md:255` | Scope | valid | 1 spans, 0 paths, AST and existence |
| `ui.invariants.md:259` | Mechanism | valid | 8 spans, 0 paths, AST and existence |
| `ui.invariants.md:274` | Evidence | valid | 4 spans, 4 paths, AST and existence |
| `ui.invariants.md:282` | Verification | valid | 1 spans, 3 paths, AST and existence |
| `ui.invariants.md:296` | Scope | valid | 3 spans, 0 paths, AST and existence |
| `ui.invariants.md:310` | Mechanism | valid | 12 spans, 0 paths, AST and existence |
| `ui.invariants.md:332` | Evidence | valid | 5 spans, 5 paths, AST and existence |
| `ui.invariants.md:341` | Verification | valid | 1 spans, 4 paths, AST and existence |
| `ui.invariants.md:355` | Scope | valid | 3 spans, 0 paths, AST and existence |
| `ui.invariants.md:359` | Mechanism | valid | 7 spans, 0 paths, AST and existence |
| `ui.invariants.md:372` | Evidence | valid | 6 spans, 6 paths, AST and existence |
| `ui.invariants.md:381` | Verification | valid | 1 spans, 3 paths, AST and existence |
| `ui.invariants.md:394` | Scope | valid | 4 spans, 0 paths, AST and existence |
| `ui.invariants.md:397` | Mechanism | valid | 10 spans, 0 paths, AST and existence |
| `ui.invariants.md:405` | Evidence | valid | 5 spans, 5 paths, AST and existence |
| `ui.invariants.md:412` | Verification | valid | 1 spans, 4 paths, AST and existence |
| `ui.invariants.md:426` | Scope | valid | 3 spans, 0 paths, AST and existence |
| `ui.invariants.md:430` | Mechanism | valid | 8 spans, 0 paths, AST and existence |
| `ui.invariants.md:439` | Evidence | valid | 7 spans, 7 paths, AST and existence |
| `ui.invariants.md:448` | Verification | valid | 1 spans, 5 paths, AST and existence |
| `ui.invariants.md:462` | Scope | valid | 3 spans, 0 paths, AST and existence |
| `ui.invariants.md:465` | Mechanism | valid | 8 spans, 0 paths, AST and existence |
| `ui.invariants.md:479` | Evidence | valid | 6 spans, 6 paths, AST and existence |
| `ui.invariants.md:488` | Verification | valid | 1 spans, 4 paths, AST and existence |
| `ui.invariants.md:503` | Scope | valid | 2 spans, 0 paths, AST and existence |
| `ui.invariants.md:505` | Mechanism | valid | 6 spans, 0 paths, AST and existence |
| `ui.invariants.md:517` | Evidence | valid | 7 spans, 4 paths, AST and existence |
| `ui.invariants.md:526` | Verification | valid | 2 spans, 3 paths, AST and existence |
| `ui.invariants.md:539` | Scope | valid | 3 spans, 0 paths, AST and existence |
| `ui.invariants.md:542` | Mechanism | valid | 5 spans, 0 paths, AST and existence |
| `ui.invariants.md:550` | Evidence | valid | 3 spans, 2 paths, AST and existence |
| `ui.invariants.md:557` | Verification | valid | 2 spans, 2 paths, AST and existence |
| `ui.invariants.md:570` | Scope | valid | 2 spans, 0 paths, AST and existence |
| `ui.invariants.md:578` | Mechanism | valid | 1 spans, 0 paths, AST and existence |
| `ui.invariants.md:585` | Evidence | valid | 6 spans, 6 paths, AST and existence |
| `ui.invariants.md:593` | Verification | valid | 1 spans, 2 paths, AST and existence |
| `ui.invariants.md:606` | Scope | valid | 1 spans, 0 paths, AST and existence |
| `ui.invariants.md:609` | Mechanism | valid | 4 spans, 0 paths, AST and existence |
| `ui.invariants.md:616` | Evidence | valid | 2 spans, 2 paths, AST and existence |
| `ui.invariants.md:621` | Verification | valid | 1 spans, 1 paths, AST and existence |
| `ui.invariants.md:633` | Scope | valid | 1 spans, 0 paths, AST and existence |
| `ui.invariants.md:640` | Mechanism | repaired | renderWorkspace=4, renderBuffer=5 |
| `ui.invariants.md:650` | Evidence | valid | 3 spans, 3 paths, AST and existence |
| `ui.invariants.md:658` | Verification | valid | 1 spans, 2 paths, AST and existence |
| `ui.invariants.md:670` | Scope | valid | 3 spans, 0 paths, AST and existence |
| `ui.invariants.md:673` | Mechanism | valid | 7 spans, 0 paths, AST and existence |
| `ui.invariants.md:681` | Evidence | valid | 6 spans, 6 paths, AST and existence |
| `ui.invariants.md:689` | Verification | valid | 1 spans, 1 paths, AST and existence |
| `ui.invariants.md:706` | Scope | valid | 5 spans, 0 paths, AST and existence |
| `ui.invariants.md:709` | Mechanism | valid | 1 spans, 0 paths, AST and existence |
| `ui.invariants.md:720` | Evidence | valid | 7 spans, 5 paths, AST and existence |
| `ui.invariants.md:731` | Verification | valid | 2 spans, 1 paths, AST and existence |
| `ui.invariants.md:746` | Scope | valid | 7 spans, 0 paths, AST and existence |
| `ui.invariants.md:750` | Mechanism | valid | 6 spans, 2 paths, AST and existence |
| `ui.invariants.md:758` | Evidence | valid | 5 spans, 5 paths, AST and existence |
| `ui.invariants.md:766` | Verification | repaired | test path exists, KeybindingRegistry=53 |
| `ui.invariants.md:778` | Scope | valid | 5 spans, 0 paths, AST and existence |
| `ui.invariants.md:783` | Mechanism | valid | 4 spans, 0 paths, AST and existence |
| `ui.invariants.md:794` | Evidence | valid | 4 spans, 4 paths, AST and existence |
| `ui.invariants.md:803` | Verification | valid | 1 spans, 2 paths, AST and existence |
| `ui.invariants.md:816` | Scope | valid | 2 spans, 0 paths, AST and existence |
| `ui.invariants.md:820` | Mechanism | valid | 6 spans, 0 paths, AST and existence |
| `ui.invariants.md:829` | Evidence | valid | 4 spans, 4 paths, AST and existence |
| `ui.invariants.md:837` | Verification | valid | 1 spans, 3 paths, AST and existence |
| `ui.invariants.md:851` | Scope | valid | 1 spans, 0 paths, AST and existence |
| `ui.invariants.md:862` | Mechanism | valid | 4 spans, 0 paths, AST and existence |
| `ui.invariants.md:871` | Evidence | valid | 7 spans, 7 paths, AST and existence |
| `ui.invariants.md:879` | Verification | valid | 1 spans, 4 paths, AST and existence |
| `ui.invariants.md:894` | Scope | valid | 1 spans, 0 paths, AST and existence |
| `ui.invariants.md:899` | Mechanism | valid | 2 spans, 0 paths, AST and existence |
| `ui.invariants.md:909` | Evidence | valid | 4 spans, 4 paths, AST and existence |
| `ui.invariants.md:916` | Verification | valid | 1 spans, 3 paths, AST and existence |
| `ui.invariants.md:931` | Scope | valid | 3 spans, 0 paths, AST and existence |
| `ui.invariants.md:935` | Mechanism | valid | 7 spans, 0 paths, AST and existence |
| `ui.invariants.md:945` | Evidence | valid | 4 spans, 3 paths, AST and existence |
| `ui.invariants.md:954` | Verification | valid | 1 spans, 2 paths, AST and existence |
| `ui.invariants.md:968` | Scope | valid | 3 spans, 0 paths, AST and existence |
| `ui.invariants.md:971` | Mechanism | valid | 3 spans, 0 paths, AST and existence |
| `ui.invariants.md:979` | Evidence | valid | 4 spans, 2 paths, AST and existence |
| `ui.invariants.md:1002` | Scope | valid | 4 spans, 0 paths, AST and existence |
| `ui.invariants.md:1005` | Mechanism | valid | 4 spans, 0 paths, AST and existence |
| `ui.invariants.md:1014` | Evidence | valid | 1 spans, 0 paths, AST and existence |
| `ui.invariants.md:1020` | Verification | valid | 2 spans, 2 paths, AST and existence |
| `ui.invariants.md:1039` | Scope | valid | 2 spans, 0 paths, AST and existence |
| `ui.invariants.md:1044` | Mechanism | valid | 7 spans, 0 paths, AST and existence |
| `ui.invariants.md:1083` | Evidence | valid | 5 spans, 3 paths, AST and existence |
| `ui.invariants.md:1100` | Verification | valid | 4 spans, 2 paths, AST and existence |
| `ui.invariants.md:1122` | Scope | valid | 5 spans, 0 paths, AST and existence |
| `ui.invariants.md:1127` | Mechanism | valid | 6 spans, 0 paths, AST and existence |
| `ui.invariants.md:1138` | Evidence | valid | 4 spans, 3 paths, AST and existence |
| `ui.invariants.md:1146` | Verification | valid | 1 spans, 2 paths, AST and existence |
| `ui.invariants.md:1172` | Mechanism | valid | 9 spans, 0 paths, AST and existence |
| `ui.invariants.md:1187` | Evidence | valid | 5 spans, 2 paths, AST and existence |
| `ui.invariants.md:1207` | Verification | valid | 4 spans, 2 paths, AST and existence |
| `ui.invariants.md:1223` | Scope | valid | 3 spans, 0 paths, AST and existence |
| `ui.invariants.md:1226` | Mechanism | valid | 6 spans, 0 paths, AST and existence |
| `ui.invariants.md:1238` | Evidence | valid | 2 spans, 2 paths, AST and existence |
| `ui.invariants.md:1248` | Verification | valid | 5 spans, 1 paths, AST and existence |
| `ui.invariants.md:1262` | Scope | valid | 3 spans, 0 paths, AST and existence |
| `ui.invariants.md:1265` | Mechanism | valid | 5 spans, 0 paths, AST and existence |
| `ui.invariants.md:1275` | Evidence | valid | 1 spans, 1 paths, AST and existence |
| `ui.invariants.md:1283` | Verification | valid | 3 spans, 0 paths, AST and existence |
| `ui.invariants.md:1300` | Scope | valid | 5 spans, 0 paths, AST and existence |
| `ui.invariants.md:1304` | Mechanism | valid | 14 spans, 0 paths, AST and existence |
| `ui.invariants.md:1316` | Evidence | valid | 2 spans, 2 paths, AST and existence |
| `ui.invariants.md:1325` | Verification | valid | 6 spans, 1 paths, AST and existence |
| `ui.invariants.md:1342` | Scope | valid | 2 spans, 0 paths, AST and existence |
| `ui.invariants.md:1347` | Mechanism | valid | 4 spans, 0 paths, AST and existence |
| `ui.invariants.md:1359` | Evidence | valid | 3 spans, 1 paths, AST and existence |
| `ui.invariants.md:1368` | Verification | valid | 2 spans, 1 paths, AST and existence |
| `ui.invariants.md:1381` | Scope | valid | 3 spans, 0 paths, AST and existence |
| `ui.invariants.md:1384` | Mechanism | valid | 4 spans, 0 paths, AST and existence |
| `ui.invariants.md:1391` | Evidence | valid | 5 spans, 5 paths, AST and existence |
| `ui.invariants.md:1398` | Verification | valid | 1 spans, 2 paths, AST and existence |
| `ui.invariants.md:1411` | Scope | valid | 3 spans, 0 paths, AST and existence |
| `ui.invariants.md:1414` | Mechanism | valid | 6 spans, 0 paths, AST and existence |
| `ui.invariants.md:1422` | Evidence | valid | 3 spans, 3 paths, AST and existence |
| `ui.invariants.md:1448` | Scope | valid | 2 spans, 0 paths, AST and existence |
| `ui.invariants.md:1453` | Mechanism | valid | 2 spans, 0 paths, AST and existence |
| `ui.invariants.md:1462` | Evidence | valid | 4 spans, 3 paths, AST and existence |
| `ui.invariants.md:1471` | Verification | valid | 2 spans, 2 paths, AST and existence |
| `ui.invariants.md:1484` | Scope | valid | 3 spans, 0 paths, AST and existence |
| `ui.invariants.md:1487` | Mechanism | valid | 7 spans, 0 paths, AST and existence |
| `ui.invariants.md:1502` | Evidence | valid | 7 spans, 4 paths, AST and existence |
| `ui.invariants.md:1515` | Verification | valid | 1 spans, 0 paths, AST and existence |
| `ui.invariants.md:1529` | Scope | valid | 3 spans, 0 paths, AST and existence |
| `ui.invariants.md:1532` | Mechanism | valid | 15 spans, 0 paths, AST and existence |
| `ui.invariants.md:1554` | Evidence | valid | 8 spans, 4 paths, AST and existence |
| `ui.invariants.md:1568` | Verification | valid | 4 spans, 1 paths, AST and existence |
| `ui.invariants.md:1590` | Mechanism | valid | 13 spans, 0 paths, AST and existence |
| `ui.invariants.md:1611` | Evidence | valid | 9 spans, 0 paths, AST and existence |
| `ui.invariants.md:1619` | Verification | valid | 6 spans, 3 paths, AST and existence |
| `ui.invariants.md:1640` | Mechanism | repaired | applyBar=5 |
| `ui.invariants.md:1649` | Evidence | valid | 4 spans, 4 paths, AST and existence |
| `ui.invariants.md:1659` | Verification | valid | 1 spans, 3 paths, AST and existence |
| `ui.invariants.md:1672` | Scope | valid | 5 spans, 0 paths, AST and existence |
| `ui.invariants.md:1676` | Mechanism | valid | 6 spans, 0 paths, AST and existence |
| `ui.invariants.md:1696` | Evidence | valid | 7 spans, 7 paths, AST and existence |
| `ui.invariants.md:1707` | Verification | valid | 1 spans, 4 paths, AST and existence |
| `ui.invariants.md:1722` | Scope | valid | 4 spans, 0 paths, AST and existence |
| `ui.invariants.md:1726` | Mechanism | valid | 6 spans, 1 paths, AST and existence |
| `ui.invariants.md:1742` | Evidence | valid | 5 spans, 3 paths, AST and existence |
| `ui.invariants.md:1755` | Verification | valid | 1 spans, 3 paths, AST and existence |
| `ui.invariants.md:1775` | Mechanism | valid | 12 spans, 0 paths, AST and existence |
| `ui.invariants.md:1786` | Evidence | valid | 8 spans, 8 paths, AST and existence |
| `ui.invariants.md:1798` | Verification | valid | 1 spans, 3 paths, AST and existence |
| `ui.invariants.md:1811` | Scope | valid | 3 spans, 0 paths, AST and existence |
| `ui.invariants.md:1816` | Mechanism | valid | 5 spans, 0 paths, AST and existence |
| `ui.invariants.md:1829` | Evidence | valid | 4 spans, 4 paths, AST and existence |
| `ui.invariants.md:1837` | Verification | valid | 1 spans, 2 paths, AST and existence |
| `ui.invariants.md:1852` | Mechanism | valid | 6 spans, 0 paths, AST and existence |
| `ui.invariants.md:1860` | Evidence | valid | 3 spans, 2 paths, AST and existence |
| `ui.invariants.md:1868` | Verification | valid | 1 spans, 1 paths, AST and existence |
| `ui.invariants.md:1883` | Scope | valid | 9 spans, 0 paths, AST and existence |
| `ui.invariants.md:1886` | Mechanism | valid | 8 spans, 0 paths, AST and existence |
| `ui.invariants.md:1895` | Evidence | valid | 7 spans, 2 paths, AST and existence |
| `ui.invariants.md:1904` | Verification | valid | 1 spans, 2 paths, AST and existence |
| `ui.invariants.md:1916` | Scope | valid | 2 spans, 0 paths, AST and existence |
| `ui.invariants.md:1919` | Mechanism | valid | 3 spans, 0 paths, AST and existence |
| `ui.invariants.md:1926` | Evidence | valid | 4 spans, 4 paths, AST and existence |
| `ui.invariants.md:1932` | Verification | valid | 1 spans, 1 paths, AST and existence |
| `ui.invariants.md:1944` | Scope | valid | 2 spans, 0 paths, AST and existence |
| `ui.invariants.md:1947` | Mechanism | valid | 7 spans, 0 paths, AST and existence |
| `ui.invariants.md:1957` | Evidence | valid | 3 spans, 3 paths, AST and existence |
| `ui.invariants.md:1964` | Verification | valid | 1 spans, 2 paths, AST and existence |
| `ui.invariants.md:1977` | Scope | valid | 5 spans, 0 paths, AST and existence |
| `ui.invariants.md:1980` | Mechanism | valid | 7 spans, 0 paths, AST and existence |
| `ui.invariants.md:1990` | Evidence | valid | 5 spans, 5 paths, AST and existence |
| `ui.invariants.md:1998` | Verification | valid | 1 spans, 2 paths, AST and existence |
| `ui.invariants.md:2011` | Scope | valid | 4 spans, 0 paths, AST and existence |
| `ui.invariants.md:2014` | Mechanism | valid | 5 spans, 0 paths, AST and existence |
| `ui.invariants.md:2023` | Evidence | valid | 2 spans, 2 paths, AST and existence |
| `ui.invariants.md:2031` | Verification | valid | 1 spans, 2 paths, AST and existence |
| `ui.invariants.md:2043` | Scope | valid | 5 spans, 0 paths, AST and existence |
| `ui.invariants.md:2047` | Mechanism | valid | 8 spans, 0 paths, AST and existence |
| `ui.invariants.md:2057` | Evidence | valid | 11 spans, 11 paths, AST and existence |
| `ui.invariants.md:2068` | Verification | valid | 1 spans, 5 paths, AST and existence |
| `ui.invariants.md:2084` | Scope | valid | 5 spans, 0 paths, AST and existence |
| `ui.invariants.md:2088` | Mechanism | valid | 9 spans, 0 paths, AST and existence |
| `ui.invariants.md:2101` | Evidence | valid | 5 spans, 4 paths, AST and existence |
| `ui.invariants.md:2112` | Verification | valid | 1 spans, 3 paths, AST and existence |
| `ui.invariants.md:2127` | Scope | valid | 11 spans, 0 paths, AST and existence |
| `ui.invariants.md:2131` | Mechanism | valid | 8 spans, 0 paths, AST and existence |
| `ui.invariants.md:2144` | Evidence | valid | 6 spans, 2 paths, AST and existence |
| `ui.invariants.md:2154` | Verification | valid | 1 spans, 2 paths, AST and existence |
| `ui.invariants.md:2169` | Scope | valid | 9 spans, 0 paths, AST and existence |
| `ui.invariants.md:2173` | Mechanism | valid | 16 spans, 0 paths, AST and existence |
| `ui.invariants.md:2184` | Evidence | valid | 3 spans, 2 paths, AST and existence |
| `ui.invariants.md:2192` | Verification | valid | 1 spans, 2 paths, AST and existence |
| `ui.invariants.md:2204` | Scope | valid | 6 spans, 0 paths, AST and existence |
| `ui.invariants.md:2209` | Mechanism | valid | 2 spans, 0 paths, AST and existence |
| `ui.invariants.md:2220` | Evidence | valid | 3 spans, 3 paths, AST and existence |
| `ui.invariants.md:2227` | Verification | valid | 1 spans, 2 paths, AST and existence |
| `ui.invariants.md:2242` | Scope | valid | 7 spans, 0 paths, AST and existence |
| `ui.invariants.md:2266` | Mechanism | valid | 6 spans, 0 paths, AST and existence |
| `ui.invariants.md:2280` | Evidence | valid | 7 spans, 7 paths, AST and existence |
| `ui.invariants.md:2289` | Verification | valid | 1 spans, 3 paths, AST and existence |
| `ui.invariants.md:2304` | Scope | valid | 3 spans, 0 paths, AST and existence |
| `ui.invariants.md:2309` | Mechanism | valid | 5 spans, 0 paths, AST and existence |
| `ui.invariants.md:2327` | Evidence | valid | 7 spans, 5 paths, AST and existence |
| `ui.invariants.md:2338` | Verification | valid | 1 spans, 4 paths, AST and existence |
| `ui.invariants.md:2353` | Scope | valid | 3 spans, 0 paths, AST and existence |
| `ui.invariants.md:2374` | Mechanism | valid | 11 spans, 0 paths, AST and existence |
| `ui.invariants.md:2390` | Evidence | valid | 6 spans, 6 paths, AST and existence |
| `ui.invariants.md:2398` | Verification | valid | 1 spans, 3 paths, AST and existence |
| `ui.invariants.md:2411` | Scope | valid | 5 spans, 0 paths, AST and existence |
| `ui.invariants.md:2432` | Mechanism | valid | 4 spans, 0 paths, AST and existence |
| `ui.invariants.md:2447` | Evidence | valid | 6 spans, 6 paths, AST and existence |
| `ui.invariants.md:2455` | Verification | valid | 1 spans, 4 paths, AST and existence |
| `ui.invariants.md:2470` | Scope | valid | 5 spans, 0 paths, AST and existence |
| `ui.invariants.md:2494` | Mechanism | valid | 10 spans, 0 paths, AST and existence |
| `ui.invariants.md:2509` | Evidence | valid | 6 spans, 6 paths, AST and existence |
| `ui.invariants.md:2517` | Verification | valid | 1 spans, 4 paths, AST and existence |

Summary by kind:

| Kind | Inspected fields | Citation-bearing fields | Backtick spans | Artifact paths |
| --- | ---: | ---: | ---: | ---: |
| Scope | 61 | 55 | 201 | 0 |
| Mechanism | 61 | 61 | 407 | 4 |
| Evidence | 61 | 60 | 296 | 243 |
| Verification | 61 | 58 | 89 | 144 |
| Total | 244 | 234 | 993 | 391 |

No citation was removed.

## Checker controls

The checker test suite has two arms.
The root-relative fixture passed.
The file-relative fixture failed and suggested `sub/demo.invariants.md`.
All 50 checker tests passed.

I also planted one short-form annotation in `ActivityBar.ts`.
The checker exited 1 and reported:

`src/modules/ui/ActivityBar.ts:17: contract path must be root-relative: ui.invariants.md (use src/modules/ui/ui.invariants.md)`

The control resolved 1,026 annotations and 217 lattice links with 1 problem.
I removed the plant before the final pass.

## Verification

`node --test .claude/skills/invariants/scripts/check_invariants.test.mjs`
passed all 50 tests.

`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`
resolved 1,027 annotations and 217 lattice links with 0 problems.

The final artifact census reported 156 unique paths and 0 problems.
The repaired AST queries reported 4, 5, and 5 matches.
`git diff --check` passed before commit.

The pre-commit formatter changed the staged bytes.
A post-commit validation reran all 50 checker tests.
It also resolved 1,027 annotations and 217 lattice links with 0 problems.

I did not run `scripts/merge-gate.sh`, as the brief required.
No app drive applies because this task changed contracts, comments, and checker rules.
No runtime behavior changed, so scale parity does not apply.

## Bycatch

- **Contract-layer gap:** [ui.invariants.md](../../../../src/modules/ui/ui.invariants.md) claims `src/modules/ui/` scope,
  but it contains 86 explicit path citations into 13 other modules.
  The modules are agent, app, commands, editor, filetree, git, keybindings,
  lsp, settings, system, terminal, theme, and workspace.
  This strengthens #241 (decide whether to split [ui.invariants.md](../../../../src/modules/ui/ui.invariants.md) along
  its five lattice families). I did not change the contract boundary.

