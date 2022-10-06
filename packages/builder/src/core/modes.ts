export function isRunMode() {
    if (process.env.ROLLUP_RUN === "true") {
        return true;
    }

    return false;
}

export function isWatchMode() {
    if (process.env.ROLLUP_WATCH === "true") {
        return true;
    }

    return false;
}
