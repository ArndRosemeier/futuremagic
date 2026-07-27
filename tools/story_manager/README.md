# Futuremagic Story Manager

Publish Markdown stories to [futuremagic.de](https://futuremagic.de/) via FTP.

## Setup

```powershell
cd C:\Projekte\FutureMagic
python -m pip install -r tools\story_manager\requirements.txt
```

Set the FTP password (same as hub deploy):

```powershell
$env:FTP_PASSWORD = "your-password"
```

Or enter it in the UI password field.

## Write a story

Put Markdown files in `stories/` at the repo root:

```markdown
---
title: The Long Road
date: 2026-07-27
excerpt: Optional short blurb
---

Once upon a time...
```

Filename stem becomes the URL slug: `the-long-road.md` → `/stories/the-long-road.html`.

## Run

```powershell
python tools\story_manager\app.py
```

1. Select a draft → check the preview  
2. **Publish / Update to live site**  
3. Use **Live on site** to refresh, reorder, or remove  

After the hub with the Stories UI has been deployed once (`.\deploy-clean.ps1`), story changes only need this tool.
