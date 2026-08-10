// Run through `npm run gallery:shots`: it builds the gallery and passes --disable-gpu, which
// offscreen capture needs (disabling acceleration in-process instead yields an unreadable image).

const { app, BrowserWindow } = require("electron");
const { mkdirSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");

const PAGE = join(__dirname, "..", "out", "gallery", "index.html");
const OUT_DIR = join(__dirname, "..", "out", "gallery-shots");
const THEMES = ["light", "dark"];
const WIDTHS = [1180, 860];
const MAX_HEIGHT = 1600;
const SETTLE_MS = 250;
// Past this size the image reader shows raw bytes instead of the picture, so bigger shots go to JPEG.
const PNG_BUDGET = 100_000;

// Frozen so two runs of the same state produce the same image.
const FREEZE_CSS = "*, *::before, *::after { animation: none !important; transition: none !important; }";

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function shoot(win, section, theme, width) {
  win.setContentSize(width, 800);
  await win.loadFile(PAGE, { hash: `${section}/${theme}` });
  await win.webContents.insertCSS(FREEZE_CSS);
  await wait(SETTLE_MS);

  const height = await win.webContents.executeJavaScript("document.documentElement.scrollHeight");
  win.setContentSize(width, Math.min(MAX_HEIGHT, Math.max(200, Math.ceil(height))));
  await wait(SETTLE_MS);

  const image = await win.webContents.capturePage();
  const png = image.toPNG();
  const useJpeg = png.length > PNG_BUDGET;
  const file = join(OUT_DIR, `${section}-${theme}-${width}.${useJpeg ? "jpg" : "png"}`);
  // Below ~90 the encoder washes out small bold text, which reads as a colour bug that is not there.
  const bytes = useJpeg ? image.toJPEG(90) : png;
  writeFileSync(file, bytes);
  console.log(`${file} ${Math.round(bytes.length / 1024)}KB`);
}

app.whenReady().then(async () => {
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
