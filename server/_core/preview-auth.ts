import { ENV } from "./env";

/**
 * Preview sign-in creates a real database user and session so the whole
 * workflow (invoices, lab results, PDF reports) can be reviewed on an
 * environment without Manus OAuth.
 *
 * It is disabled by default and refuses to run when an OAuth endpoint is
 * configured, so production deployments always use the Manus login.
 */
export function isPreviewLoginEnabled(): boolean {
  return process.env.ALLOW_PREVIEW_LOGIN === "1"
    && !ENV.oAuthServerUrl
    && Boolean(ENV.cookieSecret)
    && Boolean(ENV.appId);
}
