# Changelog

## [2.3.2](https://github.com/ahmedtawfeeq1/loredex/compare/loredex-v2.3.1...loredex-v2.3.2) (2026-07-12)


### Bug Fixes

* **plugin:** pin hooks to loredex@latest so pushes reach users automatically ([f0d960e](https://github.com/ahmedtawfeeq1/loredex/commit/f0d960e3dd532f99c511fe9ccc6d64a850d17a85))

## [2.3.1](https://github.com/ahmedtawfeeq1/loredex/compare/loredex-v2.3.0...loredex-v2.3.1) (2026-07-12)


### Bug Fixes

* **classify:** pin project to the registered root, not the LLM guess ([51c1f5f](https://github.com/ahmedtawfeeq1/loredex/commit/51c1f5fd92d6f207597c2adda7a5544004e5f9be))
* **cli:** list antigravity in --editor help + note auto-detect ([6cec446](https://github.com/ahmedtawfeeq1/loredex/commit/6cec4465fb670dd056c7c9dd36e314332bc8db82))

## [2.3.0](https://github.com/ahmedtawfeeq1/loredex/compare/loredex-v2.2.0...loredex-v2.3.0) (2026-07-11)


### Features

* route receipts + undo, never-route filing-scope globs (PR-3, epic4) — every route persists a reversible receipt under `.loredex/receipts/`; `undoRoute` restores byte-identical state (delete vault copies, restore sources); `executePlan` refuses sources matching `Config.neverRoute` globs at a single chokepoint (app + CLI honor it); exports `undoRoute`, `listReceipts`, `loadReceipt`, `RouteReceipt`, `RouteUndoError`, `matchNeverRoute`, `RouteScopeError`; `routeFile`/`executePlan` now return `receiptId`.

## [2.2.0](https://github.com/ahmedtawfeeq1/loredex/compare/loredex-v2.1.0...loredex-v2.2.0) (2026-07-10)


### Features

* handoff write APIs + frontmatter schema v2 (PR-11, epic7.story1) ([d92146d](https://github.com/ahmedtawfeeq1/loredex/commit/d92146da2e4aaa6ca76aed1e7ea7b487532b8e8a))
* previewRoute — read-only route plan (destination + planned frontmatter) ([7d7b9a6](https://github.com/ahmedtawfeeq1/loredex/commit/7d7b9a6f9bfb51aee5745e15a3839a6ad381604e))

## [2.1.0](https://github.com/ahmedtawfeeq1/loredex/compare/loredex-v2.0.0...loredex-v2.1.0) (2026-07-10)


### Features

* consumeHandoff + loredex_schema versioning (epic3.story3 / PR-2) ([928f13b](https://github.com/ahmedtawfeeq1/loredex/commit/928f13b5b2ae99262f44060ee72072c891f71bcb))
* injectable typed event emitter (PR-8 subset for epic1.story5) ([99a134d](https://github.com/ahmedtawfeeq1/loredex/commit/99a134d81b5860f2146b015e1041b3e6f6d8e2d3))
* listHandoffs(scope) + HandoffCard — one handoff collector (epic3.story1 / PR-1) ([e9e8601](https://github.com/ahmedtawfeeq1/loredex/commit/e9e8601e590c00dbca02ce4f970ac5bdffcc49cf))
* parseActivity + ActivityEvent — shared activity grammar (epic6.story1 / PR-6) ([95c04cc](https://github.com/ahmedtawfeeq1/loredex/commit/95c04cc18a71dd787574f83dcdd11d3c2f9ff879))
* read-only syncStatus() + SyncHealth (epic5.story1 / PR-4) ([d0dbfb6](https://github.com/ahmedtawfeeq1/loredex/commit/d0dbfb6e50b643ba542b77dd1e8c19e44f6b2a69))


### Bug Fixes

* valid gitattributes pattern for Start Here - Product.md + invocation-agnostic handoff footers ([c1fa833](https://github.com/ahmedtawfeeq1/loredex/commit/c1fa833e1e1ac50dad0128add3118e0362694f1a))

## [2.0.0](https://github.com/ahmedtawfeeq1/loredex/compare/loredex-v1.1.0...loredex-v2.0.0) (2026-07-09)


### Features

* generate _index/Dashboard.base — native Obsidian database dashboard ([e66462c](https://github.com/ahmedtawfeeq1/loredex/commit/e66462ccb4f4c485aa4550a64a7711f71e86471c))


### Miscellaneous Chores

* cut 2.0.0 — the ecosystem release ([1c93abf](https://github.com/ahmedtawfeeq1/loredex/commit/1c93abf2a18620990905b431874acb5d5a274ba4))

## [1.1.0](https://github.com/ahmedtawfeeq1/loredex/compare/loredex-v1.0.0...loredex-v1.1.0) (2026-07-07)


### Features

* order MOC topics by recency — newest activity first, date in heading ([d00199e](https://github.com/ahmedtawfeeq1/loredex/commit/d00199e969e3511f5cca54e0526b9b78675fd52f))


### Bug Fixes

* document routing lanes and forbid agent self-stamping loredex: routed ([84da0b5](https://github.com/ahmedtawfeeq1/loredex/commit/84da0b512c64571fa544bb2123210717e387e89a))

## [1.0.0](https://github.com/ahmedtawfeeq1/loredex/compare/loredex-v0.8.0...loredex-v1.0.0) (2026-07-05)


### Features

* conflict-free generated files for team vaults ([03943b4](https://github.com/ahmedtawfeeq1/loredex/commit/03943b4ad93b0ab2e412c070447c3e24e446c085))
* curate --product --refresh-stale — incremental map step ([f22bb71](https://github.com/ahmedtawfeeq1/loredex/commit/f22bb71b01914435567ff16b479b495e853ca917))
* curate --product — deterministic cross-project dashboard ([a7f9395](https://github.com/ahmedtawfeeq1/loredex/commit/a7f9395f93a4c746d19f57c4b77ef052c5ef7ab0))
* library entry point — embed loredex core in other hosts ([db264c4](https://github.com/ahmedtawfeeq1/loredex/commit/db264c43261148d1999ff3859a7c3103f9c7907f))
* LLM reduce step for curate --product — narrative, risks, duplicates ([6efc76d](https://github.com/ahmedtawfeeq1/loredex/commit/6efc76d3cb8b4031bfe03e6dbc4b754375c1bc54))
* MCP server — live vault access for any MCP agent ([24d41b4](https://github.com/ahmedtawfeeq1/loredex/commit/24d41b47bcdb06369bfc4b8bd566fb6d7ac0c916))
* portable source provenance — drift detection works on any teammate's machine ([d333569](https://github.com/ahmedtawfeeq1/loredex/commit/d333569524c176f2b73a64a737473234cf946dcc))
* SessionStart hook auto-surfaces open handoffs into session context ([e902461](https://github.com/ahmedtawfeeq1/loredex/commit/e902461292629de54fcb6df59d98cd090610961e))
* team handoffs + vault sync — cross-project flow for multi-repo products ([b467ab9](https://github.com/ahmedtawfeeq1/loredex/commit/b467ab9bcae02dd46ffdc2902f8e1e31869e421c))


### Bug Fixes

* realpath containment for vault_note — blocks traversal and symlink escapes ([140d0b0](https://github.com/ahmedtawfeeq1/loredex/commit/140d0b0362b0e2b17d6103380049504e9411b776))
* sanitize handoff frontmatter before injecting into session context ([daed4e7](https://github.com/ahmedtawfeeq1/loredex/commit/daed4e7d043879b06d3afac3c4b9a17afd5fccbc))
* scope ignoreDeprecations to tsup dts pass — IDE tsconfig stays valid for TS 5.x ([27e2606](https://github.com/ahmedtawfeeq1/loredex/commit/27e26062106e1bdeac054f0cec4a0c72b06bf3c2))


### Miscellaneous Chores

* cut 1.0.0 — CLI, Claude Code plugin, team vaults, product view, MCP server ([6d1b9d0](https://github.com/ahmedtawfeeq1/loredex/commit/6d1b9d0034accb9e610b20d53d4061cde585df01))

## [0.8.0](https://github.com/ahmedtawfeeq1/loredex/compare/loredex-v0.7.0...loredex-v0.8.0) (2026-07-04)


### Features

* add missing /loredex-route skill ([60b41ae](https://github.com/ahmedtawfeeq1/loredex/commit/60b41ae63f57a2bc31e0da1fd7db81969b04a0c2))
* split the monolithic skill into one per action ([9a7420c](https://github.com/ahmedtawfeeq1/loredex/commit/9a7420c2fc634eba4cb96cc0e24f960447320945))


### Bug Fixes

* watch crashes with EMFILE on real projects ([87a8f4d](https://github.com/ahmedtawfeeq1/loredex/commit/87a8f4d43b25dea5705a997d9cf80e8717026b70))

## [0.7.0](https://github.com/ahmedtawfeeq1/loredex/compare/loredex-v0.6.0...loredex-v0.7.0) (2026-07-04)


### Features

* orphan detection, git-based drift detection, Cursor governance hook ([d525c97](https://github.com/ahmedtawfeeq1/loredex/commit/d525c9706e3bc75159063b8b362cdad4cf8d3260))
* tiered digest in curate — bounds prompt size as vaults grow ([d8595d3](https://github.com/ahmedtawfeeq1/loredex/commit/d8595d35444ad2270b2f599fa234044162608fac))


### Bug Fixes

* every hint prints a copy-pasteable npx command ([87b7333](https://github.com/ahmedtawfeeq1/loredex/commit/87b7333fc1ae89b0416c8288827c9e615b55af9e))
* reject non-absolute source_path in drift detection ([fa0b518](https://github.com/ahmedtawfeeq1/loredex/commit/fa0b5188b1bf32823d4a9ab0c091d60e7cb2457e))

## [0.6.0](https://github.com/ahmedtawfeeq1/loredex/compare/loredex-v0.5.0...loredex-v0.6.0) (2026-07-04)


### Features

* auto-detect installed editors for code links ([0016c8b](https://github.com/ahmedtawfeeq1/loredex/commit/0016c8bb32bb646a313b066122addd46edc207b7))

## [0.5.0](https://github.com/ahmedtawfeeq1/loredex/compare/loredex-v0.4.0...loredex-v0.5.0) (2026-07-04)


### Features

* link provenance — vault notes stay wired to their origins ([100791b](https://github.com/ahmedtawfeeq1/loredex/commit/100791b7a594d1414d25dea1802b4ab64b6f7c31))

## [0.4.0](https://github.com/ahmedtawfeeq1/loredex/compare/loredex-v0.3.2...loredex-v0.4.0) (2026-07-03)


### Features

* live progress ticker + friendly Start Here brief names ([8e441ec](https://github.com/ahmedtawfeeq1/loredex/commit/8e441ec5a61d70310fa88ae05f3878cff54a1ac4))

## [0.3.2](https://github.com/ahmedtawfeeq1/loredex/compare/loredex-v0.3.1...loredex-v0.3.2) (2026-07-03)


### Bug Fixes

* republish with neutral README example names ([588c5a6](https://github.com/ahmedtawfeeq1/loredex/commit/588c5a6a4730f3d289d2ce28b4d6c14e40d077b8))

## [0.3.1](https://github.com/ahmedtawfeeq1/loredex/compare/loredex-v0.3.0...loredex-v0.3.1) (2026-07-03)


### Bug Fixes

* drop --bare from headless claude calls — it strips credentials ([c5badfa](https://github.com/ahmedtawfeeq1/loredex/commit/c5badfa003be8828d3def58e5609ebad6408773f))
* keep plugin version in sync with releases ([c2af48a](https://github.com/ahmedtawfeeq1/loredex/commit/c2af48ae6d173eca1afab5e515443be181c4d3df))

## [0.3.0](https://github.com/ahmedtawfeeq1/loredex/compare/loredex-v0.2.0...loredex-v0.3.0) (2026-07-03)


### Features

* loredex curate — objective-driven briefs, stale flags, semantic links ([122ee30](https://github.com/ahmedtawfeeq1/loredex/commit/122ee30759a53ee3d58950575cf911adfd9d5507))

## [0.2.0](https://github.com/ahmedtawfeeq1/loredex/compare/loredex-v0.1.0...loredex-v0.2.0) (2026-07-02)


### Features

* Claude Code plugin + self-hosted marketplace ([f10608e](https://github.com/ahmedtawfeeq1/loredex/commit/f10608eab1ed69a68f1a5db597289ffe42363b62))
* CLI — init, adopt, route, watch, status, doctor ([58f8d7e](https://github.com/ahmedtawfeeq1/loredex/commit/58f8d7e4fc685204f335da33c4ee759adf42ce23))
* vault engine — scan, classify, route, index, link ([b2b81e4](https://github.com/ahmedtawfeeq1/loredex/commit/b2b81e4ceed6f4ac572096a3c50605d9f130d362))
