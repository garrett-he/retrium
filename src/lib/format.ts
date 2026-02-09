export function formatPlaytime(seconds: number): string {
    const totalMinutes = Math.round(seconds / 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return hours > 0 ? `${hours}h ${String(minutes).padStart(2, "0")}m` : `${minutes}m`;
}

export function formatUptime(startedAt: string, now: number = Date.now()): string {
    const start = new Date(startedAt).getTime();
    if (Number.isNaN(start)) {
        return "0:00";
    }
    const total = Math.max(0, Math.floor((now - start) / 1000));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    const ss = String(seconds).padStart(2, "0");
    if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, "0")}:${ss}`;
    }
    return `${minutes}:${ss}`;
}
