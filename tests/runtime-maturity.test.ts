import { describe, expect, it } from "vitest";
import {
  computeRuntimeHealthReport,
  RUNTIME_HEALTH_THRESHOLDS,
} from "../src/shared/runtime-maturity";

describe("runtime maturity", () => {
  it("computes runtime health and recovery confidence scores", () => {
    const report = computeRuntimeHealthReport({
      continuityHealthScore: 0.82,
      continuityDriftScore: 0.2,
      continuityConfidenceScore: 0.88,
      maintenanceHealthScore: 0.9,
      memoryPressureRatio: 0.3,
      contextAssemblyMs: 40,
      reconstructionMs: 60,
      savepointMs: 30,
      compressionMs: 50,
    });
    expect(report.runtimeHealthScore).toBeGreaterThan(0.7);
    expect(report.recoveryConfidenceScore).toBeGreaterThan(0.7);
    expect(report.memoryPressure).toBe("low");
    expect(report.warnings).toHaveLength(0);
  });

  it("warns on slow paths and high drift", () => {
    const report = computeRuntimeHealthReport({
      continuityHealthScore: 0.4,
      continuityDriftScore: RUNTIME_HEALTH_THRESHOLDS.highDrift + 0.05,
      continuityConfidenceScore: 0.4,
      maintenanceHealthScore: 0.5,
      memoryPressureRatio: 0.9,
      contextAssemblyMs: RUNTIME_HEALTH_THRESHOLDS.slowContextAssemblyMs + 10,
      reconstructionMs: RUNTIME_HEALTH_THRESHOLDS.slowReconstructionMs + 20,
      savepointMs: RUNTIME_HEALTH_THRESHOLDS.slowSavepointMs + 5,
      compressionMs: RUNTIME_HEALTH_THRESHOLDS.slowCompressionMs + 5,
    });
    expect(report.memoryPressure).toBe("high");
    expect(report.warnings.length).toBeGreaterThan(3);
    expect(report.runtimeHealthScore).toBeLessThan(0.55);
  });
});
