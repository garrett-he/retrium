import {ipcMain} from "electron";
import {Program} from "dostron/types";
import {discoverPrograms} from "./dostron";
import config from "./config";

ipcMain.handle("discoverPrograms", async (): Promise<Program[]> => discoverPrograms(config.get("library")));
