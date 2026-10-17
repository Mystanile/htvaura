// Run the API and Expo together for an iPhone Safari + laptop browser demo.
const { spawn } = require('node:child_process');
const { existsSync } = require('node:fs');
const { networkInterfaces } = require('node:os');
const path = require('node:path');
const net = require('node:net');

const appRoot = path.resolve(__dirname, '..');
const serverRoot = path.resolve(appRoot, '../server');
const python = path.join(serverRoot, '.venv', 'Scripts', 'python.exe');
const port = Number(process.env.SAFEKEEPS_WEB_PORT || 8083);
const children = [];

function available(port) {
  return new Promise(resolve => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.listen(port, '0.0.0.0', () => server.close(() => resolve(true)));
  });
}

function launch(command, args, options) {
  const child = spawn(command, args, { stdio: 'inherit', windowsHide: true, ...options });
  children.push(child);
  child.on('error', error => { console.error(error.message); shutdown(1); });
  return child;
}

function shutdown(code = 0) {
  for (const child of children) child.kill();
  process.exit(code);
}

process.on('SIGINT', () => shutdown());
process.on('SIGTERM', () => shutdown());

async function main() {
  if (!existsSync(python)) throw new Error('Create server/.venv and install server/requirements.txt first. See TWO_PHONE_DEMO.md.');
  if (!(await available(port))) throw new Error('Web port ' + port + ' is already in use. Stop the previous demo or set SAFEKEEPS_WEB_PORT.');
  const interfaces = Object.entries(networkInterfaces());
  const preferred = interfaces.find(([name]) => /wi-?fi/i.test(name));
  const candidates = preferred ? [preferred, ...interfaces] : interfaces;
  const address = candidates
    .filter(([name]) => !/vpn|nord|lynx|wsl|vethernet|loopback/i.test(name))
    .flatMap(([, values]) => values || [])
    .find(value => value.family === 'IPv4' && !value.internal && !value.address.startsWith('169.254.'));
  if (!address) throw new Error('Connect the laptop and iPhone to a shared network or hotspot, then run again.');

  const apiUrl = 'http://' + address.address + ':8000';
  if (await available(8000)) {
    const backend = launch(python, ['-m', 'uvicorn', 'kaze.app:app', '--host', '0.0.0.0', '--port', '8000'], { cwd: serverRoot });
    backend.on('exit', code => { if (code) shutdown(code); });
  }
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const response = await fetch('http://127.0.0.1:8000/openapi.json', { signal: AbortSignal.timeout(1000) });
      const spec = await response.json();
      if (!spec.paths?.['/safekeeps/guests']) throw new Error('Port 8000 is running an older or different server. Stop it and run npm run demo again.');
      ready = true;
      break;
    } catch (error) {
      if (error.message.includes('older or different')) throw error;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }
  if (!ready) throw new Error('The API did not start. Check the Python error above.');
  console.log('\nLaptop: http://localhost:' + port);
  console.log('iPhone Safari: http://' + address.address + ':' + port);
  console.log('Tap Start demo on each, then enter the other device\'s friend code.\n');
  const expo = launch(process.execPath, [require.resolve('expo/bin/cli'), 'start', '--web', '--go', '--port', String(port)], {
    cwd: appRoot, env: { ...process.env, EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL || apiUrl },
  });
  expo.on('exit', code => shutdown(code || 0));
}

main().catch(error => { console.error(error.message); shutdown(1); });
