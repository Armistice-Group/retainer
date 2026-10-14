import "server-only";
import { cookies } from "next/headers";

export const FLASH_COOKIE = "flash";

/**
 * A message to show (as a toast) on the next page, for actions that
 * redirect. FlashToaster reads and clears it in the browser.
 */
export async function flash(message: string) {
  (await cookies()).set(FLASH_COOKIE, encodeURIComponent(message), {
    path: "/",
    maxAge: 60,
    sameSite: "lax",
    httpOnly: false,
  });
}
