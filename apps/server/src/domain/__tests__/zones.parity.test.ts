import { describe, expect, it } from "vitest";

import * as shared from "@mtg/shared/constants/zones";
import * as server from "../constants";

const zoneTypes = Object.values(shared.ZONE);

describe("zone constants parity", () => {
  it("matches zone identifiers", () => {
    expect(server.ZONE).toEqual(shared.ZONE);
    expect(server.LEGACY_COMMAND_ZONE).toBe(shared.LEGACY_COMMAND_ZONE);
  });

  it("matches hidden/public zone helpers", () => {
    zoneTypes.forEach((zoneType) => {
      expect(server.isHiddenZoneType(zoneType)).toBe(shared.isHiddenZoneType(zoneType));
      expect(server.isPublicZoneType(zoneType)).toBe(shared.isPublicZoneType(zoneType));
    });
  });

  it("matches commander zone helper", () => {
    expect(server.isCommanderZoneType(shared.ZONE.COMMANDER)).toBe(true);
    expect(server.isCommanderZoneType(shared.LEGACY_COMMAND_ZONE)).toBe(true);
    expect(server.isCommanderZoneType(shared.ZONE.HAND)).toBe(false);
  });
});
