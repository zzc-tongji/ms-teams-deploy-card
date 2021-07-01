import { exec } from "child_process";
import { Octokit } from "@octokit/rest";
import { setOutput, info, getInput, warning } from "@actions/core";
import fetch, { Response } from "node-fetch";
import moment from "moment";
import yaml from "yaml";

import { WebhookBody, PotentialAction } from "./models";
import { formatCompactLayout } from "./layouts/compact";
import { formatCozyLayout } from "./layouts/cozy";
import { formatCompleteLayout } from "./layouts/complete";
import { CONCLUSION_THEMES } from "./constants";

export function escapeMarkdownTokens(text: string) {
  return text
    .replace(/\n\ {1,}/g, "\n ")
    .replace(/\_/g, "\\_")
    .replace(/\*/g, "\\*")
    .replace(/\|/g, "\\|")
    .replace(/#/g, "\\#")
    .replace(/-/g, "\\-")
    .replace(/>/g, "\\>");
}

export function getRunInformation() {
  const [owner, repo] = (process.env.GITHUB_REPOSITORY || "").split("/");
  return {
    owner,
    repo,
    ref: process.env.GITHUB_SHA || undefined,
    branchUrl: `https://github.com/${process.env.GITHUB_REPOSITORY}/tree/${process.env.GITHUB_REF}`,
    runId: process.env.GITHUB_RUN_ID || undefined,
    runNum: process.env.GITHUB_RUN_NUMBER || undefined,
  };
}

export async function getOctokitCommit() {
  const runInfo = getRunInformation();
  info("Workflow run information: " + JSON.stringify(runInfo, undefined, 2));

  const githubToken = getInput("github-token", { required: true });
  const command = `curl -H 'Authorization: token ${githubToken}' 'https://api.github.com/repos/${runInfo.owner}/${runInfo.repo}/commits/${runInfo.ref}' 2>/dev/null`;
  return new Promise((resolve, reject) => {
    exec(command, { encoding: "utf8" }, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      console.log('commits', stdout);
      resolve(JSON.parse(stdout));
    });
  });
}

const safeText: (origin: string) => string = (origin) => {
  return origin.replace(/'/g, "");
}

export function submitNotification(webhookBody: WebhookBody) {
  const webhookUri = getInput("webhook-uri", { required: true });
  const webhookBodyJson = JSON.stringify(webhookBody, undefined, 2);

  const command = `curl -d '${safeText(JSON.stringify(webhookBody))}' -H 'Content-Type: application/json;charset=utf-8' -X POST '${safeText(webhookUri)}' 2>/dev/null`;
  return new Promise((resolve) => {
    exec(command, { encoding: "utf8" }, (error, stdout) => {
      if (error) {
        console.error(error);
        resolve('')
        return ;
      }
      setOutput("webhook-body", webhookBodyJson);
      info(webhookBodyJson);
      resolve(stdout);
    });
  });
}

export async function formatAndNotify(
  state: "start" | "exit",
  conclusion = "in_progress",
  elapsedSeconds?: number
) {
  let webhookBody: WebhookBody;
  const commit = await getOctokitCommit();
  const cardLayoutStart = getInput(`card-layout-${state}`);

  if (cardLayoutStart === "compact") {
    webhookBody = formatCompactLayout(commit, conclusion, elapsedSeconds);
  } else if (cardLayoutStart === "cozy") {
    webhookBody = formatCozyLayout(commit, conclusion, elapsedSeconds);
  } else {
    webhookBody = formatCompleteLayout(commit, conclusion, elapsedSeconds);
  }

  submitNotification(webhookBody);
}

export async function getWorkflowRunStatus() {
  const runInfo = getRunInformation();
  const githubToken = getInput("github-token", { required: true });
  const command = `curl -H 'Authorization: token ${githubToken}' 'https://api.github.com/repos/${runInfo.owner}/${runInfo.repo}/actions/runs/${runInfo.runId || "1"}/jobs' 2>/dev/null`;
  const workflowJobs: any = await new Promise((resolve, reject) => {
    exec(command, { encoding: "utf8" }, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      console.log('commits', stdout);
      resolve(JSON.parse(stdout));
    });
  });

  const job = workflowJobs.jobs.find(
    (job: any) =>
      job.name === process.env.GITHUB_JOB
  );

  let lastStep;
  const stoppedStep = job?.steps.find(
    (step: any) =>
      step.conclusion === "failure" ||
      step.conclusion === "timed_out" ||
      step.conclusion === "cancelled" ||
      step.conclusion === "action_required"
  );

  if (stoppedStep) {
    lastStep = stoppedStep;
  } else {
    lastStep = job?.steps
      .reverse()
      .find(
        (
          step: any
        ) => step.status === "completed"
      );
  }

  const startTime = moment(job?.started_at, moment.ISO_8601);
  const endTime = moment(lastStep?.completed_at, moment.ISO_8601);
  return {
    elapsedSeconds: endTime.diff(startTime, "seconds"),
    conclusion: lastStep?.conclusion,
  };
}

export function renderActions(statusUrl: string, diffUrl: string) {
  const actions: PotentialAction[] = [];
  if (getInput("enable-view-status-action").toLowerCase() === "true") {
    actions.push(
      new PotentialAction(getInput("view-status-action-text"), [statusUrl])
    );
  }
  if (getInput("enable-review-diffs-action").toLowerCase() === "true") {
    actions.push(
      new PotentialAction(getInput("review-diffs-action-text"), [diffUrl])
    );
  }

  // Set custom actions
  const customActions = getInput("custom-actions");
  if (customActions && customActions.toLowerCase() !== "null") {
    try {
      let customActionsCounter = 0;
      const customActionsList = yaml.parse(customActions);
      if (Array.isArray(customActionsList)) {
        (customActionsList as any[]).forEach((action) => {
          if (
            action.text !== undefined &&
            action.url !== undefined &&
            (action.url as string).match(/https?:\/\/\S+/g)
          ) {
            actions.push(new PotentialAction(action.text, [action.url]));
            customActionsCounter++;
          }
        });
      }
      info(`Added ${customActionsCounter} custom facts.`);
    } catch {
      warning("Invalid custom-actions value.");
    }
  }
  return actions;
}
