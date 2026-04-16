# AWS Free Tier Deployment Guide

Personal use (1-2 users). Everything runs on a single t2.micro EC2 instance via docker-compose.
Free for 12 months. Set a calendar reminder at month 11 to migrate to Oracle Cloud.

---

## PART 1 — AWS Account Setup

### 1. Create Account
- Go to https://aws.amazon.com → Create account
- Use a new email (personal or new Gmail)
- Credit card required — will NOT be charged if you stay within free tier
- Choose **Basic support (Free)**

### 2. Set Billing Alert (IMPORTANT — do this first)
- Go to **Billing Dashboard** → **Budgets** → **Create Budget**
- Choose: Zero spend budget (alerts you the moment anything costs money)
- Email: your email
- This protects you from accidental charges

### 3. Set Region
- Top right corner → select **US East (N. Virginia) us-east-1**
- This region has the best free tier availability

---

## PART 2 — Launch EC2 Instance

### 4. Launch t2.micro
- Go to **EC2** → **Launch Instance**
- Name: `job-search`
- AMI: **Ubuntu Server 22.04 LTS** (Free tier eligible)
- Instance type: **t3.micro** (Free tier eligible)
- Key pair: Click **Create new key pair**
  - Name: `job-search-key`
  - Type: RSA
  - Format: .pem
  - **Download and save this file somewhere safe — you cannot get it again**

### 5. Configure Security Group
Under **Network settings** → **Create security group**, add these rules:

| Type | Protocol | Port | Source |
|------|----------|------|--------|
| SSH | TCP | 22 | My IP (select from dropdown) |
| HTTP | TCP | 80 | Anywhere (0.0.0.0/0) |
| HTTPS | TCP | 443 | Anywhere (0.0.0.0/0) |

### 6. Storage
- Change from 8GB to **20GB** (still within free tier)

### 7. Launch
- Click **Launch Instance**
- Wait ~2 minutes for it to start

### 8. Allocate Elastic IP (Static IP)
Without this your IP changes every reboot.
- Go to **EC2** → **Elastic IPs** → **Allocate Elastic IP address** → **Allocate**
- Select the new IP → **Actions** → **Associate Elastic IP**
- Select your instance → **Associate**
- Note down this IP address — this is your server's permanent IP

---

## PART 3 — Server Setup

### 9. SSH Into the Server
```bash
# Fix key permissions (required on Mac/Linux)
chmod 400 ~/Downloads/job-search-key.pem

# Connect
ssh -i ~/Downloads/job-search-key.pem ubuntu@YOUR_ELASTIC_IP
```

On Windows use PuTTY or Windows Terminal with the same command.

### 10. Install Docker
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker ubuntu

# Install Docker Compose plugin
sudo apt install docker-compose-plugin -y

# Log out and back in for group changes to take effect
exit
# SSH back in
ssh -i ~/Downloads/job-search-key.pem ubuntu@YOUR_ELASTIC_IP
```

### 11. Add Swap File (prevents OOM on 1GB RAM)
```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### 12. Install Nginx + Certbot
```bash
sudo apt install nginx certbot python3-certbot-nginx -y
```

### 13. Clone the Repo
```bash
cd /home/ubuntu
git clone https://github.com/atharvab1902/job-search.git
cd job-search
```

### 14. Create .env File
```bash
nano backend/.env
```

Paste this (fill in your values):
```env
DATABASE_URL=postgresql://jobsearch:CHOOSE_A_PASSWORD@db:5432/jobsearch
JWT_SECRET=CHOOSE_A_LONG_RANDOM_STRING_AT_LEAST_32_CHARS
NODE_ENV=production
PORT=3001
```

To generate a good JWT secret:
```bash
openssl rand -base64 32
```

### 15. Update docker-compose for Production
The docker-compose.yml already works. Just make sure the DB password matches what you set in .env:
```bash
# Check that POSTGRES_PASSWORD in docker-compose.yml matches your DATABASE_URL password
cat docker-compose.yml | grep POSTGRES_PASSWORD
```

### 16. Start the App
```bash
docker compose up -d --build
```

First build takes ~5-10 minutes (downloads Claude + Gemini CLIs).

Check it's running:
```bash
docker compose ps
curl http://localhost:3001/api/health
```

---

## PART 4 — Domain + SSL (Optional but Recommended)

### 17. Get a Domain (Optional)
- Free option: Get a free subdomain from https://freedns.afraid.org
- Cheap option: .xyz domains on Namecheap ~$1/year
- Point an A record to your Elastic IP

If you skip this, access the app directly via `http://YOUR_ELASTIC_IP`

### 18. Configure Nginx
```bash
sudo nano /etc/nginx/sites-available/job-search
```

Paste (replace `yourdomain.com` with your domain or Elastic IP):
```nginx
server {
    listen 80;
    server_name yourdomain.com;

    # Frontend
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Backend API
    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 900s;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/job-search /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 19. SSL Certificate (only if you have a domain)
```bash
sudo certbot --nginx -d yourdomain.com
```

Free SSL from Let's Encrypt, auto-renews every 90 days.

---

## PART 5 — GitHub Actions Auto-Deploy

Every push to `main` will automatically deploy to your server.

### 20. Add GitHub Secrets
Go to your GitHub repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

Add these 3 secrets:
| Name | Value |
|------|-------|
| `AWS_HOST` | Your Elastic IP |
| `AWS_USERNAME` | `ubuntu` |
| `AWS_SSH_KEY` | Contents of your .pem file (open it in notepad, copy everything) |

### 21. Create GitHub Actions Workflow
```bash
# On your LOCAL machine (not the server)
mkdir -p .github/workflows
```

Create `.github/workflows/deploy.yml`:
```yaml
name: Deploy to AWS

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy via SSH
        uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.AWS_HOST }}
          username: ${{ secrets.AWS_USERNAME }}
          key: ${{ secrets.AWS_SSH_KEY }}
          script: |
            cd /home/ubuntu/job-search
            git pull origin main
            docker compose up -d --build
          command_timeout: 20m
```

Commit and push this file — every future push to `main` auto-deploys.

---

## PART 6 — Gmail MCP (Required for Email Sync)

The Gmail MCP credentials need to be on the server.

```bash
# On the server, create the credentials directory
mkdir -p /home/ubuntu/.gmail-mcp

# Copy your local credentials to the server
# Run this on your LOCAL machine:
scp -i ~/Downloads/job-search-key.pem \
  ~/.gmail-mcp/gcp-oauth.keys.json \
  ubuntu@YOUR_ELASTIC_IP:/home/ubuntu/.gmail-mcp/

scp -i ~/Downloads/job-search-key.pem \
  ~/.gmail-mcp/credentials.json \
  ubuntu@YOUR_ELASTIC_IP:/home/ubuntu/.gmail-mcp/
```

---

## PART 7 — Maintenance

### Check logs
```bash
docker compose logs -f backend    # backend logs
docker compose logs -f db         # database logs
```

### Restart everything
```bash
docker compose restart
```

### Update manually
```bash
cd /home/ubuntu/job-search
git pull origin main
docker compose up -d --build
```

### Free up disk space (run monthly)
```bash
docker system prune -f
```

### Monitor free tier usage
- Go to AWS Console → **Billing** → **Free Tier**
- Check monthly that EC2 and data transfer stay under limits

---

## Cost Breakdown (12 months free)

| Service | Free Tier | Your Usage |
|---------|-----------|------------|
| EC2 t2.micro | 750 hrs/month | ~744 hrs (always on) ✅ |
| EBS Storage | 30 GB | 20 GB ✅ |
| Data Transfer Out | 1 GB/month | <1 GB personal use ✅ |
| **Total** | **$0** | **$0** |

After 12 months → migrate to Oracle Cloud Always Free (same setup, just a different server).

---

## Quick Reference

```bash
# SSH into server
ssh -i ~/Downloads/job-search-key.pem ubuntu@YOUR_ELASTIC_IP

# Check app status
curl http://localhost:3001/api/health

# View live logs
docker compose logs -f

# Restart app
docker compose restart

# Full redeploy
git pull && docker compose up -d --build
```
