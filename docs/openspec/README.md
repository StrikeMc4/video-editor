# OpenSpec

Spec-driven record of the project, in the [OpenSpec](https://github.com/Fission-AI/OpenSpec) layout.

```
docs/openspec/
├── specs/                     Current behaviour, one folder per capability (source of truth)
│   ├── timeline/spec.md       tracks, placement, snapping, trim, split, undo, playback
│   ├── transform/spec.md      move / resize / rotate a clip in the preview
│   ├── filters/spec.md        filter presets and brightness/contrast/saturation
│   ├── transitions/spec.md    transitions between butted clips
│   ├── effects/spec.md        built-in overlay effects, screen blend, sound / mute
│   ├── text/spec.md           text overlays: sidebar, preview, timeline lane
│   └── export/spec.md         MP4 export and preview/export parity
└── changes/
    └── archive/               Finished changes, oldest first (NNN-name/)
        ├── 001-initial-editor/
        ├── 002-builtin-effects/
        └── 003-text-overlays/
```

## Rules for agents

1. **Before changing an area**, read its `specs/<area>/spec.md`.
2. **After finishing a change**, do both:
   - update the affected `spec.md` so it describes the app *as it is now*;
   - add `changes/archive/NNN-short-name/` (next number) with `proposal.md` (why, what, impact) and `tasks.md` (checklist of what was done). Add `design.md` only if there was a non-obvious decision.
3. A change that touches user-visible behaviour also updates `VIDEDIT.md`; one that moves or adds files also updates the file table in `README.md`.
4. Spec format: `### Requirement:` with a SHALL sentence, then `#### Scenario:` with **WHEN / THEN**. Keep each requirement testable.
