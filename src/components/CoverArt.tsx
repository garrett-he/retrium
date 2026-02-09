import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { convertFileSrc } from "@tauri-apps/api/core";
import { MsIcon } from "@/components/MsIcon";
import type { Program } from "@/types";

interface CoverArtProps {
    program: Program;
    height: number | Record<string, number>;
    glyphSize?: number;
    radius?: string;
    thumbnail?: boolean;
    className?: string;
}

/** Gradient placeholder or cover image for a program. */
export function CoverArt({
    program,
    height,
    glyphSize = 64,
    radius = "0px",
    thumbnail = false,
    className,
}: CoverArtProps) {
    const src = program.cover ? convertFileSrc(program.cover) : null;

    return (
        <Box
            className={`scanlines${className ? ` ${className}` : ""}`}
            data-testid={`cover-${program.id}`}
            sx={{
                position: "relative",
                height,
                borderRadius: radius,
                overflow: "hidden",
                flexShrink: 0,
                backgroundImage: `linear-gradient(155deg, #3B2411 0%, #7A4A12 100%)`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
            }}
        >
            {src ? (
                <img src={src} alt={program.info.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
                <MsIcon filled sx={{ fontSize: glyphSize, color: "rgba(255,242,214,0.42)" }}>
                    {thumbnail ? "sports_esports" : "videogame_asset"}
                </MsIcon>
            )}
            {thumbnail && (
                <Typography
                    variant="caption"
                    sx={{
                        position: "absolute",
                        left: 6,
                        bottom: 4,
                        right: 6,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        fontFamily: '"IBM Plex Mono", monospace',
                        fontSize: 9,
                        color: "rgba(255,242,214,0.75)",
                    }}
                >
                    {program.info.name}
                </Typography>
            )}
        </Box>
    );
}
