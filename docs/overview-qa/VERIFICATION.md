# Overview refinement verification

Preview: http://127.0.0.1:3001/. Branch: codex/toyyo-branding. No commits or pushes.

## Latest change scope

- components/story/Story.tsx: removed hero logo/mascot imports and placements; preserved tagline; separated intro, vehicle interaction slot and recommendation; added requested overview label; separated estimated advantage and deadline; retained CTA/upgrade-preview callbacks. Uses existing director API with layout framing offsets for the opener in Guided tour and Summary.
- app/globals.css: responsive hero grid, bounded heading scale, spacing and mobile CTA padding; removed unused introduction-logo class.
- docs/TOYYO_BRAND_GUIDE.md: updated logo/mascot placement guidance.
- docs/overview-qa: this report and screenshots.

Financial engines, profiles, ranking, API contracts/integrations, assistant functionality, navigation, vehicle renderer, director implementation and model loading logic were not changed. Other uncommitted files belong to the preceding branding task and were preserved.

## Verification executed

- ESLint PASS after final phone-spacing change.
- TypeScript standalone PASS; final production build TypeScript PASS.
- Existing Vitest: 8 files, 109 tests PASS.
- Final production build PASS (18 generated static pages). Two generic API prerender logs are unchanged from the preexisting baseline.
- git diff --check PASS. Impeccable mechanical scan found no issues in the changed Story/CSS targets.
- Browser at 1440×900, 1024×768, 768×1024 and 375×812: no horizontal page overflow. Desktop/landscape use two columns; portrait sizes put heading/summary, car, recommendation and buttons in that order.
- Phone CTAs are both 44px tall, occupy the same row and finish above the fixed assistant launcher; no CTA/widget overlap in the tested 375×812 view.
- Hero contains zero image elements: navbar logo and functional assistant mascot remain; no repeated hero logo or standalone character. Tagline preserved.
- Desktop Compare options opens the existing Lease end drawer; Why this move? opens the existing explanation drawer with matching values and assumptions. Both close normally.
- Summary and Guided tour both render the shared hero. A native horizontal drag over the existing vehicle interaction slot rotated the car; before/after captures saved. Rendering, automatic tour movement, model loading and drag handler implementation are unchanged.
- Dark desktop view inspected; light theme and original Guided tour selection restored afterward. No browser console errors observed in the final check.
- Maya still shows $1,288 (rounded from existing source $1,288.47), Jan 28 deadline, $389 lease payment and unchanged option details. The hero accurately calls the buyout metric estimated net advantage, rather than implying lifetime interest savings.

## Screenshots and comparison

- Before: ../branding-qa/landing-desktop-light.jpg and ../branding-qa/landing-mobile-light.jpg.
- After: desktop-light.jpg, desktop-dark.jpg, tablet-light.jpg, tablet-landscape.jpg and mobile-light.jpg.
- Interaction: car-before-drag.jpg, car-after-drag.jpg.

No new visual blocker observed in these views. Existing unrelated financial-copy/sponsor-cache limitations remain documented separately. No new dependencies or deployment changes.
