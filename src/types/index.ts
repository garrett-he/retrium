export interface DosboxVersion {
    name: string;
    path: string;
}

export interface DosboxVersions {
    default: string;
    versions: DosboxVersion[];
}

export interface Cart {
    id: string;
    dir: string;
    info: CartInfo;
    cover?: string;
}

export interface CartInfo {
    name: string;
    language?: string;
    release?: number;
    category?: string;
    developer?: string;
    publisher?: string;
    series?: string;
    tags?: string[];
}

export interface CartProcess {
    pid: number;
    cart: Cart;
    dosboxVersion: string;
    startedAt: string;
}

export interface CartSummary {
    lastRun: string;
    runs: number;
    elapsed: number;
}

export interface CartRunOptions {
    cart: Cart;
    dosboxVersion: string;
}

export interface SetupState {
    configured: boolean;
    library: string;
    dosbox: string;
}
