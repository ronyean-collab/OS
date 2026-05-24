import { describe, expect, it, afterEach, beforeEach } from "vitest";

import { openTestDatabase } from "../electron/main/database/test-db";

import { createWorkspace } from "../electron/main/services/workspace-service";

import {

  __setSecureStorageForTests,

  getProviderConfig,

  saveProviderConfig,

} from "../electron/main/services/provider-service";

import {

  mapOpenAIError,

  testOpenAIConnection,

} from "../electron/main/services/provider-connection-test";

import { getProviderDefinition } from "../src/shared/provider-definitions";

import { MemorySecureStorageStub } from "../electron/main/secure-storage/memory-stub";

import { PROVIDER_SECURE_STORAGE_ERROR } from "../src/shared/provider-errors";

import OpenAI from "openai";



const DEFAULT_OPENAI_MODEL = getProviderDefinition("openai").recommendedModel;



describe("provider setup", () => {

  const cleanups: Array<() => void> = [];

  const stub = new MemorySecureStorageStub();



  beforeEach(() => {

    __setSecureStorageForTests(stub);

  });



  afterEach(() => {

    __setSecureStorageForTests(null);

    while (cleanups.length) cleanups.pop()?.();

  });



  function session() {

    const s = openTestDatabase();

    cleanups.push(s.cleanup);

    return s.db;

  }



  it("saveProviderConfig stores key in secure storage and exposes hasApiKey", () => {

    const db = session();

    const ws = createWorkspace(db, "Provider WS");

    const config = saveProviderConfig(

      db,

      ws.id,

      "openai",

      DEFAULT_OPENAI_MODEL,

      "sk-test-key-12345",

      null,

    );

    expect(config.model).toBe(DEFAULT_OPENAI_MODEL);

    expect(config.hasApiKey).toBe(true);



    const loaded = getProviderConfig(db, ws.id);

    expect(loaded?.hasApiKey).toBe(true);

    expect(loaded?.provider).toBe("openai");



    const ref = stub.buildRef(ws.id, "openai");

    expect(stub.getKey(ref)).toBe("sk-test-key-12345");

  });



  it("saveProviderConfig rejects new config without api key", () => {

    const db = session();

    const ws = createWorkspace(db, "No key");

    expect(() =>

      saveProviderConfig(db, ws.id, "openai", DEFAULT_OPENAI_MODEL, "", null),

    ).toThrow(/API key is required/i);

  });



  it("saveProviderConfig surfaces secure storage failure message", () => {

    stub.setFailNextWrite(true);

    const db = session();

    const ws = createWorkspace(db, "Secure fail");

    expect(() =>

      saveProviderConfig(db, ws.id, "openai", DEFAULT_OPENAI_MODEL, "sk-x", null),

    ).toThrow(PROVIDER_SECURE_STORAGE_ERROR);

  });



  it("testOpenAIConnection rejects empty key", async () => {

    const result = await testOpenAIConnection("", DEFAULT_OPENAI_MODEL);

    expect(result.ok).toBe(false);

    expect(result.status).toBe("invalid_key");

  });



  it("mapOpenAIError classifies invalid key", () => {

    const err = new OpenAI.AuthenticationError(401, undefined, "invalid", undefined);

    const result = mapOpenAIError(err);

    expect(result.status).toBe("invalid_key");

    expect(result.ok).toBe(false);

  });



  it("mapOpenAIError classifies quota exceeded", () => {

    const err = new OpenAI.RateLimitError(429, undefined, "rate", undefined);

    const result = mapOpenAIError(err);

    expect(result.status).toBe("quota_exceeded");

  });



  it("mapOpenAIError classifies network failures", () => {

    const result = mapOpenAIError(new Error("fetch failed ECONNREFUSED"));

    expect(result.status).toBe("network_error");

  });



  it("testProviderConnection requires key when none stored", async () => {

    const db = session();

    const ws = createWorkspace(db, "No stored key");

    const { testProviderConnection } = await import(

      "../electron/main/services/provider-connection-test"

    );

    const result = await testProviderConnection(db, ws.id, {});

    expect(result.ok).toBe(false);

    expect(result.status).toBe("invalid_key");

  });

});

