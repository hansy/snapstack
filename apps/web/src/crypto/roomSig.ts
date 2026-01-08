import { hkdfSha256 } from "./hash";
import { utf8ToBytes } from "./bytes";
import { deriveEd25519KeyPairFromSeed } from "./ed25519";

const ROOM_SIG_INFO = "room-sig";

export const deriveRoomSigningKeyPair = (params: {
  sessionId: string;
  playerKey: Uint8Array;
}): { publicKey: Uint8Array; privateKey: Uint8Array } => {
  const seed = hkdfSha256({
    ikm: params.playerKey,
    salt: utf8ToBytes(params.sessionId),
    info: utf8ToBytes(ROOM_SIG_INFO),
    length: 32,
  });
  return deriveEd25519KeyPairFromSeed(seed);
};

export const deriveRoomSigningPublicKey = (params: {
  sessionId: string;
  playerKey: Uint8Array;
}): Uint8Array => {
  return deriveRoomSigningKeyPair(params).publicKey;
};
