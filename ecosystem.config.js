module.exports = {
  apps: [
    {
      name: "uptime-monitor",
      script: ".output/server/index.mjs",
      args: "start",
      env: {
        PORT: Number(process.env.PORT) || 4003
      }
    }
  ]
}
