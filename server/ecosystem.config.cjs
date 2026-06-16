/** PM2 process file — used by scripts/deploy/deploy.sh on EC2 */
module.exports = {
  apps: [
    {
      name: "veraglo-erp",
      script: "index.js",
      cwd: __dirname,
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "600M",
      env: {
        NODE_ENV: "production",
        HOST: "0.0.0.0",
        PORT: "3000",
        USE_FILE_STORAGE: "1",
      },
    },
  ],
};
