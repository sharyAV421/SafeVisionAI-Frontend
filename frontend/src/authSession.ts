import { ApiError } from "./api";
import type { TranslationKey } from "./i18n";

type Translate = (key: TranslationKey) => string;

/** An absent cookie is the normal signed-out state; transport/server failures remain visible. */
export function sessionRestoreMessage(error: unknown, translate: Translate): string {
  if (error instanceof ApiError && error.status === 401) return "";
  if (error instanceof ApiError && error.status === 0) return translate("authServiceUnreachable");
  if (error instanceof ApiError && error.status >= 500) return translate("authServerError");
  return translate("accessFailed");
}
