import "./style.css";

type ControlTile = {
  title: string;
  value: string;
  note: string;
};

const controlTiles: ControlTile[] = [
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
        <span class="status-pill">Milestone 1</span>
        <span class="status-pill status-pill-muted">Shell UI</span>
      </div>
    </header>

    <main class="workspace" aria-label="FrameTuner workspace">
      <section class="panel media-panel" aria-labelledby="preview-title">
        <div class="upload-bar" tabindex="0" aria-label="Video file drop area">
          <div class="upload-copy">
            <span class="section-kicker">Source</span>
            <strong>Drop a video file here</strong>
            <span>Your video stays in this browser.</span>
          </div>
          <button class="button primary compact-button" type="button" disabled>
            Choose file
          </button>
        </div>

        <div class="preview-header">
          <div>
            <span class="section-kicker">Preview</span>
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

      <aside class="panel control-panel" aria-labelledby="controls-title">
        <div class="panel-heading compact-heading">
          <div>
            <span class="section-kicker">Inspector</span>
            <h2 id="controls-title">Edit controls</h2>
          </div>
          <span class="status-pill status-pill-muted">Idle</span>
        </div>

        <div class="control-grid">
          ${controlTiles
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
          <button class="button" type="button" disabled>Reset</button>
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
          <p class="message">Waiting for a source video.</p>
        </section>
      </aside>
    </main>
  </div>
`;
