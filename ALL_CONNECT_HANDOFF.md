# All Connect — first playable slice

**All Connect** is an original browser-playable 2D/2.5D social life-simulation map. It uses the interaction pattern of a LagosLife-style city game without copying LagosLife’s map, art, code, text, or visual identity.

## Included in this slice

- Light civic-map theme with pale districts, readable labels, white panels, and an electric-violet interaction accent
- Original connected city map with six activity locations:
  - The Nexus
  - Northline Market
  - Sunroom Gardens
  - Maker Row
  - Harbor Steps
  - Courtyard 9
- Clickable location markers with destination cards and activity buttons
- Violet route feedback and avatar movement
- Three simulated local residents on the map
- Drag-to-pan and scroll-to-zoom map controls
- Keyboard map panning with `WASD` or arrow keys
- Local player state for credits, energy, connections, experience, and status
- Local save file at `user://all_connect_save.json`
- Responsive layout that hides the story panel on narrow screens
- Custom All Connect loading shell and game-specific favicon

## Preview

Open the browser preview at:

<https://3000-iktjmbr1ko4n4eetlgxid-c5d6345f.us1.manus.computer/>

## Validation

- `npm run check` passes the All Connect boot, interaction, state update, local-save, and responsive-layout checks.
- Portable Godot export completed successfully.
- Native renderer review completed for the title screen and light city-map screen.
- Managed checkpoint: `80feada4dcf8865c36de11ae98702c7bac5da27c`

## Deliberate first-slice limits

The current version uses deterministic local residents and local persistence. It does not yet include real accounts, a remote database, live multiplayer, chat, payments, or a large quest/economy system. Those should be added as a separate product phase rather than implied by the local prototype.
