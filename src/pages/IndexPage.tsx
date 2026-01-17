import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { ProgramCard } from "@/components/ProgramCard";
import { Button } from "@/components/ui/button";
import { useProgramsContext } from "@/hooks/usePrograms";
import { api } from "@/lib/api";

export function IndexPage() {
    const { programs, refresh } = useProgramsContext();
    const [selectedCategory, setSelectedCategory] = useState("All");
    const [adding, setAdding] = useState(false);

    const categories = useMemo(() => {
        const counts = new Map<string, number>();
        for (const program of programs) {
            const category = program.info.category ?? "Uncategorized";
            counts.set(category, (counts.get(category) ?? 0) + 1);
        }
        return counts;
    }, [programs]);

    const filteredPrograms = useMemo(() => {
        if (selectedCategory === "All") {
            return programs;
        }
        return programs.filter((program) => (program.info.category ?? "Uncategorized") === selectedCategory);
    }, [programs, selectedCategory]);

    const handleAdd = async () => {
        setAdding(true);
        try {
            await api.addPrograms();
            await refresh();
        } finally {
            setAdding(false);
        }
    };

    return (
        <>
            <PageHeader title="Programs">
                <Button size="icon" onClick={handleAdd} disabled={adding} aria-label="Add programs">
                    <Plus className="h-5 w-5" />
                </Button>
            </PageHeader>
            <main className="container mx-auto p-4">
                <fieldset className="mb-4 flex flex-wrap gap-4">
                    <label className="flex items-center gap-2">
                        <input
                            type="radio"
                            name="category"
                            checked={selectedCategory === "All"}
                            onChange={() => setSelectedCategory("All")}
                        />
                        <span>All ({programs.length})</span>
                    </label>
                    {[...categories.entries()].map(([category, count]) => (
                        <label key={category} className="flex items-center gap-2">
                            <input
                                type="radio"
                                name="category"
                                checked={selectedCategory === category}
                                onChange={() => setSelectedCategory(category)}
                            />
                            <span>
                                {category} ({count})
                            </span>
                        </label>
                    ))}
                </fieldset>
                <div className="flex flex-wrap gap-4">
                    {filteredPrograms.map((program) => (
                        <ProgramCard key={program.id} program={program} />
                    ))}
                </div>
            </main>
        </>
    );
}
