#!/usr/bin/env node

const {Octokit} = require("@octokit/rest");
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ignore = require('ignore');
const { execSync } = require('child_process');

const github = new Octokit({auth: process.env.GITHUB_ACCESS_TOKEN});

// Detect if being run directly from the CLI
if (require.main === module) {
    console.log("Hello from", "cute-github-init!");
    createGithubRepoAndUploadNoOverwrite();
} else {
    module.exports = {createGithubRepoAndUploadNoOverwrite};
}

async function createGithubRepoAndUploadNoOverwrite(randomRepoName = false, dirPath = ".") {
    let name;
    if (randomRepoName) {
        name = crypto.randomBytes(2).toString('hex');
    } else {
        name = path.basename(path.resolve(dirPath));
    }


    try {
        console.log(`Creating repository: ${name} from ${dirPath}`);
        const repo = await github.repos.createForAuthenticatedUser({name});

        const ig = getGitignoreParser(dirPath);

        console.log(`Uploading contents to repository: ${repo.data.full_name}`);
        await uploadDirectory(repo.data.full_name, dirPath, '', ig);
        console.log(`Completed uploading contents to https://github.com/${repo.data.full_name}`);
        await initializeGit(dirPath, repo.data.full_name);
        console.log(`Added .git`);
        return true;
    } catch (error) {
        console.error('Error in createAndUploadRepo:', error);
        return false;
    }
}

function getGitignoreParser(dirPath) {
    const gitignorePath = path.join(dirPath, '.gitignore');
    let ig = ignore();
    if (fs.existsSync(gitignorePath)) {
        const gitignore = fs.readFileSync(gitignorePath, 'utf8');
        ig = ignore().add(gitignore);
    }
    return ig;
}

async function uploadDirectory(repoName, dirPath, currentPath, ig) {
    console.log(`Uploading directory: ${dirPath}`);
    const files = fs.readdirSync(dirPath, {withFileTypes: true});

    for (const file of files) {
        const filePath = path.join(dirPath, file.name);

        if (ig.ignores(filePath.replace(dirPath + '/', ''))) continue;

        if (file.isFile()) {
            await uploadFile(repoName, filePath, path.join(currentPath, file.name));
        } else if (file.isDirectory()) {
            console.log(`Entering directory: ${filePath}`);
            await uploadDirectory(repoName, filePath, path.join(currentPath, file.name), ig);
        }
    }
}

async function uploadFile(repoName, filePath, gitPath) {
    const content = fs.readFileSync(filePath, 'base64');
    const message = `Adding file ${gitPath}`;

    try {
        console.log(`Uploading file ${gitPath} to repository`);
        await github.repos.createOrUpdateFileContents({
            owner: repoName.split('/')[0],
            repo: repoName.split('/')[1],
            path: gitPath,
            message: message,
            content: content,
            branch: 'main' // Assuming 'main' is the default branch
        });
        console.log(`File uploaded successfully: ${gitPath}`);
    } catch (error) {
        console.error(`Error uploading file ${gitPath}:`, error);
    }
}

async function initializeGit(dirPath, repoFullName) {
    try {
        // Navigate to the project directory
        process.chdir(dirPath);

        // Initialize a new git repository
        execSync('git init');

        // Add the remote repository
        execSync(`git remote add origin https://github.com/${repoFullName}.git`);

        // Fetch the data from the remote repository
        execSync('git fetch');

        execSync('git reset --hard origin/main');

        // Pull the latest changes from the remote repository
        execSync('git pull origin main');

        console.log('Git repository initialized and linked to remote.');
    } catch (error) {
        console.error('Error initializing git:', error);
    }
}

