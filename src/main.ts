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
  thumbnailDataUrls: string[];
  thumbnailGenerationId: number;
  activeTrimEdge: TrimEdge | null;
};

type TrimEdge = "start" | "end";

const TRIM_SLIDER_MAX = 1000;
const MIN_TRIM_SECONDS = 0.1;
const TRIM_THUMBNAIL_COUNT = 12;
const TRIM_THUMBNAIL_WIDTH = 160;
const TRIM_THUMBNAIL_HEIGHT = 90;
const TRIM_FILMSTRIP_HIDE_DELAY_MS = 180;

const initialControlTiles: ControlTile[] = [
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

          <div class="trim-fields">
            <label>
              <span>Start</span>
              <input type="number" min="0" value="0" step="0.1" data-trim-start-input disabled />
            </label>
            <label>
              <span>End</span>
              <input type="number" min="0" value="0" step="0.1" data-trim-end-input disabled />
            </label>
          </div>

          <div class="trim-actions">
            <button class="button" type="button" data-set-trim-start disabled>Set start</button>
            <button class="button" type="button" data-set-trim-end disabled>Set end</button>
          </div>

          <p class="trim-message" data-trim-message>Load a video to choose a time range.</p>
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
const trimStartInput = query<HTMLInputElement>("[data-trim-start-input]");
const trimEndInput = query<HTMLInputElement>("[data-trim-end-input]");
const trimSummary = query<HTMLElement>("[data-trim-summary]");
const trimMessage = query<HTMLElement>("[data-trim-message]");
const trimFilmstrip = query<HTMLDivElement>("[data-trim-filmstrip]");
const trimFilmstripTrack = query<HTMLDivElement>("[data-trim-filmstrip-track]");
const trimStartMarkerTime = query<HTMLElement>("[data-trim-start-marker-time]");
const trimEndMarkerTime = query<HTMLElement>("[data-trim-end-marker-time]");
const trimActiveLabel = query<HTMLElement>("[data-trim-active-label]");
const trimActiveTime = query<HTMLElement>("[data-trim-active-time]");
const setTrimStartButton = query<HTMLButtonElement>("[data-set-trim-start]");
const setTrimEndButton = query<HTMLButtonElement>("[data-set-trim-end]");
let trimFilmstripHideTimer: number | null = null;

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
  setPreviewControlsEnabled(false);
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

trimStartInput.addEventListener("change", () => {
  setTrimRange(Number(trimStartInput.value), state.trimEnd, "start");
});

trimEndInput.addEventListener("change", () => {
  setTrimRange(state.trimStart, Number(trimEndInput.value), "end");
});

setTrimStartButton.addEventListener("click", () => {
  setTrimRange(video.currentTime, state.trimEnd, "start");
});

setTrimEndButton.addEventListener("click", () => {
  setTrimRange(state.trimStart, video.currentTime, "end");
});

resetSourceButton.addEventListener("click", resetSource);

window.addEventListener("beforeunload", revokeSourceUrl);
window.addEventListener("resize", updatePreviewFit);
window.addEventListener("pointerup", handleGlobalTrimPointerEnd);
window.addEventListener("pointercancel", handleGlobalTrimPointerEnd);

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
  renderTrimUi();

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
  renderTrimUi();
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

  playToggle.textContent = video.paused ? "Play" : "Pause";
  muteToggle.textContent = video.muted ? "Unmute" : "Mute";
  timeReadout.textContent = `${formatTime(currentTime)} / ${formatTime(duration)}`;
  seekInput.value =
    duration > 0 ? String(Math.round((currentTime / duration) * Number(seekInput.max))) : "0";
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
  trimStartInput.value = enabled ? formatSecondsInput(state.trimStart) : "0";
  trimEndInput.value = enabled ? formatSecondsInput(state.trimEnd) : "0";

  trimStartInput.max = enabled ? formatSecondsInput(Math.max(0, duration - MIN_TRIM_SECONDS)) : "0";
  trimEndInput.max = enabled ? formatSecondsInput(duration) : "0";
  trimStartInput.step = "0.1";
  trimEndInput.step = "0.1";

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
  trimStartInput.disabled = !enabled;
  trimEndInput.disabled = !enabled;
  setTrimStartButton.disabled = !enabled;
  setTrimEndButton.disabled = !enabled;
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
  renderTrimUi();
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
