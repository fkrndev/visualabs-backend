module.exports = {
  apps: [
    {
      name: "vims",
      script: "bun",
      args: "run src/index.ts",
      env: {
        NODE_ENV: "production",
        PORT: 2024,
        TZ: "Asia/Jakarta",
      },
      watch: false,
      max_memory_restart: "512M",
      error_file: "./logs/error.log",
      out_file: "./logs/out.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      max_restarts: 10,
      min_uptime: "10s",
      restart_delay: 5000,
    },
  ],
};
