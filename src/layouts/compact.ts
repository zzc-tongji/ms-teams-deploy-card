import { Octokit } from "@octokit/rest";
import { WebhookBody } from "../models";
import { getInput } from "@actions/core";
import { CONCLUSION_THEMES } from "../constants";

export function formatCompactLayout(
  commit: any,
  conclusion: string,
  elapsedSeconds?: number
) {
  const repoUrl = `https://github.com/${process.env.GITHUB_REPOSITORY}`;
  const shortSha = process.env.GITHUB_SHA?.substr(0, 7);
  const runLink = `${repoUrl}/actions/runs/${process.env.GITHUB_RUN_ID}`;
  const webhookBody = new WebhookBody();

  // Set status and elapsedSeconds
  let labels = `\`${conclusion.toUpperCase()}\``;
  if (elapsedSeconds) {
    labels = `\`${conclusion.toUpperCase()} [${elapsedSeconds}s]\``;
  }

  // Set environment name
  const environment = getInput("environment");
  if (environment !== "") {
    labels += ` \`ENV:${environment.toUpperCase()}\``;
  }

  // Set themeColor
  webhookBody.themeColor = CONCLUSION_THEMES[conclusion] || "957DAD";

  webhookBody.text =
    `${labels} &nbsp; CI [#${process.env.GITHUB_RUN_NUMBER}](${runLink}) ` +
    `(commit [${shortSha}](${commit.html_url})) on [${process.env.GITHUB_REPOSITORY}](${repoUrl}) ` +
    `by [@${commit.author.login}](${commit.author.html_url})`;

  return webhookBody;
}
