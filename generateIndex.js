const fs = require('fs');
const config = require('./config.json');

let headers = {
    'Authorization': process.env.GITHUB_TOKEN,
};

async function getRepos(url) {
    try {
        const response = await fetch(url, { headers });
        if (!response.ok) {
            const errorDetails = await response.text(); // Capture response body for detailed error logging
            throw new Error(`Failed to fetch repositories ${url} - Status: ${response.status} - Response: ${errorDetails}`);
        }
        const repos = await response.json();
        return repos.map(repo => ({
            name: repo.name,
            full_name: repo.full_name,
            owner: repo.full_name.replace(`/${repo.name}`, ''),
            owner_url: repo.html_url.replace(`/${repo.name}`, ''),
            description: repo.description,
            contributors_url: repo.contributors_url,
            pushed_at: repo.pushed_at,
        }));
    } catch (error) {
        console.error(`Error fetching repository ${url}`, error);
        return [];
    }
}

async function appendRepoContributers(repos) {
    await Promise.all(repos.map(async (repo) => {
        if (repo.contributors_url) {
            try {
                const contributorsResponse = await fetch(repo.contributors_url);
                if (!contributorsResponse.ok) {
                    const errorDetails = await contributorsResponse.text();
                    throw new Error(`Failed to fetch contributors for ${repo.name} - Status: ${contributorsResponse.status} - Response: ${errorDetails}`);
                }
                repo.contributorsList = (await contributorsResponse.json())
                    .map(contributor => ({
                        avatar_url: contributor.avatar_url,
                        login: contributor.login,
                        html_url: contributor.html_url,
                    }));
            } catch (error) {
                console.error(`Error fetching contributors ${repo.name} ${repo.contributors_url}`, error);
                repo.contributorsList = [];
            }
        }
        repo.contributorsList = repo.contributorsList || [];
    }));
}

async function fetchRepositories() {
    try {
        const reposPromises = config.fetchConfigs.map(({ orgOrUser, isUser }) =>
            getRepos(`https://api.github.com/${isUser ? "users" : "orgs"}/${orgOrUser}/repos?sort=pushed`)
        );
        const allRepos = (await Promise.all(reposPromises))
            .flat()
            .filter(repo => repo); // Remove any null or undefined results
        allRepos.sort((a, b) => new Date(b.pushed_at) - new Date(a.pushed_at));
        return allRepos;
    } catch (error) {
        console.error("Error fetching repositories:", error);
        return [];
    }
}

async function modifyHTML() {
    const repos = await fetchRepositories();
    await appendRepoContributers(repos);
    let indexContent = fs.readFileSync('./index.html', 'utf-8');
    indexContent = indexContent.replace(`SET_TITLE`, config.title);
    indexContent = indexContent.replace(`SET_REPO_JSON`, JSON.stringify(repos, undefined, 4));
    fs.writeFileSync('./_site/index.html', indexContent);
    console.log('index.html generated successfully!');
}

modifyHTML();
