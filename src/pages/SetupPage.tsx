import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import type { SetupState } from "@/types";

interface SetupPageProps {
    defaults: SetupState;
    onComplete: (library: string, dosbox: string) => Promise<void>;
}

export function SetupPage({ defaults, onComplete }: SetupPageProps) {
    const [library, setLibrary] = useState(defaults.library);
    const [dosbox, setDosbox] = useState(defaults.dosbox);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const pick = async (picker: () => Promise<string | null>, setValue: (value: string) => void) => {
        try {
            const path = await picker();
            if (path) {
                setValue(path);
            }
        } catch (err) {
            setError(String(err));
        }
    };

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        setSaving(true);
        setError(null);
        try {
            await onComplete(library, dosbox);
        } catch (err) {
            setError(String(err));
        } finally {
            setSaving(false);
        }
    };

    return (
        <main className="flex min-h-screen items-center justify-center p-4">
            <Card className="w-full max-w-xl">
                <form onSubmit={handleSubmit}>
                    <CardHeader>
                        <CardTitle>Welcome to Retrium</CardTitle>
                        <CardDescription>
                            Tell Retrium where to keep your programs and which DOSBox to launch them with.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="space-y-2">
                            <label htmlFor="library" className="text-sm font-medium">
                                Library directory
                            </label>
                            <div className="flex gap-2">
                                <Input
                                    id="library"
                                    value={library}
                                    onChange={(event) => setLibrary(event.target.value)}
                                />
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => pick(api.pickLibraryDirectory, setLibrary)}
                                >
                                    Browse
                                </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Your programs and saved states are stored in this directory.
                            </p>
                        </div>
                        <div className="space-y-2">
                            <label htmlFor="dosbox" className="text-sm font-medium">
                                DOSBox executable
                            </label>
                            <div className="flex gap-2">
                                <Input id="dosbox" value={dosbox} onChange={(event) => setDosbox(event.target.value)} />
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => pick(api.pickDosboxExecutable, setDosbox)}
                                >
                                    Browse
                                </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Full path to DOSBox.exe (or the DOSBox binary on macOS and Linux).
                            </p>
                        </div>
                        {error && (
                            <p role="alert" className="text-sm text-destructive">
                                {error}
                            </p>
                        )}
                    </CardContent>
                    <CardFooter>
                        <Button type="submit" className="w-full" disabled={saving || !library.trim() || !dosbox.trim()}>
                            {saving ? "Saving..." : "Get started"}
                        </Button>
                    </CardFooter>
                </form>
            </Card>
        </main>
    );
}
