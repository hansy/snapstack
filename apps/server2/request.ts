import { UUID_REGEX } from "./constants";

export const normalizePathname = (pathname: string): string =>
  pathname.replace(/\/+$/, "");

export const getRoomFromUrl = (url: URL): string | null => {
  const pathname = normalizePathname(url.pathname);
  const roomFromPath = pathname.startsWith("/signal/")
    ? pathname.slice("/signal/".length)
    : null;
  return roomFromPath || url.searchParams.get("room");
};

export const isValidRoomName = (room: string): boolean => UUID_REGEX.test(room);
