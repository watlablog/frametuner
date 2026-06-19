import "./style.css";

type ControlTile = {
  title: string;
  value: string;
  note: string;
};

type PreviewState = {
  sourceKind: SourceKind;
  sourceFile: File | null;
  sourceUrl: string | null;
  duration: number;
  width: number;
  height: number;
  canPreviewDirectly: boolean;
  gifFrames: GifFrame[];
  gifCurrentFrameIndex: number;
  gifCurrentTime: number;
  gifIsPlaying: boolean;
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

type SourceKind = "empty" | "video" | "gif";
type TrimEdge = "start" | "end";
type CropMode = "full" | "16:9" | "9:16" | "1:1" | "free";
type CropHandle = "move" | "n" | "e" | "s" | "w" | "nw" | "ne" | "sw" | "se";
type ResizeMode = "original" | "custom";

type GifFrame = {
  canvas: HTMLCanvasElement;
  startTime: number;
  duration: number;
};

type GifDecodeResult = {
  frames: GifFrame[];
  width: number;
  height: number;
  duration: number;
};

type ImageDecoderConstructor = new (init: {
  data: BufferSource;
  type: string;
}) => ImageDecoderLike;

type ImageDecoderLike = {
  tracks: {
    ready?: Promise<void>;
    selectedTrack?: {
      frameCount?: number;
    };
  };
  decode(options?: { frameIndex?: number; completeFramesOnly?: boolean }): Promise<{
    image: VideoFrameLike;
  }>;
  close(): void;
};

type VideoFrameLike = CanvasImageSource & {
  codedWidth?: number;
  codedHeight?: number;
  displayWidth?: number;
  displayHeight?: number;
  duration?: number | null;
  close(): void;
};

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
const FALLBACK_GIF_FRAME_DURATION_MS = 100;
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

const FOLDER_OPEN_ICON = `
  <svg class="button-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M3.5 6.8A2.3 2.3 0 0 1 5.8 4.5h4.3l2.1 2.2h6A2.3 2.3 0 0 1 20.5 9v1.1H7.2a2.2 2.2 0 0 0-2.1 1.5l-1.6 4.6V6.8Z" />
    <path d="M5.2 12.3a1.8 1.8 0 0 1 1.7-1.2h13.6a1 1 0 0 1 .9 1.3l-2 5.8a1.8 1.8 0 0 1-1.7 1.2H4.1a1 1 0 0 1-.9-1.3l2-5.8Z" />
  </svg>
`;

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
  sourceKind: "empty",
  sourceFile: null,
  sourceUrl: null,
  duration: 0,
  width: 0,
  height: 0,
  canPreviewDirectly: false,
  gifFrames: [],
  gifCurrentFrameIndex: 0,
  gifCurrentTime: 0,
  gifIsPlaying: false,
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
            <strong data-upload-title>Drop a video file here</strong>
          </div>
          <input class="file-input" id="source-file" type="file" accept="video/*,image/gif" />
          <div class="upload-actions">
            <button class="button primary compact-button" type="button" data-choose-file>
              ${FOLDER_OPEN_ICON}
              <span>Open</span>
            </button>
            <button class="button compact-button clear-button" type="button" data-reset-source disabled>
              Clear
            </button>
          </div>
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
            <canvas class="gif-preview-canvas" data-gif-preview-canvas aria-hidden="true"></canvas>
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

        <dl class="media-meta" data-media-meta aria-label="Video metadata">
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

      <aside class="panel control-panel" aria-label="Edit controls">
        <section class="trim-panel" aria-labelledby="trim-title">
          <div class="trim-heading">
            <h3 id="trim-title">Trim range</h3>
            <span data-trim-summary>0:00.0 - 0:00.0 / 0.0s</span>
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
        </section>

        <section class="crop-panel" aria-labelledby="crop-title">
          <div class="crop-heading">
            <h3 id="crop-title">Crop</h3>
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
        </section>

        <section class="size-panel" aria-labelledby="size-title">
          <div class="size-heading">
            <h3 id="size-title">Resize</h3>
            <span data-size-summary>Original</span>
          </div>

          <div class="size-mode-row">
            <div class="size-preset-grid" role="group" aria-label="Resize preset">
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
            <label class="size-option">
              <input type="checkbox" data-resize-aspect checked disabled />
              <span>Keep aspect</span>
            </label>
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
                aria-label="Resize width in pixels"
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
                aria-label="Resize height in pixels"
                data-resize-height
                disabled
              />
            </label>
          </div>

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
const videoFrame = query<HTMLDivElement>(".video-frame");
const videoStage = query<HTMLDivElement>("[data-video-stage]");
const video = query<HTMLVideoElement>("[data-preview-video]");
const gifCanvas = query<HTMLCanvasElement>("[data-gif-preview-canvas]");
const gifContext = gifCanvas.getContext("2d");
const placeholder = query<HTMLDivElement>("[data-video-placeholder]");
const previewStatus = query<HTMLElement>("[data-preview-status]");
const playToggle = query<HTMLButtonElement>("[data-play-toggle]");
const muteToggle = query<HTMLButtonElement>("[data-mute-toggle]");
const seekInput = query<HTMLInputElement>("[data-seek]");
const timeReadout = query<HTMLElement>("[data-time-readout]");
const resetSourceButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-reset-source]"));
const metaFile = query<HTMLElement>("[data-meta-file]");
const metaResolution = query<HTMLElement>("[data-meta-resolution]");
const metaDuration = query<HTMLElement>("[data-meta-duration]");
const metaSize = query<HTMLElement>("[data-meta-size]");
const trimSlider = query<HTMLDivElement>("[data-trim-slider]");
const trimStartRange = query<HTMLInputElement>("[data-trim-start-range]");
const trimEndRange = query<HTMLInputElement>("[data-trim-end-range]");
const trimSummary = query<HTMLElement>("[data-trim-summary]");
const trimFilmstrip = query<HTMLDivElement>("[data-trim-filmstrip]");
const trimFilmstripTrack = query<HTMLDivElement>("[data-trim-filmstrip-track]");
const trimStartMarkerTime = query<HTMLElement>("[data-trim-start-marker-time]");
const trimEndMarkerTime = query<HTMLElement>("[data-trim-end-marker-time]");
const trimActiveLabel = query<HTMLElement>("[data-trim-active-label]");
const trimActiveTime = query<HTMLElement>("[data-trim-active-time]");
const cropOverlay = query<HTMLDivElement>("[data-crop-overlay]");
const cropBox = query<HTMLDivElement>("[data-crop-box]");
const cropSummary = query<HTMLElement>("[data-crop-summary]");
const cropSizeInput = query<HTMLInputElement>("[data-crop-size]");
const freeSizeFields = query<HTMLDivElement>("[data-free-size-fields]");
const freeCropWidthInput = query<HTMLInputElement>("[data-free-crop-width]");
const freeCropHeightInput = query<HTMLInputElement>("[data-free-crop-height]");
const freeSizeState = query<HTMLElement>("[data-free-size-state]");
const cropModeButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-crop-mode]"));
const sizeSummary = query<HTMLElement>("[data-size-summary]");
const resizeWidthInput = query<HTMLInputElement>("[data-resize-width]");
const resizeHeightInput = query<HTMLInputElement>("[data-resize-height]");
const resizeAspectInput = query<HTMLInputElement>("[data-resize-aspect]");
const resizeModeButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-resize-mode]"));
let trimFilmstripHideTimer: number | null = null;
let cropDragSession: CropDragSession | null = null;
let gifPlaybackTimer: number | null = null;

chooseFileButton.addEventListener("click", () => fileInput.click());

uploadBar.addEventListener("keydown", (event) => {
  if ((event.key === "Enter" || event.key === " ") && event.target === uploadBar) {
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
  if (state.sourceKind !== "video") {
    return;
  }

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
  if (state.sourceKind === "video") {
    handlePreviewLoadFailure();
  }
});

playToggle.addEventListener("click", async () => {
  if (!state.canPreviewDirectly) {
    return;
  }

  if (state.sourceKind === "gif") {
    if (state.gifIsPlaying) {
      stopGifPlayback();
    } else {
      startGifPlayback();
    }
    updatePlaybackUi();
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
  if (state.sourceKind === "gif") {
    return;
  }

  video.muted = !video.muted;
  updatePlaybackUi();
});

seekInput.addEventListener("input", () => {
  if (!state.canPreviewDirectly || state.duration <= 0) {
    return;
  }

  const nextTime = (Number(seekInput.value) / Number(seekInput.max)) * state.duration;
  seekPreviewToTime(isTrimActive() ? clamp(nextTime, state.trimStart, state.trimEnd) : nextTime);
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

cropBox.addEventListener("pointerdown", startCropDrag);
cropBox.addEventListener("keydown", handleCropKeyboard);

for (const button of resetSourceButtons) {
  button.addEventListener("click", resetSource);
}

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

function isGifFile(file: File): boolean {
  return file.type === "image/gif" || file.name.toLowerCase().endsWith(".gif");
}

function loadSourceFile(file: File): void {
  revokeSourceUrl();
  stopGifPlayback();
  state.sourceKind = "empty";
  resetVideoElement();
  resetTrimFilmstrip();
  resetGifState();

  const isGif = isGifFile(file);

  state.sourceFile = file;
  state.sourceKind = isGif ? "gif" : "video";
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
  const generationId = state.thumbnailGenerationId;

  uploadTitle.textContent = file.name;
  previewStatus.textContent = "Loading";
  previewStatus.classList.add("status-pill-muted");
  previewStatus.classList.remove("status-pill-warning");
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

  if (isGif) {
    void loadGifSource(file, generationId);
    return;
  }

  state.sourceUrl = URL.createObjectURL(file);
  video.src = state.sourceUrl;
  video.load();
}

async function loadGifSource(file: File, generationId: number): Promise<void> {
  try {
    const decodedGif = await decodeGifFrames(file, generationId);

    if (!decodedGif || !isCurrentSourceGeneration(file, generationId)) {
      return;
    }

    state.gifFrames = decodedGif.frames;
    state.gifCurrentFrameIndex = 0;
    state.gifCurrentTime = 0;
    state.duration = decodedGif.duration;
    state.width = decodedGif.width;
    state.height = decodedGif.height;
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

    gifCanvas.width = state.width;
    gifCanvas.height = state.height;
    renderLoadedState();
    drawGifFrame(0);
    void generateTrimThumbnails();
  } catch {
    if (isCurrentSourceGeneration(file, generationId)) {
      handlePreviewLoadFailure();
    }
  }
}

function handlePreviewLoadFailure(): void {
  stopGifPlayback();
  state.canPreviewDirectly = false;
  previewStatus.textContent = "Unsupported";
  previewStatus.classList.remove("status-pill-muted");
  previewStatus.classList.add("status-pill-warning");
  placeholder.classList.remove("is-hidden");
  video.classList.remove("is-loaded");
  gifCanvas.classList.remove("is-loaded");
  videoStage.classList.remove("is-loaded", "is-gif", "fit-width", "fit-height");
  setPreviewControlsEnabled(false);
  setTrimControlsEnabled(false);
  setCropControlsEnabled(false);
  setResizeControlsEnabled(false);
  renderTrimUi();
  renderCropUi();
  renderResizeUi();
  updatePlaybackUi();
}

function renderLoadedState(): void {
  previewStatus.textContent = "Ready";
  previewStatus.classList.remove("status-pill-muted", "status-pill-warning");
  placeholder.classList.add("is-hidden");
  video.classList.toggle("is-loaded", state.sourceKind === "video");
  gifCanvas.classList.toggle("is-loaded", state.sourceKind === "gif");
  videoStage.classList.toggle("is-gif", state.sourceKind === "gif");
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

async function decodeGifFrames(file: File, generationId: number): Promise<GifDecodeResult | null> {
  const ImageDecoder = getImageDecoderConstructor();

  if (!ImageDecoder) {
    throw new Error("GIF decoding is not supported in this browser.");
  }

  const decoder = new ImageDecoder({
    data: await file.arrayBuffer(),
    type: "image/gif"
  });

  try {
    await decoder.tracks.ready;

    if (!isCurrentSourceGeneration(file, generationId)) {
      return null;
    }

    const frameCount = Math.max(1, Math.floor(decoder.tracks.selectedTrack?.frameCount ?? 1));
    const frames: GifFrame[] = [];
    let width = 0;
    let height = 0;
    let startTime = 0;

    for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
      if (!isCurrentSourceGeneration(file, generationId)) {
        return null;
      }

      const decodedFrame = await decoder.decode({ frameIndex, completeFramesOnly: true });
      const image = decodedFrame.image;

      try {
        const frameWidth = getDecodedFrameWidth(image);
        const frameHeight = getDecodedFrameHeight(image);

        if (frameWidth <= 0 || frameHeight <= 0) {
          throw new Error("GIF dimensions could not be decoded.");
        }

        width = width || frameWidth;
        height = height || frameHeight;

        const frameCanvas = document.createElement("canvas");
        const frameContext = frameCanvas.getContext("2d");

        if (!frameContext) {
          throw new Error("Canvas is not available.");
        }

        frameCanvas.width = width;
        frameCanvas.height = height;
        frameContext.clearRect(0, 0, width, height);
        frameContext.drawImage(image, 0, 0, width, height);

        const duration = getDecodedFrameDurationSeconds(image);
        frames.push({
          canvas: frameCanvas,
          startTime: roundTime(startTime),
          duration
        });
        startTime += duration;
      } finally {
        image.close();
      }
    }

    const duration = roundTime(startTime);

    if (frames.length === 0 || width <= 0 || height <= 0 || duration <= 0) {
      throw new Error("GIF does not contain usable frames.");
    }

    return {
      frames,
      width,
      height,
      duration
    };
  } finally {
    decoder.close();
  }
}

function getImageDecoderConstructor(): ImageDecoderConstructor | null {
  return (globalThis as unknown as { ImageDecoder?: ImageDecoderConstructor }).ImageDecoder ?? null;
}

function getDecodedFrameWidth(frame: VideoFrameLike): number {
  return Math.round(frame.displayWidth ?? frame.codedWidth ?? 0);
}

function getDecodedFrameHeight(frame: VideoFrameLike): number {
  return Math.round(frame.displayHeight ?? frame.codedHeight ?? 0);
}

function getDecodedFrameDurationSeconds(frame: VideoFrameLike): number {
  const durationValue = Number(frame.duration);
  const durationMs = Number.isFinite(durationValue) && durationValue > 0
    ? durationValue >= 1000 ? durationValue / 1000 : durationValue
    : FALLBACK_GIF_FRAME_DURATION_MS;

  return clamp(durationMs, 20, 10000) / 1000;
}

function isCurrentSourceGeneration(file: File, generationId: number): boolean {
  return state.sourceFile === file && state.thumbnailGenerationId === generationId;
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
  if (state.sourceKind !== "video") {
    return;
  }

  if (isTrimActive() && video.currentTime >= state.trimEnd) {
    video.pause();
    video.currentTime = state.trimEnd;
  } else if (!video.paused && video.currentTime < state.trimStart) {
    video.currentTime = state.trimStart;
  }

  updatePlaybackUi();
}

function updatePlaybackUi(): void {
  const duration = state.sourceKind === "video" && Number.isFinite(video.duration) ? video.duration : state.duration;
  const currentTime = getCurrentPreviewTime();
  const isPlaying = state.sourceKind === "gif" ? state.gifIsPlaying : !video.paused;
  const muteLabel = state.sourceKind === "gif" ? "No audio" : video.muted ? "Unmute" : "Mute";
  const muteIcon = state.sourceKind === "gif" ? "volume" : video.muted ? "muted" : "volume";
  const mutePressed = state.sourceKind === "gif" ? false : video.muted;

  setPlayerIconButton(playToggle, isPlaying ? "pause" : "play", isPlaying ? "Pause" : "Play", isPlaying);
  setPlayerIconButton(muteToggle, muteIcon, muteLabel, mutePressed);
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

function getCurrentPreviewTime(): number {
  if (state.sourceKind === "gif") {
    return state.gifCurrentTime;
  }

  return Number.isFinite(video.currentTime) ? video.currentTime : 0;
}

function seekPreviewToTime(time: number): void {
  const targetTime = clamp(time, 0, state.duration);

  if (state.sourceKind === "gif") {
    setGifCurrentTime(getNearestGifFrameStart(targetTime));
    return;
  }

  video.currentTime = isTrimActive() ? clamp(targetTime, state.trimStart, state.trimEnd) : targetTime;
}

function startGifPlayback(): void {
  if (state.sourceKind !== "gif" || state.gifFrames.length === 0) {
    return;
  }

  if (state.gifCurrentTime < state.trimStart || state.gifCurrentTime >= state.trimEnd) {
    setGifCurrentTime(state.trimStart);
  }

  state.gifIsPlaying = true;
  scheduleNextGifFrame();
}

function stopGifPlayback(): void {
  state.gifIsPlaying = false;

  if (gifPlaybackTimer !== null) {
    window.clearTimeout(gifPlaybackTimer);
    gifPlaybackTimer = null;
  }
}

function scheduleNextGifFrame(): void {
  if (!state.gifIsPlaying || state.sourceKind !== "gif") {
    return;
  }

  const frame = state.gifFrames[state.gifCurrentFrameIndex];

  if (!frame) {
    stopGifPlayback();
    updatePlaybackUi();
    return;
  }

  const elapsedInFrame = Math.max(0, state.gifCurrentTime - frame.startTime);
  const remainingMs = Math.max(20, (frame.duration - elapsedInFrame) * 1000);

  if (gifPlaybackTimer !== null) {
    window.clearTimeout(gifPlaybackTimer);
  }

  gifPlaybackTimer = window.setTimeout(() => {
    const nextTime = roundTime(frame.startTime + frame.duration);
    const stopTime = isTrimActive() ? state.trimEnd : state.duration;

    if (nextTime >= stopTime - 0.0001) {
      setGifCurrentTime(stopTime, true);
      stopGifPlayback();
      updatePlaybackUi();
      return;
    }

    setGifCurrentTime(nextTime);
    updatePlaybackUi();
    scheduleNextGifFrame();
  }, remainingMs);
}

function setGifCurrentTime(time: number, preferPreviousBoundary = false): void {
  if (state.sourceKind !== "gif" || state.gifFrames.length === 0) {
    return;
  }

  const clampedTime = clamp(time, 0, state.duration);
  const frameIndex = getGifFrameIndexAtTime(clampedTime, preferPreviousBoundary);
  state.gifCurrentFrameIndex = frameIndex;
  state.gifCurrentTime = roundTime(clampedTime);
  drawGifFrame(frameIndex);
}

function drawGifFrame(frameIndex: number): void {
  if (!gifContext) {
    return;
  }

  const frame = state.gifFrames[frameIndex];

  if (!frame) {
    return;
  }

  gifContext.clearRect(0, 0, gifCanvas.width, gifCanvas.height);
  gifContext.drawImage(frame.canvas, 0, 0, gifCanvas.width, gifCanvas.height);
}

function getGifFrameIndexAtTime(time: number, preferPreviousBoundary = false): number {
  const frames = state.gifFrames;

  if (frames.length <= 1) {
    return 0;
  }

  const safeTime = clamp(time, 0, state.duration);

  if (safeTime >= state.duration) {
    return frames.length - 1;
  }

  if (preferPreviousBoundary) {
    for (let index = frames.length - 1; index > 0; index -= 1) {
      if (Math.abs(safeTime - frames[index].startTime) < 0.0001) {
        return index - 1;
      }
    }
  }

  for (let index = frames.length - 1; index >= 0; index -= 1) {
    if (safeTime >= frames[index].startTime) {
      return index;
    }
  }

  return 0;
}

function getGifFrameBoundaries(): number[] {
  if (state.gifFrames.length === 0) {
    return [0];
  }

  return [
    ...state.gifFrames.map((frame) => frame.startTime),
    state.duration
  ];
}

function getNearestGifFrameStart(time: number): number {
  if (state.gifFrames.length === 0) {
    return 0;
  }

  let nearestTime = state.gifFrames[0].startTime;
  let nearestDistance = Math.abs(nearestTime - time);

  for (const frame of state.gifFrames) {
    const distance = Math.abs(frame.startTime - time);
    if (distance < nearestDistance) {
      nearestTime = frame.startTime;
      nearestDistance = distance;
    }
  }

  return nearestTime;
}

function getNearestGifBoundaryIndex(time: number, boundaries = getGifFrameBoundaries()): number {
  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < boundaries.length; index += 1) {
    const distance = Math.abs(boundaries[index] - time);
    if (distance < nearestDistance) {
      nearestIndex = index;
      nearestDistance = distance;
    }
  }

  return nearestIndex;
}

function setTrimRange(nextStart: number, nextEnd: number, editedEdge: "start" | "end"): void {
  if (!state.canPreviewDirectly || state.duration <= 0) {
    return;
  }

  if (state.sourceKind === "gif") {
    setGifTrimRange(nextStart, nextEnd, editedEdge);
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

  seekPreviewToTime(video.currentTime);

  renderTrimUi();
  updatePlaybackUi();
}

function setGifTrimRange(nextStart: number, nextEnd: number, editedEdge: "start" | "end"): void {
  const boundaries = getGifFrameBoundaries();

  if (boundaries.length < 2) {
    return;
  }

  let startIndex = getNearestGifBoundaryIndex(nextStart, boundaries);
  let endIndex = getNearestGifBoundaryIndex(nextEnd, boundaries);

  if (endIndex <= startIndex) {
    if (editedEdge === "start") {
      startIndex = Math.max(0, endIndex - 1);
    } else {
      endIndex = Math.min(boundaries.length - 1, startIndex + 1);
    }
  }

  state.trimStart = boundaries[startIndex];
  state.trimEnd = boundaries[endIndex];

  const currentTime = getCurrentPreviewTime();
  if (currentTime < state.trimStart || currentTime > state.trimEnd) {
    setGifCurrentTime(editedEdge === "end" ? state.trimEnd : state.trimStart, editedEdge === "end");
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
      ? `${formatTrimTime(state.trimStart)} - ${formatTrimTime(state.trimEnd)} / ${formatSecondsInput(trimDuration)}s`
      : "0:00.0 - 0:00.0 / 0.0s";
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
  cropBox.tabIndex = active ? 0 : -1;
  cropSummary.textContent = editable ? formatCropSummary() : "Full frame";
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

function renderResizeUi(): void {
  const editable = isResizeEditable();
  const outputSize = editable ? getCurrentResizeSize() : { width: 0, height: 0 };
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
  sizeSummary.textContent = editable
    ? `${getResizeModeLabel(state.resizeMode)} ${outputSize.width} x ${outputSize.height}`
    : "Original";
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
  if (!state.canPreviewDirectly || state.duration <= 0) {
    resetTrimFilmstrip();
    return;
  }

  if (state.sourceKind === "gif") {
    generateGifTrimThumbnails();
    return;
  }

  if (!state.sourceUrl) {
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
      drawContainedFrame(context, thumbnailVideo, thumbnailVideo.videoWidth, thumbnailVideo.videoHeight, canvas.width, canvas.height);
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

function generateGifTrimThumbnails(): void {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context || state.gifFrames.length === 0) {
    resetTrimFilmstrip();
    return;
  }

  canvas.width = TRIM_THUMBNAIL_WIDTH;
  canvas.height = TRIM_THUMBNAIL_HEIGHT;

  const thumbnails: string[] = [];
  const thumbnailCount: number = TRIM_THUMBNAIL_COUNT;

  for (let index = 0; index < thumbnailCount; index += 1) {
    const progress = thumbnailCount === 1 ? 0 : index / (thumbnailCount - 1);
    const frameIndex = getGifFrameIndexAtTime(state.duration * progress, progress === 1);
    const frame = state.gifFrames[frameIndex];

    if (frame) {
      drawContainedFrame(context, frame.canvas, frame.canvas.width, frame.canvas.height, canvas.width, canvas.height);
      thumbnails.push(canvas.toDataURL("image/jpeg", 0.72));
    }
  }

  state.thumbnailDataUrls = thumbnails;
  renderTrimFilmstripThumbnails();
  renderTrimUi();

  if (state.activeTrimEdge !== null) {
    trimFilmstrip.classList.add("is-visible");
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

  if (state.sourceKind === "gif") {
    setGifCurrentTime(edge === "end" ? state.trimEnd : state.trimStart, edge === "end");
    updatePlaybackUi();
    return;
  }

  seekPreviewToTime(edge === "end" ? state.trimEnd : state.trimStart);
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
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  canvasWidth: number,
  canvasHeight: number
): void {
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

  context.drawImage(source, drawX, drawY, drawWidth, drawHeight);
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
  muteToggle.disabled = !enabled || state.sourceKind === "gif";
  seekInput.disabled = !enabled;
  for (const button of resetSourceButtons) {
    button.disabled = !state.sourceFile;
  }
}

function resetSource(): void {
  revokeSourceUrl();
  stopGifPlayback();
  state.sourceKind = "empty";
  resetVideoElement();
  resetTrimFilmstrip();
  resetGifState();

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
  previewStatus.textContent = "Empty";
  previewStatus.classList.add("status-pill-muted");
  previewStatus.classList.remove("status-pill-warning");
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
  gifCanvas.classList.remove("is-loaded");
  videoStage.classList.remove("is-loaded", "is-gif", "fit-width", "fit-height");
  cropDragSession = null;
  cropBox.classList.remove("is-dragging");

  if (gifContext) {
    gifContext.clearRect(0, 0, gifCanvas.width, gifCanvas.height);
  }
}

function revokeSourceUrl(): void {
  if (state.sourceUrl) {
    URL.revokeObjectURL(state.sourceUrl);
    state.sourceUrl = null;
  }
}

function resetGifState(): void {
  state.gifFrames = [];
  state.gifCurrentFrameIndex = 0;
  state.gifCurrentTime = 0;
  state.gifIsPlaying = false;
  gifCanvas.width = 0;
  gifCanvas.height = 0;
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

function formatTrimTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return "0:00.0";
  }

  const tenths = Math.floor((totalSeconds % 1) * 10);
  const wholeSeconds = Math.floor(totalSeconds);
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const seconds = wholeSeconds % 60;

  if (hours > 0) {
    return `${hours}:${padTime(minutes)}:${padTime(seconds)}.${tenths}`;
  }

  return `${minutes}:${padTime(seconds)}.${tenths}`;
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
