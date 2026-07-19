import streamDeck from "@elgato/streamdeck";

import { ErrorPulse } from "./actions/error-pulse";
import { HumanLoop } from "./actions/human-loop";

streamDeck.logger.setLevel("info");

// Only emit did-receive-global-settings events for property-inspector updates,
// not for our own getGlobalSettings() requests. Without this the poller's
// settings handler would re-trigger a refresh on every poll and hammer the API.
// Available from Stream Deck 7.1 (see manifest Software.MinimumVersion).
streamDeck.settings.useExperimentalMessageIdentifiers = true;

streamDeck.actions.registerAction(new ErrorPulse());
streamDeck.actions.registerAction(new HumanLoop());

streamDeck.connect();
