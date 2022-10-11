import { scanForPackages } from "../scan";

describe("GlobSet", () => {
    test("negation", async () => {
        const result = await scanForPackages();
        console.log(result);
    });
});
