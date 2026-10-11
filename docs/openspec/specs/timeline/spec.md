# Timeline

Code: `src/renderer.js` (state, `planPlacement`, `applyPlacement`, `normalizeTracks`, `startClipDrag`, `startTrim`, `splitAtPlayhead`, playback), `src/styles.css`.

### Requirement: Implicit tracks
The timeline SHALL have as many tracks as its clips need. Track 0 is V1 (bottom); higher tracks draw on top. Empty tracks SHALL disappear after any move or delete (`normalizeTracks`).

#### Scenario: Last clip leaves a track
- **WHEN** the only clip on V2 is moved to V1 or deleted
- **THEN** V2 no longer exists

### Requirement: Placement
A clip dropped so that it overlaps a clip on the target track SHALL go on a **new track directly above** that track. Dropping above all tracks or below V1 SHALL create a top or bottom track. Code SHALL use `planPlacement()` + `applyPlacement()` and never set `track` by hand.

#### Scenario: Drop onto another clip
- **WHEN** a clip is dropped on top of an existing clip on V1
- **THEN** it is placed on a new V2 above, and the old V2+ tracks shift up

### Requirement: Snapping
Clip starts and ends SHALL snap to other clips' edges, the playhead and 0 within 8 px.

### Requirement: Trim and split
Dragging a clip's edge SHALL trim only that edge and stop at neighbouring clips and source bounds (minimum clip length 0.1 s). `S` / Split SHALL cut the selected clip (or the top-most clip under the playhead) at the playhead.

### Requirement: Undo / redo
Every mutation SHALL be preceded by `commit()`. A continuous gesture (slider, drag) SHALL be one undo step (`beginEdit`/`endEdit`). Snapshots contain clips, texts and both selections.

### Requirement: Playback
The playhead is the master clock. The preview has one `<video>` per track, stacked in track order; each follows the clip under the playhead. Scrubbing and playback use `requestAnimationFrame`.

### Requirement: Text lane
When at least one text exists, a **T lane** SHALL be shown above the tracks (see `text/spec.md`). Track y-positions and drop zones account for its height (`laneH()`).
