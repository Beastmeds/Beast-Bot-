module.exports = {
  apps: [
    {
      name: "BeastBot",
      script: "/Users/nicolloyd/Library/Mobile Documents/com~apple~CloudDocs/Beast Bot/start-beast.sh",
      interpreter: "/bin/bash",
      cwd: "/Users/nicolloyd/Library/Mobile Documents/com~apple~CloudDocs/Beast Bot",
      watch: false,
      env: {
        NODE_ENV: "production"
      }
    }
  ]
}
