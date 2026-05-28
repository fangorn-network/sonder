const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

try {
  console.log('📦 1/4: Running electron-vite production compilation...');
  execSync('pnpm run build', { stdio: 'inherit' });

  console.log('📂 2/4: Setting up isolated environment targets...');
  const buildTarget = path.join(__dirname, 'build-target');
  
  // Wipe out any stale environments
  if (fs.existsSync(buildTarget)) {
    fs.rmSync(buildTarget, { recursive: true, force: true });
  }
  fs.mkdirSync(buildTarget, { recursive: true });

  // Copy bundled distribution assets
  if (fs.existsSync(path.join(__dirname, 'out'))) {
    fs.cpSync(path.join(__dirname, 'out'), path.join(buildTarget, 'out'), { recursive: true });
  } else if (fs.existsSync(path.join(__dirname, 'dist'))) {
    // If your config outputs to dist instead of out
    fs.cpSync(path.join(__dirname, 'dist'), path.join(buildTarget, 'out'), { recursive: true });
  }

  // Copy local deployment assets
  if (fs.existsSync(path.join(__dirname, '.env'))) {
    fs.copyFileSync(path.join(__dirname, '.env'), path.join(buildTarget, '.env'));
  }

  console.log('📝 3/4: Injecting clean deployment configurations...');
  // Strip out package dependencies entirely
  const pkg = require('./package.json');
  pkg.dependencies = {};
  fs.writeFileSync(path.join(buildTarget, 'package.json'), JSON.stringify(pkg, null, 2));

  // Build isolated configuration rules
  const builderConfig = {
    nodeModulesFromDependencies: false,
    npmRebuild: false,
    electronVersion: '39.8.9',
    asar: true,
    win: {
      executableName: 'SOND3R'
    },
    extraResources: [
      { from: 'out/main/toolboxes', to: 'toolboxes' },
      { from: '.env', to: '.env' }
    ],
    files: [
      'out/**/*',
      'package.json'
    ],
    electronDownload: {
      mirror: 'https://npmmirror.com/mirrors/electron/'
    }
  };
  fs.writeFileSync(path.join(buildTarget, 'electron-builder.json'), JSON.stringify(builderConfig, null, 2));

  console.log('🚀 4/4: Executing electron-builder asset assembly...');
  // Run directly within the clean workspace context
  execSync(`pnpm electron-builder --win --projectDir "${buildTarget}" --config "${path.join(buildTarget, 'electron-builder.json')}"`, {
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'production' }
  });

  // Extract the artifact files back out safely
  if (fs.existsSync(path.join(buildTarget, 'dist'))) {
    if (fs.existsSync(path.join(__dirname, 'dist'))) {
      fs.rmSync(path.join(__dirname, 'dist'), { recursive: true, force: true });
    }
    fs.cpSync(path.join(buildTarget, 'dist'), path.join(__dirname, 'dist'), { recursive: true });
  }

  console.log('✨ Build succeeded! Output ready in root /dist folder.');
} catch (error) {
  console.error('❌ Build script execution failed:', error.message);
  process.exit(1);
} finally {
  // Always clean up the temporary workspace
  const buildTarget = path.join(__dirname, 'build-target');
  if (fs.existsSync(buildTarget)) {
    fs.rmSync(buildTarget, { recursive: true, force: true });
  }
}