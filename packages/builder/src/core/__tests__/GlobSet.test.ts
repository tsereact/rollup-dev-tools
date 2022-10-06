import GlobSet from "../GlobSet";

describe("GlobSet", () => {
    test("negation", () => {
        const [fn, prefix, plain] = GlobSet.compile("src/test.js");
        console.log("==", prefix, plain);
        console.log("--", fn("src\\test.js"));
    });
});
