import type { Plugin } from "rollup";
declare function manualChunks(prefix: string, dirs: Record<string, string>): Plugin;
declare namespace manualChunks {
    function suppressOutput(): void;
}
export default manualChunks;
