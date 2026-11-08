# Toyyo branding verification

Branch: `codex/toyyo-branding`. No commit or push performed. Preview: http://127.0.0.1:3001/ (production build left running).

## Changes and placements

The supplied horizontal mark appears in the navbar, desktop/tablet landing introduction and footer. The badge appears in the sponsor header, favicon/app icons and Open Graph social image. A transparent cutout of the supplied mascot appears beside the landing introduction, in the assistant header/launcher, empty recommendations and dashboard/replay/thinking loading states. Phone landing pages omit the extra introduction to keep the vehicle and main decision clear. Next Image provides responsive web assets; originals are untouched.

Reusable exports: ToyyoLogo, ToyyoMascot, ToyyoAssistantAvatar, ToyyoLoadingState. The agent prompt change is its product name only. Engine math, datasets, policy/ranking, API contracts, provider settings, stores, simulations and package/lockfile have no diff.

## Executed verification

- Standalone TypeScript: PASS; final Next production build also passes TypeScript.
- ESLint: PASS after final responsive adjustment.
- Existing Vitest suite: eight files / 109 tests PASS.
- Production build: PASS, 18 generated static pages; final social-image metadata warning resolved. Two preexisting generic API prerender logs persist, as in the baseline.
- git diff --check: PASS. Impeccable mechanical detector: no findings for scanned branding/UI targets.
- Browser: 1440×900 desktop light/dark; 375×812 phone light/dark; 768×1024 intermediate viewport. No horizontal page overflow in evaluated widths. Desktop panel and phone assistant sheet open/close; Toyyo labels, accessible names, image loading and page titles verified.
- Browser-rendered routes inspected: overview, moves, finances, driving, repair, TFS and lab. Moves screenshot includes loaded ranked choices.
- HTTP smoke: all seven page routes, favicon, app/Apple icons, social image and three WebP branding assets return 200; response details in http-smoke.json.
- DOM confirms branded icons/social metadata and visible logos loaded, with no previous customer-facing application names on the landing page.
- New loading animation is restricted to prefers-reduced-motion:no-preference; inspected CSS rule in the rendered page. No OS-wide motion setting changed.
- Browser console: no new branding error observed; existing THREE.Clock deprecation warning remains.

## Limits / existing issues

No branding blocker observed in tested views. Existing sponsor /api/tfs static-cache issue, preexisting financial wording concerns and model/library limitations remain outside this branding change; see FEATURE_GAP_ANALYSIS.md. This is browser QA and existing-suite verification, not a newly added automated Playwright suite or accessibility certification. New loading/empty states are simple presentational conditions; the natural dashboard loading state was observed, but every possible empty-data sequence was not exercised.

Set NEXT_PUBLIC_APP_URL to the eventual public domain when the existing deployment owner deploys. No remote deployment or messages were sent. Recommended next step: teammate visual review, then an ownership-coordinated branding commit/PR when requested.

## All modified tracked files

- `app/(dashboard)/driving/page.tsx`
- `app/(dashboard)/finances/page.tsx`
- `app/(dashboard)/moves/page.tsx`
- `app/(dashboard)/repair/page.tsx`
- `app/favicon.ico`
- `app/globals.css`
- `app/lab/page.tsx`
- `app/layout.tsx`
- `app/tfs/TfsView.tsx`
- `app/tfs/page.tsx`
- `components/agent/AgentPanel.tsx`
- `components/agent/Chat.tsx`
- `components/agent/RecommendationCard.tsx`
- `components/dashboard/AskButton.tsx`
- `components/dashboard/ConsentSheet.tsx`
- `components/dashboard/Footer.tsx`
- `components/dashboard/MoveDrawer.tsx`
- `components/dashboard/RideReplaySlot.tsx`
- `components/dashboard/TopBar.tsx`
- `components/story/Story.tsx`
- `lib/agent/prompt.ts`

## All new branding files

- `app/apple-icon.png`
- `app/icon.png`
- `app/loading.tsx`
- `app/opengraph-image.alt.txt`
- `app/opengraph-image.png`
- `components/branding/ToyyoLoadingState.tsx`
- `components/branding/ToyyoLogo.tsx`
- `components/branding/ToyyoMascot.tsx`
- `docs/TOYYO_BRAND_GUIDE.md`
- `docs/branding-qa/VERIFICATION.md`
- `docs/branding-qa/assistant-desktop-dark.jpg`
- `docs/branding-qa/assistant-mobile-light.jpg`
- `docs/branding-qa/http-smoke.json`
- `docs/branding-qa/landing-desktop-dark.jpg`
- `docs/branding-qa/landing-desktop-light.jpg`
- `docs/branding-qa/landing-mobile-dark.jpg`
- `docs/branding-qa/landing-mobile-light.jpg`
- `docs/branding-qa/moves-desktop-light.jpg`
- `public/branding/toyyo-badge.png`
- `public/branding/toyyo-badge.webp`
- `public/branding/toyyo-logo-horizontal.png`
- `public/branding/toyyo-logo-horizontal.webp`
- `public/branding/toyyo-mascot.png`
- `public/branding/toyyo-mascot.webp`

The five previously created *_UPDATED/API/gap planning documents were already untracked before this branding task and were preserved without edits.
