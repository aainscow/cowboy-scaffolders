# Cowboy Scaffolders

A 3D browser game about building scaffolding as cheaply as you dare.
Big Terry's rule: *as long as it doesn't fall down, it's fine.*

**Play:** https://aainscow.github.io/cowboy-scaffolders/

## How it plays

- **Design** the scaffold on the front of a house: tubes (standards, ledgers, braces), timber boards or steel deck, wall ties, ladders and ladder locks. Everything costs money; whatever you don't spend of the client's quote is profit.
- **It has to stand while it goes up.** The crew erects the pieces one at a time in *your* build order, and every half-built stage is physically simulated. Use the **Build order** tool or the order list to change the sequence.
- **Then Dave loads it.** He climbs the ladders carrying hods of bricks, pallets, pianos, a safe, a tonne of sand and a bronze elephant, and dumps them on the platform.
- **Then the chavs arrive.** They swing on low tubes and climb any unlocked ladder to spray-paint the house (£150 clean-up per tag). Lock the ladders and they'll rattle them, lose their temper and swing on anything they can reach (braces and standards included). Locks are optional: lay **trap boards** instead. A chav who drops 3.5 m or less through one lies there dazed until the police cart them off, and pays you a £100 reward. Drop one further and you get sued. Dave avoids trap boards when there's another way up.
- **Windows cost money.** Dumping 100 kg or more in front of a window puts a brick through it (£120 glazier). Board it up first for £35, or gamble. Windows in the firing line are marked in design mode.
- Collapses take the house with them: windows, gutters, pots and gnomes. Dave gets tangled in the tubes and ascends.

12 jobs, with tighter quotes, heavier loads and more chavs as you go. Stars for coming in well under the quote.

Controls:
- **Desktop:** click two dots to place a piece; hold and drag through dots to lay a chain of tubes. Drag empty space to pan, right-drag to orbit, wheel to zoom (or WASD/arrows and the on-screen pad). Ctrl+Z undoes.
- **Phone/tablet:** tap two dots to place a piece; hold and drag to chain. Two fingers to move the camera. Landscape works best.

## Code

Plain JavaScript + [three.js](https://threejs.org) (loaded from a CDN), no build tooling beyond a small Python bundler.

| Path | What |
| --- | --- |
| `src/engine.js` | 2D XPBD structural sim (members, semi-rigid couplers, base plates, ties, buckling, board capacity) and the trial runner: construction sequence, Dave's deliveries, chav AI |
| `src/levels.js` | The 12 jobs |
| `src/g1_world.js` … `src/g4_game.js` | Renderer, scenery, people/ragdolls/police, UI and game flow |
| `src/shell.html` | Page markup and CSS |
| `build.py` | Bundles everything into `dist/index.html` (artifact body) and `docs/index.html` (standalone page for GitHub Pages) |
| `test/` | Headless tests: `node test/refs.mjs` runs a reference solution for every job (all must pass); `naive.mjs`, `chavs.mjs`, `trap.mjs` check failure cases |

```sh
python3 build.py          # rebuild dist/ and docs/
node test/refs.mjs        # every job must still be solvable
python3 -m http.server -d docs 8000   # play locally at http://localhost:8000
```
