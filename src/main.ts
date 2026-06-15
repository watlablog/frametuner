import "./style.css";

type InspectorControl = {
  title: string;
  value: string;
  note: string;
};

const inspectorControls: InspectorControl[] = [
  {
    title: "Time",
    value: "Start 00:00 / End 00:00",
    note: "Trim controls"
  },
  {
    title: "Crop",
    value: "Full frame",
    note: "Numeric crop"
  },
  {
    title: "Size",
    value: "Original",
    note: "Resize"
  },
  {
    title: "Frame rate",
    value: "Original",
    note: "FPS tuning"
  },
  {
    title: "Audio",
    value: "Keep audio",
    note: "Audio mode"
  },
  {
    title: "Combine",
    value: "Single source",
    note: "Later milestone"
  }
];

const root = document.querySelector<HTMLDivElement>("#app");

if (!root) {
  throw new Error("FrameTuner root element was not found.");
}

root.innerHTML = `
  <div class="app-shell">
    <header class="app-header">
      <div class="brand-lockup">
        <p class="eyebrow">WATLAB Tools</p>
        <h1 class="brand-wordmark">FrameTuner</h1>
        <p class="app-copy">Browser-based video trimming and tuning tool.</p>
      </div>
      <div class="header-meta" aria-label="Project status">
        <span class="status-pill">Milestone 1</span>
        <span class="status-pill status-pill-muted">Shell UI</span>
      </div>
    </header>

    <main class="workspace" aria-label="FrameTuner workspace">
      <div class="media-column">
        <section class="panel upload-panel" aria-labelledby="upload-title">
          <div class="panel-heading">
            <div>
              <p class="section-kicker">Source</p>
              <h2 id="upload-title">Upload</h2>
            </div>
            <span class="status-pill">Local-first</span>
          </div>
          <div class="drop-zone" tabindex="0" aria-label="Video file drop area">
            <span class="drop-mark" aria-hidden="true">+</span>
            <div>
              <p class="drop-title">Drop a video file here</p>
              <p class="drop-copy">Your video stays in this browser.</p>
            </div>
            <button class="button primary" type="button" disabled>
              Choose file
            </button>
          </div>
          <p class="message">
            File loading will be connected in Milestone 2. Core editing stays local and static-host friendly.
          </p>
        </section>

        <section class="panel preview-panel" aria-labelledby="preview-title">
          <div class="panel-heading">
            <div>
              <p class="section-kicker">Preview</p>
              <h2 id="preview-title">Video preview</h2>
            </div>
            <span class="status-pill status-pill-muted">Empty</span>
          </div>
          <div class="video-frame" aria-label="Preview area">
            <div class="video-placeholder">
              <span class="preview-monogram" aria-hidden="true">FT</span>
              <p>Load a short clip to preview it here.</p>
            </div>
          </div>
          <div class="player-controls" aria-label="Player controls">
            <button class="button" type="button" disabled>Play</button>
            <label class="seek-control">
              <span>Seek</span>
              <input type="range" min="0" max="100" value="0" disabled />
            </label>
            <span class="time-readout">00:00 / 00:00</span>
            <button class="button" type="button" disabled>Mute</button>
          </div>
        </section>
      </div>

      <aside class="panel inspector-panel" aria-labelledby="inspector-title">
        <div class="panel-heading">
          <div>
            <p class="section-kicker">Inspector</p>
            <h2 id="inspector-title">Edit controls</h2>
          </div>
          <span class="status-pill status-pill-muted">Idle</span>
        </div>
        <div class="control-list">
          ${inspectorControls
            .map(
              (control) => `
                <div class="control-row">
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
        <div class="inspector-actions">
          <button class="button" type="button" disabled>Undo</button>
          <button class="button" type="button" disabled>Reset</button>
        </div>
      </aside>

      <section class="panel export-panel workspace-wide" aria-labelledby="export-title">
        <div class="panel-heading">
          <div>
            <p class="section-kicker">Output</p>
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
        <p class="message">Waiting for a source video.</p>
      </section>
    </main>
  </div>
`;
