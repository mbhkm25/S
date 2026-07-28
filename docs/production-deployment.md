# SANAD production deployment

Production is deployed only from `main` to:

- Server repository: `/opt/sanad-app`
- Published web root: `/var/www/app.sanadflow.com/html`
- Backups: `/var/backups/sanad-app`
- Health URL: `https://app.sanadflow.com`

## One-time setup

### 1. Generate a dedicated deployment key

Run locally:

```bash
ssh-keygen -t ed25519 -C "sanad-github-actions-production" -f sanad-production-deploy -N ""
```

Never commit either key.

### 2. Configure the server

After this branch is merged and the server has pulled `main`, log in as root and run:

```bash
cd /opt/sanad-app
git fetch origin main
git checkout main
git pull --ff-only origin main
bash scripts/bootstrap-production-deploy.sh "$(cat /path/to/sanad-production-deploy.pub)"
```

The bootstrap creates the restricted user `sanad-deploy`, installs a root-owned deployment wrapper, and grants sudo access only to that wrapper.

### 3. Add GitHub Environment secrets

Create an Environment named `production` and add:

- `PRODUCTION_HOST`: `178.105.224.195`
- `PRODUCTION_PORT`: `22`
- `PRODUCTION_USER`: `sanad-deploy`
- `PRODUCTION_SSH_KEY`: contents of the private key `sanad-production-deploy`
- `PRODUCTION_KNOWN_HOSTS`: output of:

```bash
ssh-keyscan -H 178.105.224.195
```

Verify the host fingerprint independently before saving it.

## Deploy

From GitHub:

`Actions → Deploy SANAD Production → Run workflow`

Or with GitHub CLI:

```bash
gh workflow run deploy-production.yml --ref main
```

To deploy a specific commit already contained in `main`:

```bash
gh workflow run deploy-production.yml --ref main -f commit_sha=<FULL_40_CHARACTER_SHA>
```

Watch the run:

```bash
gh run watch
```

## Safety behavior

The workflow and server script enforce:

- deployment from `main` only;
- a full expected commit SHA;
- TypeScript, route checks, and production build before SSH deployment;
- one deployment at a time;
- refusal to deploy when the server repository has uncommitted changes;
- `npm ci` from the lockfile;
- backup before replacing production files;
- Nginx configuration validation;
- HTTP and HTML health checks;
- automatic rollback if failure occurs after publication starts;
- retention of the latest 10 backups;
- release markers in `.sanad-release` and `.sanad-deployed-at`.

## Manual server fallback

As root:

```bash
/usr/local/sbin/sanad-deploy-production <FULL_MAIN_SHA>
```

Do not invoke `scripts/deploy-production.sh` directly from GitHub Actions. The root-owned wrapper validates the SHA and is the only command allowed by sudo.
