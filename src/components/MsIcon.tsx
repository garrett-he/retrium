import Icon from "@mui/material/Icon";
import type { SxProps, Theme } from "@mui/material/styles";

interface MsIconProps {
    children: string;
    filled?: boolean;
    sx?: SxProps<Theme>;
}

/** Material Symbols icon rendered through the icon font. */
export function MsIcon({ children, filled = false, sx }: MsIconProps) {
    const variation: SxProps<Theme> = filled ? { fontVariationSettings: "'FILL' 1, 'wght' 500, 'opsz' 24" } : {};
    const merged = [variation, sx].filter(Boolean) as SxProps<Theme>;
    return (
        <Icon baseClassName="material-symbols-outlined" className={filled ? "fill-icon" : undefined} sx={merged}>
            {children}
        </Icon>
    );
}
