import {contextBridge} from "electron";

contextBridge.exposeInMainWorld("$api", {
    hello: (): string => {
        return "Hello, world!";
    }
});
