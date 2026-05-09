module.exports = {
  apps: [
    {
      name: "uptime-monitor",
      script: "yarn",
      args: "start",
      env: {
        PORT: Number(process.env.PORT) || 4003
      }
    }
  ]
}