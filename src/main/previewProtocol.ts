import { net, protocol, screen } from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { previewScheme as scheme } from "../shared/previewUrl.js";
import type { PreviewKind } from "../shared/previewUrl.js";
interface Thumbnail {
   data: Buffer;
   type: string;
}

protocol.registerSchemesAsPrivileged([{ scheme, privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

/**
 * The path rides in the URL; the revision only changes the URL when the file
 * does, so the renderer's image cache never serves stale pixels.
 */
export const createPreviewUrl = (filePath: string, kind: PreviewKind, revision: string): string =>
   `${scheme}://${kind}/${Buffer.from(path.normalize(filePath), "utf8").toString("base64url")}?v=${encodeURIComponent(revision)}`;

const thumbnailCache = new Map<string, Promise<Thumbnail>>();
const thumbnailCacheLimit = 256;

// Encodes wait here instead of going straight to sharp, whose thread pool
// drains strictly in request order. Holding an arrow key requests every set
// flown past; newest-first lets the set the user stopped on skip the stale
// backlog instead of waiting behind it.
const maxConcurrentEncodes = 4;
interface PendingEncode {
   filePath: string;
   resolve: (thumbnail: Thumbnail) => void;
   reject: (error: unknown) => void;
}
const pendingEncodes = new Map<string, PendingEncode>();
let activeEncodes = 0;

export const clearThumbnailCache = (): void => {
   for (const encode of pendingEncodes.values()) encode.reject(new Error("Preview cache was reset"));
   pendingEncodes.clear();
   thumbnailCache.clear();
};

/**
 * The largest a card can draw: a set always shows at least two cards side by
 * side, so half the widest display, in device pixels. Anything bigger costs
 * decode time and memory without adding a visible pixel.
 */
let thumbnailBox: { width: number; height: number } | null = null;
const getThumbnailBox = (): { width: number; height: number } => {
   if (thumbnailBox !== null) return thumbnailBox;
   const displays = screen.getAllDisplays();
   const width = Math.max(...displays.map((display) => display.size.width * display.scaleFactor));
   const height = Math.max(...displays.map((display) => display.size.height * display.scaleFactor));
   thumbnailBox = { width: Math.round(Math.min(1600, Math.max(640, width / 2))), height: Math.round(Math.min(1600, Math.max(480, height * 0.8))) };
   return thumbnailBox;
};

/**
 * JPEG encodes several times faster than WebP at the same visual quality.
 * Only images with transparency need WebP to keep their alpha channel.
 */
const encodeThumbnail = async (filePath: string): Promise<Thumbnail> => {
   const source = sharp(filePath, { animated: false, failOn: "none" });
   const { hasAlpha } = await source.metadata();
   const resized = source.rotate().resize({ ...getThumbnailBox(), fit: "inside", withoutEnlargement: true });
   return hasAlpha
      ? { data: await resized.webp({ quality: 82, effort: 2 }).toBuffer(), type: "image/webp" }
      : { data: await resized.jpeg({ quality: 85 }).toBuffer(), type: "image/jpeg" };
};

const startNextEncode = (): void => {
   while (activeEncodes < maxConcurrentEncodes) {
      const newest = [...pendingEncodes].at(-1);
      if (newest === undefined) return;
      const [newestKey, encode] = newest;
      pendingEncodes.delete(newestKey);
      activeEncodes += 1;
      encodeThumbnail(encode.filePath)
         .then(encode.resolve, encode.reject)
         .finally(() => {
            activeEncodes -= 1;
            startNextEncode();
         });
   }
};

const getThumbnail = (filePath: string, cacheKey: string): Promise<Thumbnail> => {
   const cached = thumbnailCache.get(cacheKey);
   if (cached !== undefined) {
      // Map iteration order is insertion order: re-insert to keep the entry young.
      thumbnailCache.delete(cacheKey);
      thumbnailCache.set(cacheKey, cached);
      return cached;
   }
   if (thumbnailCache.size >= thumbnailCacheLimit) {
      const oldestKey = thumbnailCache.keys().next().value;
      if (oldestKey !== undefined) thumbnailCache.delete(oldestKey);
   }
   const promise = new Promise<Thumbnail>((resolve, reject) => pendingEncodes.set(cacheKey, { filePath, resolve, reject }));
   thumbnailCache.set(cacheKey, promise);
   promise.catch(() => {
      if (thumbnailCache.get(cacheKey) === promise) thumbnailCache.delete(cacheKey);
   });
   startNextEncode();
   return promise;
};

/** Serves previews only for files the caller allows, which is the current scan root. */
export const registerPreviewProtocol = (isAllowed: (filePath: string) => boolean): void => {
   protocol.handle(scheme, async (request) => {
      try {
         const url = new URL(request.url);
         const filePath = Buffer.from(url.pathname.slice(1), "base64url").toString("utf8");
         if (!path.isAbsolute(filePath) || !isAllowed(filePath)) return new Response("Preview is not available", { status: 403 });
         const headers = new Headers({ "cache-control": "private, max-age=3600" });
         if (url.hostname === "full") {
            const file = await net.fetch(pathToFileURL(filePath).href);
            for (const [name, value] of file.headers) if (name !== "cache-control") headers.set(name, value);
            return new Response(file.body, { headers, status: file.status, statusText: file.statusText });
         }
         if (url.hostname !== "thumbnail") return new Response("Unknown preview kind", { status: 400 });
         const thumbnail = await getThumbnail(filePath, `${url.pathname}${url.search}`);
         headers.set("content-type", thumbnail.type);
         return new Response(new Uint8Array(thumbnail.data), { headers });
      } catch {
         return new Response("Preview is not available", { status: 400 });
      }
   });
};
