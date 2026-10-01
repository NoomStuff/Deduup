import { net, protocol } from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";

const previewProtocol = "image-deduplicator-preview";
type PreviewKind = "thumbnail" | "full";
interface PreviewAccess {
   filePath: string;
   kind: PreviewKind;
}

const allowedPreviews = new Map<string, PreviewAccess>();
const thumbnailCache = new Map<string, Promise<Buffer>>();
const thumbnailCacheLimit = 256;

protocol.registerSchemesAsPrivileged([{ scheme: previewProtocol, privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

export const createPreviewUrl = (filePath: string, kind: PreviewKind = "thumbnail", revision = ""): string => {
   const normalizedPath = path.normalize(filePath);
   const encodedPath = Buffer.from(normalizedPath, "utf8").toString("base64url");
   const accessKey = `${kind}/${encodedPath}/${revision}`;
   allowedPreviews.set(accessKey, { filePath: normalizedPath, kind });
   return `${previewProtocol}://file/${accessKey}`;
};

export const resetPreviewAccess = (): void => {
   allowedPreviews.clear();
   for (const encode of scheduledEncodes.values()) encode.cancel();
   scheduledEncodes.clear();
   thumbnailCache.clear();
};

// Encodes wait here instead of going straight to sharp, whose thread pool
// drains strictly in request order. Holding an arrow key requests every set
// flown past; newest-first lets the set the user stopped on skip the stale
// backlog instead of waiting behind it.
const maxConcurrentEncodes = 4;
interface PendingEncode {
   promise: Promise<Buffer>;
   run: () => void;
   cancel: () => void;
}
const scheduledEncodes = new Map<string, PendingEncode>();
let activeEncodes = 0;

const startNextEncode = (): void => {
   if (activeEncodes >= maxConcurrentEncodes) return;
   const newestKey = [...scheduledEncodes.keys()].at(-1);
   if (newestKey === undefined) return;
   const encode = scheduledEncodes.get(newestKey);
   scheduledEncodes.delete(newestKey);
   if (encode === undefined) return;
   activeEncodes += 1;
   encode.run();
};

const createThumbnail = (filePath: string, cacheKey: string): Promise<Buffer> => {
   const cached = thumbnailCache.get(cacheKey);
   if (cached !== undefined) {
      // Map iteration order is insertion order: re-insert to keep the entry young.
      thumbnailCache.delete(cacheKey);
      thumbnailCache.set(cacheKey, cached);
      return cached;
   }
   const scheduled = scheduledEncodes.get(cacheKey);
   if (scheduled !== undefined) return scheduled.promise;

   if (thumbnailCache.size >= thumbnailCacheLimit) {
      const oldestKey = thumbnailCache.keys().next().value;
      if (oldestKey !== undefined) thumbnailCache.delete(oldestKey);
   }

   let resolveEncode!: (thumbnail: Buffer) => void;
   let rejectEncode!: (error: unknown) => void;
   const promise = new Promise<Buffer>((resolve, reject) => {
      resolveEncode = resolve;
      rejectEncode = reject;
   });
   const encode: PendingEncode = {
      promise,
      run: () => {
         sharp(filePath, { animated: false, failOn: "none" })
            .rotate()
            .resize({ width: 1200, height: 900, fit: "inside", withoutEnlargement: true })
            .webp({ quality: 82 })
            .toBuffer()
            .then(resolveEncode, rejectEncode)
            .finally(() => {
               activeEncodes -= 1;
               startNextEncode();
            });
      },
      cancel: () => rejectEncode(new Error("Preview cache was reset")),
   };
   scheduledEncodes.set(cacheKey, encode);
   thumbnailCache.set(cacheKey, promise);
   void promise.catch(() => {
      if (thumbnailCache.get(cacheKey) === promise) thumbnailCache.delete(cacheKey);
   });
   startNextEncode();
   return promise;
};

export const registerPreviewProtocol = (): void => {
   protocol.handle(previewProtocol, async (request) => {
      try {
         const accessKey = new URL(request.url).pathname.slice(1);
         const access = allowedPreviews.get(accessKey);
         if (access === undefined || !path.isAbsolute(access.filePath)) {
            return new Response("Preview is not available", { status: 403 });
         }

         // Cacheable by URL: moves change the path, so a moved file is a new URL.
         const headers = new Headers({ "cache-control": "private, max-age=3600" });
         if (access.kind === "full") {
            const file = await net.fetch(pathToFileURL(access.filePath).href);
            for (const [name, value] of file.headers) headers.set(name, value);
            headers.set("cache-control", "private, max-age=3600");
            return new Response(file.body, { headers, status: file.status, statusText: file.statusText });
         }
         const thumbnail = await createThumbnail(access.filePath, accessKey);
         headers.set("content-type", "image/webp");
         return new Response(new Uint8Array(thumbnail), { headers });
      } catch {
         return new Response("Invalid preview URL", { status: 400 });
      }
   });
};
