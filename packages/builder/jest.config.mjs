export default {
    testMatch: [
        "<rootDir>/src/**/__tests__/*.test.ts?(x)",
    ],

    transform: {
      "^.+\\.(t|j)sx?$": ["@swc/jest"],
    },
};
