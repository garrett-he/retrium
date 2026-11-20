import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import type { SxProps, Theme } from "@mui/material/styles";
import { type MouseEvent, useState } from "react";
import { MsIcon } from "@/components/MsIcon";
import type { Cart } from "@/types";

export interface CartMenuActions {
    run?: (cart: Cart) => void;
    stop?: (cart: Cart) => void;
    browse?: (cart: Cart) => void;
    exportArchive?: (cart: Cart) => void;
    edit?: (cart: Cart) => void;
    delete?: (cart: Cart) => void;
}

interface CartMenuButtonProps {
    cart: Cart;
    running: boolean;
    actions: CartMenuActions;
    iconSize?: number;
    sx?: SxProps<Theme>;
}

/** Kebab menu with quick actions for a cart. */
export function CartMenuButton({ cart, running, actions, iconSize = 18, sx }: CartMenuButtonProps) {
    const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

    const open = (event: MouseEvent<HTMLElement>) => {
        event.stopPropagation();
        setAnchorEl(event.currentTarget);
    };
    const close = () => setAnchorEl(null);

    return (
        <>
            <IconButton size="small" aria-label="Cart menu" onClick={open} sx={{ color: "text.primary", ...sx }}>
                <MsIcon sx={{ fontSize: iconSize }}>more_vert</MsIcon>
            </IconButton>
            <Menu anchorEl={anchorEl} open={anchorEl !== null} onClose={close}>
                {running && actions.stop ? (
                    <MenuItem
                        onClick={() => {
                            close();
                            actions.stop?.(cart);
                        }}
                    >
                        <MsIcon sx={{ fontSize: 18, mr: 1.5, color: "error.main" }}>stop</MsIcon> Stop
                    </MenuItem>
                ) : (
                    actions.run && (
                        <MenuItem
                            onClick={() => {
                                close();
                                actions.run?.(cart);
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
                            actions.browse?.(cart);
                        }}
                    >
                        <MsIcon sx={{ fontSize: 18, mr: 1.5 }}>folder_open</MsIcon> Open folder
                    </MenuItem>
                )}
                {actions.exportArchive && (
                    <MenuItem
                        onClick={() => {
                            close();
                            actions.exportArchive?.(cart);
                        }}
                    >
                        <MsIcon sx={{ fontSize: 18, mr: 1.5 }}>archive</MsIcon> Export cart
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
