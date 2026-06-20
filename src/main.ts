import "./style.css";

import type { FFmpeg, LogEvent, ProgressEvent } from "@ffmpeg/ffmpeg";

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
  staticFrameCanvas: HTMLCanvasElement | null;
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

type SourceKind = "empty" | "video" | "gif" | "image";
type TrimEdge = "start" | "end";
type CropMode = "full" | "16:9" | "9:16" | "1:1" | "free";
type CropHandle = "move" | "n" | "e" | "s" | "w" | "nw" | "ne" | "sw" | "se";
type ResizeMode = "original" | "custom";
type ExportFormat = "mp4" | "gif" | "png" | "jpeg" | "bmp";
type ExportJobStatus = "idle" | "loading-ffmpeg" | "running" | "done" | "error";

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

type ExportJobState = {
  status: ExportJobStatus;
  format: ExportFormat;
  progress: number;
  message: string;
  logs: string[];
  outputUrl: string | null;
  outputFileName: string | null;
};

type ExportCommandPlan = {
  sourceKind: "video" | "gif" | "image";
  format: ExportFormat;
  execution: "ffmpeg" | "canvas";
  inputName: string | null;
  outputName: string;
  outputFileName: string;
  outputMimeType: string;
  saveDescription: string;
  saveAccept: Record<string, string[]>;
  args: string[];
};

type EditSettingsSnapshot = {
  trimStart: number;
  trimEnd: number;
  cropMode: CropMode;
  cropRect: CropRect;
  freeCropSizeLocked: boolean;
  resizeMode: ResizeMode;
  resizeWidth: number;
  resizeHeight: number;
  resizeAspectLocked: boolean;
};

type AssignCheckpoint = {
  sourceFile: File;
  settings: EditSettingsSnapshot;
  format: ExportFormat;
};

type PendingSettingsRestore = {
  generationId: number;
  settings: EditSettingsSnapshot;
  format: ExportFormat;
};

type LoadSourceOptions = {
  clearAssignCheckpoint?: boolean;
  restoreSettings?: EditSettingsSnapshot;
  restoreFormat?: ExportFormat;
};

type GifExportSizeEstimate = {
  estimatedBytes: number;
  frameCount: number;
  width: number;
  height: number;
};

type CanvasExportFrame = {
  canvas: HTMLCanvasElement;
  duration: number;
};

type GifExportGeometry = {
  crop: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  outputWidth: number;
  outputHeight: number;
};

type FileSystemWritableFileStreamLike = {
  write(data: Blob): Promise<void>;
  close(): Promise<void>;
};

type FileSystemFileHandleLike = {
  name?: string;
  createWritable(): Promise<FileSystemWritableFileStreamLike>;
};

type SaveFilePickerOptionsLike = {
  suggestedName?: string;
  types?: Array<{
    description: string;
    accept: Record<string, string[]>;
  }>;
  excludeAcceptAllOption?: boolean;
};

type SaveFilePickerWindow = Window & typeof globalThis & {
  showSaveFilePicker?: (options?: SaveFilePickerOptionsLike) => Promise<FileSystemFileHandleLike>;
};

type ExportSaveTarget =
  | {
      kind: "native";
      handle: FileSystemFileHandleLike;
      fileName: string;
    }
  | {
      kind: "download";
      fileName: string;
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
const FFMPEG_CORE_URL = "/ffmpeg/ffmpeg-core.js";
const FFMPEG_WASM_URL = "/ffmpeg/ffmpeg-core.wasm";
const EXPORT_MP4_OUTPUT_NAME = "output.mp4";
const EXPORT_GIF_OUTPUT_NAME = "output.gif";
const GIF_CONCAT_INPUT_NAME = "gif-frames.ffconcat";
const GIF_FRAME_FILE_PREFIX = "gif-frame";
const GIF_ESTIMATE_BYTES_PER_PIXEL_FRAME = 1.05;
const GIF_ESTIMATE_VIDEO_FPS = 30;
const GIF_EXPORT_WARNING_BYTES = 64 * 1024 * 1024;
const EXPORT_LOG_MAX_LINES = 240;
const GIF_EXPORT_WARNING_MESSAGE =
  "This GIF conversion may be large and could fail. Reduce the output size with Resize or shorten the Trim range before converting.";
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

const CLEAR_ICON = `
  <svg class="button-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M9 3.5h6a1 1 0 0 1 1 1V6h4a1 1 0 1 1 0 2H4a1 1 0 0 1 0-2h4V4.5a1 1 0 0 1 1-1Zm1 2.5h4v-.5h-4V6Z" />
    <path d="M6.2 9.5h11.6l-.7 9.1a2.1 2.1 0 0 1-2.1 1.9H9a2.1 2.1 0 0 1-2.1-1.9l-.7-9.1Zm4.2 2.3a.8.8 0 0 0-.8.8v4.2a.8.8 0 0 0 1.6 0v-4.2a.8.8 0 0 0-.8-.8Zm3.2 0a.8.8 0 0 0-.8.8v4.2a.8.8 0 0 0 1.6 0v-4.2a.8.8 0 0 0-.8-.8Z" />
  </svg>
`;

const EXPORT_ICON = `
  <svg class="button-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M12 3.5a1 1 0 0 1 1 1v8.1l2.7-2.7a1 1 0 1 1 1.4 1.4l-4.4 4.4a1 1 0 0 1-1.4 0l-4.4-4.4a1 1 0 1 1 1.4-1.4l2.7 2.7V4.5a1 1 0 0 1 1-1Z" />
    <path d="M5 15.5a1 1 0 0 1 1 1v2h12v-2a1 1 0 1 1 2 0v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1Z" />
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
  staticFrameCanvas: null,
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

const exportState: ExportJobState = {
  status: "idle",
  format: "mp4",
  progress: 0,
  message: "Load a source to export.",
  logs: [],
  outputUrl: null,
  outputFileName: null
};

let assignCheckpoint: AssignCheckpoint | null = null;
let pendingSettingsRestore: PendingSettingsRestore | null = null;

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
    </header>

    <main class="workspace" aria-label="FrameTuner workspace">
      <section class="panel media-panel" aria-labelledby="preview-title">
        <div class="preview-header">
          <h2 id="preview-title">Preview</h2>
          <div class="preview-actions">
            <span class="status-pill status-pill-muted" data-preview-status>Empty</span>
            <input
              class="file-input"
              id="source-file"
              type="file"
              accept="video/*,image/gif,image/png,image/jpeg,image/bmp,.jpg,.jpeg,.png,.bmp"
            />
            <button class="button primary compact-button" type="button" data-choose-file>
              ${FOLDER_OPEN_ICON}
              <span>Open</span>
            </button>
            <button class="button compact-button clear-button" type="button" data-reset-source disabled>
              ${CLEAR_ICON}
              <span>Clear</span>
            </button>
          </div>
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
            <p>Drop a video, GIF, or image onto this preview window to load it.</p>
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

        <dl class="media-meta" data-media-meta aria-label="Source metadata">
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
        <div class="export-tabs" role="tablist" aria-label="Editor panel tabs">
          <button
            class="export-tab is-selected"
            type="button"
            role="tab"
            aria-selected="true"
            aria-controls="export-settings-panel"
            id="export-settings-tab"
            data-export-tab="settings"
          >
            Settings
          </button>
          <button
            class="export-tab"
            type="button"
            role="tab"
            aria-selected="false"
            aria-controls="export-log-panel"
            id="export-log-tab"
            data-export-tab="log"
          >
            Log
          </button>
        </div>

        <div
          class="export-tab-panel setting-tab-panel"
          id="export-settings-panel"
          role="tabpanel"
          aria-labelledby="export-settings-tab"
          data-export-panel="settings"
        >
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

          <section class="export-strip" aria-labelledby="export-title">
            <div class="export-heading">
              <div>
                <h2 id="export-title">Output</h2>
              </div>
              <span class="status-pill status-pill-muted" data-export-status>Not ready</span>
            </div>

            <div class="export-grid">
              <label>
                <span>Format</span>
                <select data-export-format disabled>
                  <option value="mp4">MP4</option>
                  <option value="gif">GIF</option>
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
                <select data-export-audio disabled>
                  <option>Keep audio</option>
                </select>
              </label>
            </div>

            <div class="export-actions" aria-label="Apply and export actions">
              <button class="button" type="button" data-assign-button disabled>Assign</button>
              <button class="button" type="button" data-assign-reset disabled>Reset</button>
              <button class="button primary export-button" type="button" data-export-button disabled>
                ${EXPORT_ICON}
                <span>Export</span>
              </button>
            </div>

            <div class="progress-shell" aria-label="Export progress">
              <span class="progress-bar" data-export-progress style="width: 0%"></span>
            </div>
          </section>
        </div>

        <div
          class="export-tab-panel log-tab-panel is-hidden"
          id="export-log-panel"
          role="tabpanel"
          aria-labelledby="export-log-tab"
          data-export-panel="log"
        >
          <div class="export-terminal" aria-label="Export log terminal">
            <div class="terminal-chrome" aria-hidden="true">
              <span></span>
              <span></span>
              <span></span>
            </div>
            <pre class="export-log" data-export-log aria-live="polite"></pre>
          </div>
        </div>
      </aside>
    </main>
  </div>

  <div class="export-warning-backdrop" data-export-warning-dialog aria-hidden="true" hidden>
    <section
      class="export-warning-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-warning-title"
      aria-describedby="export-warning-description"
    >
      <span class="section-kicker">Conversion warning</span>
      <h2 id="export-warning-title">Large GIF conversion</h2>
      <p id="export-warning-description">${GIF_EXPORT_WARNING_MESSAGE}</p>
      <div class="export-warning-summary" aria-label="Estimated conversion details">
        <span>Estimated GIF</span>
        <strong data-export-warning-size>--</strong>
      </div>
      <div class="export-warning-actions">
        <button class="button" type="button" data-export-warning-cancel>Cancel</button>
        <button class="button primary" type="button" data-export-warning-ok>OK</button>
      </div>
    </section>
  </div>

  <div class="export-result-backdrop" data-export-result-dialog aria-hidden="true" hidden>
    <section
      class="export-result-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-result-title"
    >
      <h2 id="export-result-title" data-export-result-title>Successfully exported!</h2>
      <p data-export-result-detail></p>
      <a class="button primary export-result-download is-hidden" href="#" download data-export-result-download>
        Download
      </a>
      <button class="button" type="button" data-export-result-close>OK</button>
    </section>
  </div>
`;

const fileInput = query<HTMLInputElement>("#source-file");
const chooseFileButton = query<HTMLButtonElement>("[data-choose-file]");
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
const controlGrid = query<HTMLDivElement>(".control-grid");
const exportStatus = query<HTMLElement>("[data-export-status]");
const exportFormatSelect = query<HTMLSelectElement>("[data-export-format]");
const exportAudioSelect = query<HTMLSelectElement>("[data-export-audio]");
const assignButton = query<HTMLButtonElement>("[data-assign-button]");
const assignResetButton = query<HTMLButtonElement>("[data-assign-reset]");
const exportButton = query<HTMLButtonElement>("[data-export-button]");
const exportProgress = query<HTMLElement>("[data-export-progress]");
const exportLog = query<HTMLPreElement>("[data-export-log]");
const exportTabButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-export-tab]"));
const exportTabPanels = Array.from(document.querySelectorAll<HTMLElement>("[data-export-panel]"));
const exportWarningDialog = query<HTMLDivElement>("[data-export-warning-dialog]");
const exportWarningSize = query<HTMLElement>("[data-export-warning-size]");
const exportWarningCancelButton = query<HTMLButtonElement>("[data-export-warning-cancel]");
const exportWarningOkButton = query<HTMLButtonElement>("[data-export-warning-ok]");
const exportResultDialog = query<HTMLDivElement>("[data-export-result-dialog]");
const exportResultTitle = query<HTMLElement>("[data-export-result-title]");
const exportResultDetail = query<HTMLElement>("[data-export-result-detail]");
const exportResultDownload = query<HTMLAnchorElement>("[data-export-result-download]");
const exportResultCloseButton = query<HTMLButtonElement>("[data-export-result-close]");
let trimFilmstripHideTimer: number | null = null;
let cropDragSession: CropDragSession | null = null;
let gifPlaybackTimer: number | null = null;
let ffmpegInstance: FFmpeg | null = null;
let ffmpegLoadPromise: Promise<FFmpeg> | null = null;
let latestFfmpegLog = "";
let activeExportTab: "settings" | "log" = "settings";
let exportWarningDialogResolve: ((confirmed: boolean) => void) | null = null;
let exportWarningPreviousFocus: HTMLElement | null = null;
let exportResultPreviousFocus: HTMLElement | null = null;

chooseFileButton.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", () => {
  const [file] = Array.from(fileInput.files ?? []);
  if (file) {
    loadSourceFile(file);
  }
});

videoFrame.addEventListener("dragenter", handleDragOver);
videoFrame.addEventListener("dragover", handleDragOver);
videoFrame.addEventListener("dragleave", (event) => {
  if (!videoFrame.contains(event.relatedTarget as Node | null)) {
    videoFrame.classList.remove("is-dragging");
  }
});
videoFrame.addEventListener("drop", (event) => {
  event.preventDefault();
  videoFrame.classList.remove("is-dragging");
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
  applyPendingSettingsRestore(state.thumbnailGenerationId);
  video.currentTime = 0;
  seekPreviewToTime(state.trimStart);
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
  if (!state.canPreviewDirectly || isSingleFrameSource()) {
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
  if (state.sourceKind !== "video") {
    return;
  }

  video.muted = !video.muted;
  updatePlaybackUi();
});

seekInput.addEventListener("input", () => {
  if (!state.canPreviewDirectly || state.duration <= 0 || isSingleFrameSource()) {
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
  invalidateExportOutput();
  renderResizeUi();
});

cropBox.addEventListener("pointerdown", startCropDrag);
cropBox.addEventListener("keydown", handleCropKeyboard);
exportFormatSelect.addEventListener("change", () => {
  exportState.format = readExportFormatSelectValue();
  invalidateExportOutput();
});
for (const button of exportTabButtons) {
  button.addEventListener("click", () => {
    const tab = button.dataset.exportTab;
    if (tab === "settings" || tab === "log") {
      activeExportTab = tab;
      renderExportUi();
    }
  });
}
assignButton.addEventListener("click", () => {
  void assignCurrentSource();
});
assignResetButton.addEventListener("click", resetAssignedSource);
exportButton.addEventListener("click", () => {
  void exportCurrentSource();
});
exportWarningCancelButton.addEventListener("click", () => {
  closeExportWarningDialog(false);
});
exportWarningOkButton.addEventListener("click", () => {
  closeExportWarningDialog(true);
});
exportWarningDialog.addEventListener("click", (event) => {
  if (event.target === exportWarningDialog) {
    closeExportWarningDialog(false);
  }
});
exportWarningDialog.addEventListener("keydown", handleExportWarningDialogKeydown);
exportResultCloseButton.addEventListener("click", closeExportResultDialog);
exportResultDialog.addEventListener("click", (event) => {
  if (event.target === exportResultDialog) {
    closeExportResultDialog();
  }
});
exportResultDialog.addEventListener("keydown", handleExportResultDialogKeydown);

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
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = "copy";
  }
  videoFrame.classList.add("is-dragging");
}

function isGifFile(file: File): boolean {
  return file.type === "image/gif" || file.name.toLowerCase().endsWith(".gif");
}

function getStaticImageFormat(file: File): ExportFormat | null {
  const fileName = file.name.toLowerCase();

  if (file.type === "image/png" || fileName.endsWith(".png")) {
    return "png";
  }

  if (
    file.type === "image/jpeg" ||
    fileName.endsWith(".jpg") ||
    fileName.endsWith(".jpeg")
  ) {
    return "jpeg";
  }

  if (file.type === "image/bmp" || fileName.endsWith(".bmp")) {
    return "bmp";
  }

  return null;
}

function loadSourceFile(file: File, options: LoadSourceOptions = {}): void {
  if (options.clearAssignCheckpoint !== false) {
    assignCheckpoint = null;
  }

  revokeSourceUrl();
  resetExportState();
  stopGifPlayback();
  state.sourceKind = "empty";
  resetVideoElement();
  resetTrimFilmstrip();
  resetGifState();
  resetStaticImageState();

  const isGif = isGifFile(file);
  const staticImageFormat = getStaticImageFormat(file);

  state.sourceFile = file;
  state.sourceKind = isGif ? "gif" : staticImageFormat ? "image" : "video";
  exportState.format = isGif ? "gif" : staticImageFormat ?? "mp4";
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
  pendingSettingsRestore = options.restoreSettings
    ? {
        generationId,
        settings: options.restoreSettings,
        format: options.restoreFormat ?? exportState.format
      }
    : null;

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
  renderSourceModeUi();
  renderTrimUi();
  renderCropUi();
  renderResizeUi();
  renderExportUi();

  if (isGif) {
    void loadGifSource(file, generationId);
    return;
  }

  if (staticImageFormat) {
    void loadStaticImageSource(file, generationId);
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

    if (decodedGif.frames.length === 1) {
      state.sourceKind = "image";
      initializeLoadedStaticFrame(
        decodedGif.frames[0].canvas,
        decodedGif.width,
        decodedGif.height,
        generationId
      );
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
    applyPendingSettingsRestore(generationId);

    gifCanvas.width = state.width;
    gifCanvas.height = state.height;
    setGifCurrentTime(state.trimStart);
    renderLoadedState();
    void generateTrimThumbnails();
  } catch {
    if (isCurrentSourceGeneration(file, generationId)) {
      handlePreviewLoadFailure();
    }
  }
}

async function loadStaticImageSource(file: File, generationId: number): Promise<void> {
  try {
    const frameCanvas = await decodeStaticImageToCanvas(file);

    if (!isCurrentSourceGeneration(file, generationId)) {
      return;
    }

    initializeLoadedStaticFrame(frameCanvas, frameCanvas.width, frameCanvas.height, generationId);
  } catch {
    if (isCurrentSourceGeneration(file, generationId)) {
      handlePreviewLoadFailure();
    }
  }
}

function initializeLoadedStaticFrame(
  frameCanvas: HTMLCanvasElement,
  width: number,
  height: number,
  generationId: number
): void {
  state.staticFrameCanvas = frameCanvas;
  state.gifFrames = [];
  state.gifCurrentFrameIndex = 0;
  state.gifCurrentTime = 0;
  state.gifIsPlaying = false;
  state.duration = 0;
  state.width = width;
  state.height = height;
  state.canPreviewDirectly = true;
  state.trimStart = 0;
  state.trimEnd = 0;
  state.cropMode = "full";
  state.cropRect = { ...DEFAULT_CROP_RECT };
  state.freeCropSizeLocked = false;
  state.resizeMode = "original";
  state.resizeWidth = state.width;
  state.resizeHeight = state.height;
  state.resizeAspectLocked = true;
  applyPendingSettingsRestore(generationId);

  gifCanvas.width = state.width;
  gifCanvas.height = state.height;
  drawStaticFrame();
  resetTrimFilmstrip();
  renderLoadedState();
}

async function decodeStaticImageToCanvas(file: File): Promise<HTMLCanvasElement> {
  if ("createImageBitmap" in window) {
    try {
      const bitmap = await createImageBitmap(file);

      try {
        return drawSourceToCanvas(bitmap, bitmap.width, bitmap.height);
      } finally {
        bitmap.close();
      }
    } catch {
      // Fall back to HTMLImageElement; it covers some browser-specific bitmap decode gaps.
    }
  }

  const image = await loadImageElement(file);
  return drawSourceToCanvas(image, image.naturalWidth, image.naturalHeight);
}

function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const imageUrl = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(imageUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(imageUrl);
      reject(new Error("Image could not be decoded."));
    };
    image.src = imageUrl;
  });
}

function drawSourceToCanvas(
  source: CanvasImageSource,
  width: number,
  height: number
): HTMLCanvasElement {
  if (width <= 0 || height <= 0) {
    throw new Error("Image dimensions could not be decoded.");
  }

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas is not available.");
  }

  canvas.width = width;
  canvas.height = height;
  context.drawImage(source, 0, 0, width, height);

  return canvas;
}

function captureEditSettings(): EditSettingsSnapshot {
  return {
    trimStart: state.trimStart,
    trimEnd: state.trimEnd,
    cropMode: state.cropMode,
    cropRect: { ...state.cropRect },
    freeCropSizeLocked: state.freeCropSizeLocked,
    resizeMode: state.resizeMode,
    resizeWidth: state.resizeWidth,
    resizeHeight: state.resizeHeight,
    resizeAspectLocked: state.resizeAspectLocked
  };
}

function applyPendingSettingsRestore(generationId: number): void {
  if (!pendingSettingsRestore || pendingSettingsRestore.generationId !== generationId) {
    return;
  }

  const restore = pendingSettingsRestore;
  pendingSettingsRestore = null;
  exportState.format = restore.format;
  restoreEditSettings(restore.settings);
}

function restoreEditSettings(settings: EditSettingsSnapshot): void {
  const minimumRange = Math.min(MIN_TRIM_SECONDS, state.duration);
  let trimStart = clamp(settings.trimStart, 0, state.duration);
  let trimEnd = clamp(settings.trimEnd, 0, state.duration);

  if (state.sourceKind === "gif") {
    const boundaries = getGifFrameBoundaries();
    trimStart = boundaries[getNearestGifBoundaryIndex(trimStart, boundaries)] ?? 0;
    trimEnd = boundaries[getNearestGifBoundaryIndex(trimEnd, boundaries)] ?? state.duration;
  }

  if (trimEnd - trimStart < minimumRange) {
    trimStart = 0;
    trimEnd = state.duration;
  }

  state.trimStart = roundTime(trimStart);
  state.trimEnd = roundTime(trimEnd);
  state.cropMode = settings.cropMode;
  state.cropRect = state.cropMode === "full"
    ? { ...DEFAULT_CROP_RECT }
    : clampCropRect(settings.cropRect);
  state.freeCropSizeLocked = state.cropMode === "free" && settings.freeCropSizeLocked;
  state.resizeMode = settings.resizeMode;
  state.resizeWidth = clamp(settings.resizeWidth, MIN_OUTPUT_DIMENSION, MAX_OUTPUT_DIMENSION);
  state.resizeHeight = clamp(settings.resizeHeight, MIN_OUTPUT_DIMENSION, MAX_OUTPUT_DIMENSION);
  state.resizeAspectLocked = settings.resizeAspectLocked;
}

function handlePreviewLoadFailure(): void {
  pendingSettingsRestore = null;
  stopGifPlayback();
  state.canPreviewDirectly = false;
  previewStatus.textContent = "Unsupported";
  previewStatus.classList.remove("status-pill-muted");
  previewStatus.classList.add("status-pill-warning");
  placeholder.classList.remove("is-hidden");
  video.classList.remove("is-loaded");
  gifCanvas.classList.remove("is-loaded");
  videoStage.classList.remove("is-loaded", "is-gif", "is-canvas-source", "fit-width", "fit-height");
  setPreviewControlsEnabled(false);
  setTrimControlsEnabled(false);
  setCropControlsEnabled(false);
  setResizeControlsEnabled(false);
  renderSourceModeUi();
  renderTrimUi();
  renderCropUi();
  renderResizeUi();
  renderExportUi();
  updatePlaybackUi();
}

function renderLoadedState(): void {
  const singleFrameSource = isSingleFrameSource();
  const canvasSource = state.sourceKind === "gif" || singleFrameSource;

  previewStatus.textContent = "Ready";
  previewStatus.classList.remove("status-pill-muted", "status-pill-warning");
  placeholder.classList.add("is-hidden");
  video.classList.toggle("is-loaded", state.sourceKind === "video");
  gifCanvas.classList.toggle("is-loaded", canvasSource);
  videoStage.classList.toggle("is-gif", state.sourceKind === "gif");
  videoStage.classList.toggle("is-canvas-source", canvasSource);
  metaResolution.textContent =
    state.width > 0 && state.height > 0 ? `${state.width} x ${state.height}` : "Unknown";
  metaDuration.textContent = singleFrameSource ? "Single frame" : formatTime(state.duration);
  updatePreviewFit();
  setPreviewControlsEnabled(true);
  setTrimControlsEnabled(!singleFrameSource);
  setCropControlsEnabled(true);
  setResizeControlsEnabled(true);
  renderSourceModeUi();
  renderTrimUi();
  renderCropUi();
  renderResizeUi();
  renderExportUi();
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
  const isPlaying =
    state.sourceKind === "gif" ? state.gifIsPlaying : state.sourceKind === "video" ? !video.paused : false;
  const muteLabel = state.sourceKind === "video" ? video.muted ? "Unmute" : "Mute" : "No audio";
  const muteIcon = state.sourceKind === "video" && video.muted ? "muted" : "volume";
  const mutePressed = state.sourceKind === "video" ? video.muted : false;

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

  return state.sourceKind === "video" && Number.isFinite(video.currentTime) ? video.currentTime : 0;
}

function isSingleFrameSource(): boolean {
  return state.sourceKind === "image";
}

function renderSourceModeUi(): void {
  controlGrid.classList.toggle("is-hidden", isSingleFrameSource());
}

function seekPreviewToTime(time: number): void {
  if (isSingleFrameSource()) {
    return;
  }

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

function drawStaticFrame(): void {
  if (!gifContext || !state.staticFrameCanvas) {
    return;
  }

  gifContext.clearRect(0, 0, gifCanvas.width, gifCanvas.height);
  gifContext.drawImage(state.staticFrameCanvas, 0, 0, gifCanvas.width, gifCanvas.height);
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
  invalidateExportOutput();

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

  invalidateExportOutput();
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
  if (isSingleFrameSource()) {
    trimSummary.textContent = "Single frame";
    trimStartMarkerTime.textContent = "0.0s";
    trimEndMarkerTime.textContent = "0.0s";
    trimActiveLabel.textContent = "Start";
    trimActiveTime.textContent = "0.0s";
    trimStartRange.value = "0";
    trimEndRange.value = String(TRIM_SLIDER_MAX);
    trimSlider.style.setProperty("--trim-start", "0%");
    trimSlider.style.setProperty("--trim-end", "100%");
    trimFilmstrip.style.setProperty("--trim-start", "0%");
    trimFilmstrip.style.setProperty("--trim-end", "100%");
    trimFilmstrip.style.setProperty("--trim-active", "0%");
    trimFilmstrip.classList.remove("has-thumbnails", "edge-start", "edge-end", "is-visible");
    return;
  }

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

  invalidateExportOutput();
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

  invalidateExportOutput();
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
  invalidateExportOutput();
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

  invalidateExportOutput();
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
  invalidateExportOutput();
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

  invalidateExportOutput();
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
  invalidateExportOutput();
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

async function assignCurrentSource(): Promise<void> {
  if (!canAssignSource()) {
    return;
  }

  const sourceFile = state.sourceFile;

  if (!sourceFile) {
    return;
  }

  const settings = captureEditSettings();
  const format = exportState.format;
  const commandPlan = buildAssignCommand(sourceFile);

  if (!(await confirmLargeGifConversion(commandPlan))) {
    exportState.status = "idle";
    exportState.progress = 0;
    exportState.message = "Assign canceled.";
    appendExportLog("Assign canceled.");
    renderExportUi();
    return;
  }

  try {
    const outputBlob = await runSourceTransform(commandPlan, sourceFile, "Assigning");
    const assignedFile = createAssignedFile(sourceFile.name, outputBlob, commandPlan.format);
    const conversionLogs = [...exportState.logs];
    assignCheckpoint = {
      sourceFile,
      settings,
      format
    };
    loadSourceFile(assignedFile, { clearAssignCheckpoint: false });
    exportState.status = "idle";
    exportState.progress = 0;
    exportState.message = "Assigned to preview.";
    exportState.logs = conversionLogs;
    appendExportLog(exportState.message);
    renderExportUi();
  } catch (error) {
    exportState.status = "error";
    exportState.progress = 0;
    exportState.message = error instanceof Error ? error.message : "Assign failed.";
    appendExportLog(`Assign failed: ${exportState.message}`);
    activeExportTab = "log";
    renderExportUi();
  }
}

function resetAssignedSource(): void {
  if (!canResetAssignedSource()) {
    return;
  }

  const checkpoint = assignCheckpoint;

  if (!checkpoint) {
    return;
  }

  assignCheckpoint = null;
  loadSourceFile(checkpoint.sourceFile, {
    restoreSettings: checkpoint.settings,
    restoreFormat: checkpoint.format
  });
  exportState.status = "idle";
  exportState.progress = 0;
  exportState.message = "Reset to the pre-assign source.";
  appendExportLog("Reset to the pre-assign source.");
  renderExportUi();
}

async function exportCurrentSource(): Promise<void> {
  if (!canExportSource()) {
    return;
  }

  const sourceFile = state.sourceFile;

  if (!sourceFile) {
    return;
  }

  const commandPlan = buildExportCommand(sourceFile);

  if (!(await confirmLargeGifConversion(commandPlan))) {
    exportState.status = "idle";
    exportState.progress = 0;
    exportState.message = "Export canceled.";
    appendExportLog("Export canceled.");
    renderExportUi();
    return;
  }

  let saveTarget: ExportSaveTarget | null;

  try {
    saveTarget = await requestExportSaveTarget(commandPlan);
  } catch (error) {
    exportState.status = "error";
    exportState.progress = 0;
    exportState.message = error instanceof Error ? error.message : "Export failed.";
    appendExportLog(`Export failed: ${exportState.message}`);
    activeExportTab = "log";
    showExportResultDialog("error");
    renderExportUi();
    return;
  }

  if (!saveTarget) {
    exportState.status = "idle";
    exportState.progress = 0;
    exportState.message = "Export canceled.";
    appendExportLog("Export canceled.");
    renderExportUi();
    return;
  }

  try {
    const outputBlob = await runSourceTransform(commandPlan, sourceFile, "Exporting");

    exportState.status = "running";
    exportState.message = `Saving ${formatExportLabel(commandPlan.format)}...`;
    appendExportLog(exportState.message);
    renderExportUi();

    if (saveTarget.kind === "native") {
      await writeBlobToFileHandle(saveTarget.handle, outputBlob);
      exportState.outputUrl = null;
      exportState.outputFileName = saveTarget.fileName;
      exportState.message = `Saved ${saveTarget.fileName}.`;
      appendExportLog(exportState.message);
    } else {
      exportState.outputUrl = URL.createObjectURL(outputBlob);
      exportState.outputFileName = saveTarget.fileName;
      exportState.message = `Export complete. Use Download ${formatExportLabel(commandPlan.format)} to save.`;
      appendExportLog("Export complete. Download fallback is ready.");
    }

    exportState.status = "done";
    exportState.progress = 1;
    showExportResultDialog("success");
    renderExportUi();
  } catch (error) {
    exportState.status = "error";
    exportState.progress = 0;
    exportState.message = error instanceof Error ? error.message : "Export failed.";
    appendExportLog(`Export failed: ${exportState.message}`);
    activeExportTab = "log";
    showExportResultDialog("error");
    renderExportUi();
  }
}

async function runSourceTransform(
  commandPlan: ExportCommandPlan,
  sourceFile: File,
  runningMessage: string
): Promise<Blob> {
  if (commandPlan.execution === "canvas") {
    return runCanvasImageTransform(commandPlan, runningMessage);
  }

  return runFfmpegTransform(commandPlan, sourceFile, runningMessage);
}

async function runCanvasImageTransform(
  commandPlan: ExportCommandPlan,
  runningMessage: string
): Promise<Blob> {
  resetExportOutput();
  exportState.status = "running";
  exportState.progress = 0.18;
  exportState.message = "Preparing source...";
  exportState.logs = [];
  appendExportLog(exportState.message);
  renderExportUi();

  const canvas = createEditedStaticFrameCanvas();
  exportState.progress = 0.72;
  exportState.message = `${runningMessage} ${formatExportLabel(commandPlan.format)}...`;
  appendExportLog(exportState.message);
  renderExportUi();

  const outputBlob = await encodeStaticCanvas(canvas, commandPlan.format);
  exportState.progress = 0.98;
  renderExportUi();

  return outputBlob;
}

async function runFfmpegTransform(
  commandPlan: ExportCommandPlan,
  sourceFile: File,
  runningMessage: string
): Promise<Blob> {
  resetExportOutput();
  exportState.status = "loading-ffmpeg";
  exportState.progress = 0;
  exportState.message = "Loading FFmpeg...";
  exportState.logs = [];
  appendExportLog(exportState.message);
  latestFfmpegLog = "";
  renderExportUi();

  let ffmpeg: FFmpeg | null = null;
  const workFiles = new Set<string>([commandPlan.outputName]);

  try {
    ffmpeg = await getLoadedFfmpeg();

    exportState.status = "running";
    exportState.progress = 0.04;
    exportState.message = "Preparing source...";
    appendExportLog(exportState.message);
    renderExportUi();

    await prepareExportCommandInput(ffmpeg, commandPlan, sourceFile, workFiles);

    exportState.progress = Math.max(exportState.progress, 0.16);
    exportState.message = `${runningMessage} ${formatExportLabel(commandPlan.format)}...`;
    appendExportLog(exportState.message);
    renderExportUi();

    const exitCode = await ffmpeg.exec(commandPlan.args);

    if (exitCode !== 0) {
      throw new Error(latestFfmpegLog || `FFmpeg exited with code ${exitCode}.`);
    }

    const exportedFile = await ffmpeg.readFile(commandPlan.outputName);
    const exportedBytes = typeof exportedFile === "string"
      ? new TextEncoder().encode(exportedFile)
      : exportedFile;
    const outputBytes = new Uint8Array(exportedBytes.byteLength);
    outputBytes.set(exportedBytes);

    return new Blob([outputBytes.buffer], { type: commandPlan.outputMimeType });
  } finally {
    if (ffmpeg) {
      await safeDeleteFfmpegFiles(ffmpeg, Array.from(workFiles));
    }
  }
}

async function prepareExportCommandInput(
  ffmpeg: FFmpeg,
  commandPlan: ExportCommandPlan,
  sourceFile: File,
  workFiles: Set<string>
): Promise<void> {
  if (commandPlan.sourceKind === "video") {
    await prepareVideoExportInput(ffmpeg, commandPlan, sourceFile, workFiles);
    return;
  }

  await prepareFrameSequenceExportInput(ffmpeg, workFiles);
}

async function prepareVideoExportInput(
  ffmpeg: FFmpeg,
  commandPlan: ExportCommandPlan,
  sourceFile: File,
  workFiles: Set<string>
): Promise<void> {
  if (!commandPlan.inputName) {
    throw new Error("Video export input is missing.");
  }

  const { fetchFile } = await import("@ffmpeg/util");
  workFiles.add(commandPlan.inputName);
  await ffmpeg.writeFile(commandPlan.inputName, await fetchFile(sourceFile));
}

async function prepareFrameSequenceExportInput(ffmpeg: FFmpeg, workFiles: Set<string>): Promise<void> {
  const exportFrames = getFrameSequenceExportFrames();

  if (exportFrames.length === 0) {
    throw new Error("No frames are available for conversion.");
  }

  const geometry = getGifExportGeometry();
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas is not available for GIF conversion.");
  }

  canvas.width = geometry.outputWidth;
  canvas.height = geometry.outputHeight;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  const frameNames: string[] = [];

  for (let index = 0; index < exportFrames.length; index += 1) {
    const exportFrame = exportFrames[index];
    const frameName = `${GIF_FRAME_FILE_PREFIX}-${String(index).padStart(5, "0")}.png`;

    workFiles.add(frameName);
    drawExportFrameToCanvas(context, canvas, exportFrame.canvas, geometry);
    await ffmpeg.writeFile(frameName, await canvasToPngBytes(canvas));
    frameNames.push(frameName);

    exportState.progress = 0.04 + ((index + 1) / exportFrames.length) * 0.12;
    exportState.message = `Preparing frame ${index + 1} / ${exportFrames.length}...`;
    renderExportUi();
  }

  workFiles.add(GIF_CONCAT_INPUT_NAME);
  await ffmpeg.writeFile(
    GIF_CONCAT_INPUT_NAME,
    new TextEncoder().encode(buildGifConcatFile(frameNames, exportFrames))
  );
}

function getFrameSequenceExportFrames(): CanvasExportFrame[] {
  if (isSingleFrameSource()) {
    return [
      {
        canvas: getStaticSourceCanvas(),
        duration: 1
      }
    ];
  }

  return getTrimmedGifExportFrames();
}

function getTrimmedGifExportFrames(): CanvasExportFrame[] {
  const trimStart = clamp(state.trimStart, 0, state.duration);
  const trimEnd = clamp(state.trimEnd, trimStart, state.duration);
  const exportFrames: CanvasExportFrame[] = [];

  for (const frame of state.gifFrames) {
    const frameStart = frame.startTime;
    const frameEnd = frame.startTime + frame.duration;
    const exportStart = Math.max(frameStart, trimStart);
    const exportEnd = Math.min(frameEnd, trimEnd);
    const duration = exportEnd - exportStart;

    if (duration > 0.001) {
      exportFrames.push({
        canvas: frame.canvas,
        duration: Math.max(0.02, duration)
      });
    }
  }

  return exportFrames;
}

function getGifExportGeometry(): GifExportGeometry {
  const crop = getCanvasExportCropRect() ?? {
    x: 0,
    y: 0,
    width: state.width,
    height: state.height
  };
  const resizeSize = getCurrentResizeSize();
  const outputWidth = isSingleFrameSource()
    ? clampImageOutputSizeValue(resizeSize.width || crop.width)
    : clampOutputSizeValue(resizeSize.width || crop.width);
  const outputHeight = isSingleFrameSource()
    ? clampImageOutputSizeValue(resizeSize.height || crop.height)
    : clampOutputSizeValue(resizeSize.height || crop.height);

  if (crop.width <= 0 || crop.height <= 0 || outputWidth <= 0 || outputHeight <= 0) {
    throw new Error("GIF conversion dimensions are invalid.");
  }

  return {
    crop,
    outputWidth,
    outputHeight
  };
}

function getCanvasExportCropRect(): { x: number; y: number; width: number; height: number } | null {
  if (!isSingleFrameSource()) {
    return getExportCropRect();
  }

  if (state.cropMode === "full" || state.width <= 0 || state.height <= 0) {
    return null;
  }

  let x = Math.round(state.cropRect.x * state.width);
  let y = Math.round(state.cropRect.y * state.height);
  let width = Math.round(state.cropRect.width * state.width);
  let height = Math.round(state.cropRect.height * state.height);

  x = clamp(x, 0, Math.max(0, state.width - 1));
  y = clamp(y, 0, Math.max(0, state.height - 1));
  width = clamp(width, 1, state.width - x);
  height = clamp(height, 1, state.height - y);

  if (width >= state.width && height >= state.height && x === 0 && y === 0) {
    return null;
  }

  return { x, y, width, height };
}

function drawExportFrameToCanvas(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  sourceCanvas: HTMLCanvasElement,
  geometry: GifExportGeometry
): void {
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(
    sourceCanvas,
    geometry.crop.x,
    geometry.crop.y,
    geometry.crop.width,
    geometry.crop.height,
    0,
    0,
    geometry.outputWidth,
    geometry.outputHeight
  );
}

function createEditedStaticFrameCanvas(): HTMLCanvasElement {
  const sourceCanvas = getStaticSourceCanvas();
  const geometry = getGifExportGeometry();
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas is not available for image export.");
  }

  canvas.width = geometry.outputWidth;
  canvas.height = geometry.outputHeight;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  drawExportFrameToCanvas(context, canvas, sourceCanvas, geometry);

  return canvas;
}

function getStaticSourceCanvas(): HTMLCanvasElement {
  if (!state.staticFrameCanvas) {
    throw new Error("No image frame is available for export.");
  }

  return state.staticFrameCanvas;
}

async function encodeStaticCanvas(canvas: HTMLCanvasElement, format: ExportFormat): Promise<Blob> {
  if (format === "png") {
    return canvasToBlob(canvas, "image/png");
  }

  if (format === "jpeg") {
    return canvasToBlob(createOpaqueCanvas(canvas), "image/jpeg", 0.92);
  }

  if (format === "bmp") {
    return canvasToBmpBlob(createOpaqueCanvas(canvas));
  }

  throw new Error(`${formatExportLabel(format)} image export is not available for this source.`);
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Could not encode image export."));
        return;
      }

      resolve(blob);
    }, type, quality);
  });
}

function createOpaqueCanvas(sourceCanvas: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas is not available for opaque image export.");
  }

  canvas.width = sourceCanvas.width;
  canvas.height = sourceCanvas.height;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(sourceCanvas, 0, 0);

  return canvas;
}

function canvasToBmpBlob(canvas: HTMLCanvasElement): Blob {
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas is not available for BMP export.");
  }

  const { width, height } = canvas;
  const imageData = context.getImageData(0, 0, width, height).data;
  const rowStride = Math.ceil((width * 3) / 4) * 4;
  const pixelDataSize = rowStride * height;
  const fileSize = 54 + pixelDataSize;
  const buffer = new ArrayBuffer(fileSize);
  const view = new DataView(buffer);

  view.setUint8(0, 0x42);
  view.setUint8(1, 0x4d);
  view.setUint32(2, fileSize, true);
  view.setUint32(10, 54, true);
  view.setUint32(14, 40, true);
  view.setInt32(18, width, true);
  view.setInt32(22, height, true);
  view.setUint16(26, 1, true);
  view.setUint16(28, 24, true);
  view.setUint32(34, pixelDataSize, true);
  view.setInt32(38, 2835, true);
  view.setInt32(42, 2835, true);

  for (let y = 0; y < height; y += 1) {
    const sourceY = height - 1 - y;
    const sourceRowOffset = sourceY * width * 4;
    const targetRowOffset = 54 + y * rowStride;

    for (let x = 0; x < width; x += 1) {
      const sourceOffset = sourceRowOffset + x * 4;
      const targetOffset = targetRowOffset + x * 3;

      view.setUint8(targetOffset, imageData[sourceOffset + 2]);
      view.setUint8(targetOffset + 1, imageData[sourceOffset + 1]);
      view.setUint8(targetOffset + 2, imageData[sourceOffset]);
    }
  }

  return new Blob([buffer], { type: "image/bmp" });
}

function canvasToPngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Could not encode GIF conversion frame."));
        return;
      }

      void blob.arrayBuffer()
        .then((buffer) => resolve(new Uint8Array(buffer)))
        .catch(reject);
    }, "image/png");
  });
}

function buildGifConcatFile(frameNames: string[], exportFrames: CanvasExportFrame[]): string {
  const lines = ["ffconcat version 1.0"];

  for (let index = 0; index < frameNames.length; index += 1) {
    lines.push(`file '${frameNames[index]}'`);
    lines.push(`duration ${formatConcatDuration(exportFrames[index].duration)}`);
  }

  lines.push(`file '${frameNames[frameNames.length - 1]}'`);

  return `${lines.join("\n")}\n`;
}

function formatConcatDuration(value: number): string {
  return Math.max(0.02, value).toFixed(6);
}

async function requestExportSaveTarget(commandPlan: ExportCommandPlan): Promise<ExportSaveTarget | null> {
  const saveFilePicker = (window as SaveFilePickerWindow).showSaveFilePicker;

  if (!saveFilePicker) {
    return {
      kind: "download",
      fileName: commandPlan.outputFileName
    };
  }

  try {
    const handle = await saveFilePicker.call(window, {
      suggestedName: commandPlan.outputFileName,
      types: [
        {
          description: commandPlan.saveDescription,
          accept: commandPlan.saveAccept
        }
      ],
      excludeAcceptAllOption: false
    });

    return {
      kind: "native",
      handle,
      fileName: handle.name || commandPlan.outputFileName
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return null;
    }

    throw error;
  }
}

async function writeBlobToFileHandle(handle: FileSystemFileHandleLike, blob: Blob): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
}

function canExportSource(): boolean {
  if (
    state.sourceFile === null ||
    !state.canPreviewDirectly ||
    isExportBusy()
  ) {
    return false;
  }

  if (state.sourceKind === "video") {
    return state.duration > 0;
  }

  if (state.sourceKind === "gif") {
    return state.duration > 0 && state.gifFrames.length > 0;
  }

  return state.sourceKind === "image" && state.staticFrameCanvas !== null;
}

function canAssignSource(): boolean {
  return canExportSource() && hasPendingEditSettings();
}

function canResetAssignedSource(): boolean {
  return assignCheckpoint !== null && !isExportBusy();
}

function hasPendingEditSettings(): boolean {
  if (!state.canPreviewDirectly || state.width <= 0 || state.height <= 0) {
    return false;
  }

  if (isSingleFrameSource()) {
    return state.cropMode !== "full" || state.resizeMode !== "original";
  }

  return state.duration > 0 && (isTrimActive() || state.cropMode !== "full" || state.resizeMode !== "original");
}

async function confirmLargeGifConversion(commandPlan: ExportCommandPlan): Promise<boolean> {
  const estimate = getGifExportSizeEstimate(commandPlan);

  if (!estimate || estimate.estimatedBytes < GIF_EXPORT_WARNING_BYTES) {
    return true;
  }

  return showExportWarningDialog(estimate);
}

function showExportWarningDialog(estimate: GifExportSizeEstimate): Promise<boolean> {
  if (exportWarningDialogResolve) {
    return Promise.resolve(false);
  }

  exportWarningSize.textContent = `~${formatEstimatedFileSize(estimate.estimatedBytes)}`;
  exportWarningPreviousFocus =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;
  exportWarningDialog.hidden = false;
  exportWarningDialog.setAttribute("aria-hidden", "false");

  return new Promise((resolve) => {
    exportWarningDialogResolve = (confirmed) => {
      exportWarningDialog.hidden = true;
      exportWarningDialog.setAttribute("aria-hidden", "true");
      exportWarningDialogResolve = null;
      resolve(confirmed);
      renderExportUi();

      if (exportWarningPreviousFocus && document.contains(exportWarningPreviousFocus)) {
        exportWarningPreviousFocus.focus();
      }

      exportWarningPreviousFocus = null;
    };

    renderExportUi();
    exportWarningCancelButton.focus();
  });
}

function closeExportWarningDialog(confirmed: boolean): void {
  exportWarningDialogResolve?.(confirmed);
}

function handleExportWarningDialogKeydown(event: KeyboardEvent): void {
  if (!exportWarningDialogResolve) {
    return;
  }

  if (event.key === "Escape") {
    event.preventDefault();
    closeExportWarningDialog(false);
    return;
  }

  if (event.key !== "Tab") {
    return;
  }

  const focusableButtons = [exportWarningCancelButton, exportWarningOkButton];
  const currentIndex = focusableButtons.indexOf(document.activeElement as HTMLButtonElement);
  const direction = event.shiftKey ? -1 : 1;
  const nextIndex =
    currentIndex === -1
      ? 0
      : (currentIndex + direction + focusableButtons.length) % focusableButtons.length;

  event.preventDefault();
  focusableButtons[nextIndex].focus();
}

function showExportResultDialog(result: "success" | "error"): void {
  const isSuccess = result === "success";
  const hasDownloadFallback = isSuccess && exportState.outputUrl !== null && exportState.outputFileName !== null;

  exportResultTitle.textContent = isSuccess ? "Successfully exported!" : "Export failed!";
  exportResultDetail.textContent = isSuccess
    ? hasDownloadFallback
      ? "The export is ready. Use Download to save the file."
      : "The file was saved successfully."
    : "Check the Log tab for details.";

  if (hasDownloadFallback && exportState.outputUrl && exportState.outputFileName) {
    exportResultDownload.href = exportState.outputUrl;
    exportResultDownload.download = exportState.outputFileName;
    exportResultDownload.textContent = `Download ${formatExportLabel(getCurrentExportFormat())}`;
    exportResultDownload.classList.remove("is-hidden");
  } else {
    hideExportResultDownload();
  }

  exportResultPreviousFocus =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;
  exportResultDialog.hidden = false;
  exportResultDialog.setAttribute("aria-hidden", "false");
  exportResultCloseButton.focus();
}

function closeExportResultDialog(): void {
  if (exportResultDialog.hidden) {
    return;
  }

  exportResultDialog.hidden = true;
  exportResultDialog.setAttribute("aria-hidden", "true");

  if (exportResultPreviousFocus && document.contains(exportResultPreviousFocus)) {
    exportResultPreviousFocus.focus();
  }

  exportResultPreviousFocus = null;
}

function handleExportResultDialogKeydown(event: KeyboardEvent): void {
  if (exportResultDialog.hidden) {
    return;
  }

  if (event.key === "Escape") {
    event.preventDefault();
    closeExportResultDialog();
    return;
  }

  if (event.key !== "Tab") {
    return;
  }

  const focusableElements: HTMLElement[] = exportResultDownload.classList.contains("is-hidden")
    ? [exportResultCloseButton]
    : [exportResultDownload, exportResultCloseButton];
  const currentIndex = focusableElements.indexOf(document.activeElement as HTMLElement);
  const direction = event.shiftKey ? -1 : 1;
  const nextIndex =
    currentIndex === -1
      ? 0
      : (currentIndex + direction + focusableElements.length) % focusableElements.length;

  event.preventDefault();
  focusableElements[nextIndex].focus();
}

function getGifExportSizeEstimate(commandPlan?: ExportCommandPlan): GifExportSizeEstimate | null {
  const format = commandPlan?.format ?? getCurrentExportFormat();

  if (format !== "gif" || !state.canPreviewDirectly) {
    return null;
  }

  const outputSize = getCurrentResizeSize();
  const width = isSingleFrameSource()
    ? clampImageOutputSizeValue(outputSize.width || state.width)
    : clampOutputSizeValue(outputSize.width || state.width);
  const height = isSingleFrameSource()
    ? clampImageOutputSizeValue(outputSize.height || state.height)
    : clampOutputSizeValue(outputSize.height || state.height);
  const frameCount = getEstimatedGifFrameCount();

  if (width <= 0 || height <= 0 || frameCount <= 0) {
    return null;
  }

  return {
    estimatedBytes: width * height * frameCount * GIF_ESTIMATE_BYTES_PER_PIXEL_FRAME,
    frameCount,
    width,
    height
  };
}

function getEstimatedGifFrameCount(): number {
  if (state.sourceKind === "gif") {
    return getTrimmedGifExportFrames().length;
  }

  if (state.sourceKind === "video") {
    const trimDuration = Math.max(MIN_TRIM_SECONDS, state.trimEnd - state.trimStart);
    return Math.max(1, Math.ceil(trimDuration * GIF_ESTIMATE_VIDEO_FPS));
  }

  if (state.sourceKind === "image") {
    return 1;
  }

  return 0;
}

function formatEstimatedFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(bytes >= 100 * 1024 * 1024 ? 0 : 1)} MB`;
  }

  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(0)} KB`;
  }

  return `${Math.max(0, Math.round(bytes))} B`;
}

function isExportBusy(): boolean {
  return exportState.status === "loading-ffmpeg" || exportState.status === "running";
}

function readExportFormatSelectValue(): ExportFormat {
  const value = exportFormatSelect.value;
  return isExportFormat(value) ? value : getCurrentExportFormat();
}

function getCurrentExportFormat(): ExportFormat {
  const availableFormats = getAvailableExportFormats();

  if (availableFormats.includes(exportState.format)) {
    return exportState.format;
  }

  return availableFormats[0];
}

function getAvailableExportFormats(): ExportFormat[] {
  if (state.sourceKind === "video") {
    return ["mp4", "gif"];
  }

  if (state.sourceKind === "gif") {
    return ["gif", "mp4"];
  }

  if (state.sourceKind === "image") {
    return ["png", "jpeg", "bmp", "gif"];
  }

  return ["mp4"];
}

function isExportFormat(value: string): value is ExportFormat {
  return ["mp4", "gif", "png", "jpeg", "bmp"].includes(value);
}

function formatExportLabel(format: ExportFormat): string {
  return format === "jpeg" ? "JPEG" : format.toUpperCase();
}

function getExportMimeType(format: ExportFormat): string {
  if (format === "mp4") {
    return "video/mp4";
  }

  if (format === "jpeg") {
    return "image/jpeg";
  }

  return `image/${format}`;
}

function getExportSaveDescription(format: ExportFormat): string {
  if (format === "mp4") {
    return "MP4 video";
  }

  return `${formatExportLabel(format)} image`;
}

function getExportSaveAccept(format: ExportFormat): Record<string, string[]> {
  return {
    [getExportMimeType(format)]: getExportFileExtensions(format).map((extension) => `.${extension}`)
  };
}

async function getLoadedFfmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance?.loaded) {
    return ffmpegInstance;
  }

  if (ffmpegLoadPromise) {
    return ffmpegLoadPromise;
  }

  ffmpegLoadPromise = (async () => {
    const { FFmpeg } = await import("@ffmpeg/ffmpeg");
    const { toBlobURL } = await import("@ffmpeg/util");
    const [coreURL, wasmURL] = await Promise.all([
      toBlobURL(FFMPEG_CORE_URL, "text/javascript"),
      toBlobURL(FFMPEG_WASM_URL, "application/wasm")
    ]);
    const ffmpeg = new FFmpeg();
    ffmpeg.on("log", handleFfmpegLog);
    ffmpeg.on("progress", handleFfmpegProgress);
    await ffmpeg.load({
      coreURL,
      wasmURL
    });
    ffmpegInstance = ffmpeg;
    return ffmpeg;
  })();

  try {
    return await ffmpegLoadPromise;
  } catch (error) {
    ffmpegLoadPromise = null;
    throw error;
  }
}

function handleFfmpegLog(event: LogEvent): void {
  const message = event.message.trim();

  if (!message) {
    return;
  }

  latestFfmpegLog = message;
  appendExportLog(message);

  if (isExportBusy()) {
    renderExportUi();
  }
}

function handleFfmpegProgress(event: ProgressEvent): void {
  if (exportState.status !== "running") {
    return;
  }

  exportState.progress = Math.max(exportState.progress, clamp(event.progress, 0.04, 0.98));
  renderExportUi();
}

function buildExportCommand(sourceFile: File): ExportCommandPlan {
  if (state.sourceKind === "gif") {
    return buildGifExportCommand(sourceFile, getCurrentExportFormat());
  }

  if (state.sourceKind === "image") {
    return buildImageExportCommand(sourceFile, getCurrentExportFormat());
  }

  return buildVideoExportCommand(sourceFile, getCurrentExportFormat());
}

function buildAssignCommand(sourceFile: File): ExportCommandPlan {
  if (state.sourceKind === "gif") {
    return buildGifExportCommand(sourceFile, "gif");
  }

  if (state.sourceKind === "image") {
    return buildImageExportCommand(sourceFile, "png");
  }

  return buildVideoExportCommand(sourceFile, "mp4");
}

function buildVideoExportCommand(sourceFile: File, format: ExportFormat): ExportCommandPlan {
  if (format === "gif") {
    return buildVideoGifExportCommand(sourceFile);
  }

  return buildVideoMp4ExportCommand(sourceFile);
}

function buildVideoMp4ExportCommand(sourceFile: File): ExportCommandPlan {
  const inputName = `input.${getFileExtension(sourceFile.name)}`;
  const outputName = EXPORT_MP4_OUTPUT_NAME;
  const filters = buildVideoFilters();
  const trimDuration = Math.max(MIN_TRIM_SECONDS, state.trimEnd - state.trimStart);
  const args = [
    "-y",
    "-i", inputName,
    "-ss", formatFfmpegSeconds(state.trimStart),
    "-t", formatFfmpegSeconds(trimDuration),
    "-map", "0:v:0",
    "-map", "0:a:0?",
    "-dn",
    "-sn"
  ];

  if (filters.length > 0) {
    args.push("-vf", filters.join(","));
  }

  args.push(
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "23",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", "128k",
    "-movflags", "+faststart",
    outputName
  );

  return {
    sourceKind: "video",
    format: "mp4",
    execution: "ffmpeg",
    inputName,
    outputName,
    outputFileName: getExportFileName(sourceFile.name, "mp4"),
    outputMimeType: getExportMimeType("mp4"),
    saveDescription: getExportSaveDescription("mp4"),
    saveAccept: getExportSaveAccept("mp4"),
    args
  };
}

function buildVideoGifExportCommand(sourceFile: File): ExportCommandPlan {
  const inputName = `input.${getFileExtension(sourceFile.name)}`;
  const outputName = EXPORT_GIF_OUTPUT_NAME;
  const trimDuration = Math.max(MIN_TRIM_SECONDS, state.trimEnd - state.trimStart);
  const frameFilters = [
    `trim=start=${formatFfmpegSeconds(state.trimStart)}:duration=${formatFfmpegSeconds(trimDuration)}`,
    "setpts=PTS-STARTPTS",
    ...buildVideoFilters()
  ];
  const filterGraph = `[0:v]${frameFilters.join(",")},split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=sierra2_4a[v]`;
  const args = [
    "-y",
    "-i", inputName,
    "-filter_complex", filterGraph,
    "-map", "[v]",
    "-loop", "0",
    outputName
  ];

  return {
    sourceKind: "video",
    format: "gif",
    execution: "ffmpeg",
    inputName,
    outputName,
    outputFileName: getExportFileName(sourceFile.name, "gif"),
    outputMimeType: getExportMimeType("gif"),
    saveDescription: getExportSaveDescription("gif"),
    saveAccept: getExportSaveAccept("gif"),
    args
  };
}

function buildGifExportCommand(sourceFile: File, format: ExportFormat): ExportCommandPlan {
  const outputName = format === "gif" ? EXPORT_GIF_OUTPUT_NAME : EXPORT_MP4_OUTPUT_NAME;
  const args = format === "gif"
    ? buildGifImageExportArgs(outputName)
    : buildGifMp4ExportArgs(outputName);

  return {
    sourceKind: "gif",
    format,
    execution: "ffmpeg",
    inputName: null,
    outputName,
    outputFileName: getExportFileName(sourceFile.name, format),
    outputMimeType: getExportMimeType(format),
    saveDescription: getExportSaveDescription(format),
    saveAccept: getExportSaveAccept(format),
    args
  };
}

function buildImageExportCommand(sourceFile: File, format: ExportFormat): ExportCommandPlan {
  const outputFormat = getAvailableExportFormats().includes(format) ? format : "png";
  const outputName = `output.${getExportFileExtension(outputFormat)}`;

  return {
    sourceKind: "image",
    format: outputFormat,
    execution: outputFormat === "gif" ? "ffmpeg" : "canvas",
    inputName: null,
    outputName,
    outputFileName: getExportFileName(sourceFile.name, outputFormat),
    outputMimeType: getExportMimeType(outputFormat),
    saveDescription: getExportSaveDescription(outputFormat),
    saveAccept: getExportSaveAccept(outputFormat),
    args: outputFormat === "gif" ? buildGifImageExportArgs(outputName) : []
  };
}

function buildGifImageExportArgs(outputName: string): string[] {
  return [
    "-y",
    "-f", "concat",
    "-safe", "0",
    "-i", GIF_CONCAT_INPUT_NAME,
    "-filter_complex", "split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=sierra2_4a",
    "-loop", "0",
    outputName
  ];
}

function buildGifMp4ExportArgs(outputName: string): string[] {
  return [
    "-y",
    "-f", "concat",
    "-safe", "0",
    "-i", GIF_CONCAT_INPUT_NAME,
    "-map", "0:v:0",
    "-an",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "23",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    outputName
  ];
}

function buildVideoFilters(): string[] {
  const filters: string[] = [];
  const crop = getExportCropRect();
  let baseWidth = state.width;
  let baseHeight = state.height;

  if (crop) {
    filters.push(`crop=${crop.width}:${crop.height}:${crop.x}:${crop.y}`);
    baseWidth = crop.width;
    baseHeight = crop.height;
  }

  const resizeSize = getCurrentResizeSize();
  const outputWidth = clampOutputSizeValue(resizeSize.width || baseWidth);
  const outputHeight = clampOutputSizeValue(resizeSize.height || baseHeight);

  if (outputWidth !== baseWidth || outputHeight !== baseHeight) {
    filters.push(`scale=${outputWidth}:${outputHeight}`);
  }

  return filters;
}

function getExportCropRect(): { x: number; y: number; width: number; height: number } | null {
  if (state.cropMode === "full" || state.width <= 0 || state.height <= 0) {
    return null;
  }

  let x = floorEvenOffset(state.cropRect.x * state.width);
  let y = floorEvenOffset(state.cropRect.y * state.height);
  let width = floorEven(state.cropRect.width * state.width);
  let height = floorEven(state.cropRect.height * state.height);

  x = clamp(x, 0, Math.max(0, state.width - MIN_OUTPUT_DIMENSION));
  y = clamp(y, 0, Math.max(0, state.height - MIN_OUTPUT_DIMENSION));
  width = clamp(width, MIN_OUTPUT_DIMENSION, floorEven(state.width - x));
  height = clamp(height, MIN_OUTPUT_DIMENSION, floorEven(state.height - y));

  if (width >= floorEven(state.width) && height >= floorEven(state.height) && x === 0 && y === 0) {
    return null;
  }

  return { x, y, width, height };
}

function renderExportUi(): void {
  const busy = isExportBusy();
  const dialogOpen = isExportWarningDialogOpen();
  const availableFormats = getAvailableExportFormats();
  const currentFormat = getCurrentExportFormat();
  const canExport = canExportSource() && !dialogOpen;
  const canAssign = canAssignSource() && !dialogOpen;
  const canResetAssign = canResetAssignedSource() && !dialogOpen;
  exportState.format = currentFormat;
  renderExportFormatOptions(availableFormats, currentFormat);
  exportFormatSelect.value = currentFormat;
  exportFormatSelect.disabled =
    busy ||
    dialogOpen ||
    !state.canPreviewDirectly ||
    availableFormats.length <= 1;
  exportAudioSelect.options[0].textContent =
    state.sourceKind === "video" && currentFormat === "mp4" ? "Keep audio" : "No audio";
  assignButton.disabled = !canAssign;
  assignResetButton.disabled = !canResetAssign;
  exportButton.disabled = !canExport;
  exportProgress.style.width = `${Math.round(clamp(exportState.progress, 0, 1) * 100)}%`;

  exportStatus.classList.remove("status-pill-muted", "status-pill-warning");

  if (exportState.status === "done") {
    exportStatus.textContent = "Done";
  } else if (exportState.status === "error") {
    exportStatus.textContent = "Error";
    exportStatus.classList.add("status-pill-warning");
  } else if (busy) {
    exportStatus.textContent = exportState.status === "loading-ffmpeg" ? "Loading" : "Running";
  } else if (canExportSource()) {
    exportStatus.textContent = "Ready";
  } else {
    exportStatus.textContent = "Not ready";
    exportStatus.classList.add("status-pill-muted");
  }

  for (const button of exportTabButtons) {
    const isSelected = button.dataset.exportTab === activeExportTab;
    button.classList.toggle("is-selected", isSelected);
    button.setAttribute("aria-selected", String(isSelected));
    button.tabIndex = isSelected ? 0 : -1;
  }

  for (const panel of exportTabPanels) {
    panel.classList.toggle("is-hidden", panel.dataset.exportPanel !== activeExportTab);
  }

  renderExportLog();
}

function renderExportFormatOptions(availableFormats: ExportFormat[], currentFormat: ExportFormat): void {
  const currentOptionSignature = Array.from(exportFormatSelect.options)
    .map((option) => option.value)
    .join(",");
  const nextOptionSignature = availableFormats.join(",");

  if (currentOptionSignature === nextOptionSignature) {
    return;
  }

  exportFormatSelect.replaceChildren(
    ...availableFormats.map((format) => {
      const option = document.createElement("option");
      option.value = format;
      option.textContent = formatExportLabel(format);
      option.selected = format === currentFormat;
      return option;
    })
  );
}

function renderExportLog(): void {
  exportLog.textContent = exportState.logs.join("\n");
  exportLog.scrollTop = exportLog.scrollHeight;
}

function appendExportLog(message: string): void {
  const trimmedMessage = message.trim();

  if (!trimmedMessage) {
    return;
  }

  exportState.logs = [...exportState.logs, trimmedMessage].slice(-EXPORT_LOG_MAX_LINES);
  renderExportLog();
}

function isIdleExportNoticeMessage(message: string): boolean {
  return [
    "Assign canceled.",
    "Assigned to preview.",
    "Export canceled.",
    "Reset to the pre-assign source."
  ].includes(message);
}

function isExportWarningDialogOpen(): boolean {
  return exportWarningDialogResolve !== null;
}

function resetExportState(): void {
  resetExportOutput();
  exportState.status = "idle";
  exportState.format = "mp4";
  exportState.progress = 0;
  exportState.message = "Load a source to export.";
  exportState.logs = [];
  renderExportUi();
}

function invalidateExportOutput(): void {
  if (isExportBusy()) {
    return;
  }

  if (!exportState.outputUrl && exportState.status === "idle") {
    if (isIdleExportNoticeMessage(exportState.message)) {
      exportState.message = "Load a source to export.";
    }
    renderExportUi();
    return;
  }

  resetExportOutput();
  exportState.status = "idle";
  exportState.progress = 0;
  exportState.message = "Load a source to export.";
  exportState.logs = [];
  renderExportUi();
}

function resetExportOutput(): void {
  if (exportState.outputUrl) {
    URL.revokeObjectURL(exportState.outputUrl);
  }

  exportState.outputUrl = null;
  exportState.outputFileName = null;
  hideExportResultDownload();
}

function hideExportResultDownload(): void {
  exportResultDownload.classList.add("is-hidden");
  exportResultDownload.removeAttribute("href");
  exportResultDownload.removeAttribute("download");
}

async function safeDeleteFfmpegFile(ffmpeg: FFmpeg, fileName: string): Promise<void> {
  try {
    await ffmpeg.deleteFile(fileName);
  } catch {
    // The file may not exist if FFmpeg failed before writing it.
  }
}

async function safeDeleteFfmpegFiles(ffmpeg: FFmpeg, fileNames: string[]): Promise<void> {
  for (const fileName of fileNames) {
    await safeDeleteFfmpegFile(ffmpeg, fileName);
  }
}

function getFileExtension(fileName: string): string {
  const extension = fileName.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "");
  return extension || "mp4";
}

function getExportFileName(fileName: string, format: ExportFormat): string {
  const baseName = fileName.replace(/\.[^/.]+$/, "") || "video";
  return `${baseName}_frametuner.${getExportFileExtension(format)}`;
}

function createAssignedFile(sourceFileName: string, blob: Blob, format: ExportFormat): File {
  const baseName = sourceFileName.replace(/\.[^/.]+$/, "") || "video";
  return new File([blob], `${baseName}_assigned.${getExportFileExtension(format)}`, {
    type: getExportMimeType(format),
    lastModified: Date.now()
  });
}

function getExportFileExtension(format: ExportFormat): string {
  return format === "jpeg" ? "jpg" : format;
}

function getExportFileExtensions(format: ExportFormat): string[] {
  return format === "jpeg" ? ["jpg", "jpeg"] : [getExportFileExtension(format)];
}

function formatFfmpegSeconds(value: number): string {
  return Math.max(0, roundTime(value)).toFixed(3);
}

function floorEven(value: number): number {
  if (!Number.isFinite(value)) {
    return MIN_OUTPUT_DIMENSION;
  }

  return Math.max(MIN_OUTPUT_DIMENSION, Math.floor(value / 2) * 2);
}

function floorEvenOffset(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.floor(value / 2) * 2);
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

function clampImageOutputSizeValue(value: number): number {
  const safeValue = Number.isFinite(value) ? Math.round(value) : 1;
  return clamp(safeValue, 1, MAX_OUTPUT_DIMENSION);
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
  const singleFrameSource = isSingleFrameSource();
  playToggle.disabled = !enabled || singleFrameSource;
  muteToggle.disabled = !enabled || state.sourceKind !== "video";
  seekInput.disabled = !enabled || singleFrameSource;
  for (const button of resetSourceButtons) {
    button.disabled = !state.sourceFile;
  }
}

function resetSource(): void {
  assignCheckpoint = null;
  pendingSettingsRestore = null;
  revokeSourceUrl();
  resetExportState();
  stopGifPlayback();
  state.sourceKind = "empty";
  resetVideoElement();
  resetTrimFilmstrip();
  resetGifState();
  resetStaticImageState();

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
  renderSourceModeUi();
  renderTrimUi();
  renderCropUi();
  renderResizeUi();
  renderExportUi();
  updatePlaybackUi();
}

function resetVideoElement(): void {
  video.pause();
  video.removeAttribute("src");
  video.load();
  video.classList.remove("is-loaded");
  gifCanvas.classList.remove("is-loaded");
  videoFrame.classList.remove("is-dragging");
  videoStage.classList.remove("is-loaded", "is-gif", "is-canvas-source", "fit-width", "fit-height");
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

function resetStaticImageState(): void {
  state.staticFrameCanvas = null;
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
