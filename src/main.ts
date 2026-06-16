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
};

const initialControlTiles: ControlTile[] = [
  {
    title: "Time",
    value: "00:00 - 00:00",
    note: "Trim range"
  },
  {
    title: "Crop",
    value: "Full frame",
    note: "Area"
  },
  {
    title: "Size",
    value: "Original",
    note: "Scale"
  },
  {
    title: "FPS",
    value: "Original",
    note: "Frame rate"
  },
  {
    title: "Audio",
    value: "Keep",
    note: "Mode"
  },
  {
    title: "Combine",
    value: "Single",
    note: "Source"
  }
];

const state: PreviewState = {
  sourceFile: null,
  sourceUrl: null,
  duration: 0,
  width: 0,
  height: 0,
  canPreviewDirectly: false
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
          <video class="preview-video" playsinline preload="metadata" data-preview-video></video>
          <div class="video-placeholder" data-video-placeholder>
            <span class="preview-monogram" aria-hidden="true">FT</span>
            <p>Load a short clip to preview it here.</p>
          </div>
        </div>

        <div class="player-controls" aria-label="Player controls">
          <button class="button" type="button" data-play-toggle disabled>Play</button>
          <label class="seek-control">
            <span>Seek</span>
            <input type="range" min="0" max="1000" value="0" step="1" data-seek disabled />
          </label>
          <span class="time-readout" data-time-readout>00:00 / 00:00</span>
          <button class="button" type="button" data-mute-toggle disabled>Mute</button>
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
  video.currentTime = 0;
  renderLoadedState();
});

video.addEventListener("timeupdate", updatePlaybackUi);
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
  setPreviewControlsEnabled(false);
  uploadCopy.textContent = "This file cannot be previewed directly by this browser.";
});

playToggle.addEventListener("click", async () => {
  if (!state.canPreviewDirectly) {
    return;
  }

  if (video.paused) {
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

  video.currentTime = (Number(seekInput.value) / Number(seekInput.max)) * state.duration;
  updatePlaybackUi();
});

resetSourceButton.addEventListener("click", resetSource);

window.addEventListener("beforeunload", revokeSourceUrl);
window.addEventListener("resize", updatePreviewFit);

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

  state.sourceFile = file;
  state.sourceUrl = URL.createObjectURL(file);
  state.duration = 0;
  state.width = 0;
  state.height = 0;
  state.canPreviewDirectly = false;

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
  updatePlaybackUi();
}

function updatePreviewFit(): void {
  if (!state.canPreviewDirectly || state.width <= 0 || state.height <= 0) {
    video.classList.remove("fit-width", "fit-height");
    return;
  }

  const frameRect = videoFrame.getBoundingClientRect();

  if (frameRect.width <= 0 || frameRect.height <= 0) {
    return;
  }

  const videoRatio = state.width / state.height;
  const frameRatio = frameRect.width / frameRect.height;
  const fitWidth = videoRatio >= frameRatio;

  video.classList.toggle("fit-width", fitWidth);
  video.classList.toggle("fit-height", !fitWidth);
}

function updatePlaybackUi(): void {
  const duration = Number.isFinite(video.duration) ? video.duration : state.duration;
  const currentTime = Number.isFinite(video.currentTime) ? video.currentTime : 0;

  playToggle.textContent = video.paused ? "Play" : "Pause";
  muteToggle.textContent = video.muted ? "Unmute" : "Mute";
  timeReadout.textContent = `${formatTime(currentTime)} / ${formatTime(duration)}`;
  seekInput.value =
    duration > 0 ? String(Math.round((currentTime / duration) * Number(seekInput.max))) : "0";
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

  state.sourceFile = null;
  state.sourceUrl = null;
  state.duration = 0;
  state.width = 0;
  state.height = 0;
  state.canPreviewDirectly = false;

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
  updatePlaybackUi();
}

function resetVideoElement(): void {
  video.pause();
  video.removeAttribute("src");
  video.load();
  video.classList.remove("is-loaded", "fit-width", "fit-height");
}

function revokeSourceUrl(): void {
  if (state.sourceUrl) {
    URL.revokeObjectURL(state.sourceUrl);
  }
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
