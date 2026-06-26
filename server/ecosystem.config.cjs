/** PM2 process file — run from repo root: pm2 start server/ecosystem.config.cjs */
module.exports = {
    apps: [{
        name: "currency-safe",
        cwd: __dirname,
        script: "index.js",
        instances: 1,
        autorestart: true,
        watch: false,
        max_memory_restart: "300M",
        env: {
            NODE_ENV: "production",
            PORT: 8787
        }
    }]
};
