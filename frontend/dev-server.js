const { spawn, execSync } = require('child_process');
const net = require('net');

const DEFAULT_PORT = 3000;

function checkPort(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false);
      } else {
        resolve(true);
      }
    });
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port);
  });
}

function getProcessOnPort(port) {
  try {
    const output = execSync(`lsof -t -i :${port}`, { encoding: 'utf8' }).trim();
    if (output) {
      const pids = output.split(/\s+/).filter(Boolean);
      if (pids.length > 0) {
        const pid = pids[0];
        const psInfo = execSync(`ps -p ${pid} -o command=`, { encoding: 'utf8' }).trim();
        return { pid, command: psInfo };
      }
    }
  } catch (e) {
    // Ignore errors (e.g. when port is not occupied or lsof is missing)
  }
  return null;
}

async function findAvailablePort(startPort) {
  let port = startPort;
  while (true) {
    const isAvailable = await checkPort(port);
    if (isAvailable) {
      return port;
    }
    port++;
  }
}

async function main() {
  console.log('Checking port availability...');
  const targetPort = parseInt(process.env.PORT || DEFAULT_PORT, 10);
  
  const isDefaultAvailable = await checkPort(targetPort);
  let finalPort = targetPort;

  if (!isDefaultAvailable) {
    console.log(`Port ${targetPort} occupied.`);
    const occupant = getProcessOnPort(targetPort);
    if (occupant) {
      console.log(`Found process:\nPID: ${occupant.pid}\nCommand: ${occupant.command}`);
    } else {
      console.log(`Found process on port ${targetPort} but could not retrieve details.`);
    }

    finalPort = await findAvailablePort(targetPort + 1);
    console.log(`\nPort ${targetPort} is already in use.\nStarting application on port ${finalPort}.\n`);
  } else {
    console.log(`Port ${targetPort} is available.\nStarting application on port ${targetPort}.\n`);
  }

  console.log('--------------------------------------------------');
  console.log(`Frontend Running:\nhttp://localhost:${finalPort}`);
  console.log('--------------------------------------------------\n');

  // Spawn Next.js dev server
  const nextProcess = spawn('npx', ['next', 'dev', '-p', finalPort.toString()], {
    stdio: 'inherit',
    shell: true,
  });

  // Forward signals to Next.js child process
  const cleanup = () => {
    nextProcess.kill('SIGINT');
    process.exit();
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

main().catch((err) => {
  console.error('Failed to start development server:', err);
  process.exit(1);
});
