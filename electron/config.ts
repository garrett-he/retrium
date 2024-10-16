import path from "node:path";
import {app} from "electron";
import ElectronStore from "electron-store";

interface Config {
    library: string;
}

export default new ElectronStore<Config>({
    defaults: {
        library: path.resolve(app.getPath("documents"), "Dostron")
    }
});
