# Gameplay HUD layout

The normal top-right HUD has one current-language button that toggles BG/EN. Four actions remain available through the existing bottom-center cycling control, which displays the matching accepted action-cursor atlas icon beside its localized label.

The bottom-right inventory always shows three slots collapsed, including empty slots. Its labeled toggle expands upward to a three-column, three-row viewport. Further items scroll vertically; empty cells pad the final row. Selection, language changes and item actions retain expanded scroll position. Existing View/Use, bounded Blender inspection, item cursor, menu, meters, quest and save behavior remain independent.

Reuse assets/ui/action-cursors/{look,talk,use,take}.png first-frame artwork (LOOK-A, SPEAK-A, USE-I, TAKE-A). No new artwork or collectible models. Local layout review does not authorize publication.

Owner-selected R60 option4 uses the small low curved tab joined to the inventory's upper-right corner, with an upward chevron collapsed and downward chevron expanded. Keep the joined fill beneath the tab free of a dividing border. All inventory thumbnail images have six pixels of inset spacing, independent of item-use cursor and inspection sizes.

Owner-selected R62 option3 replaces the large item menu with exactly two wide rounded ears: left View (LOOK-A eye), right Use (USE-I gear), with no visible labels, Drop, Close or self-use button. They slide from behind the stationary selected slot in150ms and retract under it on outside click; reduced-motion uses an immediate reveal. Retain localized accessible button names and existing 3D inspection. Keep controls visible at both edge columns and anchored during scrolling. Use selects the item cursor; clicking Mitko with it performs the existing self-use behavior, without adding another menu option. Preserve legacy dropped-item saves and recovery even though the inventory no longer offers Drop.
