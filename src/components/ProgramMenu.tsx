import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import type { SxProps, Theme } from "@mui/material/styles";
import { type MouseEvent, useState } from "react";
import { MsIcon } from "@/components/MsIcon";
import type { Program } from "@/types";

export interface ProgramMenuActions {
    run?: (program: Program) => void;
    stop?: (program: Program) => void;
    browse?: (program: Program) => void;
    exportArchive?: (program: Program) => void;
    edit?: (program: Program) => void;
    delete?: (program: Program) => void;
}

interface ProgramMenuButtonProps {
    program: Program;
    running: boolean;
    actions: ProgramMenuActions;
    iconSize?: number;
    sx?: SxProps<Theme>;
}

/** Kebab menu with quick actions for a program. */
export function ProgramMenuButton({ program, running, actions, iconSize = 18, sx }: ProgramMenuButtonProps) {
    const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

    const open = (event: MouseEvent<HTMLElement>) => {
        event.stopPropagation();
        setAnchorEl(event.currentTarget);
    };
    const close = () => setAnchorEl(null);

    return (
        <>
            <IconButton size="small" aria-label="Program menu" onClick={open} sx={{ color: "text.primary", ...sx }}>
                <MsIcon sx={{ fontSize: iconSize }}>more_vert</MsIcon>
            </IconButton>
            <Menu anchorEl={anchorEl} open={anchorEl !== null} onClose={close}>
                {running && actions.stop ? (
                    <MenuItem
                        onClick={() => {
                            close();
                            actions.stop?.(program);
                        }}
                    >
                        <MsIcon sx={{ fontSize: 18, mr: 1.5, color: "error.main" }}>stop</MsIcon> Stop
                    </MenuItem>
                ) : (
                    actions.run && (
                        <MenuItem
                            onClick={() => {
                                close();
                                actions.run?.(program);
                            }}
                        >
                            <MsIcon sx={{ fontSize: 18, mr: 1.5, color: "success.main" }}>play_arrow</MsIcon> Run with
                            default DOSBox
                        </MenuItem>
                    )
                )}
                {actions.browse && (
                    <MenuItem
                        onClick={() => {
                            close();
                            actions.browse?.(program);
                        }}
                    >
                        <MsIcon sx={{ fontSize: 18, mr: 1.5 }}>folder_open</MsIcon> Open folder
                    </MenuItem>
                )}
                {actions.exportArchive && (
                    <MenuItem
                        onClick={() => {
                            close();
                            actions.exportArchive?.(program);
                        }}
                    >
                        <MsIcon sx={{ fontSize: 18, mr: 1.5 }}>archive</MsIcon> Export archive
                    </MenuItem>
                )}
                <Divider />
                {actions.edit && (
                    <MenuItem
                        onClick={() => {
                            close();
                            actions.edit?.(program);
                        }}
                    >
                        <MsIcon sx={{ fontSize: 18, mr: 1.5 }}>edit</MsIcon> Edit details
                    </MenuItem>
                )}
                {actions.delete && (
                    <MenuItem
                        onClick={() => {
                            close();
                            actions.delete?.(program);
                        }}
                        sx={{ color: "error.main" }}
                    >
                        <MsIcon sx={{ fontSize: 18, mr: 1.5 }}>delete</MsIcon> Delete
                    </MenuItem>
                )}
            </Menu>
        </>
    );
}
