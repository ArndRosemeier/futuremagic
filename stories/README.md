# Stories

Write Markdown drafts here, then publish them with:

```powershell
python tools\story_manager\app.py
```

## Frontmatter

```markdown
---
title: My Story Title
date: 2026-07-27
excerpt: A short teaser for the listing.
---
```

## Structure (table of contents)

Heading levels become a nested Contents tree in the reader:

```markdown
# Book I — Title
## Act 1 — Title
### Chapter 1 — Title
#### Scene
```

You can use as many levels as you need (`#` through `######`).
