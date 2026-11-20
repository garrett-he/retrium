import Button from "@mui/material/Button";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useEffect, useState } from "react";
import { MsIcon } from "@/components/MsIcon";
import { useT } from "@/i18n";
import { api } from "@/lib/api";
import type { LaunchInfo } from "@/types";

interface RunSplitButtonProps {
    cartId: string;
    running: boolean;
    onRun: (targetId: string) => void;
}

/**
 * Run button driven by `Config/launch.json`.
 *
 * The main button is the `default` target and says so in the author's own words.
 * The dropdown lists every target so a setup program can be reached without
 * editing the file; picking one does not change `default` — that is an edit, not
 * a run. With a single target the button collapses into a plain button, and a
 * broken `launch.json` disables it with the reason shown rather than guessing an
 * executable.
 */
export function RunSplitButton({ cartId, running, onRun }: RunSplitButtonProps) {
    const t = useT();
    const [launch, setLaunch] = useState<LaunchInfo | null>(null);
    const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

    useEffect(() => {
        let active = true;
        api.getCartLaunch(cartId)
            .then((info) => {
                if (active) {
                    setLaunch(info);
                }
            })
            .catch((error: unknown) => {
                if (active) {
                    setLaunch({ targets: [], error: String(error) });
                }
            });
        return () => {
            active = false;
        };
    }, [cartId]);

    const targets = launch?.targets ?? [];
    const error = launch?.error;
    const defaultTarget = targets.find((target) => target.id === launch?.defaultTarget) ?? targets[0];
    const disabled = running || error !== undefined || defaultTarget === undefined;
    const multi = targets.length > 1;

    return (
        <Stack spacing={0.5}>
            <Stack direction="row">
                <Button
                    data-testid="run-default"
                    variant="contained"
                    startIcon={<MsIcon>play_arrow</MsIcon>}
                    disabled={disabled}
                    onClick={() => defaultTarget && onRun(defaultTarget.id)}
                    sx={multi ? { borderTopRightRadius: 0, borderBottomRightRadius: 0 } : undefined}
                >
                    {defaultTarget ? t("run.withTarget", { target: defaultTarget.label }) : t("run.plain")}
                </Button>
                {multi && (
                    <Button
                        aria-label={t("run.chooseTarget")}
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
                )}
                <Menu anchorEl={anchorEl} open={anchorEl !== null} onClose={() => setAnchorEl(null)}>
                    {targets.map((target) => (
                        <MenuItem
                            key={target.id}
                            data-testid={`run-target-${target.id}`}
                            onClick={() => {
                                setAnchorEl(null);
                                onRun(target.id);
                            }}
                            sx={{ display: "block" }}
                        >
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                {target.label}
                            </Typography>
                            <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{ fontFamily: '"IBM Plex Mono", monospace', display: "block" }}
                            >
                                {target.executable}
                            </Typography>
                        </MenuItem>
                    ))}
                </Menu>
            </Stack>
            {error !== undefined && (
                <Typography
                    data-testid="launch-error"
                    variant="caption"
                    color="error"
                    sx={{ maxWidth: 320, wordBreak: "break-word" }}
                >
                    {t("run.invalid", { error })}
                </Typography>
            )}
        </Stack>
    );
}
