import Button from "@mui/material/Button";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useState } from "react";
import { MsIcon } from "@/components/MsIcon";
import type { DosboxVersions } from "@/types";

interface RunSplitButtonProps {
    dosboxVersions: DosboxVersions;
    onRun: (version: string) => void;
}

/** Run button with a dropdown to pick a specific DOSBox version. */
export function RunSplitButton({ dosboxVersions, onRun }: RunSplitButtonProps) {
    const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

    const defaultVersion =
        dosboxVersions.versions.find((v) => v.name === dosboxVersions.default) ?? dosboxVersions.versions[0];
    const disabled = dosboxVersions.versions.length === 0;

    return (
        <Stack direction="row">
            <Button
                data-testid="run-default"
                variant="contained"
                startIcon={<MsIcon>play_arrow</MsIcon>}
                disabled={disabled}
                onClick={() => defaultVersion && onRun(defaultVersion.name)}
                sx={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
            >
                Run {defaultVersion ? `· ${defaultVersion.name.split(" ")[0]}` : ""}
            </Button>
            <Button
                aria-label="Choose DOSBox version"
                variant="contained"
                disabled={disabled}
                onClick={(event) => setAnchorEl(event.currentTarget)}
                sx={{
                    borderTopLeftRadius: 0,
                    borderBottomLeftRadius: 0,
                    minWidth: 0,
                    px: 1,
                    borderLeft: "1px solid rgba(0,0,0,0.25)",
                }}
            >
                <MsIcon>expand_more</MsIcon>
            </Button>
            <Menu anchorEl={anchorEl} open={anchorEl !== null} onClose={() => setAnchorEl(null)}>
                <Typography variant="caption" color="text.secondary" sx={{ pl: 2, display: "block", pt: 0.5 }}>
                    DOSBox version
                </Typography>
                {dosboxVersions.versions.map((version) => (
                    <MenuItem
                        key={version.name}
                        onClick={() => {
                            setAnchorEl(null);
                            onRun(version.name);
                        }}
                        sx={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 13.5 }}
                    >
                        {version.name}
                        {version.name === dosboxVersions.default ? " · default" : ""}
                    </MenuItem>
                ))}
            </Menu>
        </Stack>
    );
}
