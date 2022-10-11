import picomatch from "picomatch";
import { slashify } from "./ref";

export type GlobInit = string | GlobMatcher | GlobSet | (string | GlobMatcher | GlobSet)[];

export interface GlobMatcher {
    (value: string): boolean | [isMatch: boolean, isNegation: boolean];
}

class GlobSet extends Map<[pattern: string, prefix: string], GlobMatcher> {
    input?: string;
    pattern?: string;

    constructor(...input: GlobInit[]) {
        super();
        this.match = this.match.bind(this);
        input.length && this.add(...input);
    }

    add(...inputs: GlobInit[]) {
        for (const input of inputs.flat()) {
            if (input instanceof GlobSet) {
                for (const [[pattern, prefix], matcher] of input) {
                    this.set([pattern, prefix], matcher);
                }

                return this;
            }

            if (typeof input === "function") {
                this.set([input.name, ""], input);
                return this;
            }

            if (typeof input === "string") {
                const [matcher, prefix] = GlobSet.compile(input);
                this.set([input, prefix], matcher);
                return this;
            }
        }

        return this;
    }

    match(value: string) {
        this.input = value = slashify(value);
        this.pattern = undefined;        

        let result: boolean | undefined;
        for (const [[pattern], matcher] of this) {
            const match = matcher(value);
            const [isMatch, isNegation] = Array.isArray(match) ? match : [match, false];
            if (result === undefined) {
                result = isNegation;
            }

            if (isMatch !== isNegation) {
                this.pattern = pattern;
                result = isMatch;
            }
        }

        return !!result;
    }

    prefix() {
        let last: string | undefined;
        for (const [, prefix] of this.keys()) {
            if (last === undefined || last.startsWith(prefix)) {
                last = prefix;
            } else if (!prefix.startsWith(last)) {
                return "";
            }
        }

        return last !== undefined ? last : "";
    }

    static compileCache = new Map<string, [matcher: GlobMatcher, prefix: string, plain: boolean]>();
    static weakCache = new WeakMap<GlobInit[], GlobSet>();

    static compile(pattern: string) {
        const { compileCache } = this;
        let result = compileCache.get(pattern);
        if (result !== undefined) {
            return result;
        }

        const state = this.library.parse(pattern);
        const re = this.library.compileRe(state);
        const isNegation = state.negated;
        const matcher: GlobMatcher = value => [re.test(value), isNegation];
        Object.defineProperty(matcher, "name", {
            configurable: true,
            enumerable: false,
            writable: false,
            value: pattern,
        });
        
        let plain = true;
        let prefix = [] as string[];
        let text = "";
        for (const token of state.tokens) {
            if (token.type === "bos") {
                continue;
            }

            if (token.type === "text") {
                text = token.value;
                continue;
            }

            if (token.type === "slash") {
                prefix.push(text);
                prefix.push("/");
                continue;
            }

            plain = false;
            break;
        }

        result = [matcher, prefix.join(""), plain];
        compileCache.set(pattern, result);
        Object.freeze(result);

        return result;
    }

    static create(...input: GlobInit[]) {
        if (input.length === 1) {
            const [first] = input;
            if (Array.isArray(first)) {
                const { weakCache } = this;
                let result = weakCache.get(input);
                if (result === undefined) {
                    weakCache.set(first, result = new this(first));
                }

                return result;
            }

            if (first instanceof this) {
                return first;    
            }
        }

        return new this(...input);
    }

    static library = picomatch;
}

export default GlobSet;
