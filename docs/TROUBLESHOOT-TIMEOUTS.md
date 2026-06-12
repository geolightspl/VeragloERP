# ERP Timeout Troubleshooting Guide

## Common Timeout Issues & Solutions

Your ERP can timeout for several reasons. This guide helps diagnose and fix them.

---

## 1. **Server Not Running**

### Symptoms
- ❌ "Connection refused" or "Cannot connect to server"
- ❌ `curl http://localhost:3000` returns "Connection refused"
- ❌ White screen when opening app

### Quick Fix
```bash
# Check if server is running
ps aux | grep node

# Start the server
cd /workspace
npm run server:start

# Or with Docker + Postgres
npm run dev

# Or manual start
cd server && npm start
```

### Verify
```bash
curl http://localhost:3000/api/health
# Should return JSON with "ok": true
```

---

## 2. **Slow Database Queries (PostgreSQL)**

### Symptoms
- ⏱️ App works but is very slow
- ⏱️ Specific pages timeout (e.g., Sales, Customer list)
- ⏱️ First load is slow, then fast

### Diagnosis
```bash
# Check if Postgres is running
docker ps | grep postgres

# Check Postgres logs
docker compose logs postgres --tail 50

# Connect to Postgres and run slow query log
docker exec -it veraglo-erp-postgres psql -U postgres -d veraglo

# Inside postgres:
SHOW log_min_duration_statement;  -- Check slow query threshold
SELECT pid, usename, query FROM pg_stat_statements ORDER BY mean_time DESC LIMIT 10;
```

### Solutions

**Option A: Increase Connection Pool Size**
```bash
# Edit server/.env
PG_POOL_MAX=20  # Default is 10
```

**Option B: Add Database Indexes**
```bash
# Run in postgres shell
CREATE INDEX idx_customers_gstin ON customers(gstin);
CREATE INDEX idx_enquiries_status ON enquiries(status);
CREATE INDEX idx_quotations_customer ON quotations(customer_id);
```

**Option C: Check Table Sizes**
```sql
SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) 
FROM pg_tables 
WHERE schemaname='public' 
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

---

## 3. **File Storage Mode Slowness**

### Symptoms
- 🐢 Using `USE_FILE_STORAGE=1` (no Docker Postgres)
- 📁 Large data file (>50MB) causes timeouts
- 💾 File keeps growing but performance degrades

### Diagnosis
```bash
# Check file storage location
ls -lh /home/ubuntu/VeragloERP/data  # Or wherever data is stored

# Check file size
du -sh /home/ubuntu/VeragloERP/data/state.json

# Check available disk space
df -h
```

### Solutions

**Option A: Enable PostgreSQL**
```bash
# Stop current server
sudo docker compose up -d

# Restart with Postgres (recommended)
npm run dev
```

**Option B: Archive Old Data**
```bash
# In server directory
npm run db:snapshot "Archive backup $(date +%Y-%m-%d)"
```

**Option C: Cleanup Browser Cache**
```bash
# Clear IndexedDB in browser DevTools
# Or use the Backup & Restore admin tool
```

---

## 4. **High Memory Usage**

### Symptoms
- 💾 "Out of memory" error
- ⚠️ Server crashes randomly
- 🔴 Server stops responding after a few hours

### Diagnosis
```bash
# Check memory usage
free -h
top -p $(pgrep -f "node.*index.js")

# Check for memory leaks in logs
docker compose logs server | grep -i "memory\|gc\|heap"
```

### Solutions

**Option A: Increase Node Memory**
```bash
# Edit server package.json
"start": "node --max-old-space-size=2048 index.js"  # 2GB

# Or via environment
NODE_OPTIONS=--max-old-space-size=2048 npm start
```

**Option B: Restart Server Regularly**
```bash
# Add cron job to restart server daily
0 2 * * * /path/to/restart-server.sh
```

**Option C: Reduce Concurrent Connections**
```bash
# Edit server/.env
PG_POOL_MAX=5  # Reduce from 10
```

---

## 5. **Network Issues**

### Symptoms
- 🌐 App loads partially, then hangs
- 📡 "Network request timeout"
- 🔗 Some API calls work, others fail

### Diagnosis
```bash
# Check network connectivity
ping -c 3 8.8.8.8

# Check if ports are open
netstat -tlnp | grep 3000  # ERP
netstat -tlnp | grep 5432  # Postgres
netstat -tlnp | grep 26055 # Cursor server

# Test API endpoints
curl -w "\nResponse time: %{time_total}s\n" http://localhost:3000/api/health
```

### Solutions

**Option A: Increase Request Timeout**
```bash
# Edit server/index.js
app.use(express.json({ limit: "50mb" }));  // Increase from 25mb
app.use(express.urlencoded({ limit: "50mb" }));
```

**Option B: Check Firewall**
```bash
# Allow port 3000 (if behind firewall)
sudo ufw allow 3000
sudo ufw allow 5432
```

**Option C: Use HTTP/2**
```bash
# For better performance on slow networks
# Already enabled in modern browsers
```

---

## 6. **Browser-Side Timeouts**

### Symptoms
- ⏳ Page says "Loading..." but API responds OK
- 📊 Networks tab shows request hangs
- 🔄 Some pages load, others timeout

### Diagnosis
```bash
# Open browser DevTools (F12)
# Go to Network tab
# Check:
  - Response times
  - Request size
  - Status codes (200 vs 504)
# Check Console for JavaScript errors
```

### Solutions

**Option A: Clear Browser Cache**
```bash
# Press Ctrl+Shift+Delete (Windows) or Cmd+Shift+Delete (Mac)
# Clear all browsing data
# Restart browser
```

**Option B: Increase Browser Timeout**
```javascript
// In browser console (F12)
// Set timeout for fetch requests
const timeout = (ms) => new Promise(resolve => setTimeout(resolve, ms));
```

**Option C: Check Browser Extensions**
```
- Disable ad blockers (especially uBlock Origin)
- Disable VPN extensions
- Disable proxy extensions
```

---

## 7. **Large Dataset Operations**

### Symptoms
- 📦 Bulk import hangs
- 📊 Large report export times out
- 📈 Query with 100k+ records hangs

### Solutions

**Option A: Implement Pagination**
```bash
# Most list views already paginate (75 rows per page)
# Check Admin → Reports for dataset size
```

**Option B: Use Batch Processing**
```bash
# For bulk operations:
# 1. Split into chunks of 100-500 records
# 2. Process sequentially with progress updates
# 3. Add progress bar for user feedback
```

**Option C: Increase Server Timeouts**
```bash
# Add to server/index.js after app creation
app.use((req, res, next) => {
  req.setTimeout(300000); // 5 minutes
  next();
});
```

---

## 8. **Docker/Database Issues**

### Symptoms
- 🐳 Docker containers keep stopping
- 🗄️ Postgres connection refused
- 🔓 "FATAL: password authentication failed"

### Diagnosis
```bash
# Check Docker status
docker compose ps

# Check container logs
docker compose logs

# Check Postgres specifically
docker compose logs postgres --tail 100

# Verify connectivity
docker exec veraglo-erp-postgres psql -U postgres -c "SELECT 1"
```

### Solutions

**Option A: Restart Docker**
```bash
cd /workspace
docker compose down
docker compose up -d
npm run server:install
npm run server:start
```

**Option B: Reset Postgres**
```bash
# Remove and recreate database
docker compose down -v  # -v removes volumes
docker compose up -d
npm run db:init
```

**Option C: Check Memory for Docker**
```bash
# Docker settings (macOS/Windows)
# Give Docker more memory: 4GB minimum, 8GB+ recommended

# Linux - check directly
free -h
```

---

## 9. **Email Integration Timeouts**

### Symptoms
- 📧 Email sync hangs
- ⏰ IMAP connection timeout
- 🔌 "Connection reset" from email provider

### Solutions

**Option A: Reduce Sync Frequency**
```bash
# Admin → Email Integration
# Set sync frequency to 30+ minutes (not 5)
```

**Option B: Disable Auto-Create Temporarily**
```bash
# Admin → Email Integration → Settings
# Toggle "Auto-create enquiry" OFF
# Process emails manually
```

**Option C: Check Email Credentials**
```bash
# Verify:
- Email address is correct
- App password (not account password)
- IMAP/SMTP ports are correct
- 2FA is enabled for app passwords
```

---

## 10. **Production Server Timeouts**

### Symptoms
- 🌍 App times out on production but not locally
- 📍 Only happens during high traffic
- 🚀 Performance degrades over time

### Solutions

**Option A: Monitor Resources**
```bash
# SSH into production server
ssh ubuntu@13.203.208.226

# Check resources
top
free -h
df -h
```

**Option B: Increase Server Resources**
```bash
# Scale up instance type on AWS/cloud provider
# Add more CPU cores
# Add more RAM (8GB → 16GB)
```

**Option C: Enable Caching**
```bash
# Add Redis or Memcached
# Cache list endpoints
# Reduce database queries
```

**Option D: Load Balancer**
```bash
# Run multiple server instances
# Use nginx or AWS ALB as load balancer
# Distribute traffic across instances
```

---

## Quick Reference Card

| Issue | Cause | Fix |
|-------|-------|-----|
| 🔴 Cannot connect | Server not running | `npm run server:start` |
| ⏱️ Very slow | Slow DB queries | Increase PG pool, add indexes |
| 💾 Disk full | Large file storage | Use Postgres, cleanup |
| 💥 Memory error | Memory leak | Increase Node memory limit |
| 🌐 API timeout | Network issue | Check firewall, increase timeout |
| 📊 Large data | Too many records | Implement pagination |
| 🐳 Docker fails | Container issue | `docker compose restart` |
| 📧 Email hangs | IMAP issue | Check credentials, reduce frequency |
| 🚀 Production slow | High traffic | Scale resources, add load balancer |

---

## Advanced Debugging

### Enable Detailed Logging
```bash
# Set environment variables
DEBUG=* npm start
NODE_DEBUG=http npm start

# Or add to .env
LOG_LEVEL=debug
```

### Check PostgreSQL Query Log
```bash
docker exec veraglo-erp-postgres psql -U postgres -d veraglo <<EOF
ALTER SYSTEM SET log_min_duration_statement = 100;  -- Log queries > 100ms
SELECT pg_reload_conf();
EOF
```

### Profile Node.js Performance
```bash
# Use clinic.js for profiling
npm install -g clinic
clinic doctor -- npm start
```

### Monitor with Activity Monitor (macOS)
```bash
# Open Activity Monitor
# Sort by CPU or Memory
# Identify heavy processes
```

---

## Prevention Tips

✅ **Do This:**
- Monitor server logs regularly
- Set up alerting for errors
- Regularly backup database
- Keep dependencies updated
- Use PostgreSQL for >50MB data
- Add indexes to frequently queried columns

❌ **Avoid This:**
- Storing too much data in single file
- Running without monitoring
- Changing system files without backup
- Using weak database credentials
- Ignoring browser console errors
- Running low on disk space

---

## Still Having Issues?

1. **Check logs first:**
   ```bash
   npm run server:start 2>&1 | tee server.log
   tail -f server.log
   ```

2. **Check health endpoint:**
   ```bash
   curl http://localhost:3000/api/health
   ```

3. **Try fresh restart:**
   ```bash
   docker compose down
   docker compose up -d
   npm run server:install
   npm run server:start
   ```

4. **Report with details:**
   - Server logs
   - Browser console errors
   - System resources (free, df -h)
   - Which endpoint times out
   - When it started happening
