import { setFailed, info, getInput } from "@actions/core";
import { formatAndNotify, getWorkflowRunStatus } from "./utils";

try {
  // setTimeout to give time for Github API to show up the final conclusion
  setTimeout(async () => {
    const showCardOnExit = getInput(`show-on-exit`, { required: true }).toLowerCase() === "true";
    const showCardOnFailure =
      getInput(`show-on-failure`, { required: true }).toLowerCase() === "true";
    const showCardOnSuccess =
      getInput(`show-on-success`, { required: true }).toLowerCase() === "true";

    const workflowRunStatus = await getWorkflowRunStatus();
    let show = false;
    if (showCardOnExit) {
      if (showCardOnSuccess && workflowRunStatus.conclusion === "success") {
        show = true;
      }
      if (showCardOnFailure && workflowRunStatus.conclusion !== "success") {
        show = true;
      }
    }
    if (show) {
      formatAndNotify(
        "exit",
        workflowRunStatus.conclusion,
        workflowRunStatus.elapsedSeconds
      );
    } else {
      info("Configured to not show card upon job exit.");
    }
  }, 2000);
} catch (error) {
  setFailed(error.message);
}
