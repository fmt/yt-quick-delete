# YouTube Playlist Quick Delete

A small Chrome extension that adds a trash button next to the three-dot menu on every video in a YouTube playlist, including Watch Later. One click does the same thing as opening the menu and choosing "Remove from playlist".

YouTube has no multi-select and no quick delete, so cleaning up a long playlist means two clicks per video. This cuts it to one.

## Features

- Trash button placed side by side with the three-dot menu on each playlist row
- Works on Watch Later and on any playlist you own
- Supports both the classic playlist row layout and the newer lockup layout
- Rapid clicks are queued and processed one at a time
- Waits for YouTube to finish refreshing the list between removals, and retries if an edit is rejected
- Works with any YouTube interface language
- No permissions, no network requests, no data collected

## Install

The extension is not on the Chrome Web Store, so you load it as an unpacked extension.

1. Download or clone this repository.
2. Open `chrome://extensions` in Chrome (or any Chromium browser such as Edge, Brave or Vivaldi).
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select the repository folder (the one containing `manifest.json`).
5. Open a playlist, for example `https://www.youtube.com/playlist?list=WL` for Watch Later. Reload the page if it was already open.

Keep the folder in place. Moving or deleting it disables the extension.

## Usage

Open any playlist page. Each row shows a trash icon to the left of the three-dot menu. Click it and the video is removed.

You can click several trash buttons in a row. Removals run one after another, with a short pause between them while the list refreshes.

There is no confirmation prompt. A removed video can be restored by adding it again (YouTube also shows a brief "Undo" toast right after removal).

## How it works

YouTube does not offer a page-level API for this, so the extension automates the normal menu:

1. Reads the video ID of the row you clicked.
2. Waits until the page has been idle for a moment.
3. Opens that row's three-dot menu with synthetic pointer and mouse events (the popup is hidden while this happens, so it does not flash).
4. Finds the visible menu entry whose text contains a "remove" word in one of several languages, and clicks it.
5. Waits for the video to leave the list. If it is still there, waits longer and retries, up to three attempts.

Rows are identified by video ID instead of DOM node or position, because YouTube recycles row elements while the list updates.

## Limitations

- Only runs on `youtube.com/playlist` pages.
- On playlists you do not own there is no remove entry, so the button does nothing.
- If the same video appears twice in a playlist, the first match is removed.
- YouTube changes its markup often. If the buttons stop appearing or stop working, see Troubleshooting.

## Troubleshooting

Open the browser console (F12, Console tab) and look for lines starting with `[ytqd]`.

| Symptom | Likely cause | What to do |
| --- | --- | --- |
| No trash buttons | YouTube changed its row markup | Update `ITEM_SELECTOR` and `findMenuButton` in `content.js` |
| `remove entry not found` in console | Menu opened but its text did not match | Add your language's word for "remove" to `REMOVE_RE` in `content.js` |
| `could not read video id` in console | Row layout has no standard watch link | Update `videoIdOf` in `content.js` |
| "Precondition check failed" toast | An edit was sent while the list was still refreshing | The script retries automatically. If it persists, increase the values in `waitForQuiet` |

When reporting an issue, include the console output and the HTML of one playlist row (right-click the row, Inspect, copy the element).

## Project structure

```
manifest.json   Manifest V3 definition, runs the content script on youtube.com
content.js      Button injection and removal logic
content.css     Button styling and popup hiding
```

## Privacy

The extension runs only on `https://www.youtube.com/*`. It does not request any browser permissions, does not make network requests of its own, and does not store or transmit any data. All it does is click buttons that already exist on the page.

## Disclaimer

This project is not affiliated with or endorsed by YouTube or Google. It automates the page's existing interface and may stop working whenever YouTube changes it.

## License

MIT. See [LICENSE](LICENSE).
