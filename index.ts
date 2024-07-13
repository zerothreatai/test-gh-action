import * as core from '@actions/core';
import * as github from '@actions/github';
import axios from 'axios';

async function run() {
    try {
        const deploymentUrl = core.getInput('deployment_url');
        const apiUrl = "https://test-apirepo-action.vercel.app";  // Test API for scan
        const token = core.getInput('github_token');
        const context = github.context;
        const octokit = github.getOctokit(token);

        let prNumber: number | undefined;

        if (context.payload.pull_request) {
            prNumber = context.payload.pull_request.number;
        } else if (context.payload.commits) {
            const { data: pullRequests } = await octokit.rest.pulls.list({
                ...context.repo,
                state: 'open'
            });
            const matchingPR = pullRequests.find(pr => pr.head.ref === context.ref.replace('refs/heads/', ''));
            if (matchingPR) {
                prNumber = matchingPR.number;
            }
        }

        if (!prNumber) {
            core.info('No pull request found for this action.');
            return;
        }

        const host = deploymentUrl;

        const initiateResponse = await axios.post(`${apiUrl}/api/scan/initiate`, { host });
        console.log(initiateResponse.data, initiateResponse);
        const scanData = initiateResponse.data;

        let commentBody = `## Scan initiated\n**Scan ID**: ${scanData.scanId}\n**Status**: ${scanData.status}\n**Last Updated**: ${scanData.lastUpdated}\n`;

        const { data: comment } = await octokit.rest.issues.createComment({
            ...context.repo,
            issue_number: prNumber,
            body: commentBody
        });

        const commentId = comment.id;

        const updateComment = async (message: string) => {
            await octokit.rest.issues.updateComment({
                ...context.repo,
                comment_id: commentId,
                body: message
            });
        };

        const interval = setInterval(async () => {
            try {
                const statusResponse = await axios.get(`${apiUrl}/api/scan/status?scanId=${scanData.scanId}`);
                const statusData = statusResponse.data;

                commentBody = `## Scan Status Update\n**Scan ID**: ${statusData.scanId}\n**Status**: ${statusData.status}\n**Last Updated**: ${statusData.lastUpdated}`;
                await updateComment(commentBody);

                if (statusData.status >= 4) {
                    clearInterval(interval);
                    core.info('Scan completed.');
                }
            } catch (error) {
                clearInterval(interval);
                core.setFailed(`Failed to update status: ${error}`);
            }
        }, 10000);

    } catch (error) {
        core.setFailed(`Action failed: ${error}`);
    }
}

run();
