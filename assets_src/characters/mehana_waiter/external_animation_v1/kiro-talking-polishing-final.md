# Final Kiro talking animation — local runtime review

Owner selected `sprite--9px-frames-64-rows-8-cols-8.zip` as the final talking
animation and explicitly requested that Kiro continue facing the main character
throughout the conversation. Source approval is separate from runtime/publication.

Owner approved the actual local gameplay review ("appoved") on8October2026.
The candidate and listening pose are runtime-approved. Reviewed source, atlas,
PNG and26-file snapshot hashes are retained in `runtime-approval.json` in the
focused review folder. Owner subsequently
supplied422/422 full tests with zero failures/skips; both Windows file-symlink
permission fixtures passed. Runtime assets/code were hash-unchanged at verification.

Owner then approved the separate publication bundle ("appproved"): commit and
verify this task snapshot, push its feature branch, canonical PR, exact-head
green-CI merge, synchronize/verify the PC preview and remove only the named
merged task branch and task scratch. Sources, evidence and runtime assets stay
preserved. No VPS synchronization/service changes or generation are authorized.

Stable export identity: `kiro-talking-polishing-5s-web-final-12d548cd` while earlier
c08/c09 numbering awaits confirmation. No existing numbered candidate is renamed.
Requested5seconds; measured64frames ×73ms =4672ms. Original ZIP and JSON remain
unchanged; runtime atlas retains all64 frames, scaled339×1024 to170×512 per frame,
with fixed full-canvas registration and lossless WebP encoding.

The supplied source has downward-facing intro0..7 and return56..63. Active speech
uses facing frames8..55 at unchanged73ms timing, a3504ms loop, interpolating adjacent
frames including55→8. It starts at8 on every reply so a later line cannot reintroduce
the downward intro. This is runtime range selection/blending, not art regeneration
or a claim that the original five-second export stays facing left at every frame.

The exact closed-mouth, open-eyed frame8 is extracted to a PNG listening pose.
Hold it during choices, player lines and other-speaker intervals in Kiro's parent
conversation. Fade from the frozen last speaking composite over280ms; no further
mouth playback. Later reply blending140ms and entry/actual closure360ms are retained.
Ordinary polishing resumes only after actual conversation closure or cancellation.

The source includes a blink around26..28 despite the no-blinking prompt. This
approved final source is preserved as provided; no silent repair or new generation
is performed. The listening still itself is open-eyed and does not blink.

Missing speech art uses the independent still without late replay. Missing still
uses exact atlas frame8. If both facing assets are missing, the older idle/static
fallback cannot preserve facing. Pause/menu freezes clocks; scene/visibility and
gameplay interruptions discard/cancel playback. Original dialogue/effects and
reading-window durations are unchanged.

Earlier c07 exports/assets/records and historical runtime evidence remain preserved.
The current review index lives at
`extraFixes/10_Bar/kiro-talking-polishing-final/README.md` outside the game repo.
Publication, service changes, cleanup and any further generation remain separate.
