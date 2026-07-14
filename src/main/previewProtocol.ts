import { net, protocol } from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";

const previewProtocol = "image-deduplicator-preview";
const allowedPreviewPaths = new Set<string>();

protocol.registerSchemesAsPrivileged([{ scheme: previewProtocol, privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

export const createPreviewUrl = (filePath: string): string => {
   const normalizedPath = path.normalize(filePath);
   allowedPreviewPaths.add(normalizedPath.toLowerCase());
   return `${previewProtocol}://file/${Buffer.from(normalizedPath, "utf8").toString("base64url")}`;
};

export const resetPreviewAccess = (): void => {
   allowedPreviewPaths.clear();
};

export const registerPreviewProtocol = (): void => {
   protocol.handle(previewProtocol, (request) => {
      try {
         const encodedPath = new URL(request.url).pathname.slice(1);
         const filePath = path.normalize(Buffer.from(encodedPath, "base64url").toString("utf8"));
         if (!path.isAbsolute(filePath) || !allowedPreviewPaths.has(filePath.toLowerCase())) {
            return new Response("Preview is not available", { status: 403 });
         }

         return net.fetch(pathToFileURL(filePath).href);
      } catch {
         return new Response("Invalid preview URL", { status: 400 });
      }
   });
};
