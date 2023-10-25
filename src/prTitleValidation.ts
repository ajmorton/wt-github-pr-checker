// Verify that PR titles always start with a WT ticket followed by a space.
// Automation tools will use this PR title, as well as squash commit
// messages derived from this, for processing. For example the drop tool
// uses this to update the correct Jira tickets

import {type PullRequestEvent} from '@octokit/webhooks-types';
import {type App, type Octokit} from 'octokit';
import {reportWebhookError} from './webhookLogging';

const prTitleCheckName = 'PR title matches `WT-[0-9]+ .*`';

export function registerPrTitleCheckHooks(app: App) {
	// PR creation.
	app.webhooks.on('pull_request.opened', async ({octokit, payload}) => {
		try {
			runPrTitleCheck(octokit, payload, payload.pull_request.head.sha);
		} catch (error) {
			reportWebhookError(error, payload);
		}
	});

	// When the PR details (title, description, etc), not the code, have changed.
	app.webhooks.on('pull_request.edited', async ({octokit, payload}) => {
		try {
			// If the title hasn't changed there's no need to re-check it
			if (payload.changes.title) {
				runPrTitleCheck(octokit, payload, payload.pull_request.head.sha);
			}
		} catch (error) {
			reportWebhookError(error, payload);
		}
	});

	// On new commits to the PR rerun the check for the latest commit.
	app.webhooks.on('pull_request.synchronize', async ({octokit, payload}) => {
		try {
			runPrTitleCheck(octokit, payload, payload.pull_request.head.sha);
		} catch (error) {
			reportWebhookError(error, payload);
		}
	});
}

// Run the PR title check task. This verifies that the PR title begins with a wiredtiger ticket
function runPrTitleCheck(octokit: Octokit, payload: PullRequestEvent, headSha: string) {
	const prTitleRegex = /WT-[0-9]+ .*/;
	const prTitle = payload.pull_request.title;
	const conclusion = prTitleRegex.test(prTitle) ? 'success' : 'failure';

	if (process.env['DRY_RUN'] === 'true') {
		console.log(`Dry run: Reporting pr_title check result: ${conclusion}`);
	} else {
		// This is a quick check. Just run and and create it.
		// Usually for longer tasks we'd create it here and then execute it in the check_run.created hook
		void octokit.rest.checks.create({
			owner: payload.repository.owner.login,
			repo: payload.repository.name,
			name: prTitleCheckName,
			output: {
				title: '',
				summary: `WiredTiger automation tools use PR titles and commit messages of the \
                resulting merge commit (which is derived from the PR title) to update Jira tickets.
                For this to work the commit and PR title must begin with the wiredtiger ticket number \
                followed by a space.`,
			},
			// eslint-disable-next-line @typescript-eslint/naming-convention
			head_sha: headSha,
			status: 'completed',
			conclusion,
		});
	}
}
