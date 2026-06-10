# AWS deploy — push to GitHub, auto-deploy to EC2

Your friend only needs to **edit code and push to `main`**. GitHub Actions copies the app to EC2, installs dependencies, and restarts the server.

## Architecture

```
git push main  →  GitHub Actions  →  rsync over SSH  →  EC2 (Node + PM2)
                                                          ↓
                                                    RDS PostgreSQL
```

## One-time setup (you do this once)

### 1. AWS resources


| Resource                    | Notes                                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **RDS**                     | PostgreSQL 16, database `veraglo_erp`, **not** publicly accessible                                                  |
| **EC2**                     | Ubuntu 22.04 or Amazon Linux 2023, `t3.small` is enough to start                                                    |
| **Security groups**         | EC2: SSH (22) from your IP; HTTP/HTTPS (80/443 or 3000) from users. RDS: port 5432 **only** from EC2 security group |
| **ALB + ACM** (recommended) | HTTPS in front of EC2 port 3000                                                                                     |


### 2. Bootstrap the EC2 instance

Pick **one** install path and use it everywhere (GitHub secret `EC2_APP_DIR`, `.env` location, and commands below).


| Layout                            | `EC2_APP_DIR` (GitHub secret) | Example `.env` path            |
| --------------------------------- | ----------------------------- | ------------------------------ |
| Clone in home (common)            | `/home/ubuntu/VeragloERP`     | `~/VeragloERP/server/.env`     |
| System path (default in workflow) | `/opt/veraglo-erp`            | `/opt/veraglo-erp/server/.env` |


**If you cloned in your home directory** (`ls` shows `VeragloERP` after SSH):

```bash
cd ~/VeragloERP
sudo VERAGLO_APP_DIR="$HOME/VeragloERP" VERAGLO_DEPLOY_USER="$USER" bash scripts/deploy/ec2-setup.sh
nano ~/VeragloERP/server/.env
```

**If you use `/opt/veraglo-erp` instead:**

```bash
sudo VERAGLO_APP_DIR=/opt/veraglo-erp bash scripts/deploy/ec2-setup.sh
sudo nano /opt/veraglo-erp/server/.env
```

`.env` contents (either path):

```env
DATABASE_URL=postgresql://USER:PASSWORD@your-db.xxxx.region.rds.amazonaws.com:5432/veraglo_erp
PORT=3000
CORS_ORIGIN=https://erp.yourcompany.com
```

Initialize the database once (adjust path if you cloned to home):

```bash
cd ~/VeragloERP/server && npm install && npm run db:init
# or: cd /opt/veraglo-erp/server && npm install && npm run db:init
```

### 3. SSH key for GitHub Actions

On your laptop:

```bash
ssh-keygen -t ed25519 -f veraglo-deploy -N ""
```

- Add `veraglo-deploy.pub` to `~/.ssh/authorized_keys` on the EC2 instance (for user `ubuntu` or `ec2-user`).
- Keep `veraglo-deploy` (private key) — you will paste it into GitHub secrets.

### 4. GitHub repository secrets

**Settings → Secrets and variables → Actions → New repository secret**


| Secret              | Value                                                                                                 |
| ------------------- | ----------------------------------------------------------------------------------------------------- |
| `EC2_HOST`          | EC2 public IP or DNS, e.g. `3.110.x.x` or `erp.yourcompany.com`                                       |
| `EC2_USER`          | `ubuntu` (Ubuntu AMI) or `ec2-user` (Amazon Linux)                                                    |
| `EC2_SSH_KEY`       | Full contents of the **private** key file (`veraglo-deploy`)                                          |
| `EC2_APP_DIR`       | **Required if not using `/opt/veraglo-erp`** — e.g. `/home/ubuntu/VeragloERP` when you cloned in home |
| `DEPLOY_HEALTH_URL` | *(optional)* `https://erp.yourcompany.com/api/health`                                                 |


### 5. First deploy

Push to `main`, or run manually: **Actions → Deploy — AWS (EC2) → Run workflow**.

Watch the workflow log. On the server:

```bash
pm2 status
curl -s http://localhost:3000/api/health
```

Expected: `"ok": true`, `"postgres": true`.

## Day-to-day (for your friend)

1. Change code locally.
2. `git commit` and `git push origin main`.
3. Wait ~1–2 minutes — deployment runs automatically.
4. Refresh the browser.

No SSH, no Docker, no manual steps on the server.

## Migrate data from a Windows `.exe` install

1. On the old PC: **Admin → Backup → Back up now** (downloads `.json`).
2. Copy the file to EC2 and import:

```bash
scp backup.json ubuntu@EC2_HOST:/tmp/
ssh ubuntu@EC2_HOST
cd ~/VeragloERP/server   # or /opt/veraglo-erp/server
npm run db:import -- /tmp/backup.json
pm2 restart veraglo-erp
```

## Troubleshooting


| Problem               | Fix                                                                                                                                                                                |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workflow fails at SSH | Check `EC2_HOST`, `EC2_USER`, `EC2_SSH_KEY`; security group allows SSH from GitHub IPs (or use a self-hosted runner in the VPC)                                                    |
| `Missing server/.env` | Create `~/VeragloERP/server/.env` (or your `EC2_APP_DIR`/server/.env) on EC2 — never commit it to git                                                                              |
| App won't start       | `pm2 logs veraglo-erp` — usually wrong `DATABASE_URL` or RDS security group                                                                                                        |
| `no encryption` / `pg_hba.conf` on deploy | RDS requires SSL; use a real `.rds.amazonaws.com` host in `DATABASE_URL` (SSL auto-enabled) or add `?sslmode=require` / `PG_SSL=true` |
| Health check fails    | ALB/target group must point to EC2 port 3000; app listens on all interfaces by default                                                                                             |
| GitHub SSH blocked    | GitHub-hosted runners use dynamic IPs — open SSH to `0.0.0.0/0` temporarily, or use a [self-hosted runner](https://docs.github.com/en/actions/hosting-your-own-runners) on the EC2 |


## Manual deploy on the server

```bash
bash ~/VeragloERP/scripts/deploy/deploy.sh
```

