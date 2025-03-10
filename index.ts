import * as core from '@actions/core';
import * as github from '@actions/github';
import axios from 'axios';

async function run() {
    try {
        const deploymentUrl = core.getInput('deployment_url', { required: true });
        const apiUrl = "https://test-apirepo-action.vercel.app";  // Test API for scan
        const token = core.getInput('github_token', { required: true });
        const context = github.context;
        const octokit = github.getOctokit(token);

        let prNumber: number | undefined;

        // Try to determine PR number if available
        if (context.payload.pull_request) {
            prNumber = context.payload.pull_request.number;
            core.info(`Detected Pull Request #${prNumber}`);
        } else if (context.payload.commits && context.ref.startsWith('refs/heads/')) {
            const branch = context.ref.replace('refs/heads/', '');
            core.info(`No PR detected, checking for open PRs on branch: ${branch}`);
            const { data: pullRequests } = await octokit.rest.pulls.list({
                ...context.repo,
                state: 'open',
            });
            const matchingPR = pullRequests.find(pr => pr.head.ref === branch);
            if (matchingPR) {
                prNumber = matchingPR.number;
                core.info(`Found matching PR #${prNumber} for branch ${branch}`);
            }
        }

        const host = deploymentUrl;
        core.info(`Initiating scan for deployment URL: ${host}`);

        // Initiate the scan
        const initiateResponse = await axios.post(`${apiUrl}/api/scan/initiate`, { host });
        const scanData = initiateResponse.data.scanData;

        core.info(`Scan initiated - ID: ${scanData.scanId}, Status: ${scanData.status}`);

        // Base comment/log body
        let messageBody = `## Scan Initiated\n**Scan ID**: ${scanData.scanId}\n**Status**: ${scanData.status}\n**Last Updated**: ${scanData.lastUpdated}\n`;

        // Handle PR comment if PR exists
        let commentId: number | undefined;
        if (prNumber) {
            const { data: comment } = await octokit.rest.issues.createComment({
                ...context.repo,
                issue_number: prNumber,
                body: messageBody,
            });
            commentId = comment.id;
            core.info(`Comment posted on PR #${prNumber}, Comment ID: ${commentId}`);
        } else {
            core.info(messageBody); // Log to console if no PR
        }

        // Function to update status
        const updateStatus = async (message: string) => {
            if (prNumber && commentId) {
                await octokit.rest.issues.updateComment({
                    ...context.repo,
                    comment_id: commentId,
                    body: message,
                });
                core.info(`Updated PR comment for Scan ID: ${scanData.scanId}`);
            }
            core.info(message); // Always log to console
        };

        // Polling for scan status
        const interval = setInterval(async () => {
            try {
                const statusResponse = await axios.get(`${apiUrl}/api/scan/status?scanId=${scanData.scanId}`);
                const statusData = statusResponse.data;

                messageBody = `## Scan Status Update\n**Scan ID**: ${statusData.scanId}\n**Status**: ${statusData.status}\n**Last Updated**: ${statusData.lastUpdated}`;

                await updateStatus(messageBody);

                if (statusData.status >= 4) {
                    clearInterval(interval);
                    core.info(`Scan completed for ID: ${scanData.scanId}`);
                    core.setOutput('vulnerability', statusData.status); // Set output for downstream use
                }
            } catch (error) {
                clearInterval(interval);
                core.setFailed(`Status polling failed: ${error instanceof Error ? error.message : String(error)}`);
            }
        }, 10000);

    } catch (error) {
        core.setFailed(`Action failed: ${error instanceof Error ? error.message : String(error)}`);
    }
}

run();