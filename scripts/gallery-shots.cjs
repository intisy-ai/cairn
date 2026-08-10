// Run through `npm run gallery:shots`: it builds the gallery and passes --disable-gpu, which
// offscreen capture needs (disabling acceleration in-process instead yields an unreadable image).

const { app, BrowserWindow } = require("electron");
const { mkdirSync, rmSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");

// Svelte transitions are only instant when the page believes motion is unwanted (see
// util/motion.ts). Without this a hidden window, which is throttled and may never run an
// animation, captures every dialog at its opening frame: fully transparent.
app.commandLine.appendSwitch("force-prefers-reduced-motion");

const PAGE = join(__dirname, "..", "out", "gallery", "index.html");
const OUT_DIR = join(__dirname, "..", "out", "gallery-shots");
const THEMES = ["light", "dark"];
const WIDTHS = [1180, 860];
const MAX_HEIGHT = 1600;
const SETTLE_MS = 250;
// Past this size the image reader shows raw bytes instead of the picture, so bigger shots go to JPEG.
const PNG_BUDGET = 100_000;
// Highest quality that still fits wins: below ~70 the encoder washes out small bold text badly
// enough to read as a colour bug that is not there.
const JPEG_QUALITY_STEPS = [90, 80, 70, 60];

// Frozen so two runs of the same state produce the same image.
const FREEZE_CSS = "*, *::before, *::after { animation: none !important; transition: none !important; }";

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function encode(image) {
  const png = image.toPNG();
  if (png.length <= PNG_BUDGET) return { bytes: png, extension: "png" };
  let bytes = png;
  for (const quality of JPEG_QUALITY_STEPS) {
    bytes = image.toJPEG(quality);
    if (bytes.length <= PNG_BUDGET) break;
  }
  return { bytes, extension: "jpg" };
}

async function shoot(win, section, theme, width) {
  win.setContentSize(width, 800);
  await win.loadFile(PAGE, { hash: `${section.id}/${theme}` });
  await win.webContents.insertCSS(FREEZE_CSS);
  await wait(SETTLE_MS);

  // An overlay is position:fixed and contributes nothing to scrollHeight, so it states the
  // viewport it needs instead of being measured and clipped to nothing.
  const height = section.viewportHeight
    ?? (await win.webContents.executeJavaScript("document.documentElement.scrollHeight"));
  win.setContentSize(width, Math.min(MAX_HEIGHT, Math.max(200, Math.ceil(height))));
  await wait(SETTLE_MS);

  const image = await win.webContents.capturePage();
  const { bytes, extension } = encode(image);
  const file = join(OUT_DIR, `${section.id}-${theme}-${width}.${extension}`);
  writeFileSync(file, bytes);
  console.log(`${file} ${Math.round(bytes.length / 1024)}KB`);
}

app.whenReady().then(async () => {
  // A shot that crosses the size budget changes extension, so last run's file would otherwise
  // survive beside the new one and get read as if it were current.
  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });
  const win = new BrowserWindow({ show: false, useContentSize: true, backgroundColor: "#ffffff" });

  await win.loadFile(PAGE);
  const sections = await win.webContents.executeJavaScript("window.gallerySections");

  for (const section of sections) {
    for (const theme of THEMES) {
      for (const width of WIDTHS) {
        await shoot(win, section, theme, width);
      }
    }
  }

  win.destroy();
  app.quit();
});
