# Toyyo brand guide

Product name: **Toyyo**. Toyota Financial Services is the hackathon challenge sponsor; Toyyo is an independent synthetic-data prototype, not an official Toyota/TFS application. Preserve Toyota vehicle names, ToyotaCare and TFS references. Existing engineering documents and historical product names remain as references.

## Assets and provenance

| Asset | Location | Use |
|---|---|---|
| Horizontal logo | public/branding/toyyo-logo-horizontal.webp (+ PNG master export) | Navbar and footer |
| Badge | public/branding/toyyo-badge.webp (+ PNG export) | Sponsor header, icons, social card |
| Transparent mascot | public/branding/toyyo-mascot.webp (+ PNG export) | Assistant header/launcher, empty recommendations, loading/thinking |
| Browser icon | app/favicon.ico | 48px badge-derived favicon |
| App icon | app/icon.png | 512px badge on white |
| Apple icon | app/apple-icon.png | 180px badge on white |
| Social preview | app/opengraph-image.png and .alt.txt | 1200×630 badge presentation and text alternative |

Logo sources are the user's `ChatGPT Image Nov 8, 2026, 01_59_06 AM.png` (horizontal) and `01_59_21 AM.png` (badge). Export processing trims transparent margins, preserves proportions/colors, and creates resized PNG/WebP versions. No logo redrawing or color inversion. The supplied `Toyyo Tech Mascot with Racing Sash.png` received a transparent-background cutout via imagegen; retain the supplied character's pose, sash, headset and display. Original source files remain untouched in Downloads. PNG exports are retained for reuse; the UI loads optimized WebP with Next Image responsive sizing.

## Visual system

Keep the existing Overpass family, loaded with next/font, for both headings and body. Do not download Toyota Type or change the financial/chart typography. Retain the current light/dark neutral showroom surfaces, blue data color and semantic green/amber states.

Core identity colors: red #EB0A1E, black #000000, white #FFFFFF, neutral gray #58595B. The uploaded artwork contains its own shaded colors; preserve them. App surface/data shades are original project tokens, not an official Toyota palette. Red remains a restrained action/brand accent, not a replacement for every status color.

## Reusable components

| Component | API / role |
|---|---|
| ToyyoLogo | variant horizontal (default) or badge; optional className, decorative and preload; one asset-path authority |
| ToyyoMascot | size in pixels (default 72), className, decorative; full transparent character, object-contain |
| ToyyoAssistantAvatar | size (default 40), className; decorative identity beside labeled assistant controls |
| ToyyoLoadingState | label, compact and className; role=status with decorative mascot and visible text |

Components live in components/branding. Import directly, without a new context/provider or dependency. They do not own customer data, agent logic or state. Existing store keys, route names and API contracts retain their names for compatibility. The agent's identity sentence changes to Toyyo; provider configuration and safety instructions are unchanged.

## Sizing, placement and spacing

- Horizontal logo: navbar 116×40px, mobile 92×36px. A white backing and 4×6px internal padding preserve the dark wordmark in both themes. Never invert, recolor, stretch or crop the lettering.
- Badge: 36–40px in product chrome; larger exports for icons/social imagery. Use object-contain to preserve the slightly taller supplied badge silhouette inside square icon canvases.
- Mascot: 40px in assistant launch/header, 56px in an empty recommendation state, 40/72px in loading states. It supports the content; the vehicle and financial recommendation remain primary.
- Maintain at least 8px external clearance around the logo or mascot. Do not overlay currency, chart lines or text on the character. No continuous mascot animation outside waiting states.
- Header navigation keeps its current horizontally scrollable mobile row. Persona switching, consent, theme and TFS navigation retain their original controls. The brand mark stays visible at phone widths; assistant text may collapse while its labeled mascot button remains. The Overview hero has no repeated logo or standalone mascot. Its tagline remains; the vehicle and recommendation lead, while navbar and assistant retain the identity.

## Accessibility and motion

Use alt="Toyyo" for a standalone informative logo; use empty alt on artwork inside an already-labeled link/button or beside a visible assistant name. The standalone mascot defaults to “Toyyo, your automotive assistant”; redundant portraits are decorative. Every image reserves dimensions and uses object-contain. Loading text is visible and announced by role=status. Action names use “Toyyo assistant” instead of a generic product name.

Waiting states use a subtle 3px vertical movement only under prefers-reduced-motion:no-preference. Reduced-motion users see a static mascot. No flashing, pulsing glow, new parallax, or automatic sound. Keep existing keyboard/focus behavior and semantic status colors.

## Scope and review

This is an identity integration: existing 3D, financial engines, datasets, eligibility, API, state and simulation behavior are preserved. Do not infer real Toyota endorsement from symbols in the user-supplied artwork; keep the synthetic/non-affiliation notice visible. Historical planning docs are not rewritten with blind string replacement.

Before shipping, verify header, landing, comparison, assistant, footer and sponsor header in light/dark and at desktop/mobile widths. Check image requests, page titles/icons, loading/empty states and reduced-motion CSS; run lint, generated-route TypeScript, existing Vitest tests and production build. Known preexisting sponsor-cache and financial-label issues remain tracked in FEATURE_GAP_ANALYSIS.md and are outside this branding change.

Social preview URLs resolve against NEXT_PUBLIC_APP_URL when supplied, VERCEL_URL on Vercel, or http://127.0.0.1:3001 locally. Set the public application URL to the final domain in the existing deployment environment when deploying; no deployment was changed by this task.
