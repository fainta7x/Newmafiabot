# Game audio v1

## Personal judge playlists

- Playlist owner is the authenticated player.
- Available only for `judge_level = host | judge`.
- Maximum 10 tracks per player.
- Tracks can be uploaded, previewed, reordered and deleted.
- Audio is private: metadata and bytes are served only to the owner.

## Physical role dealing

Physical cards are the source of truth. The app never randomizes or reveals the role for this flow.

The host prepares ten cards: 6 citizens, 1 sheriff, 2 mafia and 1 don. Players draw cards blindly. The host records the real result seat by seat. The UI prevents an impossible deck composition and requires all ten roles before completion.

The same component is used in club-evening setup and tournament game setup.

## Playback automation

One global audio controller owns playback. This keeps music independent from protocol state mutations.

Music starts:

- from an explicit user gesture when physical role dealing begins;
- automatically during `zero_night`;
- automatically during regular `night` phases.

Music stops when role dealing ends/cancels and during day phases. The controller only follows live-phase state while a live game engine is actually mounted, so stale localStorage sessions do not start music by themselves.

If browser/WebView autoplay protection blocks a later automatic start, the controller displays one explicit `Включить музыку` action.

## Next audio block

Speech recording, Replay audio and live WebRTC audio are intentionally separate from this v1 and can be added without changing the role-deal/music storage model.
