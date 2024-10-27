import path from "node:path";
import {app} from "electron";
import ElectronStore from "electron-store";
import {DosboxVersionConfig} from "dostron/types";

interface Config {
    library: string;
    dosbox?: {
        default: string;
        versions: DosboxVersionConfig;
    };
}

export default new ElectronStore<Config>({
    defaults: {
        library: path.resolve(app.getPath("documents"), "Dostron")
    }
});
