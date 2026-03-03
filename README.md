# Journal View

**Read in your language:** [English](README.md) · [简体中文](README-zh_cn.md) · [日本語](README-ja.md) · [繁體中文](README-zh_tw.md)

---

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Obsidian](https://img.shields.io/badge/Obsidian-v0.15.0+-%23483699?logo=obsidian&style=flat-square)

| List View | Calendar View | Editor Gallery |
|:---------:|:-------------:|:--------------:|
| ![List View](showcaseimages/7bd2abb4b582a8e8e5293561d35a39c8.png) | ![Calendar View](showcaseimages/e24c0350cb6e08962aded61c8e4722f7.png) | ![Editor Gallery](showcaseimages/f8ab7b261496c728d4ff90369ca53b75.png) |

Organize Markdown files by calendar and create a journal-style view. List, calendar, On This Day, journal image layouts — all in one place.

If Journal View helps you, consider [supporting me on Ko-fi](https://ko-fi.com/jacelin) ☕️

---

## 1 Features

### 1.1 Home View

- **Calendar View**: Browse entries by month with thumbnails in date cells
- **List View**: Timeline-style list grouped by date (Today, Yesterday, Previous years)
- **On This Day**: Show entries from the same date in past years
- **Journal Cards**: Title, date, excerpt, images (1–5+ layout support)
- **Stats Bar** (optional): Consecutive days, word count, days with entries

### 1.2 Editor

- **Journal-style Image Layout**: In Live Preview, images in notes from the default folder use the same layout as journal cards
- **Auto-split**: Over 5 consecutive images are split into multiple galleries
- **Live Update**: Add/remove images and layout updates instantly
- **Image Delete**: Delete button on each image

### 1.3 Other

- **Multi-language**: English, 简体中文, 日本語, 繁體中文
- **Virtualized List**: @tanstack/react-virtual for smooth scrolling
- **File Watchers**: Auto-refresh on create, edit, delete, rename
- **Configurable Date Field**: Supports `date`, `Date`, `created`, `created_time` or custom

---

## 2 Installation

### Using BRAT (Recommended)

1. Install the [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin
2. In BRAT settings, click "Add Beta plugin"
3. Enter this plugin’s GitHub repo URL
4. Install and enable in Obsidian

> **Tip**: BRAT checks for updates and notifies you of new versions.

### Manual Install

1. Download `main.js`, `manifest.json`, `styles.css` from [Releases](https://github.com/your-username/obsidian-journal-react/releases)
2. Put them in `{vault}/.obsidian/plugins/obsidian-journal-react/`
3. Enable the plugin in Obsidian

### Build from Source

```bash
cd .obsidian/plugins/obsidian-journal-react
npm install
npm run build
```

---

## 3 Usage

### Open View

- **Command**: `Ctrl/Cmd + P` → type "Open Journal View" → Enter

### New Note

- Click the **+** button in the top-right to create today’s note with the default template

### Switch View Mode

- Click the calendar/list icon to switch between calendar and list views

---

## 4 Settings

| Setting | Description |
|---------|-------------|
| **Default Folder** | Journal view opens this folder; editor image layout applies only to notes here |
| **Date Field** | frontmatter field for dates, e.g. `date`, `created` |
| **Default Template** | Template for new notes; variables: `{{date}}`, `{{year}}`, `{{month}}`, `{{day}}`, `{{title}}` |
| **Editor Image Layout** | Enable journal-style image layout in Live Preview |
| **Image Gap** | Spacing between image containers (0–30px) |
| **Image Display Limit** | Max images per card (default 3; layout supports up to 5) |
| **Open Note Mode** | New tab / Current tab |
| **Show Stats Bar** | Show consecutive days, word count, etc. |
| **IndexedDB Storage** | View and clear cache in Maintenance section |

---

## 5 Date & Image Rules

### 5.1 Date Extraction

1. **Priority 1**: frontmatter date (custom or default `date`, `Date`, `created`, `created_time`)
2. **Priority 2**: File creation time `ctime`

### 5.2 Image Layout

| Images | Layout |
|--------|--------|
| 1 | Single column 2:1 |
| 2 | Left & right 2:1 each |
| 3 | Large left + 2 small right |
| 4 | Large left + 3 small right |
| 5+ | Large left + 4 small right; overflow into multiple galleries |

**Editor**: Same as home; images beyond 5 split into multiple galleries; delete button on each image.

### 5.3 Thumbnail Cache

Home cards use WebP thumbnails for faster scrolling.

**When are they generated?**

| Your Action | System Behavior |
|-------------|-----------------|
| Open Journal View | Read existing cache only; no generation |
| Scroll to an image | Show cache if present; otherwise show original, then generate in background |
| Return after new note | New note images generate on demand when shown |
| Edit an image | Treated as new; regenerated on next view |
| Long-unused images | LRU eviction when over quota |
| Clear cache | Remove all thumbnails; regenerate on next view |

**Storage Quota & Eviction**

- **IndexedDB**: ~200 MB cap; LRU eviction when over
- **Memory**: Up to 200 thumbnails; LRU eviction
- View usage and clear in **Settings → Maintenance**

---

## 6 Privacy & Storage

- **Local Only**: IndexedDB caches entries and thumbnails locally; nothing is uploaded
- **Quota**: Thumbnail cache capped at ~200 MB; oldest entries evicted (see 5.3)
- **Clear**: View usage and clear cache in **Settings → Maintenance**
- **No Network**: No requests to external servers

---

## 7 Development

```bash
npm install
npm run dev    # watch mode
npm run build  # production build
```

**Stack**: React 18, @tanstack/react-virtual, TypeScript, esbuild

---

## 8 License

MIT License

---

Questions or feedback? Open an issue on GitHub.
