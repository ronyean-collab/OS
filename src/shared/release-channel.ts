export const RELEASE_CHANNELS = ["dev", "beta", "stable"] as const;
export type ReleaseChannel = (typeof RELEASE_CHANNELS)[number];

export type ReleaseMetadata = {
  releaseChannel: ReleaseChannel;
  appVersion: string;
  schemaVersion: number;
  buildNumber: string;
  buildDate: string;
};

export type ReleaseChannelInfo = ReleaseMetadata & {
  badgeLabel: string;
  badgeTone: "dev" | "beta" | "stable";
  isProductionChannel: boolean;
};

export type ReleaseCompatibilityResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

const CHANNEL_ORDER: Record<ReleaseChannel, number> = {
  dev: 0,
  beta: 1,
  stable: 2,
};

/** Centralized default — override via CONTINUITY_RELEASE_CHANNEL in CI. */
export function resolveReleaseChannel(raw?: string | null): ReleaseChannel {
  const normalized = String(raw ?? process.env.CONTINUITY_RELEASE_CHANNEL ?? "dev")
    .trim()
    .toLowerCase();
  if (RELEASE_CHANNELS.includes(normalized as ReleaseChannel)) {
    return normalized as ReleaseChannel;
  }
  return "dev";
}

export function validateReleaseMetadata(
  meta: Partial<ReleaseMetadata>,
): ReleaseCompatibilityResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const channel = resolveReleaseChannel(meta.releaseChannel);
  if (meta.releaseChannel && meta.releaseChannel !== channel) {
    warnings.push(`release-channel-normalized:${meta.releaseChannel}->${channel}`);
  }

  if (!meta.appVersion?.trim()) {
    errors.push("missing-app-version");
  } else if (!/^\d+\.\d+\.\d+/.test(meta.appVersion.trim())) {
    warnings.push("app-version-non-semver");
  }

  if (meta.schemaVersion == null || Number.isNaN(Number(meta.schemaVersion))) {
    errors.push("missing-schema-version");
  } else if (Number(meta.schemaVersion) < 1) {
    errors.push("invalid-schema-version");
  }

  if (!meta.buildNumber?.trim()) {
    warnings.push("missing-build-number");
  }

  if (!meta.buildDate?.trim()) {
    warnings.push("missing-build-date");
  }

  return { ok: errors.length === 0, errors, warnings };
}

export function getReleaseChannelInfo(
  overrides?: Partial<ReleaseMetadata>,
): ReleaseChannelInfo {
  const channel = resolveReleaseChannel(overrides?.releaseChannel);
  const badge =
    channel === "stable"
      ? { badgeLabel: "Stable", badgeTone: "stable" as const }
      : channel === "beta"
        ? { badgeLabel: "Beta", badgeTone: "beta" as const }
        : { badgeLabel: "Dev", badgeTone: "dev" as const };

  return {
    releaseChannel: channel,
    appVersion: overrides?.appVersion ?? "0.0.0",
    schemaVersion: overrides?.schemaVersion ?? 0,
    buildNumber: overrides?.buildNumber ?? "local-dev",
    buildDate: overrides?.buildDate ?? "2026-05-18",
    ...badge,
    isProductionChannel: channel === "stable",
  };
}

/** Compare semver tuples — not a security boundary. */
export function compareSemver(a: string, b: string): number {
  const pa = a.replace(/^v/, "").split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.replace(/^v/, "").split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function checkReleaseCompatibility(input: {
  currentAppVersion: string;
  currentSchemaVersion: number;
  currentChannel: ReleaseChannel;
  storedAppVersion?: string | null;
  storedSchemaVersion?: number | null;
  storedChannel?: string | null;
}): ReleaseCompatibilityResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const metaCheck = validateReleaseMetadata({
    releaseChannel: input.currentChannel,
    appVersion: input.currentAppVersion,
    schemaVersion: input.currentSchemaVersion,
    buildNumber: "n/a",
    buildDate: "n/a",
  });
  errors.push(...metaCheck.errors);
  warnings.push(...metaCheck.warnings);

  if (
    input.storedSchemaVersion != null &&
    input.storedSchemaVersion > input.currentSchemaVersion
  ) {
    errors.push("schema-downgrade-detected");
  }

  if (input.storedAppVersion && input.currentAppVersion) {
    if (compareSemver(input.storedAppVersion, input.currentAppVersion) > 0) {
      errors.push("app-downgrade-detected");
    }
  }

  if (input.storedChannel) {
    const stored = resolveReleaseChannel(input.storedChannel);
    if (CHANNEL_ORDER[stored] > CHANNEL_ORDER[input.currentChannel]) {
      warnings.push("release-channel-downgrade");
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}
