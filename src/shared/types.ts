export interface ImageItem {
   file: string;
   originalPath: string;
   currentPath: string;
   folderPath: string;
   /** A short digest of the scan's visual hash: equal only when the scan evidence is equal. */
   evidence: string;
   width: number;
   height: number;
   size: number;
   modifiedAt: number;
   /** Thumbnail URL; toFullPreviewUrl gives the original-resolution one. */
   previewUrl: string;
   sourceStatus: "available" | "movedByApp" | "recycledByApp" | "missing";
}

export type FileActionStatus = "idle" | "moved" | "restored" | "recycled";

export interface ImageSet {
   id: string;
   similarity: number;
   folderPath: string;
   images: ImageItem[];
}

export interface ImageSetDecision {
   deletedImages: string[];
}

export type Decisions = Record<string, ImageSetDecision>;

export interface PlannedMove {
   setId: string;
   file: string;
   from: string;
   to: string;
   expectedSource?: { size: number; modifiedAt: number };
}

export interface MoveResult {
   moved: PlannedMove[];
   skipped: PlannedMove[];
   errors: (PlannedMove & { message: string })[];
}

export interface LoadDataResult {
   scanId: string;
   groups: ImageSet[];
   decisions: Decisions;
   scanRoot: string | null;
   duplicateFolderPath: string | null;
   currentSetId: string | null;
   duplicateFolderHasContent: boolean;
   lastFileAction: FileActionStatus;
   scanWarningCount: number;
}

export interface ScanRequest {
   rootPath: string;
}

export interface ScanProgress {
   phase: "discovering" | "hashing" | "grouping" | "saving";
   completed: number;
   total: number;
   currentFile?: string;
}

export type WindowAction = "minimize" | "maximize" | "close";

export interface AppInfo {
   name: string;
   version: string;
}

/** A newer release on GitHub. mode decides how the update reaches the user. */
export interface AvailableUpdate {
   version: string;
   name: string;
   url: string;
   /** automatic: electron-updater downloads and installs. download: the portable exe is verified into Downloads. releases: open the release page. */
   mode: "automatic" | "download" | "releases";
}

export interface UpdateStatus {
   phase: "downloading" | "ready" | "downloaded" | "error";
   version: string;
   percent: number | null;
   message?: string;
   path?: string;
}

export interface UpdateState {
   checkError: string | null;
   update: AvailableUpdate | null;
   status: UpdateStatus | null;
   checking: boolean;
   lastChecked: number | null;
   message: string;
}

export interface AppApi {
   windowAction: (action: WindowAction) => Promise<void>;
   getAppInfo: () => Promise<AppInfo>;
   checkForUpdate: (manual?: boolean) => Promise<AvailableUpdate | null>;
   downloadUpdate: (version: string) => Promise<void>;
   restartToUpdate: () => Promise<void>;
   revealUpdateDownload: () => Promise<void>;
   getUpdateState: () => Promise<UpdateState>;
   onUpdateState: (listener: (state: UpdateState) => void) => () => void;
   openExternal: (url: string) => Promise<void>;
   loadData: () => Promise<LoadDataResult>;
   chooseFolder: () => Promise<string | null>;
   scanFolder: (request: ScanRequest) => Promise<LoadDataResult>;
   cancelScan: () => Promise<void>;
   onScanProgress: (listener: (progress: ScanProgress) => void) => () => void;
   onScanComplete: (listener: (result: LoadDataResult) => void) => () => void;
   onAppError: (listener: (message: string) => void) => () => void;
   onLibraryUpdate: (listener: (result: LoadDataResult) => void) => () => void;
   onLibraryError: (listener: (message: string) => void) => () => void;
   setReviewBusy: (busy: boolean) => Promise<void>;
   onLibraryRefreshing: (listener: (refreshing: boolean) => void) => () => void;
   saveDecisions: (decisions: Decisions, scanId: string) => Promise<void>;
   saveCurrentSet: (setId: string, scanId: string) => Promise<void>;
   applyMoves: (decisions: Decisions, scanId: string) => Promise<MoveResult>;
   getDuplicateFolderStatus: () => Promise<boolean>;
   restoreDuplicateFolder: () => Promise<MoveResult>;
   trashDuplicateFolder: () => Promise<void>;
   openSetFolder: (folderPath: string) => Promise<void>;
   showImage: (imagePath: string) => Promise<void>;
   openImage: (imagePath: string) => Promise<void>;
   getPathForFile: (file: File) => string;
}
