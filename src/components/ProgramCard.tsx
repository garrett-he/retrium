import { Link } from "react-router-dom";
import { ProgramCover } from "@/components/ProgramCover";
import type { Program } from "@/types";

interface ProgramCardProps {
    program: Program;
}

export function ProgramCard({ program }: ProgramCardProps) {
    return (
        <Link
            to={`/programs/${program.id}`}
            className="group relative block h-[200px] w-[320px] overflow-hidden rounded-md bg-card shadow-md"
        >
            <ProgramCover
                program={program}
                className="h-[calc(100%+2.5rem)] w-full object-cover transition-transform duration-300 group-hover:-translate-y-10"
            />
            <div className="absolute inset-x-0 bottom-0 flex h-10 translate-y-full items-center bg-black/70 px-3 text-sm text-white transition-transform duration-300 group-hover:translate-y-0">
                {program.info.name}
            </div>
        </Link>
    );
}
