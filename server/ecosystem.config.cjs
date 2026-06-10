/** PM2 process file — used by scripts/deploy/deploy.sh on EC2 */
module.exports = {
  apps: [
    {
      name: "veraglo-erp",
      script: "index.js",
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "600M",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
