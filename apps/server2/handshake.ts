import { UUID_REGEX } from "./constants";

export type HandshakeParams = {
  userId: string;
  clientKey: string;
  sessionVersion: number;
};

export const parseHandshakeParams = (
  params: URLSearchParams
): HandshakeParams => {
  const userId = params.get("userId") || "";
  const clientKey = params.get("clientKey") || "";
  const sessionVersionRaw = params.get("sessionVersion") || "";
  const sessionVersion = Number.parseInt(sessionVersionRaw, 10);

  return { userId, clientKey, sessionVersion };
};

export const isValidHandshake = ({
  userId,
  clientKey,
  sessionVersion,
}: HandshakeParams): boolean =>
  UUID_REGEX.test(userId) &&
  UUID_REGEX.test(clientKey) &&
  Number.isFinite(sessionVersion) &&
  sessionVersion >= 0;
