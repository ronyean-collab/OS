import pkg from "../../package.json";
import { resolveReleaseChannel, type ReleaseChannel } from "./release-channel";

/** Bump when SQLite migrations change — keep in sync with `electron/main/database/migrations.ts`. */
export const SCHEMA_VERSION = 5;

export const APP_NAME = "ContinuityOS";

/** From package.json — single source for semver display. */
export const APP_VERSION: string = pkg.version ?? "0.0.0";

export const BUILD_NUMBER: string =
  process.env.CONTINUITY_BUILD_NUMBER ?? "local-dev";

export const RELEASE_CHANNEL: ReleaseChannel = resolveReleaseChannel(
  process.env.CONTINUITY_RELEASE_CHANNEL,
);

/** ISO date string for the build (set CONTINUITY_BUILD_DATE in CI). */
export const BUILD_DATE: string =
  process.env.CONTINUITY_BUILD_DATE ?? "2026-05-18";

export type AppVersionInfo = {
  appName: string;
  appVersion: string;
  buildNumber: string;
  schemaVersion: number;
  releaseChannel: string;
  buildDate: string;
};

export type VersionStamp = {
  appVersion: string;
  schemaVersion: number;
  buildNumber: string;
  releaseChannel: string;
  buildDate: string;
};

/** Full version record for persistence metadata. */
export function getAppVersionInfo(): AppVersionInfo {
  return {
    appName: APP_NAME,
    appVersion: APP_VERSION,
    buildNumber: BUILD_NUMBER,
    schemaVersion: SCHEMA_VERSION,
    releaseChannel: RELEASE_CHANNEL,
    buildDate: BUILD_DATE,
  };
}

export function getVersionStamp(): VersionStamp {
  const info = getAppVersionInfo();
  return {
    appVersion: info.appVersion,
    schemaVersion: info.schemaVersion,
    buildNumber: info.buildNumber,
    releaseChannel: info.releaseChannel,
    buildDate: info.buildDate,
  };
}

export function getDisplayVersionLabel(): string {
  return `${APP_NAME} v${APP_VERSION}`;
}

export function getShortBuildLabel(): string {
  return `Build ${BUILD_NUMBER}`;
}
