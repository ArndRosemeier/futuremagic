"""stories.json registry helpers."""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from typing import Any


@dataclass
class StoryEntry:
    slug: str
    title: str
    date: str
    excerpt: str
    path: str

    @staticmethod
    def from_dict(data: dict[str, Any]) -> StoryEntry:
        slug = data.get("slug")
        title = data.get("title")
        date = data.get("date")
        path = data.get("path")
        if (
            not isinstance(slug, str)
            or not isinstance(title, str)
            or not isinstance(date, str)
            or not isinstance(path, str)
        ):
            raise ValueError(f"Invalid story entry: {data!r}")
        excerpt = data.get("excerpt", "")
        if not isinstance(excerpt, str):
            excerpt = ""
        return StoryEntry(
            slug=slug,
            title=title,
            date=date,
            excerpt=excerpt,
            path=path,
        )


@dataclass
class StoriesRegistry:
    version: int
    stories: list[StoryEntry]

    @staticmethod
    def empty() -> StoriesRegistry:
        return StoriesRegistry(version=1, stories=[])

    @staticmethod
    def from_json(text: str) -> StoriesRegistry:
        data = json.loads(text)
        if not isinstance(data, dict):
            raise ValueError("stories.json root must be an object")
        raw_stories = data.get("stories")
        if not isinstance(raw_stories, list):
            raise ValueError("stories.json must contain a stories array")
        stories = [
            StoryEntry.from_dict(item)
            for item in raw_stories
            if isinstance(item, dict)
        ]
        version = data.get("version", 1)
        if not isinstance(version, int):
            version = 1
        return StoriesRegistry(version=version, stories=stories)

    def to_json(self) -> str:
        payload = {
            "version": self.version,
            "stories": [asdict(story) for story in self.stories],
        }
        return json.dumps(payload, indent=2, ensure_ascii=False) + "\n"

    def upsert(self, entry: StoryEntry) -> None:
        for index, existing in enumerate(self.stories):
            if existing.slug == entry.slug:
                self.stories[index] = entry
                return
        self.stories.append(entry)

    def remove(self, slug: str) -> StoryEntry | None:
        for index, existing in enumerate(self.stories):
            if existing.slug == slug:
                return self.stories.pop(index)
        return None

    def move(self, slug: str, delta: int) -> bool:
        index = next(
            (i for i, story in enumerate(self.stories) if story.slug == slug),
            None,
        )
        if index is None:
            return False
        new_index = index + delta
        if new_index < 0 or new_index >= len(self.stories):
            return False
        self.stories[index], self.stories[new_index] = (
            self.stories[new_index],
            self.stories[index],
        )
        return True

    def find(self, slug: str) -> StoryEntry | None:
        for story in self.stories:
            if story.slug == slug:
                return story
        return None


def story_remote_path(slug: str) -> str:
    return f"/stories/{slug}.html"
