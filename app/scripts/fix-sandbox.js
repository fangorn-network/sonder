console.log("It was called tho")
console.log(process.platform)
if (process.platform === 'linux') {
  const { execSync } = require('child_process');
  execSync('sudo chown root:root node_modules/electron/dist/chrome-sandbox && sudo chmod 4755 node_modules/electron/dist/chrome-sandbox', { stdio: 'inherit' });
}