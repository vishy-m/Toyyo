# Landing page: remove the grey slabs during scroll

Status: ready to build
Owner of the plan: design. Implementer: Codex.
Scope: the 3D stage on the landing page (`/`) in both modes, Guided tour and Summary, in light and dark themes.

## The problem

While scrolling the Guided tour, a flat grey rectangle with a hard top edge slides up over the car
(user screenshot, Nov 8: the lower half of the screen turns a darker grey and cuts the car's bumper
off in a straight line). It happens:

- at the start of the first three chapters (lease, driving, protection), while each chapter scrolls
  into view and before it pins;
- more faintly wherever a fade or band painted in the page colour sits over the 3D floor: the
  fades behind chapter copy, the band behind the "Every move, ranked" sheet and the band behind
  the Summary sheet.

## Why it happens

There are two causes, and they make each other worse.

1. **The canvas and the page disagree about the ground colour.** `components/stage/CarStage.tsx`
   paints its own scene background (`<color attach="background">`), adds fog in that colour, and
   draws a large reflective floor (`MeshReflectorMaterial`) that the studio lights brighten. The lit
   floor renders around `#ebebe8` in light mode, while the page ground in CSS is `--bg: #d9dad2`
   (Lunar Rock). Any HTML layer painted with `var(--bg)` over the canvas (fades, bands, the
   phone-width copy backdrop in `.story-copy`) therefore shows as a darker slab.
2. **The chapter fades are attached to sections that move.** In `components/story/Story.tsx`, each
   `Chapter` puts its copy fade (`bg-gradient-to-l/-r from-[var(--bg)]`) inside the sticky frame.
   While the chapter's section scrolls up into view, that fade travels with it. Its fully opaque
   side has a hard top edge, which is the slab in the screenshot.

## Design decisions

1. **CSS owns the ground colour; the canvas is a transparent layer.** The page shows exactly one
   ground colour, `var(--bg)`, everywhere. The canvas draws only the car, its contact shadow and the
   callout anchor. It never paints a background, a floor plane or fog. This is how product pages
   that sit a product on a flat page colour work: the object casts a soft shadow on the page itself.
2. **No floor reflection.** It produced the "ghost car" under the model in light mode and is the main
   source of the floor/page mismatch. A soft contact shadow is enough grounding.
3. **Fades only exist while their chapter is pinned.** A chapter's copy fade is invisible while the
   chapter scrolls in, fades in over the first few percent of its pinned scroll, and fades out
   over the last few percent. Nothing with a hard edge ever moves across the car.
4. **Same treatment in both themes.** Dark mode follows the same rules. The lit showroom-floor pool
   in dark mode goes away with the floor plane; that is accepted.

## Changes, by file

### `components/stage/CarStage.tsx`

- Canvas: `gl={{ antialias: true, alpha: true, premultipliedAlpha: true, powerPreference: "high-performance" }}`,
  and set the clear colour to fully transparent on create (`gl.setClearColor(0x000000, 0)`).
- Remove `<color attach="background" … />` and `<fog attach="fog" … />`, and remove the per-frame
  fog update block in `useFrame` (the `const fog = state.scene.fog …` section).
- Remove the reflective floor mesh (`<mesh …><circleGeometry …/><MeshReflectorMaterial …/></mesh>`)
  and the `MeshReflectorMaterial` import.
- Keep `<ContactShadows>`; raise `scale` to 14 and keep `frames={Infinity}` (the car moves). Use
  opacity 0.45 in light and 0.7 in dark, `blur` 2.4, `far` 2.6.
- Add a shadow catcher so the directional light's shadow still lands on the page: a
  `<mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>` with `<planeGeometry args={[40, 40]} />` and
  `<shadowMaterial transparent opacity={…} />` (0.12 light, 0.3 dark). If it shows a visible edge at
  any shot in the shot list below, remove it and rely on `ContactShadows` alone.
- The wrapper `div` that holds the canvas: its background becomes `var(--bg)` (not `pal.bg`), so the
  page colour is the only ground. Remove `bg`, `floor`, `reflect`, `floorEnv`, `fogNear`, `fogFar`
  from `PALETTE`; keep `exposure` and add `shadow`/`catcher` opacities per theme.
- Keep everything else as it is: the director, pose easing, turntable, drag, parallax, persona
  drive-off and roll-in, upgrade preview, callout projection, the `active` fade on other pages and
  the copilot shift.

### `components/story/Story.tsx`

- `Chapter`: drive the copy fade's opacity from the chapter's scroll progress (the `progress`
  motion value returned by `useScrollShot`) with
  `useTransform(progress, [0, 0.05, 0.95, 1], [0, 1, 1, 0])`, rendered as a `motion.div`. Under
  reduced motion keep it at 1 while pinned (the same mapping is fine, as scroll still drives it).
- Keep the fade's gradient stops (`from-[var(--bg)] from-[34%] to-transparent to-[58%]`) and its
  `lg:block` visibility.
- The two full-width bands (behind "Every move, ranked" in the tour, and behind the Summary sheet)
  keep `bg-[var(--bg)]` and their `before:` gradient. With decision 1 they now match the page
  exactly, so they need no other change. Do not add new bands.

### `app/globals.css`

- No token changes. `.story-copy` (phone-width copy backdrop) already uses `var(--bg)` and is
  correct once the canvas is transparent. Leave it.

## Out of scope

Do not change camera shots in `lib/client/director.ts`, copy, layout, the Summary/tour switch, other
pages, or the dashboard components. Do not add dependencies.

## Acceptance

Check each of these in light and in dark (toggle with the moon/sun button in the top bar), at
1440×900 and at 390×844:

1. Guided tour, scrolling slowly from the top to the end of the page: at no point does a rectangle,
   band or hard horizontal edge of a different grey appear over or around the car.
2. The page ground directly beside the car is the same colour as the ground under the header and
   behind the sheets (sample pixels: they should match `--bg`, `#d9dad2` light, `#16181a` dark,
   within 2 levels per channel).
3. The car still has a soft shadow under it and does not float.
4. No ghost reflection under the car.
5. Chapter copy stays readable where a close-up puts the car behind it (the fade is visible while
   the chapter is pinned).
6. Summary mode: the car stands still beside the headline and the sheet slides up over it with no
   slab or seam.
7. Moving to another page still fades the stage out; coming back fades it in.
8. `npx tsc --noEmit`, `npx eslint app components lib` and `npx vitest run` all pass.
