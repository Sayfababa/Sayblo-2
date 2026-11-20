# Grimlight

Dark-fantasy semi-idle ARPG for phone and PC (browser, installable as PWA). Working title.

```bash
npm install
npm run dev        # local dev server
npm run build      # type check + production build into dist/ (works from any sub-path)
npm test           # formula, content, save and simulation tests
npm run sim -- 60 1   # headless balancing run: 60 game minutes, seed 1
```

- Content: `src/content/*.json`
- Simulation (no graphics, fixed ticks): `src/sim/`
- Renderer (PixiJS): `src/render/`, HUD and menus: `src/ui/`
- Plan and decisions: `docs/ROADMAP.md`, art rules: `docs/assets.md`
- Sprites: `python3 tools/slice_sheets.py` cuts `assets/sheets/` into `public/sprites/`
