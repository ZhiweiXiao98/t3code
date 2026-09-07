import { describe, expect, it } from "@effect/vitest";
import {
  BearerConnectionCredential,
  BearerConnectionProfile,
  BearerConnectionRegistration,
  BearerConnectionTarget,
} from "@t3tools/client-runtime/connection";
import {
  EMPTY_CONNECTION_CATALOG_DOCUMENT,
  registerConnectionInCatalog,
} from "@t3tools/client-runtime/platform";
import { EnvironmentId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import { vi } from "vite-plus/test";

vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
}));

vi.mock("expo-secure-store", () => ({
  deleteItemAsync: vi.fn(),
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
}));

import { CONNECTION_CATALOG_KEY, LEGACY_CONNECTIONS_KEY, make } from "./catalog-store";
import { MobileSecureStorage } from "../persistence/mobile-secure-storage";

function makeStorage(initial: Readonly<Record<string, string>>) {
  const values = new Map(Object.entries(initial));
  const deleted: Array<string> = [];
  const storage = MobileSecureStorage.of({
    getItem: (key) => Effect.sync(() => values.get(key) ?? null),
    setItem: (key, value) =>
      Effect.sync(() => {
        values.set(key, value);
      }),
    removeItem: (key) =>
      Effect.sync(() => {
        deleted.push(key);
        values.delete(key);
      }),
  });
  return { deleted, storage, values };
}

describe("mobile connection catalog storage", () => {
  it.effect("recovers from a corrupt current catalog", () =>
    Effect.gen(function* () {
      const memory = makeStorage({
        [CONNECTION_CATALOG_KEY]: "{not-json",
      });
      const catalog = yield* make().pipe(
        Effect.provideService(MobileSecureStorage, memory.storage),
      );

      expect((yield* catalog.read).targets).toEqual([]);
      expect(memory.deleted).toEqual([CONNECTION_CATALOG_KEY]);
    }),
  );

  it.effect("recovers from a catalog with an invalid environment id", () =>
    Effect.gen(function* () {
      const memory = makeStorage({
        [CONNECTION_CATALOG_KEY]: JSON.stringify({
          schemaVersion: 1,
          targets: [
            {
              _tag: "BearerConnectionTarget",
              environmentId: "",
              label: "Desktop",
              connectionId: "bearer:invalid",
            },
          ],
          profiles: [],
          credentials: [],
          remoteDpopTokens: [],
        }),
      });
      const catalog = yield* make().pipe(
        Effect.provideService(MobileSecureStorage, memory.storage),
      );

      expect((yield* catalog.read).targets).toEqual([]);
      expect(memory.deleted).toEqual([CONNECTION_CATALOG_KEY]);
    }),
  );

  it.effect("replaces and removes a corrupt legacy catalog", () =>
    Effect.gen(function* () {
      const memory = makeStorage({
        [LEGACY_CONNECTIONS_KEY]: JSON.stringify({ connections: [{ invalid: true }] }),
      });
      const catalog = yield* make().pipe(
        Effect.provideService(MobileSecureStorage, memory.storage),
      );

      expect((yield* catalog.read).targets).toEqual([]);
      expect(memory.deleted).toEqual([LEGACY_CONNECTIONS_KEY]);
      expect(memory.values.has(CONNECTION_CATALOG_KEY)).toBe(true);
    }),
  );

  it.effect("falls back to valid legacy data when the current catalog is corrupt", () =>
    Effect.gen(function* () {
      const memory = makeStorage({
        [CONNECTION_CATALOG_KEY]: "{not-json",
        [LEGACY_CONNECTIONS_KEY]: JSON.stringify({
          connections: [
            {
              environmentId: "legacy-environment",
              environmentLabel: "Legacy",
              pairingUrl: "https://legacy.example.test/pair",
              displayUrl: "https://legacy.example.test",
              httpBaseUrl: "https://legacy.example.test",
              wsBaseUrl: "wss://legacy.example.test",
              bearerToken: "legacy-token",
              authenticationMethod: "bearer",
            },
          ],
        }),
      });
      const catalog = yield* make().pipe(
        Effect.provideService(MobileSecureStorage, memory.storage),
      );

      expect((yield* catalog.read).targets).toHaveLength(1);
      expect(memory.deleted).toEqual([CONNECTION_CATALOG_KEY, LEGACY_CONNECTIONS_KEY]);

      yield* catalog.update((document) => document);
      expect(memory.values.has(CONNECTION_CATALOG_KEY)).toBe(true);
      expect(memory.values.has(LEGACY_CONNECTIONS_KEY)).toBe(false);
    }),
  );

  it.effect("persists and reloads a paired bearer environment", () =>
    Effect.gen(function* () {
      const memory = makeStorage({});
      const catalog = yield* make().pipe(
        Effect.provideService(MobileSecureStorage, memory.storage),
      );
      const environmentId = EnvironmentId.make("environment-1");
      const connectionId = `bearer:${environmentId}`;
      const registration = new BearerConnectionRegistration({
        target: new BearerConnectionTarget({
          environmentId,
          label: "Desktop",
          connectionId,
        }),
        profile: new BearerConnectionProfile({
          connectionId,
          environmentId,
          label: "Desktop",
          httpBaseUrl: "http://127.0.0.1:3773",
          wsBaseUrl: "ws://127.0.0.1:3773",
        }),
        credential: new BearerConnectionCredential({ token: "bearer-token" }),
      });

      yield* catalog.update((document) => registerConnectionInCatalog(document, registration));

      const encoded = memory.values.get(CONNECTION_CATALOG_KEY);
      expect(encoded).toContain(environmentId);
      const reloaded = yield* make().pipe(
        Effect.provideService(MobileSecureStorage, memory.storage),
        Effect.flatMap((store) => store.read),
      );
      expect(reloaded.targets[0]).toBeInstanceOf(BearerConnectionTarget);
      expect(reloaded).toEqual(
        registerConnectionInCatalog(EMPTY_CONNECTION_CATALOG_DOCUMENT, registration),
      );
    }),
  );
});
