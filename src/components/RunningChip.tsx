import Chip from "@mui/material/Chip";
import type { SxProps, Theme } from "@mui/material/styles";
import { useT } from "@/i18n";

interface RunningChipProps {
    small?: boolean;
    sx?: SxProps<Theme>;
}

/** Pulsing badge indicating a cart is currently emulated. */
export function RunningChip({ small = false, sx }: RunningChipProps) {
    const t = useT();
    return (
        <Chip
            size="small"
            icon={<span className="pulse-dot" />}
            label={t("running.chip")}
            sx={{
                bgcolor: "rgba(23,20,18,0.85)",
                color: "#8FE093",
                "& .MuiChip-icon": { width: 16, height: 16 },
                fontFamily: '"IBM Plex Mono", monospace',
                fontSize: 11,
                height: small ? 20 : undefined,
                ...sx,
            }}
        />
    );
}
