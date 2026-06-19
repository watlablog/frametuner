import "./style.css";

type ControlTile = {
  title: string;
  value: string;
  note: string;
};

type PreviewState = {
  sourceFile: File | null;
  sourceUrl: string | null;
  duration: number;
  width: number;
  height: number;
  canPreviewDirectly: boolean;
  trimStart: number;
  trimEnd: number;
  cropMode: CropMode;
  cropRect: CropRect;
  freeCropSizeLocked: boolean;
  resizeMode: ResizeMode;
  resizeWidth: number;
  resizeHeight: number;
  resizeAspectLocked: boolean;
  thumbnailDataUrls: string[];
  thumbnailGenerationId: number;
  activeTrimEdge: TrimEdge | null;
};

type TrimEdge = "start" | "end";
type CropMode = "full" | "16:9" | "9:16" | "1:1" | "free";
type CropHandle = "move" | "n" | "e" | "s" | "w" | "nw" | "ne" | "sw" | "se";
type ResizeMode = "original" | "1080p" | "720p" | "480p" | "custom";

type CropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type CropDragSession = {
  handle: CropHandle;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startRect: CropRect;
  stageRect: DOMRect;
};

const TRIM_SLIDER_MAX = 1000;
const MIN_TRIM_SECONDS = 0.1;
const TRIM_THUMBNAIL_COUNT = 12;
const TRIM_THUMBNAIL_WIDTH = 160;
const TRIM_THUMBNAIL_HEIGHT = 90;
const TRIM_FILMSTRIP_HIDE_DELAY_MS = 180;
const MIN_CROP_SIZE_RATIO = 0.12;
const MIN_OUTPUT_DIMENSION = 2;
const MAX_OUTPUT_DIMENSION = 7680;
const DEFAULT_CROP_RECT: CropRect = {
  x: 0,
  y: 0,
  width: 1,
  height: 1
};

const CROP_MODES: Array<{
  mode: CropMode;
  label: string;
  ratio: number | null;
}> = [
  { mode: "full", label: "Full", ratio: null },
  { mode: "16:9", label: "16:9", ratio: 16 / 9 },
  { mode: "9:16", label: "9:16", ratio: 9 / 16 },
  { mode: "1:1", label: "1:1", ratio: 1 },
  { mode: "free", label: "Free", ratio: null }
];

const RESIZE_PRESETS: Array<{
  mode: ResizeMode;
  label: string;
  shortEdge: number | null;
}> = [
  { mode: "original", label: "Original", shortEdge: null },
  { mode: "1080p", label: "1080p", shortEdge: 1080 },
  { mode: "720p", label: "720p", shortEdge: 720 },
  { mode: "480p", label: "480p", shortEdge: 480 },
  { mode: "custom", label: "Custom", shortEdge: null }
];

const PLAYER_ICONS = {
  play: `
    <svg class="player-icon" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path d="M10 7.5v17l15-8.5-15-8.5Z" />
    </svg>
  `,
  pause: `
    <svg class="player-icon" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path d="M10 7h4.8v18H10V7Zm7.2 0H22v18h-4.8V7Z" />
    </svg>
  `,
  volume: `
    <svg class="player-icon" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path d="M5.5 12.2v7.6h5.1L17.5 26V6l-6.9 6.2H5.5Z" />
      <path class="player-icon-stroke" d="M21 11.2c1.4 1.3 2.2 3 2.2 4.8s-.8 3.6-2.2 4.8M24.5 7.8c2.3 2.2 3.7 5.1 3.7 8.2s-1.4 6.1-3.7 8.2" />
    </svg>
  `,
  muted: `
    <svg class="player-icon" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path d="M5.5 12.2v7.6h5.1L17.5 26V6l-6.9 6.2H5.5Z" />
      <path class="player-icon-stroke" d="m21.5 12 6 8m0-8-6 8" />
    </svg>
  `
} as const;

type PlayerIconName = keyof typeof PLAYER_ICONS;

const initialControlTiles: ControlTile[] = [
  {
    title: "FPS",
    value: "Original",
    note: "Frame rate"
  },
  {
    title: "Audio",
    value: "Keep",
    note: "Mode"
  }
];

const state: PreviewState = {
  sourceFile: null,
  sourceUrl: null,
  duration: 0,
  width: 0,
  height: 0,
  canPreviewDirectly: false,
  trimStart: 0,
  trimEnd: 0,
  cropMode: "full",
  cropRect: { ...DEFAULT_CROP_RECT },
  freeCropSizeLocked: false,
  resizeMode: "original",
  resizeWidth: 0,
  resizeHeight: 0,
  resizeAspectLocked: true,
  thumbnailDataUrls: [],
  thumbnailGenerationId: 0,
  activeTrimEdge: null
};

const root = document.querySelector<HTMLDivElement>("#app");

if (!root) {
  throw new Error("FrameTuner root element was not found.");
}

root.innerHTML = `
  <div class="app-shell">
    <header class="app-header">
      <div class="brand-lockup">
        <h1 class="brand-wordmark">FrameTuner</h1>
        <p class="app-copy">Browser-based video trimming and tuning tool.</p>
      </div>
      <div class="header-meta" aria-label="Project status">
        <span class="status-pill">Milestone 2</span>
        <span class="status-pill status-pill-muted">Preview</span>
      </div>
    </header>

    <main class="workspace" aria-label="FrameTuner workspace">
      <section class="panel media-panel" aria-labelledby="preview-title">
        <div class="upload-bar" tabindex="0" aria-label="Video file drop area">
          <div class="upload-copy">
            <span class="section-kicker">Source</span>
            <strong data-upload-title>Drop a video file here</strong>
            <span data-upload-copy>Your video stays in this browser.</span>
          </div>
          <input class="file-input" id="source-file" type="file" accept="video/*,image/gif" />
          <button class="button primary compact-button" type="button" data-choose-file>
            Choose file
          </button>
        </div>

        <div class="preview-header">
          <div>
            <span class="section-kicker">Preview</span>
            <h2 id="preview-title">Video preview</h2>
          </div>
          <span class="status-pill status-pill-muted" data-preview-status>Empty</span>
        </div>

        <div class="video-frame" aria-label="Preview area">
          <div class="video-stage" data-video-stage>
            <video class="preview-video" playsinline preload="metadata" data-preview-video></video>
            <div class="crop-overlay" data-crop-overlay aria-hidden="true">
              <div
                class="crop-box"
                data-crop-box
                role="group"
                tabindex="0"
                aria-label="Crop area"
              >
                <span class="crop-grid-line crop-grid-line-vertical first" aria-hidden="true"></span>
                <span class="crop-grid-line crop-grid-line-vertical second" aria-hidden="true"></span>
                <span class="crop-grid-line crop-grid-line-horizontal first" aria-hidden="true"></span>
                <span class="crop-grid-line crop-grid-line-horizontal second" aria-hidden="true"></span>
                <span class="crop-handle crop-handle-n" data-crop-handle="n" aria-hidden="true"></span>
                <span class="crop-handle crop-handle-e" data-crop-handle="e" aria-hidden="true"></span>
                <span class="crop-handle crop-handle-s" data-crop-handle="s" aria-hidden="true"></span>
                <span class="crop-handle crop-handle-w" data-crop-handle="w" aria-hidden="true"></span>
                <span class="crop-handle crop-handle-nw" data-crop-handle="nw" aria-hidden="true"></span>
                <span class="crop-handle crop-handle-ne" data-crop-handle="ne" aria-hidden="true"></span>
                <span class="crop-handle crop-handle-sw" data-crop-handle="sw" aria-hidden="true"></span>
                <span class="crop-handle crop-handle-se" data-crop-handle="se" aria-hidden="true"></span>
              </div>
            </div>
          </div>
          <div class="video-placeholder" data-video-placeholder>
            <span class="preview-monogram" aria-hidden="true">FT</span>
            <p>Load a short clip to preview it here.</p>
          </div>
        </div>

        <div class="player-controls" aria-label="Player controls">
          <button class="player-icon-button" type="button" aria-label="Play" data-play-toggle disabled>
            ${PLAYER_ICONS.play}
          </button>
          <button class="player-icon-button" type="button" aria-label="Mute" aria-pressed="false" data-mute-toggle disabled>
            ${PLAYER_ICONS.volume}
          </button>
          <span class="time-readout" data-time-readout>0:00 / 0:00</span>
          <label class="seek-control">
            <span>Seek</span>
            <input type="range" min="0" max="1000" value="0" step="1" data-seek disabled />
          </label>
        </div>

        <dl class="media-meta" data-media-meta aria-label="Loaded video metadata">
          <div>
            <dt>File</dt>
            <dd data-meta-file>No source loaded</dd>
          </div>
          <div>
            <dt>Resolution</dt>
            <dd data-meta-resolution>--</dd>
          </div>
          <div>
            <dt>Duration</dt>
            <dd data-meta-duration>--</dd>
          </div>
          <div>
            <dt>Size</dt>
            <dd data-meta-size>--</dd>
          </div>
        </dl>
      </section>

      <aside class="panel control-panel" aria-labelledby="controls-title">
        <div class="panel-heading compact-heading">
          <div>
            <span class="section-kicker">Inspector</span>
            <h2 id="controls-title">Edit controls</h2>
          </div>
          <span class="status-pill status-pill-muted" data-inspector-status>Idle</span>
        </div>

        <section class="trim-panel" aria-labelledby="trim-title">
          <div class="trim-heading">
            <div>
              <span class="section-kicker">Time</span>
              <h3 id="trim-title">Trim range</h3>
            </div>
            <span data-trim-summary>00:00 - 00:00</span>
          </div>

          <div class="trim-slider" data-trim-slider>
            <div class="trim-filmstrip" data-trim-filmstrip aria-hidden="true">
              <div class="trim-filmstrip-track" data-trim-filmstrip-track></div>
              <span class="trim-filmstrip-shade trim-filmstrip-shade-start"></span>
              <span class="trim-filmstrip-shade trim-filmstrip-shade-end"></span>
              <span class="trim-filmstrip-marker trim-filmstrip-marker-start">
                <span>Start</span>
                <strong data-trim-start-marker-time>00:00</strong>
              </span>
              <span class="trim-filmstrip-marker trim-filmstrip-marker-end">
                <span>End</span>
                <strong data-trim-end-marker-time>00:00</strong>
              </span>
              <span class="trim-filmstrip-active" data-trim-active-marker>
                <span data-trim-active-label>Start</span>
                <strong data-trim-active-time>00:00</strong>
              </span>
            </div>

            <input
              aria-label="Trim start"
              type="range"
              min="0"
              max="${TRIM_SLIDER_MAX}"
              value="0"
              step="1"
              data-trim-start-range
              disabled
            />
            <input
              aria-label="Trim end"
              type="range"
              min="0"
              max="${TRIM_SLIDER_MAX}"
              value="${TRIM_SLIDER_MAX}"
              step="1"
              data-trim-end-range
              disabled
            />
          </div>

          <p class="trim-message" data-trim-message>Load a video to choose a time range.</p>
        </section>

        <section class="crop-panel" aria-labelledby="crop-title">
          <div class="crop-heading">
            <div>
              <span class="section-kicker">Frame</span>
              <h3 id="crop-title">Crop</h3>
            </div>
            <span data-crop-summary>Full frame</span>
          </div>

          <div class="crop-mode-grid" role="group" aria-label="Crop aspect ratio">
            ${CROP_MODES.map(
              (cropMode) => `
                <button
                  class="crop-mode-button"
                  type="button"
                  data-crop-mode="${cropMode.mode}"
                  disabled
                >
                  ${cropMode.label}
                </button>
              `
            ).join("")}
          </div>

          <label class="crop-size-control">
            <span>Crop size</span>
            <input type="range" min="20" max="100" value="100" step="1" data-crop-size disabled />
          </label>

          <div class="free-size-fields" data-free-size-fields>
            <label>
              <span>Width</span>
              <input
                type="number"
                min="1"
                value="0"
                step="1"
                inputmode="numeric"
                aria-label="Free crop width in pixels"
                data-free-crop-width
                disabled
              />
            </label>
            <label>
              <span>Height</span>
              <input
                type="number"
                min="1"
                value="0"
                step="1"
                inputmode="numeric"
                aria-label="Free crop height in pixels"
                data-free-crop-height
                disabled
              />
            </label>
            <span class="free-size-state" data-free-size-state>Free</span>
          </div>

          <div class="crop-actions">
            <button class="button" type="button" data-reset-crop disabled>Reset crop</button>
          </div>

          <p class="crop-message" data-crop-message>Load a video to crop the preview frame.</p>
        </section>

        <section class="size-panel" aria-labelledby="size-title">
          <div class="size-heading">
            <div>
              <span class="section-kicker">Output</span>
              <h3 id="size-title">Size</h3>
            </div>
            <span data-size-summary>Original</span>
          </div>

          <div class="size-preset-grid" role="group" aria-label="Output size preset">
            ${RESIZE_PRESETS.map(
              (preset) => `
                <button
                  class="size-preset-button"
                  type="button"
                  data-resize-mode="${preset.mode}"
                  disabled
                >
                  ${preset.label}
                </button>
              `
            ).join("")}
          </div>

          <div class="size-fields">
            <label>
              <span>Width</span>
              <input
                type="number"
                min="2"
                value="0"
                step="2"
                inputmode="numeric"
                aria-label="Output width in pixels"
                data-resize-width
                disabled
              />
            </label>
            <label>
              <span>Height</span>
              <input
                type="number"
                min="2"
                value="0"
                step="2"
                inputmode="numeric"
                aria-label="Output height in pixels"
                data-resize-height
                disabled
              />
            </label>
          </div>

          <label class="size-option">
            <input type="checkbox" data-resize-aspect checked disabled />
            <span>Keep aspect</span>
          </label>

          <div class="size-actions">
            <button class="button" type="button" data-reset-size disabled>Reset size</button>
          </div>

          <p class="size-message" data-size-message>Load a video to resize the output frame.</p>
        </section>

        <div class="control-grid">
          ${initialControlTiles
            .map(
              (control) => `
                <div class="control-tile">
                  <div>
                    <h3>${control.title}</h3>
                    <p>${control.note}</p>
                  </div>
                  <span>${control.value}</span>
                </div>
              `
            )
            .join("")}
        </div>

        <div class="quick-actions" aria-label="History controls">
          <button class="button" type="button" disabled>Undo</button>
          <button class="button" type="button" data-reset-source disabled>Reset</button>
        </div>

        <section class="export-strip" aria-labelledby="export-title">
          <div class="export-heading">
            <div>
              <span class="section-kicker">Output</span>
              <h2 id="export-title">Export</h2>
            </div>
            <span class="status-pill status-pill-muted">Not ready</span>
          </div>

          <div class="export-grid">
            <label>
              <span>Format</span>
              <select disabled>
                <option>MP4</option>
              </select>
            </label>
            <label>
              <span>Quality</span>
              <select disabled>
                <option>Standard</option>
              </select>
            </label>
            <label>
              <span>Audio</span>
              <select disabled>
                <option>Keep audio</option>
              </select>
            </label>
            <button class="button primary export-button" type="button" disabled>
              Export video
            </button>
          </div>

          <div class="progress-shell" aria-label="Export progress">
            <span class="progress-bar" style="width: 0%"></span>
          </div>
          <p class="message">Export will be connected after preview and trimming are stable.</p>
        </section>
      </aside>
    </main>
  </div>
`;

const fileInput = query<HTMLInputElement>("[data-choose-file] + input, #source-file");
const chooseFileButton = query<HTMLButtonElement>("[data-choose-file]");
const uploadBar = query<HTMLDivElement>(".upload-bar");
const uploadTitle = query<HTMLElement>("[data-upload-title]");
const uploadCopy = query<HTMLElement>("[data-upload-copy]");
const videoFrame = query<HTMLDivElement>(".video-frame");
const videoStage = query<HTMLDivElement>("[data-video-stage]");
const video = query<HTMLVideoElement>("[data-preview-video]");
const placeholder = query<HTMLDivElement>("[data-video-placeholder]");
const previewStatus = query<HTMLElement>("[data-preview-status]");
const inspectorStatus = query<HTMLElement>("[data-inspector-status]");
const playToggle = query<HTMLButtonElement>("[data-play-toggle]");
const muteToggle = query<HTMLButtonElement>("[data-mute-toggle]");
const seekInput = query<HTMLInputElement>("[data-seek]");
const timeReadout = query<HTMLElement>("[data-time-readout]");
const resetSourceButton = query<HTMLButtonElement>("[data-reset-source]");
const metaFile = query<HTMLElement>("[data-meta-file]");
const metaResolution = query<HTMLElement>("[data-meta-resolution]");
const metaDuration = query<HTMLElement>("[data-meta-duration]");
const metaSize = query<HTMLElement>("[data-meta-size]");
const trimSlider = query<HTMLDivElement>("[data-trim-slider]");
const trimStartRange = query<HTMLInputElement>("[data-trim-start-range]");
const trimEndRange = query<HTMLInputElement>("[data-trim-end-range]");
const trimSummary = query<HTMLElement>("[data-trim-summary]");
const trimMessage = query<HTMLElement>("[data-trim-message]");
const trimFilmstrip = query<HTMLDivElement>("[data-trim-filmstrip]");
const trimFilmstripTrack = query<HTMLDivElement>("[data-trim-filmstrip-track]");
const trimStartMarkerTime = query<HTMLElement>("[data-trim-start-marker-time]");
const trimEndMarkerTime = query<HTMLElement>("[data-trim-end-marker-time]");
const trimActiveLabel = query<HTMLElement>("[data-trim-active-label]");
const trimActiveTime = query<HTMLElement>("[data-trim-active-time]");
const cropOverlay = query<HTMLDivElement>("[data-crop-overlay]");
const cropBox = query<HTMLDivElement>("[data-crop-box]");
const cropSummary = query<HTMLElement>("[data-crop-summary]");
const cropMessage = query<HTMLElement>("[data-crop-message]");
const cropSizeInput = query<HTMLInputElement>("[data-crop-size]");
const freeSizeFields = query<HTMLDivElement>("[data-free-size-fields]");
const freeCropWidthInput = query<HTMLInputElement>("[data-free-crop-width]");
const freeCropHeightInput = query<HTMLInputElement>("[data-free-crop-height]");
const freeSizeState = query<HTMLElement>("[data-free-size-state]");
const cropModeButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-crop-mode]"));
const resetCropButton = query<HTMLButtonElement>("[data-reset-crop]");
const sizeSummary = query<HTMLElement>("[data-size-summary]");
const sizeMessage = query<HTMLElement>("[data-size-message]");
const resizeWidthInput = query<HTMLInputElement>("[data-resize-width]");
const resizeHeightInput = query<HTMLInputElement>("[data-resize-height]");
const resizeAspectInput = query<HTMLInputElement>("[data-resize-aspect]");
const resizeModeButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-resize-mode]"));
const resetSizeButton = query<HTMLButtonElement>("[data-reset-size]");
let trimFilmstripHideTimer: number | null = null;
let cropDragSession: CropDragSession | null = null;

chooseFileButton.addEventListener("click", () => fileInput.click());

uploadBar.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    fileInput.click();
  }
});

fileInput.addEventListener("change", () => {
  const [file] = Array.from(fileInput.files ?? []);
  if (file) {
    loadSourceFile(file);
  }
});

uploadBar.addEventListener("dragenter", handleDragOver);
uploadBar.addEventListener("dragover", handleDragOver);
uploadBar.addEventListener("dragleave", (event) => {
  if (!uploadBar.contains(event.relatedTarget as Node | null)) {
    uploadBar.classList.remove("is-dragging");
  }
});
uploadBar.addEventListener("drop", (event) => {
  event.preventDefault();
  uploadBar.classList.remove("is-dragging");
  const [file] = Array.from(event.dataTransfer?.files ?? []);
  if (file) {
    loadSourceFile(file);
  }
});

video.addEventListener("loadedmetadata", () => {
  state.duration = Number.isFinite(video.duration) ? video.duration : 0;
  state.width = video.videoWidth;
  state.height = video.videoHeight;
  state.canPreviewDirectly = true;
  state.trimStart = 0;
  state.trimEnd = state.duration;
  state.cropMode = "full";
  state.cropRect = { ...DEFAULT_CROP_RECT };
  state.freeCropSizeLocked = false;
  state.resizeMode = "original";
  state.resizeWidth = state.width;
  state.resizeHeight = state.height;
  state.resizeAspectLocked = true;
  video.currentTime = 0;
  renderLoadedState();
  void generateTrimThumbnails();
});

video.addEventListener("timeupdate", handleTimeUpdate);
video.addEventListener("durationchange", updatePlaybackUi);
video.addEventListener("play", updatePlaybackUi);
video.addEventListener("pause", updatePlaybackUi);
video.addEventListener("ended", updatePlaybackUi);

video.addEventListener("error", () => {
  state.canPreviewDirectly = false;
  previewStatus.textContent = "Unsupported";
  previewStatus.classList.remove("status-pill-muted");
  previewStatus.classList.add("status-pill-warning");
  inspectorStatus.textContent = "Preview failed";
  placeholder.classList.remove("is-hidden");
  video.classList.remove("is-loaded");
  videoStage.classList.remove("is-loaded", "fit-width", "fit-height");
  setPreviewControlsEnabled(false);
  setCropControlsEnabled(false);
  setResizeControlsEnabled(false);
  renderCropUi();
  renderResizeUi();
  uploadCopy.textContent = "This file cannot be previewed directly by this browser.";
});

playToggle.addEventListener("click", async () => {
  if (!state.canPreviewDirectly) {
    return;
  }

  if (video.paused) {
    if (video.currentTime < state.trimStart || video.currentTime >= state.trimEnd) {
      video.currentTime = state.trimStart;
    }
    await video.play();
  } else {
    video.pause();
  }
});

muteToggle.addEventListener("click", () => {
  video.muted = !video.muted;
  updatePlaybackUi();
});

seekInput.addEventListener("input", () => {
  if (!state.canPreviewDirectly || state.duration <= 0) {
    return;
  }

  const nextTime = (Number(seekInput.value) / Number(seekInput.max)) * state.duration;
  video.currentTime = isTrimActive() ? clamp(nextTime, state.trimStart, state.trimEnd) : nextTime;
  updatePlaybackUi();
});

bindTrimRangeEvents(trimStartRange, "start");
bindTrimRangeEvents(trimEndRange, "end");

for (const button of cropModeButtons) {
  button.addEventListener("click", () => {
    const mode = button.dataset.cropMode as CropMode | undefined;
    if (mode) {
      setCropMode(mode);
    }
  });
}

cropSizeInput.addEventListener("input", () => {
  setCropScale(Number(cropSizeInput.value));
});

freeCropWidthInput.addEventListener("change", applyFreeCropSizeFromInputs);
freeCropHeightInput.addEventListener("change", applyFreeCropSizeFromInputs);

resetCropButton.addEventListener("click", () => {
  resetCropToFullFrame();
});

for (const button of resizeModeButtons) {
  button.addEventListener("click", () => {
    const mode = button.dataset.resizeMode as ResizeMode | undefined;
    if (mode) {
      setResizeMode(mode);
    }
  });
}

resizeWidthInput.addEventListener("change", () => {
  applyCustomResizeFromInput("width");
});

resizeHeightInput.addEventListener("change", () => {
  applyCustomResizeFromInput("height");
});

resizeAspectInput.addEventListener("change", () => {
  state.resizeAspectLocked = resizeAspectInput.checked;
  renderResizeUi();
});

resetSizeButton.addEventListener("click", () => {
  resetResizeToOriginal();
});

cropBox.addEventListener("pointerdown", startCropDrag);
cropBox.addEventListener("keydown", handleCropKeyboard);

resetSourceButton.addEventListener("click", resetSource);

window.addEventListener("beforeunload", revokeSourceUrl);
window.addEventListener("resize", updatePreviewFit);
window.addEventListener("pointerup", handleGlobalTrimPointerEnd);
window.addEventListener("pointercancel", handleGlobalTrimPointerEnd);
window.addEventListener("pointermove", handleCropDragMove);
window.addEventListener("pointerup", endCropDrag);
window.addEventListener("pointercancel", endCropDrag);

if ("ResizeObserver" in window) {
  const previewResizeObserver = new ResizeObserver(updatePreviewFit);
  previewResizeObserver.observe(videoFrame);
}

function query<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing expected element: ${selector}`);
  }
  return element;
}

function handleDragOver(event: DragEvent): void {
  event.preventDefault();
  uploadBar.classList.add("is-dragging");
}

function loadSourceFile(file: File): void {
  revokeSourceUrl();
  resetVideoElement();
  resetTrimFilmstrip();

  state.sourceFile = file;
  state.sourceUrl = URL.createObjectURL(file);
  state.duration = 0;
  state.width = 0;
  state.height = 0;
  state.canPreviewDirectly = false;
  state.trimStart = 0;
  state.trimEnd = 0;
  state.cropMode = "full";
  state.cropRect = { ...DEFAULT_CROP_RECT };
  state.freeCropSizeLocked = false;
  state.resizeMode = "original";
  state.resizeWidth = 0;
  state.resizeHeight = 0;
  state.resizeAspectLocked = true;
  state.thumbnailGenerationId += 1;

  uploadTitle.textContent = file.name;
  uploadCopy.textContent = "Loading local preview metadata...";
  previewStatus.textContent = "Loading";
  previewStatus.classList.add("status-pill-muted");
  previewStatus.classList.remove("status-pill-warning");
  inspectorStatus.textContent = "Loading";
  metaFile.textContent = file.name;
  metaResolution.textContent = "--";
  metaDuration.textContent = "--";
  metaSize.textContent = formatFileSize(file.size);
  setPreviewControlsEnabled(false);
  setTrimControlsEnabled(false);
  setCropControlsEnabled(false);
  setResizeControlsEnabled(false);
  renderTrimUi();
  renderCropUi();
  renderResizeUi();

  video.src = state.sourceUrl;
  video.load();
}

function renderLoadedState(): void {
  previewStatus.textContent = "Ready";
  previewStatus.classList.remove("status-pill-muted", "status-pill-warning");
  inspectorStatus.textContent = "Loaded";
  uploadCopy.textContent = "Preview is running locally in this browser.";
  placeholder.classList.add("is-hidden");
  video.classList.add("is-loaded");
  metaResolution.textContent =
    state.width > 0 && state.height > 0 ? `${state.width} x ${state.height}` : "Unknown";
  metaDuration.textContent = formatTime(state.duration);
  updatePreviewFit();
  setPreviewControlsEnabled(true);
  setTrimControlsEnabled(true);
  setCropControlsEnabled(true);
  setResizeControlsEnabled(true);
  renderTrimUi();
  renderCropUi();
  renderResizeUi();
  updatePlaybackUi();
}

function updatePreviewFit(): void {
  if (!state.canPreviewDirectly || state.width <= 0 || state.height <= 0) {
    videoStage.classList.remove("fit-width", "fit-height");
    return;
  }

  const frameRect = videoFrame.getBoundingClientRect();

  if (frameRect.width <= 0 || frameRect.height <= 0) {
    return;
  }

  const videoRatio = state.width / state.height;
  const frameRatio = frameRect.width / frameRect.height;
  const fitWidth = videoRatio >= frameRatio;

  videoStage.style.setProperty("--video-aspect", String(videoRatio));
  videoStage.classList.add("is-loaded");
  videoStage.classList.toggle("fit-width", fitWidth);
  videoStage.classList.toggle("fit-height", !fitWidth);
  renderCropUi();
}

function handleTimeUpdate(): void {
  if (isTrimActive() && video.currentTime >= state.trimEnd) {
    video.pause();
    video.currentTime = state.trimEnd;
  } else if (!video.paused && video.currentTime < state.trimStart) {
    video.currentTime = state.trimStart;
  }

  updatePlaybackUi();
}

function updatePlaybackUi(): void {
  const duration = Number.isFinite(video.duration) ? video.duration : state.duration;
  const currentTime = Number.isFinite(video.currentTime) ? video.currentTime : 0;

  setPlayerIconButton(playToggle, video.paused ? "play" : "pause", video.paused ? "Play" : "Pause", !video.paused);
  setPlayerIconButton(muteToggle, video.muted ? "muted" : "volume", video.muted ? "Unmute" : "Mute", video.muted);
  timeReadout.textContent = `${formatPlayerTime(currentTime)} / ${formatPlayerTime(duration)}`;
  const seekProgress = duration > 0 ? clamp((currentTime / duration) * 100, 0, 100) : 0;
  seekInput.style.setProperty("--seek-progress", `${seekProgress}%`);
  seekInput.value =
    duration > 0 ? String(Math.round((currentTime / duration) * Number(seekInput.max))) : "0";
}

function setPlayerIconButton(
  button: HTMLButtonElement,
  iconName: PlayerIconName,
  label: string,
  pressed: boolean
): void {
  if (button.dataset.icon !== iconName) {
    button.innerHTML = PLAYER_ICONS[iconName];
    button.dataset.icon = iconName;
  }

  button.setAttribute("aria-label", label);
  button.setAttribute("aria-pressed", String(pressed));
  button.title = label;
}

function setTrimRange(nextStart: number, nextEnd: number, editedEdge: "start" | "end"): void {
  if (!state.canPreviewDirectly || state.duration <= 0) {
    return;
  }

  const minimumRange = Math.min(MIN_TRIM_SECONDS, state.duration);
  let start = clamp(Number.isFinite(nextStart) ? nextStart : state.trimStart, 0, state.duration);
  let end = clamp(Number.isFinite(nextEnd) ? nextEnd : state.trimEnd, 0, state.duration);

  if (end - start < minimumRange) {
    if (editedEdge === "start") {
      start = clamp(end - minimumRange, 0, state.duration - minimumRange);
    } else {
      end = clamp(start + minimumRange, minimumRange, state.duration);
    }
  }

  if (end - start < minimumRange) {
    start = 0;
    end = state.duration;
  }

  state.trimStart = roundTime(start);
  state.trimEnd = roundTime(end);

  if (video.currentTime < state.trimStart) {
    video.currentTime = state.trimStart;
  }

  if (video.currentTime > state.trimEnd) {
    video.currentTime = state.trimEnd;
  }

  renderTrimUi();
  updatePlaybackUi();
}

function bindTrimRangeEvents(input: HTMLInputElement, edge: TrimEdge): void {
  input.addEventListener("pointerdown", () => {
    showTrimFilmstrip(edge);
  });

  input.addEventListener("focus", () => {
    showTrimFilmstrip(edge);
  });

  input.addEventListener("input", () => {
    if (edge === "start") {
      setTrimRange(sliderValueToTime(input.value), state.trimEnd, edge);
    } else {
      setTrimRange(state.trimStart, sliderValueToTime(input.value), edge);
    }

    showTrimFilmstrip(edge);
    seekPreviewToTrimEdge(edge);
  });

  input.addEventListener("pointerup", scheduleTrimFilmstripHide);
  input.addEventListener("pointercancel", scheduleTrimFilmstripHide);
  input.addEventListener("blur", scheduleTrimFilmstripHide);
}

function renderTrimUi(): void {
  const duration = state.duration;
  const enabled = state.canPreviewDirectly && duration > 0;
  const trimDuration = Math.max(0, state.trimEnd - state.trimStart);

  trimSummary.textContent =
    enabled
      ? `${formatTime(state.trimStart)} - ${formatTime(state.trimEnd)}`
      : "00:00 - 00:00";
  trimMessage.textContent = enabled
    ? `Selected range: ${formatPreciseSeconds(trimDuration)}`
    : "Load a video to choose a time range.";
  trimStartMarkerTime.textContent = enabled ? formatMarkerTime(state.trimStart) : "0.0s";
  trimEndMarkerTime.textContent = enabled ? formatMarkerTime(state.trimEnd) : "0.0s";
  trimActiveLabel.textContent = state.activeTrimEdge === "end" ? "End" : "Start";
  trimActiveTime.textContent =
    enabled && state.activeTrimEdge === "end"
      ? formatMarkerTime(state.trimEnd)
      : formatMarkerTime(state.trimStart);

  trimStartRange.value = enabled ? String(timeToSliderValue(state.trimStart)) : "0";
  trimEndRange.value = enabled ? String(timeToSliderValue(state.trimEnd)) : String(TRIM_SLIDER_MAX);

  const startPercent = enabled ? (state.trimStart / duration) * 100 : 0;
  const endPercent = enabled ? (state.trimEnd / duration) * 100 : 100;
  const activePercent =
    enabled && state.activeTrimEdge === "end" ? endPercent : startPercent;
  trimSlider.style.setProperty("--trim-start", `${startPercent}%`);
  trimSlider.style.setProperty("--trim-end", `${endPercent}%`);
  trimFilmstrip.style.setProperty("--trim-start", `${startPercent}%`);
  trimFilmstrip.style.setProperty("--trim-end", `${endPercent}%`);
  trimFilmstrip.style.setProperty("--trim-active", `${activePercent}%`);
  trimFilmstrip.classList.toggle("edge-end", state.activeTrimEdge === "end");
  trimFilmstrip.classList.toggle("edge-start", state.activeTrimEdge !== "end");
  trimFilmstrip.classList.toggle("has-thumbnails", state.thumbnailDataUrls.length > 0);
}

function setTrimControlsEnabled(enabled: boolean): void {
  trimStartRange.disabled = !enabled;
  trimEndRange.disabled = !enabled;
}

function setCropControlsEnabled(enabled: boolean): void {
  for (const button of cropModeButtons) {
    button.disabled = !enabled;
  }

  cropSizeInput.disabled = !enabled || state.cropMode === "full";
  freeCropWidthInput.disabled = !enabled || state.cropMode !== "free";
  freeCropHeightInput.disabled = !enabled || state.cropMode !== "free";
  resetCropButton.disabled = !enabled || state.cropMode === "full";
  cropBox.tabIndex = enabled && state.cropMode !== "full" ? 0 : -1;
}

function setCropMode(mode: CropMode): void {
  if (!isCropEditable()) {
    return;
  }

  const previousMode = state.cropMode;
  const previousScale = getCropScalePercent() / 100;
  const center = getCropCenter(state.cropRect);

  state.cropMode = mode;
  state.freeCropSizeLocked = false;

  if (mode === "full") {
    state.cropRect = { ...DEFAULT_CROP_RECT };
  } else if (mode === "free" && previousMode !== "full") {
    state.cropRect = clampCropRect(state.cropRect);
  } else if (mode === "free") {
    state.cropRect = makeCropRectFromCenter(center.x, center.y, 0.82, 0.82);
  } else {
    const cropScale = previousMode === "full" ? 0.86 : previousScale;
    state.cropRect = makeCropRectForMode(mode, center.x, center.y, cropScale);
  }

  renderCropUi();
}

function setCropScale(percent: number): void {
  if (!isCropEditable() || state.cropMode === "full") {
    return;
  }

  if (state.cropMode === "free") {
    state.freeCropSizeLocked = false;
  }

  const cropScale = clamp(percent / 100, MIN_CROP_SIZE_RATIO, 1);
  const center = getCropCenter(state.cropRect);

  if (state.cropMode === "free") {
    const normalizedAspect = state.cropRect.width / state.cropRect.height;
    const maxSize = getMaxCropSizeForNormalizedAspect(normalizedAspect);
    state.cropRect = makeCropRectFromCenter(
      center.x,
      center.y,
      maxSize.width * cropScale,
      maxSize.height * cropScale
    );
  } else {
    state.cropRect = makeCropRectForMode(state.cropMode, center.x, center.y, cropScale);
  }

  renderCropUi();
}

function resetCropToFullFrame(): void {
  if (!isCropEditable()) {
    return;
  }

  state.cropMode = "full";
  state.cropRect = { ...DEFAULT_CROP_RECT };
  state.freeCropSizeLocked = false;
  renderCropUi();
}

function renderCropUi(): void {
  const editable = isCropEditable();
  const active = editable && state.cropMode !== "full";
  const freeActive = active && state.cropMode === "free";
  const cropScale = getCropScalePercent();
  const pixelSize = getCropPixelSize();
  const minimumPixelSize = getMinimumCropPixelSize();

  cropOverlay.classList.toggle("is-visible", active);
  cropOverlay.setAttribute("aria-hidden", String(!active));
  cropBox.style.setProperty("--crop-x", `${state.cropRect.x * 100}%`);
  cropBox.style.setProperty("--crop-y", `${state.cropRect.y * 100}%`);
  cropBox.style.setProperty("--crop-width", `${state.cropRect.width * 100}%`);
  cropBox.style.setProperty("--crop-height", `${state.cropRect.height * 100}%`);
  cropBox.setAttribute("aria-label", `${formatCropSummary()} crop area`);

  for (const button of cropModeButtons) {
    const isSelected = button.dataset.cropMode === state.cropMode;
    button.classList.toggle("is-selected", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
    button.disabled = !editable;
  }

  cropSizeInput.value = String(cropScale);
  cropSizeInput.disabled = !active;
  freeSizeFields.classList.toggle("is-visible", freeActive);
  freeCropWidthInput.value = String(pixelSize.width);
  freeCropHeightInput.value = String(pixelSize.height);
  freeCropWidthInput.min = String(minimumPixelSize.width);
  freeCropHeightInput.min = String(minimumPixelSize.height);
  freeCropWidthInput.max = String(Math.max(minimumPixelSize.width, state.width));
  freeCropHeightInput.max = String(Math.max(minimumPixelSize.height, state.height));
  freeCropWidthInput.disabled = !freeActive;
  freeCropHeightInput.disabled = !freeActive;
  freeSizeState.textContent = state.freeCropSizeLocked ? "Locked" : "Free";
  freeSizeState.classList.toggle("is-locked", state.freeCropSizeLocked);
  resetCropButton.disabled = !active;
  cropBox.tabIndex = active ? 0 : -1;
  cropSummary.textContent = editable ? formatCropSummary() : "Full frame";
  cropMessage.textContent = !editable
    ? "Load a video to crop the preview frame."
    : state.freeCropSizeLocked
      ? "Fixed free size is active. Move the crop area from its center."
      : active
        ? "Drag the crop area or handles to frame the output."
      : "Full frame is selected. Choose an aspect ratio to crop.";
  renderResizeUi();
}

function applyFreeCropSizeFromInputs(): void {
  if (!isCropEditable() || state.cropMode !== "free") {
    renderCropUi();
    return;
  }

  const minimumPixelSize = getMinimumCropPixelSize();
  const currentPixelSize = getCropPixelSize();
  const width = clampPixelInput(
    freeCropWidthInput.value,
    currentPixelSize.width,
    minimumPixelSize.width,
    state.width
  );
  const height = clampPixelInput(
    freeCropHeightInput.value,
    currentPixelSize.height,
    minimumPixelSize.height,
    state.height
  );
  const center = getCropCenter(state.cropRect);

  state.cropRect = makeCropRectFromCenter(center.x, center.y, width / state.width, height / state.height);
  state.freeCropSizeLocked = true;
  renderCropUi();
}

function startCropDrag(event: PointerEvent): void {
  if (!isCropEditable() || state.cropMode === "full" || event.button !== 0) {
    return;
  }

  const stageRect = videoStage.getBoundingClientRect();

  if (stageRect.width <= 0 || stageRect.height <= 0) {
    return;
  }

  const handleElement = (event.target as HTMLElement).closest<HTMLElement>("[data-crop-handle]");
  const handle = (handleElement?.dataset.cropHandle as CropHandle | undefined) ?? "move";

  cropDragSession = {
    handle,
    pointerId: event.pointerId,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startRect: { ...state.cropRect },
    stageRect
  };

  cropBox.setPointerCapture(event.pointerId);
  cropBox.classList.add("is-dragging");
  cropBox.focus();
  event.preventDefault();
}

function handleCropDragMove(event: PointerEvent): void {
  if (!cropDragSession || event.pointerId !== cropDragSession.pointerId) {
    return;
  }

  const deltaX = (event.clientX - cropDragSession.startClientX) / cropDragSession.stageRect.width;
  const deltaY = (event.clientY - cropDragSession.startClientY) / cropDragSession.stageRect.height;

  if (cropDragSession.handle === "move") {
    state.cropRect = clampCropRect({
      ...cropDragSession.startRect,
      x: cropDragSession.startRect.x + deltaX,
      y: cropDragSession.startRect.y + deltaY
    });
  } else if (state.cropMode === "free") {
    state.freeCropSizeLocked = false;
    state.cropRect = resizeFreeCropRect(cropDragSession, deltaX, deltaY);
  } else {
    state.cropRect = resizeFixedCropRect(cropDragSession, event.clientX, event.clientY);
  }

  renderCropUi();
  event.preventDefault();
}

function endCropDrag(event: PointerEvent): void {
  if (!cropDragSession || event.pointerId !== cropDragSession.pointerId) {
    return;
  }

  if (cropBox.hasPointerCapture(event.pointerId)) {
    cropBox.releasePointerCapture(event.pointerId);
  }

  cropDragSession = null;
  cropBox.classList.remove("is-dragging");
}

function handleCropKeyboard(event: KeyboardEvent): void {
  if (!isCropEditable() || state.cropMode === "full") {
    return;
  }

  const moveStep = event.shiftKey ? 0.03 : 0.01;
  const scaleStep = event.shiftKey ? 5 : 2;
  let nextRect = state.cropRect;

  if (event.key === "ArrowLeft") {
    nextRect = clampCropRect({ ...state.cropRect, x: state.cropRect.x - moveStep });
  } else if (event.key === "ArrowRight") {
    nextRect = clampCropRect({ ...state.cropRect, x: state.cropRect.x + moveStep });
  } else if (event.key === "ArrowUp") {
    nextRect = clampCropRect({ ...state.cropRect, y: state.cropRect.y - moveStep });
  } else if (event.key === "ArrowDown") {
    nextRect = clampCropRect({ ...state.cropRect, y: state.cropRect.y + moveStep });
  } else if (event.key === "+" || event.key === "=") {
    setCropScale(getCropScalePercent() + scaleStep);
    event.preventDefault();
    return;
  } else if (event.key === "-" || event.key === "_") {
    setCropScale(getCropScalePercent() - scaleStep);
    event.preventDefault();
    return;
  } else {
    return;
  }

  state.cropRect = nextRect;
  renderCropUi();
  event.preventDefault();
}

function resizeFreeCropRect(session: CropDragSession, deltaX: number, deltaY: number): CropRect {
  const start = session.startRect;
  const startRight = start.x + start.width;
  const startBottom = start.y + start.height;
  let left = start.x;
  let right = startRight;
  let top = start.y;
  let bottom = startBottom;

  if (session.handle.includes("w")) {
    left = clamp(start.x + deltaX, 0, startRight - MIN_CROP_SIZE_RATIO);
  }

  if (session.handle.includes("e")) {
    right = clamp(startRight + deltaX, start.x + MIN_CROP_SIZE_RATIO, 1);
  }

  if (session.handle.includes("n")) {
    top = clamp(start.y + deltaY, 0, startBottom - MIN_CROP_SIZE_RATIO);
  }

  if (session.handle.includes("s")) {
    bottom = clamp(startBottom + deltaY, start.y + MIN_CROP_SIZE_RATIO, 1);
  }

  return clampCropRect({
    x: left,
    y: top,
    width: right - left,
    height: bottom - top
  });
}

function resizeFixedCropRect(
  session: CropDragSession,
  clientX: number,
  clientY: number
): CropRect {
  const center = getCropCenter(session.startRect);
  const pointerX = (clientX - session.stageRect.left) / session.stageRect.width;
  const pointerY = (clientY - session.stageRect.top) / session.stageRect.height;
  const horizontalScale = session.handle.includes("e") || session.handle.includes("w")
    ? Math.abs(pointerX - center.x) / Math.max(session.startRect.width / 2, 0.001)
    : 1;
  const verticalScale = session.handle.includes("n") || session.handle.includes("s")
    ? Math.abs(pointerY - center.y) / Math.max(session.startRect.height / 2, 0.001)
    : 1;
  const maxSize = getMaxCropSizeForMode(state.cropMode);
  const startScale = session.startRect.width / maxSize.width;
  const minimumScale = getMinimumCropScale(maxSize);
  const nextScale = clamp(startScale * Math.max(horizontalScale, verticalScale), minimumScale, 1);

  return makeCropRectForMode(state.cropMode, center.x, center.y, nextScale);
}

function isCropEditable(): boolean {
  return state.canPreviewDirectly && state.width > 0 && state.height > 0;
}

function makeCropRectForMode(
  mode: CropMode,
  centerX: number,
  centerY: number,
  scale: number
): CropRect {
  const maxSize = getMaxCropSizeForMode(mode);
  const cropScale = clamp(scale, getMinimumCropScale(maxSize), 1);
  return makeCropRectFromCenter(
    centerX,
    centerY,
    maxSize.width * cropScale,
    maxSize.height * cropScale
  );
}

function makeCropRectFromCenter(
  centerX: number,
  centerY: number,
  width: number,
  height: number
): CropRect {
  return clampCropRect({
    x: centerX - width / 2,
    y: centerY - height / 2,
    width,
    height
  });
}

function getMaxCropSizeForMode(mode: CropMode): { width: number; height: number } {
  const targetRatio = getCropTargetRatio(mode);

  if (!targetRatio || state.width <= 0 || state.height <= 0) {
    return { width: 1, height: 1 };
  }

  const sourceRatio = state.width / state.height;
  return getMaxCropSizeForNormalizedAspect(targetRatio / sourceRatio);
}

function getMaxCropSizeForNormalizedAspect(normalizedAspect: number): {
  width: number;
  height: number;
} {
  if (!Number.isFinite(normalizedAspect) || normalizedAspect <= 0) {
    return { width: 1, height: 1 };
  }

  if (normalizedAspect >= 1) {
    return { width: 1, height: 1 / normalizedAspect };
  }

  return { width: normalizedAspect, height: 1 };
}

function getCropTargetRatio(mode: CropMode): number | null {
  return CROP_MODES.find((cropMode) => cropMode.mode === mode)?.ratio ?? null;
}

function getCropCenter(rect: CropRect): { x: number; y: number } {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2
  };
}

function getCropPixelSize(): { width: number; height: number } {
  if (state.width <= 0 || state.height <= 0) {
    return { width: 0, height: 0 };
  }

  return {
    width: Math.round(state.cropRect.width * state.width),
    height: Math.round(state.cropRect.height * state.height)
  };
}

function getMinimumCropPixelSize(): { width: number; height: number } {
  return {
    width: Math.max(1, Math.ceil(state.width * MIN_CROP_SIZE_RATIO)),
    height: Math.max(1, Math.ceil(state.height * MIN_CROP_SIZE_RATIO))
  };
}

function clampPixelInput(value: string, fallback: number, min: number, max: number): number {
  const parsedValue = Math.round(Number(value));
  const safeValue = Number.isFinite(parsedValue) ? parsedValue : fallback;
  return clamp(safeValue, min, max);
}

function getCropScalePercent(): number {
  if (state.cropMode === "full") {
    return 100;
  }

  const maxSize = state.cropMode === "free"
    ? getMaxCropSizeForNormalizedAspect(state.cropRect.width / state.cropRect.height)
    : getMaxCropSizeForMode(state.cropMode);
  const scale = Math.min(state.cropRect.width / maxSize.width, state.cropRect.height / maxSize.height);

  return Math.round(clamp(scale, MIN_CROP_SIZE_RATIO, 1) * 100);
}

function getMinimumCropScale(maxSize: { width: number; height: number }): number {
  return clamp(
    Math.max(MIN_CROP_SIZE_RATIO / maxSize.width, MIN_CROP_SIZE_RATIO / maxSize.height),
    MIN_CROP_SIZE_RATIO,
    1
  );
}

function clampCropRect(rect: CropRect): CropRect {
  const width = clamp(rect.width, MIN_CROP_SIZE_RATIO, 1);
  const height = clamp(rect.height, MIN_CROP_SIZE_RATIO, 1);

  return {
    x: clamp(rect.x, 0, 1 - width),
    y: clamp(rect.y, 0, 1 - height),
    width,
    height
  };
}

function formatCropSummary(): string {
  if (!isCropEditable() || state.cropMode === "full") {
    return "Full frame";
  }

  const cropWidth = Math.round(state.cropRect.width * state.width);
  const cropHeight = Math.round(state.cropRect.height * state.height);
  return `${getCropModeLabel(state.cropMode)} ${cropWidth} x ${cropHeight}`;
}

function getCropModeLabel(mode: CropMode): string {
  return CROP_MODES.find((cropMode) => cropMode.mode === mode)?.label ?? "Crop";
}

function setResizeControlsEnabled(enabled: boolean): void {
  for (const button of resizeModeButtons) {
    button.disabled = !enabled;
  }

  const customEnabled = enabled && state.resizeMode === "custom";
  resizeWidthInput.disabled = !customEnabled;
  resizeHeightInput.disabled = !customEnabled;
  resizeAspectInput.disabled = !customEnabled;
  resetSizeButton.disabled = !enabled || state.resizeMode === "original";
}

function setResizeMode(mode: ResizeMode): void {
  if (!isResizeEditable()) {
    return;
  }

  const previousSize = getCurrentResizeSize();
  state.resizeMode = mode;

  if (mode === "custom") {
    state.resizeWidth = previousSize.width;
    state.resizeHeight = previousSize.height;
  } else {
    const presetSize = getResizeSizeForMode(mode);
    state.resizeWidth = presetSize.width;
    state.resizeHeight = presetSize.height;
  }

  renderResizeUi();
}

function applyCustomResizeFromInput(changedDimension: "width" | "height"): void {
  if (!isResizeEditable()) {
    renderResizeUi();
    return;
  }

  const currentSize = getCurrentResizeSize();
  const baseSize = getBaseFrameSize();
  const baseAspect = baseSize.width > 0 && baseSize.height > 0 ? baseSize.width / baseSize.height : 1;
  let width = clampResizeDimension(resizeWidthInput.value, currentSize.width);
  let height = clampResizeDimension(resizeHeightInput.value, currentSize.height);

  state.resizeMode = "custom";
  state.resizeAspectLocked = resizeAspectInput.checked;

  if (state.resizeAspectLocked) {
    if (changedDimension === "width") {
      height = normalizeOutputDimension(width / baseAspect);
    } else {
      width = normalizeOutputDimension(height * baseAspect);
    }
  }

  state.resizeWidth = clamp(width, MIN_OUTPUT_DIMENSION, MAX_OUTPUT_DIMENSION);
  state.resizeHeight = clamp(height, MIN_OUTPUT_DIMENSION, MAX_OUTPUT_DIMENSION);
  renderResizeUi();
}

function resetResizeToOriginal(): void {
  if (!isResizeEditable()) {
    return;
  }

  const baseSize = getBaseFrameSize();
  state.resizeMode = "original";
  state.resizeWidth = baseSize.width;
  state.resizeHeight = baseSize.height;
  state.resizeAspectLocked = true;
  renderResizeUi();
}

function renderResizeUi(): void {
  const editable = isResizeEditable();
  const outputSize = editable ? getCurrentResizeSize() : { width: 0, height: 0 };
  const baseSize = editable ? getBaseFrameSize() : { width: 0, height: 0 };
  const customActive = editable && state.resizeMode === "custom";

  for (const button of resizeModeButtons) {
    const isSelected = button.dataset.resizeMode === state.resizeMode;
    button.classList.toggle("is-selected", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
    button.disabled = !editable;
  }

  resizeWidthInput.value = String(outputSize.width);
  resizeHeightInput.value = String(outputSize.height);
  resizeWidthInput.disabled = !customActive;
  resizeHeightInput.disabled = !customActive;
  resizeWidthInput.max = String(MAX_OUTPUT_DIMENSION);
  resizeHeightInput.max = String(MAX_OUTPUT_DIMENSION);
  resizeAspectInput.checked = state.resizeAspectLocked;
  resizeAspectInput.disabled = !customActive;
  resetSizeButton.disabled = !editable || state.resizeMode === "original";
  sizeSummary.textContent = editable
    ? `${getResizeModeLabel(state.resizeMode)} ${outputSize.width} x ${outputSize.height}`
    : "Original";
  sizeMessage.textContent = !editable
    ? "Load a video to resize the output frame."
    : state.resizeMode === "original"
      ? `Output follows the current frame: ${baseSize.width} x ${baseSize.height}.`
      : `Output will scale from ${baseSize.width} x ${baseSize.height} to ${outputSize.width} x ${outputSize.height}.`;
}

function isResizeEditable(): boolean {
  return state.canPreviewDirectly && state.width > 0 && state.height > 0;
}

function getCurrentResizeSize(): { width: number; height: number } {
  if (state.resizeMode === "custom") {
    const baseSize = getBaseFrameSize();
    return {
      width: clampOutputSizeValue(state.resizeWidth || baseSize.width),
      height: clampOutputSizeValue(state.resizeHeight || baseSize.height)
    };
  }

  return getResizeSizeForMode(state.resizeMode);
}

function getResizeSizeForMode(mode: ResizeMode): { width: number; height: number } {
  const baseSize = getBaseFrameSize();

  if (baseSize.width <= 0 || baseSize.height <= 0) {
    return { width: 0, height: 0 };
  }

  if (mode === "original" || mode === "custom") {
    return baseSize;
  }

  const preset = RESIZE_PRESETS.find((resizePreset) => resizePreset.mode === mode);
  const shortEdge = preset?.shortEdge;

  if (!shortEdge) {
    return baseSize;
  }

  const aspect = baseSize.width / baseSize.height;

  if (baseSize.width >= baseSize.height) {
    return {
      width: normalizeOutputDimension(shortEdge * aspect),
      height: normalizeOutputDimension(shortEdge)
    };
  }

  return {
    width: normalizeOutputDimension(shortEdge),
    height: normalizeOutputDimension(shortEdge / aspect)
  };
}

function getBaseFrameSize(): { width: number; height: number } {
  if (!isResizeEditable()) {
    return { width: 0, height: 0 };
  }

  return getCropPixelSize();
}

function clampResizeDimension(value: string, fallback: number): number {
  const parsedValue = Math.round(Number(value));
  const safeValue = Number.isFinite(parsedValue) ? parsedValue : fallback;
  return clampOutputSizeValue(safeValue);
}

function clampOutputSizeValue(value: number): number {
  return clamp(normalizeOutputDimension(value), MIN_OUTPUT_DIMENSION, MAX_OUTPUT_DIMENSION);
}

function normalizeOutputDimension(value: number): number {
  if (!Number.isFinite(value)) {
    return MIN_OUTPUT_DIMENSION;
  }

  return Math.max(MIN_OUTPUT_DIMENSION, Math.round(value / 2) * 2);
}

function getResizeModeLabel(mode: ResizeMode): string {
  return RESIZE_PRESETS.find((preset) => preset.mode === mode)?.label ?? "Size";
}

async function generateTrimThumbnails(): Promise<void> {
  if (!state.sourceUrl || !state.canPreviewDirectly || state.duration <= 0) {
    resetTrimFilmstrip();
    return;
  }

  const generationId = state.thumbnailGenerationId;
  const thumbnailVideo = document.createElement("video");
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    resetTrimFilmstrip();
    return;
  }

  canvas.width = TRIM_THUMBNAIL_WIDTH;
  canvas.height = TRIM_THUMBNAIL_HEIGHT;
  thumbnailVideo.muted = true;
  thumbnailVideo.playsInline = true;
  thumbnailVideo.preload = "auto";
  thumbnailVideo.src = state.sourceUrl;
  thumbnailVideo.load();

  try {
    await waitForVideoMetadata(thumbnailVideo);

    const thumbnails: string[] = [];
    const thumbnailDuration = Number.isFinite(thumbnailVideo.duration)
      ? thumbnailVideo.duration
      : state.duration;
    const maxSampleTime = Math.max(0, Math.min(state.duration, thumbnailDuration) - 0.04);
    const thumbnailCount: number = TRIM_THUMBNAIL_COUNT;

    for (let index = 0; index < thumbnailCount; index += 1) {
      if (generationId !== state.thumbnailGenerationId) {
        return;
      }

      const progress = thumbnailCount === 1 ? 0 : index / (thumbnailCount - 1);
      await seekThumbnailVideoTo(thumbnailVideo, maxSampleTime * progress);
      drawContainedFrame(context, thumbnailVideo, canvas.width, canvas.height);
      thumbnails.push(canvas.toDataURL("image/jpeg", 0.72));
    }

    if (generationId !== state.thumbnailGenerationId) {
      return;
    }

    state.thumbnailDataUrls = thumbnails;
    renderTrimFilmstripThumbnails();
    renderTrimUi();

    if (state.activeTrimEdge !== null) {
      trimFilmstrip.classList.add("is-visible");
    }
  } catch {
    if (generationId === state.thumbnailGenerationId) {
      resetTrimFilmstrip();
    }
  } finally {
    thumbnailVideo.removeAttribute("src");
    thumbnailVideo.load();
  }
}

function renderTrimFilmstripThumbnails(): void {
  trimFilmstripTrack.replaceChildren(
    ...state.thumbnailDataUrls.map((thumbnailDataUrl) => {
      const image = document.createElement("img");
      image.src = thumbnailDataUrl;
      image.alt = "";
      image.decoding = "async";
      image.draggable = false;
      return image;
    })
  );
}

function resetTrimFilmstrip(): void {
  state.thumbnailDataUrls = [];
  state.activeTrimEdge = null;
  clearTrimFilmstripHideTimer();
  trimFilmstrip.classList.remove("is-visible", "has-thumbnails", "edge-start", "edge-end");
  trimFilmstripTrack.replaceChildren();
}

function showTrimFilmstrip(edge: TrimEdge): void {
  state.activeTrimEdge = edge;
  clearTrimFilmstripHideTimer();
  renderTrimUi();

  if (state.thumbnailDataUrls.length === 0) {
    return;
  }

  trimFilmstrip.classList.add("is-visible");
}

function scheduleTrimFilmstripHide(): void {
  clearTrimFilmstripHideTimer();
  trimFilmstripHideTimer = window.setTimeout(() => {
    state.activeTrimEdge = null;
    trimFilmstrip.classList.remove("is-visible");
    renderTrimUi();
  }, TRIM_FILMSTRIP_HIDE_DELAY_MS);
}

function handleGlobalTrimPointerEnd(): void {
  if (state.activeTrimEdge !== null) {
    scheduleTrimFilmstripHide();
  }
}

function clearTrimFilmstripHideTimer(): void {
  if (trimFilmstripHideTimer !== null) {
    window.clearTimeout(trimFilmstripHideTimer);
    trimFilmstripHideTimer = null;
  }
}

function seekPreviewToTrimEdge(edge: TrimEdge): void {
  if (!state.canPreviewDirectly) {
    return;
  }

  video.currentTime = edge === "end" ? state.trimEnd : state.trimStart;
  updatePlaybackUi();
}

function waitForVideoMetadata(targetVideo: HTMLVideoElement): Promise<void> {
  if (targetVideo.readyState >= HTMLMediaElement.HAVE_METADATA) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const cleanup = (): void => {
      window.clearTimeout(timeoutId);
      targetVideo.removeEventListener("loadedmetadata", handleLoadedMetadata);
      targetVideo.removeEventListener("error", handleError);
    };
    const handleLoadedMetadata = (): void => {
      cleanup();
      resolve();
    };
    const handleError = (): void => {
      cleanup();
      reject(new Error("Thumbnail metadata load failed."));
    };
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("Thumbnail metadata load timed out."));
    }, 4000);

    targetVideo.addEventListener("loadedmetadata", handleLoadedMetadata, { once: true });
    targetVideo.addEventListener("error", handleError, { once: true });
  });
}

function seekThumbnailVideoTo(targetVideo: HTMLVideoElement, time: number): Promise<void> {
  const targetTime = Math.max(0, time);

  if (
    Math.abs(targetVideo.currentTime - targetTime) < 0.001 &&
    targetVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
  ) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const cleanup = (): void => {
      window.clearTimeout(timeoutId);
      targetVideo.removeEventListener("seeked", handleSeeked);
      targetVideo.removeEventListener("error", handleError);
    };
    const handleSeeked = (): void => {
      cleanup();
      resolve();
    };
    const handleError = (): void => {
      cleanup();
      reject(new Error("Thumbnail seek failed."));
    };
    const timeoutId = window.setTimeout(() => {
      cleanup();
      resolve();
    }, 2500);

    targetVideo.addEventListener("seeked", handleSeeked, { once: true });
    targetVideo.addEventListener("error", handleError, { once: true });
    targetVideo.currentTime = targetTime;
  });
}

function drawContainedFrame(
  context: CanvasRenderingContext2D,
  sourceVideo: HTMLVideoElement,
  canvasWidth: number,
  canvasHeight: number
): void {
  const sourceWidth = sourceVideo.videoWidth;
  const sourceHeight = sourceVideo.videoHeight;

  context.fillStyle = "#020913";
  context.fillRect(0, 0, canvasWidth, canvasHeight);

  if (sourceWidth <= 0 || sourceHeight <= 0) {
    return;
  }

  const scale = Math.min(canvasWidth / sourceWidth, canvasHeight / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  const drawX = (canvasWidth - drawWidth) / 2;
  const drawY = (canvasHeight - drawHeight) / 2;

  context.drawImage(sourceVideo, drawX, drawY, drawWidth, drawHeight);
}

function isTrimActive(): boolean {
  return (
    state.canPreviewDirectly &&
    state.duration > 0 &&
    (state.trimStart > 0.001 || state.trimEnd < state.duration - 0.001)
  );
}

function sliderValueToTime(value: string): number {
  if (state.duration <= 0) {
    return 0;
  }

  return (Number(value) / TRIM_SLIDER_MAX) * state.duration;
}

function timeToSliderValue(value: number): number {
  if (state.duration <= 0) {
    return 0;
  }

  return Math.round((value / state.duration) * TRIM_SLIDER_MAX);
}

function setPreviewControlsEnabled(enabled: boolean): void {
  playToggle.disabled = !enabled;
  muteToggle.disabled = !enabled;
  seekInput.disabled = !enabled;
  resetSourceButton.disabled = !state.sourceFile;
}

function resetSource(): void {
  revokeSourceUrl();
  resetVideoElement();
  resetTrimFilmstrip();

  state.sourceFile = null;
  state.sourceUrl = null;
  state.duration = 0;
  state.width = 0;
  state.height = 0;
  state.canPreviewDirectly = false;
  state.trimStart = 0;
  state.trimEnd = 0;
  state.cropMode = "full";
  state.cropRect = { ...DEFAULT_CROP_RECT };
  state.freeCropSizeLocked = false;
  state.resizeMode = "original";
  state.resizeWidth = 0;
  state.resizeHeight = 0;
  state.resizeAspectLocked = true;
  state.thumbnailGenerationId += 1;

  fileInput.value = "";
  uploadTitle.textContent = "Drop a video file here";
  uploadCopy.textContent = "Your video stays in this browser.";
  previewStatus.textContent = "Empty";
  previewStatus.classList.add("status-pill-muted");
  previewStatus.classList.remove("status-pill-warning");
  inspectorStatus.textContent = "Idle";
  placeholder.classList.remove("is-hidden");
  metaFile.textContent = "No source loaded";
  metaResolution.textContent = "--";
  metaDuration.textContent = "--";
  metaSize.textContent = "--";
  setPreviewControlsEnabled(false);
  setTrimControlsEnabled(false);
  setCropControlsEnabled(false);
  setResizeControlsEnabled(false);
  renderTrimUi();
  renderCropUi();
  renderResizeUi();
  updatePlaybackUi();
}

function resetVideoElement(): void {
  video.pause();
  video.removeAttribute("src");
  video.load();
  video.classList.remove("is-loaded");
  videoStage.classList.remove("is-loaded", "fit-width", "fit-height");
  cropDragSession = null;
  cropBox.classList.remove("is-dragging");
}

function revokeSourceUrl(): void {
  if (state.sourceUrl) {
    URL.revokeObjectURL(state.sourceUrl);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function roundTime(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function formatSecondsInput(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }

  return (Math.round(value * 10) / 10).toFixed(1);
}

function formatPreciseSeconds(value: number): string {
  return `${formatSecondsInput(value)} sec`;
}

function formatPlayerTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return "0:00";
  }

  const roundedSeconds = Math.floor(totalSeconds);
  const hours = Math.floor(roundedSeconds / 3600);
  const minutes = Math.floor((roundedSeconds % 3600) / 60);
  const seconds = roundedSeconds % 60;

  if (hours > 0) {
    return `${hours}:${padTime(minutes)}:${padTime(seconds)}`;
  }

  return `${minutes}:${padTime(seconds)}`;
}

function formatMarkerTime(value: number): string {
  if (!Number.isFinite(value) || value < 60) {
    return `${formatSecondsInput(value)}s`;
  }

  const tenths = Math.floor((value % 1) * 10);
  return `${formatTime(value)}.${tenths}`;
}

function formatTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return "00:00";
  }

  const roundedSeconds = Math.floor(totalSeconds);
  const hours = Math.floor(roundedSeconds / 3600);
  const minutes = Math.floor((roundedSeconds % 3600) / 60);
  const seconds = roundedSeconds % 60;

  if (hours > 0) {
    return `${hours}:${padTime(minutes)}:${padTime(seconds)}`;
  }

  return `${padTime(minutes)}:${padTime(seconds)}`;
}

function padTime(value: number): string {
  return String(value).padStart(2, "0");
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ["KB", "MB", "GB"];
  let size = bytes / 1024;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}
