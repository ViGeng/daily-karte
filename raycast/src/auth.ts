import { getPreferenceValues, OAuth } from "@raycast/api";
import { authorizeGoogle, firebaseSession, readConfig } from "./lib/session";
import type { Session } from "./types";

let pending: Promise<Session> | undefined;

export async function getSession(): Promise<Session> {
  if (pending) return pending;
  pending = (async () => {
    const config = readConfig(getPreferenceValues<{ firebaseProjectId: string; googleClientId: string }>());
    const client = new OAuth.PKCEClient({
      redirectMethod: OAuth.RedirectMethod.AppURI,
      providerName: "Daily Karte",
      providerId: `${config.projectId}:${config.clientId}`,
      providerIcon: "icon.png",
      description: "Sign in with the Google account you use for Daily Karte.",
    });
    return firebaseSession(config, await authorizeGoogle(client, config.clientId));
  })();
  try {
    return await pending;
  } finally {
    pending = undefined;
  }
}
