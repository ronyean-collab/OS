export type RuntimeHealthInput = {
  continuityHealthScore: number;
  continuityDriftScore: number;
  continuityConfidenceScore: number;
  maintenanceHealthScore: number;
  memoryPressureRatio: number;
  contextAssemblyMs: number;
  reconstructionMs: number;
  savepointMs: number;
  compressionMs: number;
};

export type RuntimeHealthReport = {
  runtimeHealthScore: number;
  recoveryConfidenceScore: number;
  warnings: string[];
  memoryPressure: "low" | "moderate" | "high";
  timings: {
    contextAssemblyMs: number;
    reconstructionMs: number;
    savepointMs: number;
    compressionMs: number;
  };
};

export const RUNTIME_HEALTH_THRESHOLDS = {
  slowContextAssemblyMs: 250,
  slowReconstructionMs: 400,
  slowSavepointMs: 180,
  slowCompressionMs: 350,
  highDrift: 0.62,
  lowConfidence: 0.55,
  highMemoryPressureRatio: 0.82,
} as const;

export function computeRuntimeHealthReport(input: RuntimeHealthInput): RuntimeHealthReport {
  const warnings: string[] = [];
  if (input.contextAssemblyMs >= RUNTIME_HEALTH_THRESHOLDS.slowContextAssemblyMs) {
    warnings.push("Context assembly is slower than expected.");
  }
  if (input.reconstructionMs >= RUNTIME_HEALTH_THRESHOLDS.slowReconstructionMs) {
    warnings.push("Continuity reconstruction is slower than expected.");
  }
  if (input.savepointMs >= RUNTIME_HEALTH_THRESHOLDS.slowSavepointMs) {
    warnings.push("Savepoint creation is slower than expected.");
  }
  if (input.compressionMs >= RUNTIME_HEALTH_THRESHOLDS.slowCompressionMs) {
    warnings.push("Compression cycle is slower than expected.");
  }
  if (input.continuityDriftScore >= RUNTIME_HEALTH_THRESHOLDS.highDrift) {
    warnings.push("Continuity drift is elevated.");
  }
  if (input.continuityConfidenceScore <= RUNTIME_HEALTH_THRESHOLDS.lowConfidence) {
    warnings.push("Continuity confidence is low.");
  }

  const memoryPressure =
    input.memoryPressureRatio >= RUNTIME_HEALTH_THRESHOLDS.highMemoryPressureRatio
      ? "high"
      : input.memoryPressureRatio >= 0.55
        ? "moderate"
        : "low";
  if (memoryPressure === "high") {
    warnings.push("Runtime memory pressure is high.");
  }

  const timingPenalty =
    (input.contextAssemblyMs > RUNTIME_HEALTH_THRESHOLDS.slowContextAssemblyMs ? 0.08 : 0) +
    (input.reconstructionMs > RUNTIME_HEALTH_THRESHOLDS.slowReconstructionMs ? 0.1 : 0) +
    (input.savepointMs > RUNTIME_HEALTH_THRESHOLDS.slowSavepointMs ? 0.05 : 0);

  const runtimeHealthScore = clamp01(
    input.continuityHealthScore * 0.35 +
      input.maintenanceHealthScore * 0.2 +
      input.continuityConfidenceScore * 0.25 +
      (1 - input.continuityDriftScore) * 0.15 +
      (1 - input.memoryPressureRatio) * 0.05 -
      timingPenalty,
  );

  const recoveryConfidenceScore = clamp01(
    input.continuityConfidenceScore * 0.5 +
      (1 - input.continuityDriftScore) * 0.3 +
      input.maintenanceHealthScore * 0.2 -
      (memoryPressure === "high" ? 0.12 : 0),
  );

  return {
    runtimeHealthScore,
    recoveryConfidenceScore,
    warnings,
    memoryPressure,
    timings: {
      contextAssemblyMs: input.contextAssemblyMs,
      reconstructionMs: input.reconstructionMs,
      savepointMs: input.savepointMs,
      compressionMs: input.compressionMs,
    },
  };
}

export function clamp01(value: number): number {
  return Number(Math.max(0, Math.min(1, value)).toFixed(3));
}
