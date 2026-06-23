# FrameTuner

FrameTuner is a browser-based media tuning tool for trimming, cropping, resizing, changing playback speed, removing audio, exporting clips, extracting WAV audio, and exporting image sequences.

The app runs locally in the browser. Video conversion is handled by `ffmpeg.wasm` using a locally bundled FFmpeg core.

## Features

- Open or drop videos, GIFs, still images, or multiple image files.
- Preview media directly in the browser.
- Trim a time range with a filmstrip preview.
- Crop with preset aspect ratios or a free rectangle.
- Resize to the original size or a custom size.
- Change FPS as a speed change while preserving frame count.
- Remove audio from MP4 output.
- Export videos as MP4, GIF, WAV, or image sequences.
- Export GIFs as GIF, MP4, or image sequences.
- Export still images as PNG, JPEG, BMP, or GIF.
- Use Assign to apply the current settings back into the preview before making more edits.
- View FFmpeg output in the Log tab.

## Supported Input

- Video: MP4, MOV, and other formats supported by the browser and FFmpeg.
- GIF: animated GIFs are decoded as editable frame sequences.
- Still images: PNG, JPEG, BMP.
- Image sequences: multiple PNG, JPEG, or BMP files selected or dropped together.

When multiple images are loaded, FrameTuner sorts them by natural filename order and treats them as a 30 FPS frame sequence. The sequence goes through the same frame preprocessing window used for GIFs.

## Basic Use

1. Click **Open** or drop a file onto the preview area.
2. Wait for the **Loading source** dialog to finish. Large GIFs or large image sequences can take time to decode.
3. For GIFs or image sequences, use the preprocessing dialog if needed:
   - Select a frame number to preview that frame.
   - Use the arrow keys to move the highlighted frame.
   - Use **Skip count** and **Select skipped** to select frames for deletion.
   - Use **Delete selected** to remove selected frames.
   - Use **Restore all** to undo preprocessing deletions before applying.
   - Click **Apply** to load the processed frame sequence, or **Cancel** to keep the current source unchanged.
4. Use the preview controls to play, pause, mute, and seek.
5. Adjust settings in the **Settings** tab.
6. Click **Export** to save the result, or **Assign** to apply the current edits back into the preview.

## Trim

Use **Trim range** to choose the active time range.

- Drag the Start or End slider to adjust the trim range.
- While dragging, a filmstrip appears above the slider.
- The main preview follows the active trim edge so you can see the exact cut point.
- Still images and single-frame sources do not have a time range, so trim controls are disabled.

## Crop

Use **Crop** to define the visible region.

- **Full** keeps the entire frame.
- Preset ratios constrain the crop rectangle.
- **Free** allows manual width and height entry.
- Drag the crop rectangle in the preview to move it.
- Drag the handles to resize it.
- If you manually resize a Free crop rectangle in the preview, the fixed size entry is released.

## Resize

Use **Resize** to control the output dimensions.

- **Original** keeps the source size after crop.
- **Custom** enables width and height fields.
- **Keep aspect** preserves the current aspect ratio while editing custom dimensions.

## FPS

FPS changes are treated as speed changes.

- **Original** keeps the source timing.
- **Custom** changes the duration of each frame while preserving the frame count.
- For video MP4 output, audio is time-stretched when audio is kept.
- FPS changes do not affect PNG, JPEG, or BMP image sequence exports because image sequences do not store timing.
- FPS controls are disabled for still images and single-frame sources.

## Output

Choose the export format in the **Output** section.

Available formats depend on the current source:

- Video: MP4, GIF, WAV, PNG, JPEG, BMP.
- Animated GIF or image sequence: GIF, MP4, PNG, JPEG, BMP.
- Still image or single-frame source: PNG, JPEG, BMP, GIF.

### MP4

MP4 export applies Trim, FPS, Crop, Resize, and Audio settings.

For video sources, the Audio menu supports:

- **Keep audio**
- **Remove audio**

For GIFs, image sequences, and still images, audio is not available.

### GIF

GIF export applies Trim, FPS, Crop, and Resize.

Large GIF exports can be expensive in the browser. FrameTuner estimates GIF output size before conversion and shows a warning dialog when the export may be too large.

### WAV

WAV export is available for video sources only.

It extracts the audio stream as 16-bit PCM WAV. Trim and Custom FPS speed changes are applied to the audio. If the source video has no audio stream, the export fails and the reason is shown in the result dialog and Log tab.

### Image Sequences

PNG, JPEG, and BMP export from video, GIF, or image sequence sources creates numbered image files.

- FrameTuner asks you to choose an existing folder.
- The app does not create a subfolder.
- Files are named from the selected folder name, such as `folder_0000.png`, `folder_0001.png`, and so on.
- Number padding is at least four digits and always includes a leading zero.

Folder export requires a browser with the File System Access API.

## Assign and Reset

Use **Assign** when you want to apply the current settings into the preview and continue editing from the transformed media.

- Assign creates an internal result from the current Trim, FPS, Crop, Resize, and Audio settings.
- After Assign completes, the preview reloads with the assigned media.
- The edit settings return to their defaults.
- Assign does not open a save dialog.

Use **Reset** to return to the source and settings from immediately before the last Assign.

- Reset is one level only.
- Opening a new source or clicking **Clear** discards the Assign checkpoint.

## Log

The **Log** tab shows FFmpeg messages and app export messages.

Use it when an export fails or takes longer than expected. The success or failure dialog gives a short result, while the Log tab contains the technical details.

## Browser Notes

- Chrome or Edge is recommended.
- GIF decoding uses the browser `ImageDecoder` API.
- Save dialogs and image sequence folder export use the File System Access API where available.
- If a browser does not support a required API, FrameTuner disables the affected operation or shows an error.

## Development

Install dependencies:

```sh
npm install
```

Start the development server:

```sh
npm run dev
```

Run type checking:

```sh
npm run typecheck
```

Build for production:

```sh
npm run build
```

Preview the production build:

```sh
npm run preview
```

The `dev`, `build`, and `preview` scripts prepare the local FFmpeg core files before running Vite.
