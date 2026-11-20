# Gameplay HUD layout

The normal top-right HUD has one current-language button that toggles BG/EN. Four actions remain available through the existing bottom-center cycling control, which displays the matching accepted action-cursor vector icon beside its localized label.

Inventory item hover and keyboard focus show no name labels, custom tooltips or native browser title tooltips. Keep localized `aria-label` names for assistive technology. Item details remain available through View.

The transparent gap in the top bar passes pointer events through to scenery, including the apartment lamp. Menu and language button groups retain pointer input.

The bottom-right inventory always shows three slots collapsed, including empty slots. Its labeled toggle expands upward to a three-column, three-row viewport. Further items scroll vertically; empty cells pad the final row. Selection, language changes and item actions retain expanded scroll position. Existing View/Use, bounded Blender inspection, item cursor, menu, meters, quest and save behavior remain independent.

Reuse exact accepted frame-zero artwork as assets/ui/action-cursors/icons/{look,talk,use,take}.svg (LOOK-A, SPEAK-A, USE-I, TAKE-A). No new artwork or collectible models. Local layout review does not authorize publication.

Owner-selected R60 option4 uses the small low curved tab joined to the inventory's upper-right corner, with an upward chevron collapsed and downward chevron expanded. Keep the joined fill beneath the tab free of a dividing border. All inventory thumbnail images have six pixels of inset spacing, independent of item-use cursor and inspection sizes.

Owner-selected R62 option3 replaces the large item menu with exactly two wide rounded ears: left View (LOOK-A eye), right Use (USE-I gear), with no visible labels, Drop, Close or self-use button. They slide from behind the stationary selected slot in150ms and retract under it on outside click; reduced-motion uses an immediate reveal. Retain localized accessible button names and existing 3D inspection. Keep controls visible at both edge columns and anchored during scrolling. Use selects the item cursor; clicking Mitko with it performs the existing self-use behavior, without adding another menu option. Preserve legacy dropped-item saves and recovery even though the inventory no longer offers Drop.

Keep the complete original item frame and highlight on every side, including when selected and during ear retraction. Remove only the additional inner vertical edge of each ear (left ear's right border, right ear's left border), which otherwise shows through inside the item field. Static action and ear icons use the shared vector source; animated world cursors retain their accepted atlases.

All inventory and received-item views show only the item name, native 3D object and item commentary. Keep shared bounded drag/zoom/Home controls without visible instructions or action buttons. Click outside the object viewer to dismiss, consuming that click; a drag starting inside must never dismiss or activate the scene. Escape also closes. Apply the same behavior to future collectible items. The painted tavern sign remains in the scene: Look gives Mitko commentary, without another menu window.
