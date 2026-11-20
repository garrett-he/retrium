import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import ListSubheader from "@mui/material/ListSubheader";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import type { SxProps, Theme } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import { type MouseEvent, useState } from "react";
import { MsIcon } from "@/components/MsIcon";
import type { Cart, TargetInfo } from "@/types";

export interface CartMenuActions {
    /** `targetId` omitted means "whatever `default` points at". */
    run?: (cart: Cart, targetId?: string) => void;
    stop?: (cart: Cart) => void;
    browse?: (cart: Cart) => void;
    exportCart?: (cart: Cart) => void;
    edit?: (cart: Cart) => void;
    delete?: (cart: Cart) => void;
    /** Called when the menu opens, so the caller can load this cart's targets. */
    loadTargets?: (cart: Cart) => void;
}

interface CartMenuButtonProps {
    cart: Cart;
    running: boolean;
    actions: CartMenuActions;
    targets?: TargetInfo[];
    iconSize?: number;
    sx?: SxProps<Theme>;
}

/** Kebab menu with quick actions for a cart. */
export function CartMenuButton({ cart, running, actions, targets = [], iconSize = 18, sx }: CartMenuButtonProps) {
    const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

    const open = (event: MouseEvent<HTMLElement>) => {
        event.stopPropagation();
        setAnchorEl(event.currentTarget);
        actions.loadTargets?.(cart);
    };
    const close = () => setAnchorEl(null);

    return (
        <>
            <IconButton size="small" aria-label="Cart menu" onClick={open} sx={{ color: "text.primary", ...sx }}>
                <MsIcon sx={{ fontSize: iconSize }}>more_vert</MsIcon>
            </IconButton>
            <Menu anchorEl={anchorEl} open={anchorEl !== null} onClose={close}>
                {running
                    ? actions.stop && (
                          <MenuItem
                              onClick={() => {
                                  close();
                                  actions.stop?.(cart);
                              }}
                          >
                              <MsIcon sx={{ fontSize: 18, mr: 1.5, color: "error.main" }}>stop</MsIcon> Stop
                          </MenuItem>
                      )
                    : actions.run && (
                          <MenuItem
                              onClick={() => {
                                  close();
                                  actions.run?.(cart);
                              }}
                          >
                              <MsIcon sx={{ fontSize: 18, mr: 1.5, color: "success.main" }}>play_arrow</MsIcon> Run
                          </MenuItem>
                      )}
                {!running && actions.run && targets.length > 1 && (
                    <ListSubheader sx={{ lineHeight: 2, bgcolor: "transparent" }}>Run with…</ListSubheader>
                )}
                {!running &&
                    actions.run &&
                    targets.length > 1 &&
                    targets.map((target) => (
                        <MenuItem
                            key={target.id}
                            sx={{ pl: 4, display: "block" }}
                            onClick={() => {
                                close();
                                actions.run?.(cart, target.id);
                            }}
                        >
                            <Typography variant="body2">{target.label}</Typography>
                            <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{ fontFamily: '"IBM Plex Mono", monospace', display: "block" }}
                            >
                                {target.executable}
                            </Typography>
                        </MenuItem>
                    ))}
                {actions.browse && (
                    <MenuItem
                        onClick={() => {
                            close();
                            actions.browse?.(cart);
                        }}
                    >
                        <MsIcon sx={{ fontSize: 18, mr: 1.5 }}>folder_open</MsIcon> Open folder
                    </MenuItem>
                )}
                {actions.exportCart && (
                    <MenuItem
                        onClick={() => {
                            close();
                            actions.exportCart?.(cart);
                        }}
                    >
                        <MsIcon sx={{ fontSize: 18, mr: 1.5 }}>io</MsIcon> Export cart…
                    </MenuItem>
                )}
                <Divider />
                {actions.edit && (
                    <MenuItem
                        onClick={() => {
                            close();
                            actions.edit?.(cart);
                        }}
                    >
                        <MsIcon sx={{ fontSize: 18, mr: 1.5 }}>edit</MsIcon> Edit details
                    </MenuItem>
                )}
                {actions.delete && (
                    <MenuItem
                        onClick={() => {
                            close();
                            actions.delete?.(cart);
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
