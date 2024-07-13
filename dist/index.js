"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const github = __importStar(require("@actions/github"));
const axios_1 = __importDefault(require("axios"));
async function run() {
    try {
        const deploymentUrl = core.getInput('deployment_url');
        const apiUrl = "https://test-apirepo-action.vercel.app/"; // test api for scan
        const token = core.getInput('github_token');
        const context = github.context;
        if (!context.payload.pull_request) {
            core.setFailed('This action can only be run on pull requests.');
            return;
        }
        const { number: prNumber } = context.payload.pull_request;
        const octokit = github.getOctokit(token);
        const host = deploymentUrl;
        const initiateResponse = await axios_1.default.post(`${apiUrl}/api/scan/initiate`, { host });
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
        const updateComment = async (message) => {
            await octokit.rest.issues.updateComment({
                ...context.repo,
                comment_id: commentId,
                body: message
            });
        };
        const updateStatus = async () => {
            try {
                const statusResponse = await axios_1.default.get(`${apiUrl}/api/scan/status?scanId=${scanData.scanId}`);
                const statusData = statusResponse.data;
                commentBody = `## Scan Status Update
                        **Scan ID**: ${statusData.scanId}
                        **Status**: ${statusData.status}
                        **Last Updated**: ${statusData.lastUpdated}
                        `;
                await updateComment(commentBody);
                if (statusData.status < 4) {
                    setTimeout(updateStatus, 10000);
                }
                else {
                    core.info('✅ Scan completed.');
                }
            }
            catch (error) {
                core.setFailed(`Failed to update status: ${error}`);
            }
        };
        setTimeout(updateStatus, 10000);
    }
    catch (error) {
        core.setFailed(`Action failed: ${error}`);
    }
}
run();
