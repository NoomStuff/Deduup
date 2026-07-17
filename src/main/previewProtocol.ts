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
const thumbnailCacheLimit = 96;

protocol.registerSchemesAsPrivileged([{ scheme: previewProtocol, privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

export const createPreviewUrl = (filePath: string, kind: PreviewKind = "thumbnail"): string => {
   const normalizedPath = path.normalize(filePath);
   const encodedPath = Buffer.from(normalizedPath, "utf8").toString("base64url");
   const accessKey = `${kind}/${encodedPath}`;
   allowedPreviews.set(accessKey, { filePath: normalizedPath, kind });
   return `${previewProtocol}://file/${accessKey}`;
};

export const resetPreviewAccess = (): void => {
   allowedPreviews.clear();
   thumbnailCache.clear();
};

const createThumbnail = (filePath: string): Promise<Buffer> => {
   const cacheKey = filePath.toLowerCase();
   const cached = thumbnailCache.get(cacheKey);
   if (cached !== undefined) return cached;

   if (thumbnailCache.size >= thumbnailCacheLimit) {
      const oldestKey = thumbnailCache.keys().next().value;
      if (oldestKey !== undefined) thumbnailCache.delete(oldestKey);
   }
   const thumbnail = sharp(filePath, { animated: false, failOn: "none" })
      .rotate()
      .resize({ width: 1200, height: 900, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
   thumbnailCache.set(cacheKey, thumbnail);
   void thumbnail.catch(() => thumbnailCache.delete(cacheKey));
   return thumbnail;
};

export const registerPreviewProtocol = (): void => {
   protocol.handle(previewProtocol, async (request) => {
      try {
         const accessKey = new URL(request.url).pathname.slice(1);
         const access = allowedPreviews.get(accessKey);
         if (access === undefined || !path.isAbsolute(access.filePath)) {
            return new Response("Preview is not available", { status: 403 });
         }

         if (access.kind === "full") return await net.fetch(pathToFileURL(access.filePath).href);
         const thumbnail = await createThumbnail(access.filePath);
         return new Response(new Uint8Array(thumbnail), { headers: { "content-type": "image/webp", "cache-control": "private, max-age=3600" } });
      } catch {
         return new Response("Invalid preview URL", { status: 400 });
      }
   });
};
