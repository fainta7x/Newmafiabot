# Game audio v1

## Personal judge playlists

- Playlist owner is the authenticated player.
- Available only for `judge_level = host | judge`.
- Maximum 10 tracks per player.
- Tracks can be uploaded, previewed, reordered and deleted.
- Audio is private: metadata and bytes are served only to the owner.

## Club/test game start

For managed club and safe test games, role dealing is the first stage of the live engine rather than a separate duplicate setup screen.

Before dealing, the host chooses two tracks from the personal playlist:

1. one track for physical role dealing;
2. one track for mafia agreement and all regular nights.

Either slot can explicitly be set to no music. The choice belongs to the current browser live-game session and is isolated by the test-game sandbox.

## Physical role dealing

Physical cards are the source of truth. The app never randomizes or reveals the role for this flow.

The host prepares ten cards: 6 citizens, 1 sheriff, 2 mafia and 1 don. Players draw cards blindly. The host records the real result seat by seat. The UI prevents an impossible deck composition and requires all ten roles before completion.

In managed club/test games, completing the tenth role advances directly into zero night / mafia agreement. Tournament and legacy setup behavior stays separate.

## Playback automation

One global audio controller owns playback. This keeps music independent from protocol state mutations.

The role-deal track starts from the explicit user gesture that begins physical dealing. The agreement/night track starts automatically while the mafia-agreement timer is running and during regular `night` phases. It does not keep playing merely because another zero-night subphase is open.

Selected per-game tracks loop themselves instead of randomly moving through the playlist. Playback fades in to normal volume and fades out before stopping, so phase transitions do not cut the track abruptly.

Music stops after role dealing, after mafia agreement, and during day phases. The controller only follows live-phase state while a live game engine is actually mounted, so stale localStorage sessions do not start music by themselves.

If browser/WebView autoplay protection blocks a later automatic start, the controller displays one explicit `Включить музыку` action.

## Next audio block

Speech recording, Replay audio and live WebRTC audio are intentionally separate from this v1 and can be added without changing the role-deal/music storage model.
