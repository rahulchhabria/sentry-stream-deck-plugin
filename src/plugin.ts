import streamDeck from "@elgato/streamdeck";

import { AgentPlan } from "./actions/agent-plan";
import { ErrorPulse } from "./actions/error-pulse";
import { SelectedIssue } from "./actions/human-loop";
import { NextIssue, PreviousIssue } from "./actions/issue-navigation";
import { SendToAgent } from "./actions/send-to-agent";

streamDeck.logger.setLevel("info");

// Only emit did-receive-global-settings events for property-inspector updates,
// not for our own getGlobalSettings() requests. Without this the poller's
// settings handler would re-trigger a refresh on every poll and hammer the API.
// Available from Stream Deck 7.1 (see manifest Software.MinimumVersion).
streamDeck.settings.useExperimentalMessageIdentifiers = true;

streamDeck.actions.registerAction(new ErrorPulse());
streamDeck.actions.registerAction(new PreviousIssue());
streamDeck.actions.registerAction(new SelectedIssue());
streamDeck.actions.registerAction(new NextIssue());
streamDeck.actions.registerAction(new AgentPlan());
streamDeck.actions.registerAction(new SendToAgent());

streamDeck.connect();
