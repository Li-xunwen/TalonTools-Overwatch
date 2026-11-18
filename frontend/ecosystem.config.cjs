module.exports = {
  apps: [{
    name: 'frontend-https',
    cwd: './',
    script: 'npm',
    args: 'run dev -- --host 127.0.0.1 --https --cert /ssl/cert.pem --key /ssl/cert.key',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'development'
    }
  }]
};
