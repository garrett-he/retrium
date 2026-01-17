import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

interface PageHeaderProps {
    title: string;
    showBack?: boolean;
    children?: ReactNode;
}

export function PageHeader({ title, showBack = false, children }: PageHeaderProps) {
    const navigate = useNavigate();

    return (
        <header className="sticky top-0 z-10 flex h-12 items-center bg-background px-4 shadow">
            <div className="flex flex-1 items-center">
                {showBack && (
                    <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Back">
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                )}
            </div>
            <h1 className="flex-1 text-center text-lg font-semibold">{title}</h1>
            <div className="flex flex-1 items-center justify-end gap-2">{children}</div>
        </header>
    );
}
