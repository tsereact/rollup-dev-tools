import GlobSet from "../GlobSet";

describe("GlobSet", () => {
    test("negation", () => {
        const [fn, prefix, plain] = GlobSet.compile("src/test.js");
        console.info("==", prefix, plain);
        console.info("--", fn("src\\test.js"));
    });

    test.only("prefix", () => {
        const [fn, prefix, plain] = GlobSet.compile("../src/**/*.js");
        console.info("---", prefix, plain, fn("../src/some/dir/asdf.js"));
    });
});
