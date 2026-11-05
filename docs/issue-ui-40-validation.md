# Issue #40 — Issue UI correction verification

This checklist is for the dedicated `fix/issue-ui-40` pull request. It does **not** claim browser or production acceptance. The independent Reviewer, Designer and Lead check the latest pull request Head separately.

## Scope versus Product Interface Designer findings

| Finding | Intended change | Evidence / limit |
| --- | --- | --- |
| P1-01 | Scope legacy `header`, `ul`, `li`, `li a`, `p`, `button` and `select` CSS under `.shell`. Issue lists and header use their own CSS Module. | Source audit, TypeScript/Vite build; visual confirmation pending. |
| P1-02 | Display most recent **unconflicted** valid Labour Record outcome and author; show **current Issue-only** registered subjective hours immediately below title and before the body. Qualify partial data, and show a truthful empty state. | Pure View fixture rendering and existing §9.4 tests. |
| P1-03 | Give both tabs and tabpanels linked IDs, `aria-controls`, `aria-labelledby`, `aria-selected`, roving tabIndex, ArrowLeft/ArrowRight/Home/End keyboard handling and focus-visible outlines. | Static/SSR verification; actual keyboard behavior requires browser follow-up. |
| P1-04 | Both forms show near-button OAuth/permission reasons, login/reauthorize links and submission feedback; preserve draft on failed request. Only the Controller submits via the existing OAuth-backed service. | Pure View props test; existing API tests; browser form test pending. |
| P1-05 | Use responsive one-column summary at 600px and full-width form controls on narrow viewports; allow long text/URLs/SHA to wrap, keep visible focus and minimum 44px button height. | CSS source review and non-browser contrast calculations only. Width/zoom/keyboard/screenshots still pending. |
| P2-01 | Add explicit `刷新 Issue 与评论`; show comment count, last server read time, GitHub update time, partial pagination and retry messages near their source. | SSR props test and controlled Playground fixture steps. |

## Architecture and unchanged business boundaries

- `IssueDetailPage.tsx` is the **Controller**: route inputs, request cancellation/stale response protection, OAuth verification, Issue/config/comment reads, paging, refresh, domain summary, exact GitHub comment submission and message state. It creates the typed presentation model and callbacks.
- `view-model.ts` contains only display types and callback signatures. No dependency on React Router, Cordis or GitHub service.
- `IssueDetailView.tsx` renders the typed model; only tab selection, focus and JSX/UI markup live there. It cannot import Service, Cordis, Router, API or Labour parser, and it performs no network call. Private Discussion/Labour subviews avoid unnecessary feature plugins.
- `IssueDetailView.module.css` contains only Issue presentation styles. The legacy Playground layout remains under `.shell`.
- Unchanged: URL semantics, OAuth user-write authorization, existing Vercel Functions, original GitHub data contract, Labour Record §9.4 and 0.5h precision, plugin registration and router. No added dependency or CI workflow change.

## Existing automated checks

On the PR latest Head, GitHub's existing `CI / Build & test` runs:

```sh
npm install --no-audit --no-fund
npm run build
npm run test:installation
node --test tests/router-fallback.test.mjs
```

New `tests/issue-view.test.mjs` is included via the existing Installation test entry file. It checks the import boundary and pure SSR output of the View using typed fixture props **without any BrowserRouter or Cordis context**. Existing Issue API and Labour Record tests continue to run. Do not treat SSR output tests as keyboard or responsive browser measurements.

## Local controlled Playground manual procedure (not yet recorded as executed)

Run `npm run dev`, then open `/__issue-fixture?issueFixture=1` and use only the in-memory fixture. No real OAuth or GitHub write occurs.

1. Open `/sample/repo/issues/1?issueFixture=1`. Verify title → current Issue labour summary with recent outcome/author → body → discussion tabs. Outcome from the known valid record and partial hours must be qualified because the fixture has an invalid labour candidate. Confirm discussion/records remain in natural vertical flow.
2. Keyboard: focus selected Discussion tab. Press ArrowRight, ArrowLeft, Home, End; check selection/focus and the visible matching panel. Tab moves to panel content and form. Check focus-visible outlines. Confirm one tab is in the sequential Tab focus order.
3. Anonymous fixture: both comment and Labour forms disable submit with visible near-button reason and GitHub login link. For simulated authorized fixture, open `/__issue-fixture?issueFixture=1&fixtureAuth=1`, then issue #1 carrying both query parameters. Confirm valid inputs can submit to in-memory API only. Include `FAIL_POST` in comment to simulate 403 and verify the comment draft and local error are retained. Do **not** use real GitHub credentials.
4. Use `/sample/repo/issues/9?issueFixture=1`: first page 100/102 and incomplete; next page 102/102. Confirm refresh loads current Issue and related comments again, and labels the last server read time (not realtime).
5. Error fixtures #5 (429), #6 (502), #7 (403), #8 (404), #3 (PR) and #4 (invalid channel). Confirm error and retry context; refresh/back/forward preserve URL.
6. Check root `/` remains the original RepoPanel demo. Inspect the Issue page at 320px, 375px, 768px and desktop width, plus 200% zoom: look for overflow, long links and SHA wraps, correct vertical list flow, reachable forms, contrast and keyboard focus. Actual outcomes, viewport details, screenshots and browser identity must be recorded by the person running these checks.

## Outstanding acceptance

The current sandbox cannot fully check out GitHub and install npm packages for a local browser session; **no successful live Playground browser run, screenshots or Vercel check is claimed here**. Designer should perform design consistency review of the exact changed PR Head. Code Reviewer should check Control/View separation and regressions. Lead checks CI for that Head and decides on merge. Real Vercel online acceptance is reserved for human verification after merge to `main`.
