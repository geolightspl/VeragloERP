#!/bin/bash
# Veraglo ERP Timeout Diagnostic Script
# Run this to diagnose timeout issues

echo "🔍 Veraglo ERP Timeout Diagnostic"
echo "=================================="
echo ""

# 1. Check if server is running
echo "1️⃣  Checking if server is running..."
if curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
  echo "✅ Server is running on port 3000"
else
  if curl -s http://localhost:3002/api/health > /dev/null 2>&1; then
    echo "✅ Server is running on port 3002"
  else
    echo "❌ Server is NOT running"
    echo "   Fix: npm run server:start"
  fi
fi

# 2. Check memory usage
echo ""
echo "2️⃣  Checking memory usage..."
FREE_MEM=$(free -h | awk 'NR==2 {print $7}')
USED_MEM=$(free -h | awk 'NR==2 {print $3}')
echo "   Used: $USED_MEM"
echo "   Available: $FREE_MEM"

if [[ $(free -m | awk 'NR==2 {print $7}') -lt 500 ]]; then
  echo "   ⚠️  Low memory available (< 500MB)"
  echo "   Consider: Increase server memory or close other apps"
fi

# 3. Check disk space
echo ""
echo "3️⃣  Checking disk space..."
DISK=$(df -h / | awk 'NR==2 {print $5}')
AVAIL=$(df -h / | awk 'NR==2 {print $4}')
echo "   Used: $DISK"
echo "   Available: $AVAIL"

if [[ $(df / | awk 'NR==2 {print $5}' | sed 's/%//') -gt 90 ]]; then
  echo "   ⚠️  Disk > 90% full"
  echo "   Consider: Cleanup old files or snapshots"
fi

# 4. Check if Docker is running
echo ""
echo "4️⃣  Checking Docker containers..."
if command -v docker &> /dev/null; then
  POSTGRES=$(docker ps 2>/dev/null | grep -c postgres)
  if [[ $POSTGRES -gt 0 ]]; then
    echo "✅ PostgreSQL container is running"
  else
    echo "⚠️  PostgreSQL container is not running"
    echo "   If using Docker Postgres: docker compose up -d"
  fi
else
  echo "ℹ️  Docker not installed (using file storage mode)"
fi

# 5. Check Node processes
echo ""
echo "5️⃣  Checking Node.js processes..."
NODE_PROCS=$(pgrep -f "node.*index.js" | wc -l)
if [[ $NODE_PROCS -gt 0 ]]; then
  echo "✅ Node.js server process is running"
  pgrep -f "node.*index.js" | xargs ps aux | grep -v grep | head -1
else
  echo "❌ Node.js server process is NOT running"
fi

# 6. Check file storage size
echo ""
echo "6️⃣  Checking file storage size..."
if [[ -d "/home/ubuntu/VeragloERP/data" ]]; then
  SIZE=$(du -sh /home/ubuntu/VeragloERP/data 2>/dev/null | cut -f1)
  echo "   File storage size: $SIZE"
  if [[ ${SIZE%M} -gt 100 ]] || [[ ${SIZE%G} -gt 0 ]]; then
    echo "   ⚠️  Large file storage detected"
    echo "   Recommendation: Use PostgreSQL instead"
  fi
else
  echo "ℹ️  Using PostgreSQL (no file storage)"
fi

# 7. Test API response time
echo ""
echo "7️⃣  Testing API response time..."
START=$(date +%s%N | cut -b1-13)
if curl -s http://localhost:3000/api/health > /dev/null 2>&1 || \
   curl -s http://localhost:3002/api/health > /dev/null 2>&1; then
  END=$(date +%s%N | cut -b1-13)
  RESPONSE_TIME=$((END - START))
  echo "   Response time: ${RESPONSE_TIME}ms"
  
  if [[ $RESPONSE_TIME -gt 1000 ]]; then
    echo "   ⚠️  Slow response (> 1000ms)"
    echo "   Could be: Slow DB, network issue, or high server load"
  fi
else
  echo "❌ Cannot connect to server"
fi

# 8. Check network ports
echo ""
echo "8️⃣  Checking if ports are in use..."
for port in 3000 3002 5432 26055; do
  if lsof -i :$port 2>/dev/null | grep -q LISTEN; then
    echo "✅ Port $port is in use"
  else
    if [[ $port == "3000" ]] || [[ $port == "3002" ]]; then
      echo "⚠️  Port $port is NOT in use (server might be down)"
    fi
  fi
done

# 9. Summary and recommendations
echo ""
echo "📋 Summary & Recommendations:"
echo "=============================="

if curl -s http://localhost:3000/api/health > /dev/null 2>&1 || \
   curl -s http://localhost:3002/api/health > /dev/null 2>&1; then
  echo "✅ Server is healthy"
  if [[ $(free -m | awk 'NR==2 {print $7}') -lt 500 ]]; then
    echo "⚠️  Action: Free up memory"
  fi
  if [[ $(df / | awk 'NR==2 {print $5}' | sed 's/%//') -gt 90 ]]; then
    echo "⚠️  Action: Cleanup disk space"
  fi
else
  echo "❌ Server is not responding"
  echo ""
  echo "Quick fixes to try:"
  echo "1. Restart server:"
  echo "   cd /workspace && npm run server:start"
  echo ""
  echo "2. If using Docker, restart containers:"
  echo "   docker compose down && docker compose up -d"
  echo ""
  echo "3. Check logs for errors:"
  echo "   npm run server:start 2>&1 | tee server.log"
fi

echo ""
echo "📖 For more help, see docs/TROUBLESHOOT-TIMEOUTS.md"
