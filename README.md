# Hex Grid Designer

A single-page web app for creating a customizable hex grid and filling in
hexagons by hand, then downloading the result as SVG or PNG.

## Usage

Open `index.html` directly in a browser (or serve the folder with any static
file server, e.g. `python3 -m http.server`). No build step or install needed.

### Controls

- **Grid Size** — columns, rows, and orientation (flat-top or pointy-top).
- **Hex Style** — hex size, gap between hexes, outline width/color, and
  background color.
- **Labels** — optionally number each hex sequentially or show its row,col
  coordinate.
- **Paint** — pick a fill color (color picker or preset swatches), then
  click a hex to fill it, or click-and-drag to paint multiple hexes at once.
  Right-click a hex (or enable Erase Mode) to clear it back to the
  background color.

Your grid settings and fills are saved automatically to the browser's local
storage, so reloading the page keeps your work. Use **Clear Fills** to wipe
colors, or **Reset Grid** to restore default settings.

### Export

- **Download SVG** — vector file, ideal for further editing or high-quality
  printing.
- **Download PNG** — rasterized at 2x resolution for crisp downloads.
