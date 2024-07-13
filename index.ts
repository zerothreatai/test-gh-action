import * as core from '@actions/core';
import * as github from '@actions/github';
import axios from 'axios';

async function run() {
    try {
        const deploymentUrl = core.getInput('deployment_url');
        const apiUrl = "https://test-apirepo-action.vercel.app/"  // test api for scan
        const token = core.getInput('github_token');
        const context = github.context;

        if (!context.payload.pull_request) {
            core.setFailed('This action can only be run on pull requests.');
            return;
        }

        const { number: prNumber } = context.payload.pull_request;
        const octokit = github.getOctokit(token);
        const host = deploymentUrl;

        const initiateResponse = await axios.post(`${apiUrl}/api/scan/initiate`, { host });
        const scanData = initiateResponse.data;

        let commentBody = `## Scan initiated
                            **Scan ID**: ${scanData.scanId}
                            **Status**: ${scanData.status}
                            **Last Updated**: ${scanData.lastUpdated}
                            `;

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

        const updateStatus = async () => {
            try {
                const statusResponse = await axios.get(`${apiUrl}/api/scan/status?scanId=${scanData.scanId}`);
                const statusData = statusResponse.data;

                commentBody = `## Scan Status Update
                        **Scan ID**: ${statusData.scanId}
                        **Status**: ${statusData.status}
                        **Last Updated**: ${statusData.lastUpdated}
                        `;

                await updateComment(commentBody);

                if (statusData.status < 4) {
                    setTimeout(updateStatus, 10000);
                } else {
                    core.info('✅ Scan completed.');
                }
            } catch (error) {
                core.setFailed(`Failed to update status: ${error}`);
            }
        };

        setTimeout(updateStatus, 10000);
    } catch (error) {
        core.setFailed(`Action failed: ${error}`);
    }
}

run();
