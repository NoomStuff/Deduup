import { app } from "electron";
import { spawn } from "node:child_process";

// Electron infers isPackaged from the executable name, so also check for the
// default-app loader that runs plain `electron .` from sources.
export const isPackagedApp = (): boolean => app.isPackaged && !process.defaultApp;

export const registerWindowsIdentity = (): void => {
   if (process.platform !== "win32") return;
   // Taskbar and notification surfaces resolve a raw app user model ID's label
   // from this registry key; without it they fall back to the executable
   // description, which reads "Electron" for dev runs and the portable build,
   // neither of which installs a Start Menu shortcut.
   const modelId = "dev.deduup.app";
   const reg = (keyPath: string, value: string, data: string): void => {
      void spawn("reg", ["add", keyPath, "/v", value, "/t", "REG_SZ", "/d", data, "/f"], { windowsHide: true, stdio: "ignore" }).on("error", () => undefined);
   };
   reg(`HKCU\\Software\\Classes\\AppUserModelId\\${modelId}`, "DisplayName", "Deduup");
   // A window with no shortcut carrying its AUMID is named after the
   // executable's cached friendly name, which stays "Electron" until relabeled.
   reg("HKCU\\Software\\Classes\\Local Settings\\Software\\Microsoft\\Windows\\Shell\\MuiCache", `${process.execPath}.FriendlyAppName`, "Deduup");
};
