"""
Futuremagic Story Manager — publish Markdown stories to the live site via FTP.

Usage (from repo root):
  pip install -r tools/story_manager/requirements.txt
  python tools/story_manager/app.py
"""

from __future__ import annotations

import os
import sys
import tkinter as tk
from pathlib import Path
from tkinter import filedialog, messagebox, ttk

# Allow running as `python tools/story_manager/app.py` from repo root
_HERE = Path(__file__).resolve().parent
if str(_HERE) not in sys.path:
    sys.path.insert(0, str(_HERE))

from ftp_client import FtpClient
from markdown_story import ParsedStory, parse_story_file
from registry import StoriesRegistry, StoryEntry, story_remote_path

REPO_ROOT = _HERE.parents[1]
DEFAULT_DRAFTS = REPO_ROOT / "stories"
DEFAULT_HOST = "ftp.futuremagic.de"
DEFAULT_USER = "12529-Pyrion"
DEFAULT_REMOTE_ROOT = "/webseiten/"
REGISTRY_RELATIVE = "stories.json"


class StoryManagerApp:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.root.title("Futuremagic Story Manager")
        self.root.minsize(860, 560)
        self.root.geometry("980x640")

        self.drafts_dir = tk.StringVar(value=str(DEFAULT_DRAFTS))
        self.ftp_host = tk.StringVar(value=DEFAULT_HOST)
        self.ftp_user = tk.StringVar(value=DEFAULT_USER)
        self.ftp_password = tk.StringVar(value=self._default_password())
        self.remote_root = tk.StringVar(value=DEFAULT_REMOTE_ROOT)
        self.status = tk.StringVar(value="Ready.")

        self._parsed: ParsedStory | None = None
        self._live: StoriesRegistry = StoriesRegistry.empty()
        self._draft_paths: list[Path] = []

        self._build_ui()
        DEFAULT_DRAFTS.mkdir(parents=True, exist_ok=True)
        self.refresh_drafts()

    @staticmethod
    def _default_password() -> str:
        return os.environ.get("FTP_PASSWORD", "")

    def _build_ui(self) -> None:
        outer = ttk.Frame(self.root, padding=12)
        outer.pack(fill=tk.BOTH, expand=True)

        settings = ttk.LabelFrame(outer, text="FTP", padding=8)
        settings.pack(fill=tk.X, pady=(0, 10))

        ttk.Label(settings, text="Host").grid(row=0, column=0, sticky=tk.W, padx=(0, 6))
        ttk.Entry(settings, textvariable=self.ftp_host, width=28).grid(
            row=0, column=1, sticky=tk.W
        )
        ttk.Label(settings, text="User").grid(row=0, column=2, sticky=tk.W, padx=(12, 6))
        ttk.Entry(settings, textvariable=self.ftp_user, width=18).grid(
            row=0, column=3, sticky=tk.W
        )
        ttk.Label(settings, text="Password").grid(
            row=0, column=4, sticky=tk.W, padx=(12, 6)
        )
        ttk.Entry(settings, textvariable=self.ftp_password, show="*", width=18).grid(
            row=0, column=5, sticky=tk.W
        )
        ttk.Label(settings, text="Remote root").grid(
            row=1, column=0, sticky=tk.W, padx=(0, 6), pady=(6, 0)
        )
        ttk.Entry(settings, textvariable=self.remote_root, width=28).grid(
            row=1, column=1, sticky=tk.W, pady=(6, 0)
        )

        paned = ttk.Panedwindow(outer, orient=tk.HORIZONTAL)
        paned.pack(fill=tk.BOTH, expand=True)

        left = ttk.Frame(paned, padding=(0, 0, 8, 0))
        right = ttk.Frame(paned, padding=(8, 0, 0, 0))
        paned.add(left, weight=1)
        paned.add(right, weight=1)

        # --- Drafts ---
        drafts_box = ttk.LabelFrame(left, text="Local drafts", padding=8)
        drafts_box.pack(fill=tk.BOTH, expand=True)

        dir_row = ttk.Frame(drafts_box)
        dir_row.pack(fill=tk.X, pady=(0, 6))
        ttk.Entry(dir_row, textvariable=self.drafts_dir).pack(
            side=tk.LEFT, fill=tk.X, expand=True
        )
        ttk.Button(dir_row, text="Open .md…", command=self.choose_story_file).pack(
            side=tk.LEFT, padx=(6, 0)
        )
        ttk.Button(dir_row, text="Folder…", command=self.choose_drafts_dir).pack(
            side=tk.LEFT, padx=(6, 0)
        )
        ttk.Button(dir_row, text="Refresh", command=self.refresh_drafts).pack(
            side=tk.LEFT, padx=(6, 0)
        )

        self.drafts_list = tk.Listbox(drafts_box, exportselection=False, height=12)
        self.drafts_list.pack(fill=tk.BOTH, expand=True)
        self.drafts_list.bind("<<ListboxSelect>>", self.on_draft_select)

        preview = ttk.LabelFrame(left, text="Preview", padding=8)
        preview.pack(fill=tk.BOTH, expand=True, pady=(10, 0))
        self.preview = tk.Text(preview, height=12, wrap=tk.WORD, state=tk.DISABLED)
        self.preview.pack(fill=tk.BOTH, expand=True)

        ttk.Button(
            left, text="Publish / Update to live site", command=self.publish_selected
        ).pack(fill=tk.X, pady=(10, 0))

        # --- Live ---
        live_box = ttk.LabelFrame(right, text="Live on site", padding=8)
        live_box.pack(fill=tk.BOTH, expand=True)

        live_btns = ttk.Frame(live_box)
        live_btns.pack(fill=tk.X, pady=(0, 6))
        ttk.Button(live_btns, text="Refresh from site", command=self.refresh_live).pack(
            side=tk.LEFT
        )
        ttk.Button(live_btns, text="Move up", command=lambda: self.move_live(-1)).pack(
            side=tk.LEFT, padx=(6, 0)
        )
        ttk.Button(live_btns, text="Move down", command=lambda: self.move_live(1)).pack(
            side=tk.LEFT, padx=(6, 0)
        )
        ttk.Button(live_btns, text="Remove", command=self.remove_live).pack(
            side=tk.LEFT, padx=(6, 0)
        )

        self.live_list = tk.Listbox(live_box, exportselection=False, height=22)
        self.live_list.pack(fill=tk.BOTH, expand=True)

        status_bar = ttk.Label(outer, textvariable=self.status, relief=tk.SUNKEN, anchor=tk.W)
        status_bar.pack(fill=tk.X, pady=(10, 0))

    def set_status(self, message: str) -> None:
        self.status.set(message)
        self.root.update_idletasks()

    def choose_drafts_dir(self) -> None:
        chosen = filedialog.askdirectory(
            initialdir=self.drafts_dir.get() or str(DEFAULT_DRAFTS)
        )
        if chosen:
            self.drafts_dir.set(chosen)
            self.refresh_drafts()

    def choose_story_file(self) -> None:
        initial = self.drafts_dir.get() or str(DEFAULT_DRAFTS)
        chosen = filedialog.askopenfilename(
            title="Open Markdown story",
            initialdir=initial,
            filetypes=[
                ("Markdown files", "*.md;*.markdown"),
                ("Markdown (.md)", "*.md"),
                ("All files", "*.*"),
            ],
        )
        if not chosen:
            return
        path = Path(chosen)
        self.drafts_dir.set(str(path.parent))
        self.refresh_drafts()
        self._select_draft_path(path)

    @staticmethod
    def _is_story_markdown(path: Path) -> bool:
        if not path.is_file():
            return False
        if path.suffix.lower() not in {".md", ".markdown"}:
            return False
        # Keep folder docs out of the publish list
        if path.name.lower() in {"readme.md", "readme.markdown"}:
            return False
        return True

    def _discover_drafts(self, folder: Path) -> list[Path]:
        found: dict[str, Path] = {}
        for path in folder.rglob("*"):
            if not self._is_story_markdown(path):
                continue
            key = str(path.resolve()).lower()
            found[key] = path
        return sorted(found.values(), key=lambda p: str(p).lower())

    def _draft_label(self, folder: Path, path: Path) -> str:
        try:
            return str(path.relative_to(folder))
        except ValueError:
            return path.name

    def _select_draft_path(self, path: Path) -> None:
        target = path.resolve()
        for index, draft in enumerate(self._draft_paths):
            if draft.resolve() == target:
                self.drafts_list.selection_clear(0, tk.END)
                self.drafts_list.selection_set(index)
                self.drafts_list.see(index)
                self.on_draft_select()
                return
        # File may use an unusual extension; still allow publishing it directly
        if path.is_file():
            self._draft_paths.append(path)
            self.drafts_list.insert(tk.END, path.name)
            index = len(self._draft_paths) - 1
            self.drafts_list.selection_clear(0, tk.END)
            self.drafts_list.selection_set(index)
            self.drafts_list.see(index)
            self.on_draft_select()

    def refresh_drafts(self) -> None:
        folder = Path(self.drafts_dir.get())
        self.drafts_list.delete(0, tk.END)
        self._draft_paths = []
        self._parsed = None
        self._set_preview("")
        if not folder.is_dir():
            self.set_status(f"Drafts folder not found: {folder}")
            return
        paths = self._discover_drafts(folder)
        self._draft_paths = paths
        for path in paths:
            self.drafts_list.insert(tk.END, self._draft_label(folder, path))
        self.set_status(f"Found {len(paths)} draft(s) in {folder}")

    def on_draft_select(self, _event: object | None = None) -> None:
        selection = self.drafts_list.curselection()
        if not selection:
            return
        path = self._draft_paths[selection[0]]
        try:
            self._parsed = parse_story_file(path)
        except Exception as exc:
            self._parsed = None
            self._set_preview(f"Failed to parse {path.name}:\n{exc}")
            self.set_status(f"Parse error: {exc}")
            return
        story = self._parsed
        preview = (
            f"Title:   {story.title}\n"
            f"Slug:    {story.slug}\n"
            f"Date:    {story.date}\n"
            f"Excerpt: {story.excerpt or '(none)'}\n"
            f"Path:    {story_remote_path(story.slug)}\n"
            f"\n--- Body preview ---\n\n"
            f"{story.body_markdown[:2500]}"
        )
        self._set_preview(preview)
        self.set_status(f"Selected {path.name}")

    def _set_preview(self, text: str) -> None:
        self.preview.configure(state=tk.NORMAL)
        self.preview.delete("1.0", tk.END)
        self.preview.insert("1.0", text)
        self.preview.configure(state=tk.DISABLED)

    def _client(self) -> FtpClient:
        return FtpClient(
            host=self.ftp_host.get().strip(),
            user=self.ftp_user.get().strip(),
            password=self.ftp_password.get(),
            remote_root=self.remote_root.get().strip() or DEFAULT_REMOTE_ROOT,
        )

    def _load_remote_registry(self, client: FtpClient) -> StoriesRegistry:
        text = client.download_text(REGISTRY_RELATIVE)
        if text is None or not text.strip():
            return StoriesRegistry.empty()
        return StoriesRegistry.from_json(text)

    def _save_remote_registry(
        self, client: FtpClient, registry: StoriesRegistry
    ) -> None:
        client.upload_text(REGISTRY_RELATIVE, registry.to_json())

    def refresh_live(self) -> None:
        try:
            self.set_status("Downloading stories.json…")
            client = self._client()
            self._live = self._load_remote_registry(client)
            self._render_live_list()
            self.set_status(f"Loaded {len(self._live.stories)} live stor(ies).")
        except Exception as exc:
            messagebox.showerror("Refresh failed", str(exc))
            self.set_status(f"Refresh failed: {exc}")

    def _render_live_list(self) -> None:
        self.live_list.delete(0, tk.END)
        for index, story in enumerate(self._live.stories, start=1):
            self.live_list.insert(
                tk.END, f"{index}. {story.title}  [{story.slug}]  {story.date}"
            )

    def _selected_live_slug(self) -> str | None:
        selection = self.live_list.curselection()
        if not selection:
            return None
        return self._live.stories[selection[0]].slug

    def publish_selected(self) -> None:
        if self._parsed is None:
            selection = self.drafts_list.curselection()
            if not selection:
                messagebox.showinfo("Publish", "Select a draft Markdown file first.")
                return
            self.on_draft_select()
            if self._parsed is None:
                return

        story = self._parsed
        if not self.ftp_password.get():
            messagebox.showerror(
                "FTP password missing",
                "Set FTP_PASSWORD in the environment or enter the password above.",
            )
            return

        try:
            self.set_status(f"Publishing {story.slug}…")
            client = self._client()
            client.ensure_directory("stories/")
            html_rel = f"stories/{story.slug}.html"
            client.upload_text(html_rel, story.body_html)

            registry = self._load_remote_registry(client)
            registry.upsert(
                StoryEntry(
                    slug=story.slug,
                    title=story.title,
                    date=story.date,
                    excerpt=story.excerpt,
                    path=story_remote_path(story.slug),
                )
            )
            self._save_remote_registry(client, registry)
            self._live = registry
            self._render_live_list()
            self.set_status(f"Published “{story.title}” → {story_remote_path(story.slug)}")
            messagebox.showinfo(
                "Published",
                f"“{story.title}” is live.\n\n{story_remote_path(story.slug)}",
            )
        except Exception as exc:
            messagebox.showerror("Publish failed", str(exc))
            self.set_status(f"Publish failed: {exc}")

    def move_live(self, delta: int) -> None:
        slug = self._selected_live_slug()
        if slug is None:
            messagebox.showinfo("Reorder", "Select a live story first.")
            return
        if not self._live.move(slug, delta):
            return
        try:
            self.set_status("Updating story order…")
            client = self._client()
            self._save_remote_registry(client, self._live)
            # Keep selection on the moved item
            new_index = next(
                i for i, s in enumerate(self._live.stories) if s.slug == slug
            )
            self._render_live_list()
            self.live_list.selection_set(new_index)
            self.set_status("Story order updated on site.")
        except Exception as exc:
            messagebox.showerror("Reorder failed", str(exc))
            self.set_status(f"Reorder failed: {exc}")
            self.refresh_live()

    def remove_live(self) -> None:
        slug = self._selected_live_slug()
        if slug is None:
            messagebox.showinfo("Remove", "Select a live story first.")
            return
        entry = self._live.find(slug)
        if entry is None:
            return
        ok = messagebox.askyesno(
            "Remove story",
            f"Remove “{entry.title}” from the live site?\n\nThis deletes the HTML file and registry entry.",
        )
        if not ok:
            return
        try:
            self.set_status(f"Removing {slug}…")
            client = self._client()
            removed = self._live.remove(slug)
            if removed is None:
                return
            html_rel = removed.path.lstrip("/")
            client.delete_file(html_rel)
            self._save_remote_registry(client, self._live)
            self._render_live_list()
            self.set_status(f"Removed “{removed.title}”.")
        except Exception as exc:
            messagebox.showerror("Remove failed", str(exc))
            self.set_status(f"Remove failed: {exc}")
            self.refresh_live()


def main() -> None:
    root = tk.Tk()
    try:
        root.call("tk", "scaling", 1.25)
    except tk.TclError:
        pass
    StoryManagerApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
