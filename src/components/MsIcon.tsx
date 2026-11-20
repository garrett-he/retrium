import Icon, { type IconProps } from "@mui/material/Icon";
import type { SxProps, Theme } from "@mui/material/styles";

interface MsIconProps extends Omit<IconProps, "children" | "baseClassName" | "className"> {
    children: string;
    filled?: boolean;
}

/** Material Symbols icon rendered through the icon font. */
export function MsIcon({ children, filled = false, sx, ...rest }: MsIconProps) {
    const variation: SxProps<Theme> = filled ? { fontVariationSettings: "'FILL' 1, 'wght' 500, 'opsz' 24" } : {};
    const merged = [variation, sx].filter(Boolean) as SxProps<Theme>;
    return (
        <Icon
            {...rest}
            baseClassName="material-symbols-outlined"
            className={filled ? "fill-icon" : undefined}
            sx={merged}
        >
            {children}
        </Icon>
    );
}
