/** A cart's signature. Optional as a whole: most personal carts have none. */
export interface Author {
    name: string;
    email?: string;
}

export interface Dos {
    version?: string;
    input?: string[];
}

/** Metadata of the packaged program. Describes the program, not the cart. */
export interface CartInfo {
    name: string;
    language?: string;
    release?: number;
    category?: string;
    developer?: string;
    publisher?: string;
    series?: string;
    tags?: string[];
    players?: number;
    platform?: string;
    dos?: Dos;
    externalIds?: Record<string, string>;
}

export interface CartSummary {
    lastRun: string;
    runs: number;
    elapsed: number;
}

export interface Cart {
    id: string;
    revision: number;
    info: CartInfo;
    author?: Author;
    createdAt: string;
    cover?: string;
    /** `undefined` when unknown, e.g. the commit cache is missing. */
    dirty?: boolean;
    summary?: CartSummary;
}

export interface CartProcess {
    pid: number;
    cartId: string;
    targetId: string;
    targetLabel: string;
    startedAt: string;
}

/** One entry of `Config/launch.json`, as shown in the Run dropdown. */
export interface TargetInfo {
    id: string;
    label: string;
    executable: string;
}

export interface LaunchInfo {
    targets: TargetInfo[];
    defaultTarget?: string;
    /** Set when `launch.json` is invalid; the Run button is disabled. */
    error?: string;
}

export type ImportDecision = "upgrade" | "conflict" | "downgrade" | "duplicate";

export interface ImportNote {
    archive: string;
    id: string;
    reason: string;
}

export interface PendingImport {
    archive: string;
    id: string;
    name: string;
    decision: ImportDecision;
    message: string;
    existingRevision?: number;
    incomingRevision: number;
}

export interface ImportReport {
    imported: Cart[];
    skipped: ImportNote[];
    pending: PendingImport[];
}

/** `keep` imports a cart that is not in the library yet. */
export type ImportAction = "keep" | "replace" | "skip";

export interface ExportPreview {
    dirty: boolean;
    revision: number;
    nextRevision: number;
    /** Hash of the archive currently on disk. */
    packageHash: string;
    /** Hash the installed copy would produce right now. */
    currentHash: string;
}

export interface DosboxProbe {
    path: string;
    version?: string;
    exists: boolean;
}

export interface SetupState {
    configured: boolean;
    library: string;
    dosbox: string;
}
