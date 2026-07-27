"""Parse Markdown story drafts into HTML article bodies."""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date
from pathlib import Path

import markdown

FRONTMATTER_RE = re.compile(
    r"\A---\s*\n(.*?)\n---\s*\n(.*)\Z",
    re.DOTALL,
)
HEADING_RE = re.compile(r"^#\s+(.+)$", re.MULTILINE)
SLUG_RE = re.compile(r"[^a-z0-9]+")


@dataclass(frozen=True)
class ParsedStory:
    slug: str
    title: str
    date: str
    excerpt: str
    body_markdown: str
    body_html: str
    source_path: Path


def slugify(stem: str) -> str:
    slug = SLUG_RE.sub("-", stem.strip().lower()).strip("-")
    if not slug:
        raise ValueError(f"Cannot derive slug from filename stem: {stem!r}")
    return slug


def _parse_frontmatter(raw: str) -> tuple[dict[str, str], str]:
    match = FRONTMATTER_RE.match(raw)
    if match is None:
        return {}, raw

    meta: dict[str, str] = {}
    for line in match.group(1).splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        meta[key.strip().lower()] = value.strip().strip("\"'")
    return meta, match.group(2)


def _title_from_body(body: str, fallback: str) -> str:
    heading = HEADING_RE.search(body)
    if heading is not None:
        return heading.group(1).strip()
    return fallback


def _strip_leading_title(body: str, title: str) -> str:
    """Avoid duplicating the H1 when the hub already shows the story title."""
    pattern = re.compile(
        rf"^#\s+{re.escape(title)}\s*\n+",
        re.IGNORECASE,
    )
    return pattern.sub("", body, count=1)


def parse_story_file(path: Path, *, today: date | None = None) -> ParsedStory:
    if not path.is_file():
        raise FileNotFoundError(f"Story file not found: {path}")
    if path.suffix.lower() not in {".md", ".markdown"}:
        raise ValueError(f"Expected a Markdown (.md) file, got: {path.name}")

    raw = path.read_text(encoding="utf-8")
    meta, body = _parse_frontmatter(raw)
    slug = slugify(path.stem)
    fallback_title = path.stem.replace("-", " ").replace("_", " ").strip().title()
    title = meta.get("title") or _title_from_body(body, fallback_title)
    story_date = meta.get("date") or (today or date.today()).isoformat()
    excerpt = meta.get("excerpt", "")
    body = _strip_leading_title(body.strip(), title)
    html = markdown.markdown(
        body,
        extensions=["extra", "sane_lists", "smarty"],
        output_format="html",
    )
    return ParsedStory(
        slug=slug,
        title=title,
        date=story_date,
        excerpt=excerpt,
        body_markdown=body,
        body_html=html,
        source_path=path,
    )
