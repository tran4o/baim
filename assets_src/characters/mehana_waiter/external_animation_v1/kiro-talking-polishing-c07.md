# Kiro talking while polishing — c07

Current status: **runtime_review**, uncommitted local PC integration. Owner approved
the supplied source animation with "this worked, approved lets use it" on
8 October 2026. Actual gameplay review and publication remain separate.

Stable label: `kiro-talking-polishing-3s-web-c07`. The `3s` is the requested
duration, not the measured output. Original JSON specifies **36 × 56 ms =
2,016 ms**, full frames 339 × 1024, six columns, sheet 2034 × 6144, RGBA.

Original owner ZIP is stored unchanged under
`input/kiro-talking-polishing-3s-web-c07/sprite--9px-frames-36-rows-6-cols-6 (2).zip`.
SHA256: `7ebf67f9757702351e22e4dd84fac7c879868971102a71a19818c0b5ca42adb5`.
The original member names and JSON bytes are unchanged. Full source/derived
hashes and timing are in `animation-pilot.json`. Runtime is a per-frame Lanczos3
resize to 170 × 512 with lossless WebP encoding, native timing retained. This is
a derived asset, not an original website export.

## Generation and reference limitations

Manual Ludo **Edit Spritesheet** of the owner-preferred c03 motion. Last observed
model was Hydra; requested duration three seconds. Recommended edit text:

> Adjust only the head and gaze: turn slightly SCREEN-LEFT and lift the chin slightly. Keep both eyes visible, looking horizontally left, with a calm expression. Preserve all existing speaking and polishing motion and everything else.

The exact submitted text, final export-control state, result ID, billing and
uploaded reference identity were not independently captured. Do not infer those
facts from filenames or similar thumbnails. No API request or automatic retry
was made. c03 remains a separate motion baseline; c04, c05 and c06 retain their
rejections and original identities. Static references use separate p-series IDs.

## Integration contract

- NPC `npc.mehana_waiter`, layer `layer.mehana.waiter_idle`, Mehana only.
- Existing left727/top222/height265/z50 and counter layer remain unchanged.
- Speaking follows the existing `npcSpeechAnimationTime` reading window and
  matching NPC/line identity. It does not alter text, choices, effects, save
  state, audio or dialogue duration. This is generic speech, not phoneme sync.
- The initial conversation turn blends from the actual idle/swap pose over360ms
  with eased weights, rather than instantly changing to the listener frame. Later
  lines blend from the current listener-facing composite over140ms. At line end,
  the exact last speech composite is frozen and settles into the listening frame
  over280ms; the mouth loop does not continue. During active conversation Kiro holds pixel-extracted
  c07 frame0 (`kiro-listening-c07-frame00-d01`), with mouth motion stopped.
  Ordinary polishing returns only when the conversation actually closes, blending
  from the current composite over360ms. Interrupted blends preserve their current
  weights/poses, without restarting at a different body position. All samples
  retain fixed registration and total opacity. Existing c07 source sway remains;
  no time stretching, body warping, repaint or new generation was performed.
- Choices, player lines and other-speaker intervals within Kiro's conversation
  retain that listening orientation. The next Kiro line resumes speech.
  Unrelated conversations do not engage Kiro. NPC bubbles use the same existing
  engine window and identity where applicable.
- Pause/menu freeze playback and blend clocks. Scene exit, hidden actor and
  development/action interruption cancel playback. No persistent queued work.
- Missing/evicted speech art holds the independent listening PNG. If only that
  PNG is missing, the renderer uses exact closed-mouth atlas frame0. If both are
  absent, existing idle/static fallback cannot retain the corrected gaze; this is
  a documented limitation. The same line cannot start late; a new line may attempt
  admission normally. The listening PNG's raw RGBA matches the runtime crop,
  including transparent pixels; no repaint, additional resize or AI edit.
- Sneaky swap scheduling and approved quiet timer semantics remain unchanged:
  dialogue cancels the occurrence; leaving dialogue starts a full fresh interval.

## Evidence and review

Local evidence root (outside this repository):
`C:/Users/SveBiS/Desktop/myStuff/2026_GitPro/extraFixes/10_Bar/kiro-talking-polishing-preparation/`.
Source inspection, owner approval, test results, gameplay media and the current
review index are retained there. Browser scratch lives at
`target/ludo-review/kiro-talking-polishing-c07/`; it is not approved for deletion.
No VPS changes, commit, push, PR, merge, publication or source cleanup is included.

Future workflow: label every result at first presentation; preserve identity and
track review separately. When existing motion is preferred, inspect supported
animation-edit controls before proposing generation from another still. Edits
can re-render motion; compare the actual full export instead of promising exact
preservation. Inspect source edges against contrasting backdrops before animating.

Future talking briefs must include listener-facing loop endpoints and a compatible
closed-mouth listening state through active conversation; no return to unrelated
idle orientation at line end. Ordinary idle starts only when conversation closes
or an explicit gameplay state cancels it. Do not incidentally rewrite prior NPC art.
