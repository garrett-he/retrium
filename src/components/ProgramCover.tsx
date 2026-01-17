import { convertFileSrc } from "@tauri-apps/api/core";
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Program } from "@/types";

interface ProgramCoverProps {
    program: Program;
    className?: string;
}

export function ProgramCover({ program, className }: ProgramCoverProps) {
    const src = program.cover ? convertFileSrc(program.cover) : null;

    if (src) {
        return <img src={src} alt={program.info.name} className={className} />;
    }

    return (
        <div className={cn("flex items-center justify-center bg-muted text-muted-foreground", className)}>
            <ImageOff className="h-10 w-10" />
        </div>
    );
}
