export type BlogType = "post" | "youtube" | "podcast" | "link";

export type BlogPost = {
  id: string;
  type: BlogType;
  title: string;
  excerpt: string;
  content: string;
  author: string;
  category: string;
  mediaUrl?: string; // YouTube URL, podcast embed URL, or external link
  createdAt: number;
};

const KEY = "centralynk.blog.posts";
const ADMIN_KEY = "centralynk.blog.admin";

function read(): BlogPost[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]") as BlogPost[];
    // back-compat: posts created before `type` existed
    return raw.map((p) => ({ ...p, type: p.type ?? "post" }));
  } catch {
    return [];
  }
}

function write(posts: BlogPost[]) {
  localStorage.setItem(KEY, JSON.stringify(posts));
}

export const blogStore = {
  list(): BlogPost[] {
    return read().sort((a, b) => b.createdAt - a.createdAt);
  },
  add(input: Omit<BlogPost, "id" | "createdAt">): BlogPost {
    const post: BlogPost = {
      ...input,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
    };
    write([post, ...read()]);
    return post;
  },
  remove(id: string) {
    write(read().filter((p) => p.id !== id));
  },
};

// --- Admin gate (local-only, browser-scoped) ---
// Enable by visiting /blog?admin=1, disable with /blog?admin=0
export const adminGate = {
  isAdmin(): boolean {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(ADMIN_KEY) === "1";
  },
  set(on: boolean) {
    if (on) localStorage.setItem(ADMIN_KEY, "1");
    else localStorage.removeItem(ADMIN_KEY);
  },
};

// --- Embed helpers ---
export function youtubeEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) {
      return `https://www.youtube.com/embed/${u.pathname.slice(1)}`;
    }
    if (u.hostname.includes("youtube.com")) {
      const id = u.searchParams.get("v");
      if (id) return `https://www.youtube.com/embed/${id}`;
      if (u.pathname.startsWith("/embed/")) return url;
      if (u.pathname.startsWith("/shorts/")) {
        return `https://www.youtube.com/embed/${u.pathname.split("/")[2]}`;
      }
    }
  } catch {
    /* noop */
  }
  return null;
}

export function podcastEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    // Spotify: open.spotify.com/episode/XYZ → embed
    if (u.hostname.includes("open.spotify.com")) {
      return `https://open.spotify.com/embed${u.pathname}`;
    }
    // Apple podcasts: podcasts.apple.com → embed.podcasts.apple.com
    if (u.hostname.includes("podcasts.apple.com")) {
      return url.replace("podcasts.apple.com", "embed.podcasts.apple.com");
    }
    // Already an embed URL or generic iframe-able URL
    return url;
  } catch {
    return null;
  }
}
