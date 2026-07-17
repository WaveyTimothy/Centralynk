import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Plus } from "lucide-react";
import { blogStore, type BlogType } from "@/lib/blog-store";

const CATEGORIES = ["Product", "Opinion", "Press", "Blogpost"];

const TYPES: { value: BlogType; label: string; helper: string }[] = [
  { value: "post", label: "Blog post", helper: "Long-form written article" },
  { value: "youtube", label: "YouTube video", helper: "Paste a YouTube URL to embed" },
  { value: "podcast", label: "Podcast", helper: "Spotify, Apple Podcasts, or any embed URL" },
  { value: "link", label: "External link", helper: "Card linking out to an article elsewhere" },
];

export function AddBlogModal({ onAdded }: { onAdded?: () => void }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<BlogType>("post");
  const [title, setTitle] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [content, setContent] = useState("");
  const [author, setAuthor] = useState("");
  const [category, setCategory] = useState("Blogpost");
  const [mediaUrl, setMediaUrl] = useState("");

  const needsUrl = type !== "post";

  const reset = () => {
    setType("post"); setTitle(""); setExcerpt(""); setContent("");
    setAuthor(""); setCategory("Blogpost"); setMediaUrl("");
  };

  const submit = () => {
    if (!title.trim()) return;
    if (needsUrl && !mediaUrl.trim()) return;
    blogStore.add({
      type,
      title: title.trim(),
      excerpt: excerpt.trim(),
      content: content.trim(),
      author: author.trim() || "Anonymous",
      category,
      mediaUrl: mediaUrl.trim() || undefined,
    });
    reset();
    setOpen(false);
    onAdded?.();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted transition">
          <Plus className="size-4" /> Add Blog Post
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add content</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <Field label="Type">
            <div className="grid grid-cols-2 gap-2">
              {TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setType(t.value)}
                  className={
                    "text-left rounded-md border px-3 py-2 transition " +
                    (type === t.value
                      ? "border-foreground bg-foreground/5"
                      : "border-border hover:bg-muted")
                  }
                >
                  <div className="text-sm font-semibold text-foreground">{t.label}</div>
                  <div className="text-[11px] text-muted-foreground">{t.helper}</div>
                </button>
              ))}
            </div>
          </Field>

          <Field label="Title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="A great title" />
          </Field>

          {needsUrl && (
            <Field label={type === "youtube" ? "YouTube URL" : type === "podcast" ? "Podcast URL" : "Link URL"}>
              <Input
                value={mediaUrl}
                onChange={(e) => setMediaUrl(e.target.value)}
                placeholder={
                  type === "youtube"
                    ? "https://www.youtube.com/watch?v=..."
                    : type === "podcast"
                      ? "https://open.spotify.com/episode/..."
                      : "https://example.com/article"
                }
              />
            </Field>
          )}

          <Field label="Author">
            <Input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Your name" />
          </Field>
          <Field label="Category">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Excerpt">
            <Input value={excerpt} onChange={(e) => setExcerpt(e.target.value)} placeholder="Short summary" />
          </Field>
          {type === "post" && (
            <Field label="Content">
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Write your post..."
                className="min-h-[140px]"
              />
            </Field>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => setOpen(false)}
              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={!title.trim() || (needsUrl && !mediaUrl.trim())}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              Publish
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
