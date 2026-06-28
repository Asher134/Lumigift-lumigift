// @ts-check
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  packageManager: "npm",
  reporters: ["html", "clear-text", "progress", "dashboard"],
  testRunner: "jest",
  jest: {
    projectType: "custom",
    configFile: "jest.config.js",
    enableFindRelatedTests: true,
  },
  coverageAnalysis: "perTest",
  // Scope mutation to service layer only (issue #401)
  mutate: [
    "src/server/services/gift.service.ts",
    "src/server/services/claim.service.ts",
    "src/server/services/gift-state-machine.ts",
    "src/server/services/exchange-rate.service.ts",
  ],
  thresholds: {
    high: 80,
    low: 60,
    break: 50,
  },
  dashboard: {
    project: "github.com/JosephOnuh/Lumigift-lumigift",
    version: "main",
  },
  timeoutMS: 60000,
  concurrency: 2,
};

module.exports = config;
